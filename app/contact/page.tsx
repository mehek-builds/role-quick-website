"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { API_URL } from "@/lib/config";
import { litosClientHeaders } from "@/lib/product";
import { Button } from "@/components/app/Button";
import { ErrorNote, PendingLabel } from "@/components/app/ui";

/* The contact form.
 *
 * Posts straight to the backend's POST /contact, the same way every other
 * backend call on this site works (login posts to /auth/request-code from the
 * browser too), and trylitos.com is already on the backend's CORS allowlist.
 * There was briefly a Next.js route here that called Resend itself; it was
 * deleted, because the backend has sent mail all along for the verification
 * codes and a second transport meant a second key, a second sender domain and a
 * second way for delivery to break.
 *
 * No address anywhere in the markup, by design. CONTACT_INBOX is read inside the
 * backend process, so there is no mailto: for a scraper to harvest and nothing
 * to change here if the address ever moves.
 *
 * The reason list is duplicated from the backend rather than imported across the
 * repo boundary. The backend validates against its own copy, so a drifted list
 * here fails closed with a 400 rather than delivering something unexpected.
 */
const REASONS = [
  "Something is not working",
  "Refund request",
  "Billing question",
  "Career centre or university",
  "Privacy or my data",
  "Something else",
];

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...litosClientHeaders() },
        body: JSON.stringify({ name, email, reason, message, company }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That did not send.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-6 pb-28 pt-32">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Contact
        </p>
        <h1 className="mt-3 text-section font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
          Write to a person.
        </h1>

        {sent ? (
          <div className="mt-8 rounded-card border border-border bg-surface-alt px-7 py-8">
            <p className="text-base leading-7 text-ink">Sent. Thank you.</p>
            <p className="mt-2 text-base leading-7 text-muted">
              It goes to a real inbox and a real person answers, so it is not
              instant. If it was about something not working, the job link you
              sent is the most useful part.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-4 max-w-[52ch] text-base leading-7 text-muted">
              A person built this and a person answers. It is not instant, but
              it is a real reply.
            </p>

            <form onSubmit={submit} className="mt-9">
              {error && (
                <div className="mb-5">
                  <ErrorNote message={error} />
                </div>
              )}

              <label htmlFor="c-name" className="block text-[13px] text-ink">
                Your name
              </label>
              <input
                id="c-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-inner border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
                placeholder="Alex Rivera"
              />

              <label htmlFor="c-email" className="mt-6 block text-[13px] text-ink">
                Your email
              </label>
              <p className="mt-1 text-xs leading-5 text-faint">
                So the reply reaches you. Nothing else is done with it.
              </p>
              <input
                id="c-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-inner border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
                placeholder="you@example.com"
              />

              <label htmlFor="c-reason" className="mt-6 block text-[13px] text-ink">
                What is this about
              </label>
              <select
                id="c-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 w-full rounded-inner border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <label htmlFor="c-message" className="mt-6 block text-[13px] text-ink">
                Your message
              </label>
              {reason === "Refund request" && (
                /* Shown only when it is relevant, and it is the same requirement
                   the Terms state: a refund is decided on a written reason, so
                   asking for it here saves a round trip rather than being a
                   hurdle. */
                <p className="mt-1 text-xs leading-5 text-faint">
                  Include the email on the account and why you are asking. See
                  the refund section of the{" "}
                  <a
                    href="/terms#refunds"
                    className="underline decoration-border underline-offset-2 hover:text-ink"
                  >
                    Terms
                  </a>{" "}
                  for what qualifies.
                </p>
              )}
              <textarea
                id="c-message"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-2 w-full rounded-inner border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none placeholder:text-faint focus:border-brand"
                placeholder="Tell us what happened. If a form did not fill, paste the job link."
              />

              {/* Honeypot. Hidden from sight and from screen readers, never
                  focusable, and autoComplete off so a password manager does not
                  fill it for a real person. */}
              <div aria-hidden className="hidden">
                <label htmlFor="c-company">Company</label>
                <input
                  id="c-company"
                  tabIndex={-1}
                  autoComplete="off"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={busy} className="mt-8">
                {busy ? <PendingLabel onColor>Sending...</PendingLabel> : "Send"}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
