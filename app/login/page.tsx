"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";
import { setSession, getToken } from "@/lib/api";

/* Passwordless sign-in, same account system as the extension: email a 6-digit
   code (/auth/request-code + /auth/verify-code). If code delivery is not
   configured on the backend it answers 503 and we fall back to the legacy
   /auth/session flow, exactly like the extension does. */

type Step = "email" | "code";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const normalized = email.trim().toLowerCase();
    try {
      const res = await fetch(`${API_URL}/auth/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      if (res.ok) {
        setStep("code");
      } else if (res.status === 503) {
        // Verification email not configured: legacy passwordless session.
        const legacy = await fetch(`${API_URL}/auth/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalized }),
        });
        const data = await legacy.json().catch(() => null);
        if (legacy.ok && data?.token) {
          setSession(data.token, normalized);
          router.replace("/dashboard");
        } else {
          setError(data?.error ?? "Could not sign you in. Try again in a minute.");
        }
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not send a code. Try again in a minute.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.token) {
        setSession(data.token, email.trim().toLowerCase());
        router.replace("/dashboard");
      } else {
        setError(data?.error ?? "That code did not work. Request a new one.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <a href="/" className="mb-10 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/rolequick-mark.svg" alt="" className="h-7 w-7" />
        <span className="text-lg font-semibold tracking-tight text-ink">RoleQuick</span>
      </a>

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
              placeholder="you@school.edu"
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
              We sent a six-digit code to <span className="text-ink">{email}</span>. It
              expires in 10 minutes.
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
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="mt-3 w-full text-center text-xs text-muted hover:text-ink"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
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
