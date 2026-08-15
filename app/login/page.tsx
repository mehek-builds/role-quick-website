"use client";

import { Button } from "@/components/app/Button";
import { FlowDemoFit } from "@/components/FlowDemo";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";
import {
  setSession,
  clearSession,
  getToken,
  getOnboardingState,
  getOrCreateGuestKey,
  hasLitosHistory,
} from "@/lib/api";
import { isLitosPlusPlanId } from "@/features/billing";
import { litosClientHeaders } from "@/lib/product";
import { googleSignInError, requestCodeError, verifyCodeError } from "./errors";
import { PendingLabel } from "@/components/app/ui";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { completeGoogleSession } from "./google-session";
import { passwordFormProblem } from "./password-form";
import { updatePasswordSession } from "./password-session";
import { track } from "@/lib/analytics";

type Step = "credentials" | "code" | "new-password";
type Flow = "signin" | "signup" | "recovery" | "email-code";

/* Where a freshly signed-in person belongs. Onboarding is a STRONG DEFAULT, not a gate: /start
   sends them on, but every screen there carries a plain "Finish later" and the dashboard stays
   open. Trapping someone behind a 12-minute wall in front of a product they have not seen work
   would be the dark pattern the Guardrails exist to prevent.
   A failed state read must never block sign-in, so anything unexpected lands on the dashboard. */
async function landingRoute(): Promise<string> {
  try {
    const s = await getOnboardingState();
    if (s.requires_onboarding === undefined) return s.step === "done" ? "/dashboard" : "/start";
    return s.requires_onboarding ? "/start" : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

/* One password input, with the toggle that replaced the Confirm field.
 *
 * The competitor audit's criticism of LoopCV applied to Litos more sharply than
 * to LoopCV: "Confirm Password is a required field in 2026, on a form that
 * already has a password visibility toggle." Litos had the confirm field and NO
 * toggle, so a 15-character passphrase had to be typed correctly twice with no
 * way to check either one. Both password forms now use this instead, so signup
 * and password recovery cannot drift apart again.
 *
 * The toggle is a real button, not an icon with a click handler: it is
 * keyboard-reachable, it announces its state through aria-pressed, and its
 * label changes rather than relying on an icon a screen reader cannot read.
 * type="button" matters, because a bare <button> inside a form submits it. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <label className="block text-xs font-medium text-muted" htmlFor={id}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-controls={id}
          className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <input
        id={id}
        type={shown ? "text" : "password"}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-inner border border-control-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
      />
      {hint && <p className="mt-2 text-xs leading-5 text-muted">{hint}</p>}
    </>
  );
}

export default function Login() {
  const router = useRouter();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
    || "719679889441-oto6bdqapcrdmcso8lsfs46qc4nvpb3s.apps.googleusercontent.com";
  /* Whether the decorative panel's demo should exist at all. Starts false so the server render and
     the first client render agree, then the effect promotes it on wide viewports. Being wrong for
     one frame costs nothing here: the panel is aria-hidden decoration, and the alternative was
     mounting an animating demo inside a display:none subtree on every phone. Matches the xl
     breakpoint on the aside, and stays in step if the window is resized across it. */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const [step, setStep] = useState<Step>("credentials");
  const [flow, setFlow] = useState<Flow>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [guestEligible, setGuestEligible] = useState(false);
  const [claimMode, setClaimMode] = useState(false);
  /* Whether the Google block renders, named once because two things depend on the answer: the block
     itself, and the top margin of the Email label below it, which is only unnecessary when that
     block's "or" divider is there to supply the spacing. Keeping the condition in one place is what
     stops those two drifting, which is exactly how the label ended up flush against the paragraph
     above it on the signup and claim screens. */
  const showGoogle = Boolean(googleClientId) && !claimMode && flow === "signin";
  /* Its own flag: sharing `busy` made the submit button announce "Working..."
     for an action nobody pressed, in a second pending verb (finding 34). */
  const [guestBusy, setGuestBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claiming = params.get("claim") === "1";
    const requestedFlow = params.get("flow");
    const reason = params.get("reason");
    const preferredPlan = params.get("plan");
    if (params.get("intent") === "litos-plus" && isLitosPlusPlanId(preferredPlan)) {
      window.sessionStorage.setItem("litos_plus_selected_plan_v2", preferredPlan);
    }
    if (getToken() && !claiming) {
      void landingRoute().then((r) => router.replace(r));
      return;
    }
    queueMicrotask(() => {
      setClaimMode(claiming);
      if (claiming) setFlow("email-code");
      else if (requestedFlow === "recovery") setFlow("recovery");
      if (reason === "password-state") {
        setError("Your password may have changed, but we did not finish. Check your email so we know it is you.");
      }
      setGuestEligible(!hasLitosHistory());
    });
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function requestCode(targetEmail: string, isResend = false): Promise<boolean> {
    setBusy(true);
    setError(null);
    setDeliveryNotice(null);
    try {
      const res = await fetch(`${API_URL}/auth/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...litosClientHeaders() },
        body: JSON.stringify({ email: targetEmail }),
      });
      if (res.ok) {
        setStep("code");
        setCode("");
        setResendCooldown(30);
        setDeliveryNotice(
          isResend
            ? "We sent a new code. Only the newest one works."
            : "Code sent. Check your inbox, and your spam folder.",
        );
        return true;
      }

      const data = await res.json().catch(() => null);
      setError(requestCodeError(res.status, data?.error));
      return false;
    } catch {
      setError("Something went wrong. Check your internet and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function passwordProblem(): string | null {
    return passwordFormProblem(password);
  }

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (flow !== "signin") {
      if (flow === "signup") {
        const problem = passwordProblem();
        if (problem) {
          setError(problem);
          return;
        }
      }
      await requestCode(normalized);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/password/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...litosClientHeaders() },
        body: JSON.stringify({ email: normalized, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        setError(res.status === 429 ? "Too many tries. Wait a bit, then try again." : "That email or password is wrong.");
        return;
      }
      setSession(data.token, normalized);
      track("authentication_completed", { method: "password" });
      router.replace(await landingRoute());
    } catch {
      setError("Something went wrong. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  function enterPasswordRecovery() {
    clearSession();
    setVerificationToken(null);
    setPassword("");
    setCode("");
    setFlow("recovery");
    setStep("credentials");
    setError("Your password may have changed, but we did not finish. Check your email so we know it is you.");
    router.replace("/login?flow=recovery&reason=password-state");
  }

  async function setVerifiedPassword(
    token: string,
    newPassword: string,
  ): Promise<"success" | "rejected" | "recovery_required"> {
    const result = await updatePasswordSession({
      apiUrl: API_URL,
      token,
      password: newPassword,
      headers: litosClientHeaders(),
    });
    if (result.kind === "recovery_required") {
      enterPasswordRecovery();
      return "recovery_required";
    }
    if (result.kind === "rejected") {
      setError(result.error);
      return "rejected";
    }
    setSession(result.token, result.email ?? email.trim().toLowerCase());
    track("authentication_completed", { method: "email_verification" });
    router.replace(await landingRoute());
    return "success";
  }

  async function continueAsGuest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...litosClientHeaders() },
        body: JSON.stringify({ idempotency_key: getOrCreateGuestKey() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        setError(data?.error ?? "We could not open the guest view.");
        return;
      }
      setSession(data.token, null, true);
      track("authentication_completed", { method: "guest" });
      router.replace("/start");
    } catch {
      setError("Something went wrong. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  const submitGoogleCredential = useCallback(async (credential: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...litosClientHeaders() },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const route = await completeGoogleSession(data, {
          setSession,
          returningUserRoute: landingRoute,
        });
        if (route) {
          track("authentication_completed", { method: "google" });
          router.replace(route);
          return;
        }
      }
      setError(googleSignInError(res.status, data?.error));
    } catch {
      setError("Something went wrong. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/verify-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...litosClientHeaders(),
          ...(claimMode && getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.token) {
        if (flow === "signup") {
          const passwordResult = await setVerifiedPassword(data.token, password);
          if (passwordResult === "rejected") {
            setVerificationToken(data.token);
            setStep("new-password");
          }
          return;
        }
        if (flow === "recovery") {
          setVerificationToken(data.token);
          setPassword("");
          setStep("new-password");
          return;
        }
        setSession(data.token, email.trim().toLowerCase());
        track("authentication_completed", { method: claimMode ? "email_claim" : "email_code" });
        /* A selected paid term is a preference only. New accounts start the no-card trial and
           Stripe opens only after a later, explicit purchase from Pricing or Account. */
        router.replace(await landingRoute());
      } else {
        setError(verifyCodeError(res.status, data?.error));
      }
    } catch {
      setError("Something went wrong. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem();
    if (problem) {
      setError(problem);
      return;
    }
    if (!verificationToken) {
      setError("That code ran out. Start again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setVerifiedPassword(verificationToken, password);
    } catch {
      setError("Something went wrong. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    /* Two columns on a wide screen: the form, and the thing being signed into.
       The gate used to be a card centred in empty space, which asks a student
       to hand over an email with nothing on screen to say what for. The one
       competitor in the ten-product audit that does this well (Rezi) puts a
       live view of the product beside the form, and it is the cheapest
       reassurance available: the product is the argument.

       Preview is lg and up only. Below that it would push the form itself
       under the fold, and the form is what the page is for.
       Approved 2026-07-27 as override 3 of 10 (DESIGN.md). */
    /* The row turns on at the same width the panel does. Left at lg it was a
       row with one child, which looks identical but states a pairing that is
       no longer true, and the next person to move the panel would trust it. */
    <div className="flex min-h-screen flex-col xl:flex-row">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="mb-10 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/litos-mark.svg" alt="" className="h-6 w-6" />
        {/* One wordmark: 16px, weight 500, same as the marketing header, the
            dashboard header and the footer. This came back at 18px/600 when the
            page was rebuilt (audit finding 1, regressed). */}
        <span className="text-base font-medium tracking-tight text-ink">Litos</span>
      </Link>

      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8">
        {step === "credentials" ? (
          <div>
            <h1 className="text-heading font-medium text-ink">
              {claimMode
                ? "Save your work"
                : flow === "signup"
                  ? "Create your account"
                  : flow === "recovery"
                    ? "Reset your password"
                    : flow === "email-code"
                      ? "Sign in with a code"
                      : "Sign in"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              {claimMode
                ? "Add an email to keep this work and use Litos on your other devices."
                : flow === "signup"
                  ? "Free to start, no card needed. Choose a password, then verify your email."
                  : flow === "recovery"
                    ? "We will verify your email before you choose a new password."
                    : flow === "email-code"
                      ? "We will email you a six-digit code."
                      : "Use your Litos password or continue with Google."}
            </p>
            {showGoogle && (
              <>
                <div className="mt-6">
                  <GoogleSignInButton
                    clientId={googleClientId}
                    busy={busy}
                    onCredential={submitGoogleCredential}
                    onLoadError={() => setError("Google sign-in could not load. Continue with email.")}
                  />
                </div>
                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">or</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}
            <form onSubmit={submitCredentials}>
              {/* Keyed to whether the Google block ABOVE actually rendered, not to whether a client
                  id exists. The two are different: that block is `googleClientId && !claimMode &&
                  flow === "signin"`, so with a client id configured (which is every deployment)
                  this label lost its top margin on the signup and claim screens, where no Google
                  button and no "or" divider precede it, and collided with the paragraph above. The
                  divider was supplying the spacing; without it there was none. */}
              <label
                className={`${showGoogle ? "" : "mt-6 "}block text-xs font-medium text-muted`}
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus={!googleClientId}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  setDeliveryNotice(null);
                }}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-inner border border-control-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
              />
              {/* SAID AT THE MOMENT THEY CHOOSE IT, because this address is not only a login.
                  It is seeded as the resume email, so it is printed on the document an employer
                  reads and is the address they reply to (backend routes/profile.ts, lib/resumeEmail
                  .ts). Until now nothing on this page said so, and a student picking whichever
                  address they happened to be signed into had no way to know they were also choosing
                  what employers would see.

                  Signup and claim only. On the sign-in flows the choice was made long ago and this
                  would be noise on a screen whose whole job is one field and a button. Changing it
                  afterwards is a real path rather than a promise, so the second sentence names it:
                  Documents, under Edit parsed details. */}
              {(flow === "signup" || claimMode) && (
                <p className="mt-2 text-xs leading-5 text-muted">
                  Use the address you want employers to reply to. Litos prints it on your resume and
                  applications. You can change it later in Documents.
                </p>
              )}
              {(flow === "signin" || flow === "signup") && (
                <PasswordField
                  id="password"
                  label="Password"
                  autoComplete={flow === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(v) => { setPassword(v); setError(null); }}
                  hint={flow === "signup" ? "Use at least 15 letters. Spaces are fine." : undefined}
                />
              )}
              <Button
                type="submit"
                disabled={busy} block className="mt-4">
                {busy
                  ? <PendingLabel onColor>Saving...</PendingLabel>
                  : flow === "signin"
                    ? "Sign in"
                    : flow === "signup"
                      ? "Create account"
                      : "Send verification code"}
              </Button>
              {/* The agreement, and the moment it is formed.
                  Until now nothing on this page mentioned the Terms, so nobody
                  had agreed to anything: /terms existed and bound no one.

                  Shown on account creation only. Signing in again is not a new
                  agreement, and repeating it there would be noise on the screen
                  a returning user sees most often.

                  A line rather than a tick box, deliberately. Four of the ten
                  products audited do it this way and the two that use a required
                  checkbox (Careerflow, LoopCV) have the highest-friction gates in
                  the set. A clickwrap is formed by an affirmative act next to
                  clear notice, and pressing "Create account" under this sentence
                  is that act. */}
              {(flow === "signup" || claimMode) && (
                <p className="mt-3 text-center text-xs leading-5 text-muted">
                  By creating an account you agree to the{" "}
                  <a href="/terms" className="underline hover:text-muted">
                    Terms
                  </a>{" "}
                  and the{" "}
                  <a href="/privacy" className="underline hover:text-muted">
                    Privacy Policy
                  </a>
                  .
                </p>
              )}
            </form>
            {!claimMode && (
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
                {flow !== "signup" && (
                  <button type="button" onClick={() => { setFlow("signup"); setError(null); }} className="text-brand-ink hover:underline">
                    Create account
                  </button>
                )}
                {flow !== "signin" && (
                  <button type="button" onClick={() => { setFlow("signin"); setError(null); }} className="text-brand-ink hover:underline">
                    Sign in
                  </button>
                )}
                {flow !== "recovery" && (
                  <button type="button" onClick={() => { setFlow("recovery"); setError(null); }} className="text-muted hover:text-ink">
                    Forgot password?
                  </button>
                )}
                {flow !== "email-code" && (
                  <button type="button" onClick={() => { setFlow("email-code"); setError(null); }} className="text-muted hover:text-ink">
                    Use an email code
                  </button>
                )}
              </div>
            )}
            {guestEligible && !claimMode && flow === "signin" && (
              <>
                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">or</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  disabled={busy || guestBusy}
                  onClick={() => void continueAsGuest()} variant="secondary" block>
                  {guestBusy ? <PendingLabel state="searching">Working...</PendingLabel> : "Guest mode"}
                </Button>
                <p className="mt-3 text-center text-xs leading-5 text-muted">
                  Your 7-day Litos+ trial starts now. No card needed. Application filling stays free after it ends.
                </p>
                {/* Both controls in this block can create an account: Google on a
                    first sign-in, and guest mode, which makes a guest one.
                    Neither passes through the signup flow, so without this line
                    the two easiest ways in would be the two with no agreement
                    attached. Worded to cover both rather than repeated twice.
                    It NAMES the button, so the sentence keeps pointing at a
                    control the reader can see; it said "looking around" while
                    the button said "Look around without signing up". */}
                <p className="mt-4 text-center text-xs leading-5 text-muted">
                  Continuing with Google or using guest mode creates an account,
                  under the same{" "}
                  <a href="/terms" className="underline hover:text-muted">
                    Terms
                  </a>{" "}
                  and{" "}
                  <a href="/privacy" className="underline hover:text-muted">
                    Privacy Policy
                  </a>
                  .
                </p>
              </>
            )}
          </div>
        ) : step === "code" ? (
          <form onSubmit={submitCode}>
            <h1 className="text-heading font-medium text-ink">Check your email</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              We requested a six-digit code for <span className="text-ink">{email}</span>.
              It expires in 10 minutes.
            </p>
            <label className="mt-6 block text-xs font-medium text-muted" htmlFor="code">
              Verification code
            </label>
            <input
              id="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="mt-2 w-full rounded-inner border border-control-border bg-surface px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-ink outline-none placeholder:text-faint focus:border-brand"
            />
            <Button
              type="submit"
              disabled={busy || code.length !== 6} block className="mt-4">
              {busy
                ? <PendingLabel state="solving" onColor>Saving...</PendingLabel>
                : flow === "signup"
                  ? "Verify and create account"
                  : flow === "recovery"
                    ? "Verify and continue"
                    : "Sign in"}
            </Button>
            <button
              type="button"
              disabled={busy || resendCooldown > 0}
              onClick={() => void requestCode(email.trim().toLowerCase(), true)}
              className="mt-3 w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? <PendingLabel state="searching">Sending a new code...</PendingLabel>
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setCode("");
                setError(null);
                setDeliveryNotice(null);
              }}
              className="mt-3 w-full text-center text-xs text-muted hover:text-ink"
            >
              Use a different email
            </button>
          </form>
        ) : (
          <form onSubmit={submitNewPassword}>
            <h1 className="text-heading font-medium text-ink">Pick a new password</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Your email is verified. This will sign out every older Litos session.
            </p>
            <div className="mt-6">
              <PasswordField
                id="new-password"
                label="New password"
                autoComplete="new-password"
                value={password}
                onChange={(v) => { setPassword(v); setError(null); }}
                hint="Use at least 15 letters. Spaces are fine."
              />
            </div>
            <Button
              type="submit"
              disabled={busy} block className="mt-4">
              {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Save new password"}
            </Button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm text-danger" role="alert" aria-live="polite">
            {error}
          </p>
        )}
        {deliveryNotice && !error && (
          <p className="mt-4 text-sm leading-6 text-muted" role="status" aria-live="polite">
            {deliveryNotice}
          </p>
        )}
      </div>

      {/* "One account for everything. Sign in to see the emails and resumes
          Litos already made for you." came off 2026-07-28. Three footnotes
          stacked under this card, and that one was a pitch on the screen where
          the decision to try Litos has already been made. It also read oddly on
          the flow most people arrive in, since a new account has nothing Litos
          "already made".

          The privacy line stays. On the screen that asks for an email, the
          right to take it back is the thing worth saying, and it carries the
          only /privacy link on this page. */}
      <p className="mt-8 max-w-sm text-center text-xs leading-5 text-muted">
        Your data is yours. You can download it or delete it anytime.{" "}
        <a href="/privacy" className="underline hover:text-muted">
          Privacy
        </a>
      </p>
      </div>

      {/* The product, beside the form. No device frame and no drop shadow: the
          imagery law is real product UI, and a mockup chrome around a picture
          of the product is decoration pretending to be evidence.

          THE HERO DEMO, the same FlowDemoFit the homepage runs, not the
          extension capture that stood here until now. It is one visual or the
          other by the law's one-per-section rule, so this is a choice between
          them rather than an addition.

          One demo, two places, deliberately. A visitor arrives at /login having
          just watched this run on the homepage, and meeting the same picture
          again is continuity rather than repetition: it is the thing they were
          promised, still playing while they sign in. A second, different
          composition here would be a new thing to read at the exact moment the
          reader is trying to do something else.

          Rendered rather than photographed, so it cannot go stale the way a PNG
          of a shipped screen does. A change to the demo reaches this page on the
          same deploy as the homepage. */}
      {/* xl, not lg, and the padding came down from px-14 to px-8. Both are the
          demo's measurements rather than taste.

          FlowDemoFit switches composition, not just scale: under 480px of
          container it stops being the desktop picture and becomes the phone
          one. At lg the column was 46% of 1024 minus px-14, which is 358px, so
          a laptop at 1024 got the PHONE demo standing in a desktop-shaped
          column, 217px tall in a full-height panel. Widening alone could not
          fix it: at 46% of 1024 the column is 471px before any padding at all,
          under the threshold with nothing left to give.

          So the panel now appears at 1280 and up, where 48% minus px-8 leaves
          550px and the demo renders as the compact desktop picture at close to
          full size, growing into the full composition past about 1600. Between
          1024 and 1280 the form stands on its own, which is what it already
          does on every narrower screen. */}
      <aside
        aria-hidden
        /* bg-brand-soft, not bg-surface-alt. The striping token is #faf9f7 and
           the demo carries its own white backing, so a white card sat on a
           near-white panel beside a white form column and the whole page read
           as one flat white field with a hairline down it. The panel has to be
           a GROUND for the demo, and #faf9f7 cannot be a ground for white.

           brand-soft (#eef1fe) is the lightest tint the system already owns
           and it is the Litos blue, so the demo now sits on something rather
           than floating, without introducing a colour the palette does not
           have. The form column stays pure white: the page keeps its white
           canvas, and the tint is on the decorative half only. */
        className="hidden border-l border-border bg-brand-soft xl:flex xl:w-[48%] xl:shrink-0 xl:flex-col xl:justify-center xl:px-8 xl:py-16"
      >
        {/* The "Inside Litos" eyebrow came off 2026-07-28. The panel is
            aria-hidden decoration showing the product; labelling a picture of
            the product with the product's name is the caption saying what the
            picture already says. */}
        {/* w-full, and the reason is load-bearing rather than stylistic:
            FlowDemoFit measures its PARENT's clientWidth to choose between the
            full, compact and phone compositions. A content-sized wrapper would
            hand it back its own width as the answer and it would latch onto
            whichever variant it happened to render first. Same wrapper the
            homepage hero uses, for the same reason.

            No height cap here. The demo scales itself to the width it is given
            and this column is 48% minus px-8, which lands it just under
            COMPACT_BELOW, so it renders the compact picture at close to full
            size. The old height cap existed for a portrait PNG that could not
            scale; this one has no fixed size to run past. */}
        {/* Mounted on width, not hidden by CSS. `hidden xl:flex` is display only, so React still
            mounted the demo on every phone: FlowDemoFit bails its measure on a zero-width parent
            and keeps its initial `ok: true`, so the full desktop composition rendered inside a
            display:none subtree, running its rAF loops and timer chain for a picture nobody could
            see. The <img> this replaced cost one request; this cost battery on the auth path. */}
        {wide && <div className="flex w-full justify-center"><FlowDemoFit /></div>}
      </aside>
    </div>
  );
}
