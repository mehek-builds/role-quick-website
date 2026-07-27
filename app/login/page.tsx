"use client";

import { Button } from "@/components/app/Button";
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
  createCheckout,
} from "@/lib/api";
import { isLemonSqueezyCheckoutUrl } from "@/lib/billing";
import { litosClientHeaders } from "@/lib/product";
import { googleSignInError, requestCodeError, verifyCodeError } from "./errors";
import { PendingLabel } from "@/components/app/ui";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { completeGoogleSession } from "./google-session";
import { passwordFormProblem } from "./password-form";
import { updatePasswordSession } from "./password-session";

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
    return s.step === "done" ? "/dashboard" : "/start";
  } catch {
    return "/dashboard";
  }
}

export default function Login() {
  const router = useRouter();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
    || "719679889441-oto6bdqapcrdmcso8lsfs46qc4nvpb3s.apps.googleusercontent.com";
  const [step, setStep] = useState<Step>("credentials");
  const [flow, setFlow] = useState<Flow>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [guestEligible, setGuestEligible] = useState(false);
  const [claimMode, setClaimMode] = useState(false);
  /* Its own flag: sharing `busy` made the submit button announce "Working..."
     for an action nobody pressed, in a second pending verb (finding 34). */
  const [guestBusy, setGuestBusy] = useState(false);

  useEffect(() => {
    const claiming = new URLSearchParams(window.location.search).get("claim") === "1";
    const requestedFlow = new URLSearchParams(window.location.search).get("flow");
    const reason = new URLSearchParams(window.location.search).get("reason");
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
    return passwordFormProblem(password, confirmPassword);
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
    setConfirmPassword("");
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
          setConfirmPassword("");
          setStep("new-password");
          return;
        }
        setSession(data.token, email.trim().toLowerCase());
        const next = new URLSearchParams(window.location.search).get("next");
        if (next === "upgrade") {
          try {
            const checkout = await createCheckout();
            if (isLemonSqueezyCheckoutUrl(checkout.url)) {
              window.location.assign(checkout.url);
              return;
            }
          } catch {
            router.replace("/dashboard/settings?billing=unavailable");
            return;
          }
        }
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
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="mb-10 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/litos-mark.svg" alt="" className="h-7 w-7" />
        <span className="text-lg font-semibold tracking-tight text-ink">Litos</span>
      </Link>

      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8">
        {step === "credentials" ? (
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
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
                  ? "Choose a password, then verify your email to finish registration."
                  : flow === "recovery"
                    ? "We will verify your email before you choose a new password."
                    : flow === "email-code"
                      ? "We will email you a six-digit code."
                      : "Use your Litos password or continue with Google."}
            </p>
            {googleClientId && !claimMode && flow === "signin" && (
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
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">or</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}
            <form onSubmit={submitCredentials}>
              <label
                className={googleClientId ? "block text-xs font-medium text-muted" : "mt-6 block text-xs font-medium text-muted"}
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
                className="mt-2 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
              />
              {(flow === "signin" || flow === "signup") && (
                <>
                  <label className="mt-4 block text-xs font-medium text-muted" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete={flow === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    className="mt-2 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
                  />
                </>
              )}
              {flow === "signup" && (
                <>
                  <label className="mt-4 block text-xs font-medium text-muted" htmlFor="confirm-password">
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                    className="mt-2 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
                  />
                  <p className="mt-2 text-xs leading-5 text-faint">Use at least 15 letters. Spaces are fine.</p>
                </>
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
            </form>
            {!claimMode && (
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
                {flow !== "signup" && (
                  <button type="button" onClick={() => { setFlow("signup"); setError(null); }} className="text-brand hover:underline">
                    Create account
                  </button>
                )}
                {flow !== "signin" && (
                  <button type="button" onClick={() => { setFlow("signin"); setError(null); }} className="text-brand hover:underline">
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
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">or</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  disabled={busy || guestBusy}
                  onClick={() => void continueAsGuest()} variant="secondary" block>
                  {guestBusy ? <PendingLabel state="searching">Working...</PendingLabel> : "Look around without signing up"}
                </Button>
                <p className="mt-3 text-center text-xs leading-5 text-faint">
                  Your first week is free. No card needed. You only see this the first time.
                </p>
              </>
            )}
          </div>
        ) : step === "code" ? (
          <form onSubmit={submitCode}>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Check your email</h1>
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
              className="mt-2 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-ink outline-none placeholder:text-faint focus:border-brand"
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
            <h1 className="text-xl font-semibold tracking-tight text-ink">Pick a new password</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Your email is verified. This will sign out every older Litos session.
            </p>
            <label className="mt-6 block text-xs font-medium text-muted" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              className="mt-2 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
            <label className="mt-4 block text-xs font-medium text-muted" htmlFor="confirm-new-password">
              Confirm new password
            </label>
            <input
              id="confirm-new-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
              className="mt-2 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
            <p className="mt-2 text-xs leading-5 text-faint">Use at least 15 letters. Spaces are fine.</p>
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

      <p className="mt-8 max-w-sm text-center text-xs leading-5 text-faint">
        One account for everything. Sign in to see the emails and resumes
        Litos already made for you.
      </p>
      <p className="mt-3 max-w-sm text-center text-xs leading-5 text-faint">
        Your data is yours. You can download it or delete it anytime.{" "}
        <a href="/privacy" className="underline hover:text-muted">
          Privacy
        </a>
      </p>
    </div>
  );
}
