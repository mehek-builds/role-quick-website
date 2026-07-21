"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";
import { setSession, getToken, getOnboardingState } from "@/lib/api";
import { litosClientHeaders } from "@/lib/product";
import { requestCodeError, verifyCodeError } from "./errors";

/* Passwordless sign-in, same account system as the extension: email a 6-digit
   code (/auth/request-code + /auth/verify-code). Email ownership must always be
   verified before the backend issues a session. */

type Step = "email" | "code";

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
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    void landingRoute().then((r) => router.replace(r));
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
            ? "A fresh code was requested. Only the newest code will work."
            : "Code requested. Check your inbox, spam, and promotions folders.",
        );
        return true;
      }

      const data = await res.json().catch(() => null);
      setError(requestCodeError(res.status, data?.error));
      return false;
    } catch {
      setError("Network error. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    await requestCode(normalized);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...litosClientHeaders() },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.token) {
        setSession(data.token, email.trim().toLowerCase());
        router.replace(await landingRoute());
      } else {
        setError(verifyCodeError(res.status, data?.error));
      }
    } catch {
      setError("Network error. Check your connection and try again.");
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

      <div className="w-full max-w-sm rounded-[20px] border border-border bg-surface p-8">
        {step === "email" ? (
          <form onSubmit={submitEmail}>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              No password. We email you a six-digit code, new accounts are
              created on first sign-in.
            </p>
            <label className="mt-6 block text-xs font-medium text-muted" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Sending code..." : "Continue with email"}
            </button>
          </form>
        ) : (
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
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="mt-4 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Verifying..." : "Sign in"}
            </button>
            <button
              type="button"
              disabled={busy || resendCooldown > 0}
              onClick={() => void requestCode(email.trim().toLowerCase(), true)}
              className="mt-3 w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? "Requesting a fresh code..."
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setDeliveryNotice(null);
              }}
              className="mt-3 w-full text-center text-xs text-muted hover:text-ink"
            >
              Use a different email
            </button>
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
        One account for the extension and this dashboard. Signing in here shows
        the contacts, drafts, and resumes the extension has already made for you.
      </p>
      <p className="mt-3 max-w-sm text-center text-xs leading-5 text-faint">
        Your data is yours: export or delete it anytime.{" "}
        <a href="/privacy" className="underline hover:text-muted">
          Privacy
        </a>
      </p>
    </div>
  );
}
