"use client";

import { Button, ButtonLink } from "@/components/app/Button";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  ApplicationProfile,
  clearSession,
  createCheckout,
  createEmailConnection,
  disconnectEmailConnection,
  type EmailConnectionsResponse,
  type EmailProvider,
  getEmailConnections,
  getOnboardingState,
  getSponsorship,
  getToken,
  setSponsorFilter,
  type SponsorshipState,
  Me,
  setSession,
  setAutomationSettings,
} from "@/lib/api";
import { isLemonSqueezyCheckoutUrl } from "@/lib/billing";
import { Card, Chip, Meter, PendingLabel, ShimmerRows, ErrorNote } from "@/components/app/ui";
import { API_URL } from "@/lib/config";
import { passwordFormProblem } from "@/app/login/password-form";
import { updatePasswordSession } from "@/app/login/password-session";
import { litosClientHeaders } from "@/lib/product";

/* Application profile: exactly the fields the backend encrypts and the
   extension autofills (PRD-v2 Section 4). EEO self-identification is not
   editable here on purpose: it defaults to decline-to-answer everywhere and
   is only ever set by an explicit opt-in inside the extension. */

const TRI = [
  { value: "", label: "Not set" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export default function Settings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<ApplicationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [automaticSubmission, setAutomaticSubmission] = useState<boolean | null>(null);
  const [automaticVerification, setAutomaticVerification] = useState<boolean | null>(null);
  const [savingAutomation, setSavingAutomation] = useState(false);
  // Unattended submission is earned, not offered. The server is the authority; this only explains
  // the state so the control is not an unexplained dead toggle.
  const [consentEligibility, setConsentEligibility] = useState<{
    eligible: boolean;
    reviewed_submits: number;
    required: number;
    remaining: number;
  } | null>(null);
  const [sponsorship, setSponsorship] = useState<SponsorshipState | null>(null);
  const [sponsorBusy, setSponsorBusy] = useState(false);
  const [sponsorError, setSponsorError] = useState<string | null>(null);
  const [emailConnections, setEmailConnections] = useState<EmailConnectionsResponse | null>(null);
  const [connectionBusy, setConnectionBusy] = useState<EmailProvider | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());
  const [dataBusy, setDataBusy] = useState<"export" | "delete" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const callbackProvider = new URLSearchParams(window.location.search).get("connection") as EmailProvider | null;
        const callbackStatus = new URLSearchParams(window.location.search).get("status");
        const [meRes, profileRes, onboardingRes, initialConnections, sponsorRes] = await Promise.all([
          api<Me>("/me"),
          api<ApplicationProfile>("/profile/application").catch(() => ({})),
          getOnboardingState(),
          getEmailConnections(),
          /* Null on a backend that predates this, which renders no card at all rather than an
             empty one. The two repos deploy separately and in either order. */
          getSponsorship().catch(() => null),
        ]);
        let connectionRes = initialConnections;
        if (callbackStatus === "success" && callbackProvider) {
          for (let attempt = 0; attempt < 4 && !connectionRes.connections.some((item) => item.provider === callbackProvider && item.connected); attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 750));
            connectionRes = await getEmailConnections();
          }
        }
        if (cancelled) return;
        setMe(meRes);
        setProfile(profileRes);
        setAutomaticSubmission(onboardingRes.automatic_submission_enabled);
        setConsentEligibility(onboardingRes.standing_consent_eligibility ?? null);
        setAutomaticVerification(onboardingRes.automatic_verification_enabled);
        setEmailConnections(connectionRes);
        setSponsorship(sponsorRes);
        if (callbackProvider && callbackStatus) {
          const label = callbackProvider === "gmail" ? "Gmail" : "Outlook";
          const connected = connectionRes.connections.some((item) => item.provider === callbackProvider && item.connected);
          setConnectionNotice(callbackStatus === "success" && connected ? `${label} connected.` : `${label} connection was not completed.`);
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("connection");
          cleanUrl.searchParams.delete("status");
          cleanUrl.searchParams.delete("connected_account_id");
          window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Honour the #fragment once the content it points at actually exists.
   *
   * /dashboard/profile's "Edit details" links to
   * /dashboard/settings#application-details. Giving that card an id was
   * necessary and NOT sufficient: this page renders <ShimmerRows> until `me`
   * resolves, so at the moment the browser handles the fragment the target is
   * not in the DOM yet. The browser looks, finds nothing, and gives up. The
   * card mounts a second later and nothing re-triggers the scroll.
   *
   * Verified against production on 2026-07-28 before this effect existed: both
   * a hard load of /dashboard/settings#application-details and a client-side
   * click from Profile ended at scrollY 0 with the card at top 1115. The id was
   * live and the jump still did not happen.
   *
   * Keyed on `me` because that is the state that flips this page from shimmer
   * to content: the early return above renders <ShimmerRows> while it is null
   * and the whole page, including the card, once it is not. If those setState
   * calls in the loader are ever split so the card lands after `me`, this fires
   * too early and silently stops working. Keep them in one tick.
   *
   * KNOWN LIMITS, left in deliberately. A second review pass raised three more
   * and none of them is reachable in this app, so none is worth machinery:
   *   - `scrollY > 40` infers intent from position rather than observing a real
   *     interaction, so a restored position under 40px would not stop the jump.
   *     The cost when it misfires is a 40px correction nobody perceives.
   *   - `hashchange` also fires on back/forward, so history traversal to a
   *     fragment entry re-jumps. That is the same place the browser was going.
   *   - pushState/replaceState do not emit `hashchange`, so a same-route
   *     fragment link would not be caught. There is no such link: the only
   *     inbound one is from /dashboard/profile, a different route, which
   *     remounts this component and re-runs the effect through `me`.
   * Grep before "fixing" any of these: if a same-route fragment link ever
   * lands on this page, the third one becomes real.
   *
   * Three things the first version of this got wrong, found by an adversarial
   * review pass on 2026-07-28:
   *
   * 1. It could yank someone who was already reading. A visitor who arrives
   *    with a fragment and starts scrolling during the several seconds of data
   *    load would be dragged back the moment `me` landed. The load-time jump
   *    now stands down if they have scrolled at all. An explicit click is
   *    different: that IS a request to move, so hashchange ignores the guard.
   * 2. It never fired on hash-only navigation. If the page is already loaded,
   *    `me` does not change, so a second fragment link did nothing here. The
   *    browser usually handles that case natively, which is why it was not
   *    visible, but "usually" is not a guarantee worth resting on.
   * 3. It did not decode the fragment, so an id with an escaped character
   *    would never match. Nothing on this page needs it today. Both the
   *    decoded and raw forms are tried, so a malformed escape degrades to the
   *    old behaviour instead of throwing. */
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    let raf = 0;

    const jump = (respectExistingScroll: boolean) => {
      const raw = window.location.hash.slice(1);
      if (!raw) return;
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        /* malformed escape: fall back to the raw fragment */
      }
      if (respectExistingScroll && window.scrollY > 40) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (cancelled) return;
        const el =
          document.getElementById(decoded) ?? document.getElementById(raw);
        if (el instanceof HTMLDetailsElement) el.open = true;
        el?.scrollIntoView({ block: "start" });
      });
    };

    jump(true);
    const onHashChange = () => jump(false);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [me]);

  function patch(p: Partial<ApplicationProfile>) {
    setProfile((prev) => ({ ...(prev ?? {}), ...p }));
  }

  async function saveAutomation(patch: Partial<{ automatic_submission_enabled: boolean; automatic_verification_enabled: boolean }>) {
    if (automaticSubmission === null || automaticVerification === null) return;
    const previousSubmission = automaticSubmission;
    const previousVerification = automaticVerification;
    if (patch.automatic_submission_enabled !== undefined) setAutomaticSubmission(patch.automatic_submission_enabled);
    if (patch.automatic_verification_enabled !== undefined) setAutomaticVerification(patch.automatic_verification_enabled);
    setSavingAutomation(true);
    setError(null);
    try {
      const result = await setAutomationSettings(patch);
      setAutomaticSubmission(result.automatic_submission_enabled ?? previousSubmission);
      setAutomaticVerification(result.automatic_verification_enabled);
    } catch (err) {
      setAutomaticSubmission(previousSubmission);
      setAutomaticVerification(previousVerification);
      setError(err instanceof Error ? err.message : "Could not save that change.");
    } finally {
      setSavingAutomation(false);
    }
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...profile };
      // GET echoes back row metadata the PUT schema doesn't accept.
      delete body.id;
      delete body.user_id;
      delete body.created_at;
      delete body.updated_at;
      delete body.eeo_prefs;
      const res = await api<ApplicationProfile>("/profile/application", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setProfile(res);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function connectProvider(provider: EmailProvider) {
    setConnectionBusy(provider);
    setError(null);
    try {
      const result = await createEmailConnection(provider);
      window.location.assign(result.redirect_url);
    } catch (err) {
      setConnectionBusy(null);
      setError(err instanceof Error ? err.message : "Could not start the email connection.");
    }
  }

  async function disconnectProvider(provider: EmailProvider) {
    const label = provider === "gmail" ? "Gmail" : "Outlook";
    if (!window.confirm(`Disconnect ${label}? Litos will no longer be able to read verification codes from this account.`)) return;
    setConnectionBusy(provider);
    setError(null);
    try {
      await disconnectEmailConnection(provider);
      setEmailConnections(await getEmailConnections());
      setConnectionNotice(`${label} disconnected.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not disconnect ${label}.`);
    } finally {
      setConnectionBusy(null);
    }
  }

  async function startCheckout() {
    setCheckoutBusy(true);
    setError(null);
    try {
      const checkout = await createCheckout();
      if (!isLemonSqueezyCheckoutUrl(checkout.url)) throw new Error("Checkout returned an unsafe URL.");
      window.location.assign(checkout.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout is temporarily unavailable.");
      setCheckoutBusy(false);
    }
  }

  async function exportAccount() {
    setDataBusy("export");
    setError(null);
    try {
      const account = await api<Record<string, unknown>>("/account/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(account, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `litos-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export your data.");
    } finally {
      setDataBusy(null);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    const reportPasswordError = (message: string) => {
      setPasswordError(message);
      queueMicrotask(() => passwordErrorRef.current?.focus());
    };
    const passwordProblem = passwordFormProblem(newPassword, confirmPassword);
    if (passwordProblem) {
      reportPasswordError(passwordProblem);
      return;
    }
    setPasswordBusy(true);
    setPasswordNotice(null);
    setPasswordError(null);
    try {
      const result = await updatePasswordSession({
        apiUrl: API_URL,
        token: getToken() ?? "",
        password: newPassword,
        currentPassword,
        headers: litosClientHeaders(),
      });
      if (result.kind === "recovery_required") {
        clearSession();
        router.replace("/login?flow=recovery&reason=password-state");
        return;
      }
      if (result.kind === "rejected") {
        reportPasswordError(result.code === "recent_verification_required"
          ? "Verify your email from the sign-in page, then choose a password."
          : result.error);
        return;
      }
      setSession(result.token, result.email ?? me?.email ?? null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice("Password updated. Older sessions have been signed out.");
    } catch {
      reportPasswordError("Could not confirm the password update. Verify your email and try again.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function deleteAccount() {
    if (!me?.email) {
      setError("Add your email to save this work before deleting the account.");
      return;
    }
    const confirmation = window.prompt(`Type ${me.email} to delete your account.`);
    if (!me || confirmation === null) return;
    if (confirmation.trim().toLowerCase() !== me.email.toLowerCase()) {
      setError("Email did not match. Nothing was deleted.");
      return;
    }
    setDataBusy("delete");
    setError(null);
    try {
      await api("/account", { method: "DELETE", body: JSON.stringify({ confirm_email: me.email }) });
      clearSession();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your account.");
      setDataBusy(null);
    }
  }

  if (error && !profile) return <ErrorNote message={error} />;
  if (!me || profile === null || automaticSubmission === null || automaticVerification === null || emailConnections === null)
    return (
      <div className="space-y-6">
        <div className="rq-shimmer h-8 w-48 rounded-full" />
        <ShimmerRows rows={3} />
      </div>
    );

  const trialActive =
    me.trial_ends_at && new Date(me.trial_ends_at).getTime() > mountedAt;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink">Account</h1>
      </div>

      {error && <ErrorNote message={error} />}
      {connectionNotice && (
        <div className="rounded-inner border border-border bg-surface-alt px-4 py-3 text-sm text-ink">
          {connectionNotice}
        </div>
      )}

      {/* Account */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-ink">Account</h2>
          <button type="button" onClick={() => { clearSession(); router.replace("/"); }} className="min-h-11 px-2 text-sm text-muted hover:text-ink">Sign out</button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-faint">Email</p>
            <p className="mt-0.5 font-mono text-sm text-ink">{me.email ?? "Not saved yet"}</p>
          </div>
          <div>
            <p className="text-xs text-faint">Plan</p>
            <div className="mt-1">
              <Chip
                label={me.tier === "pro" ? "Pro" : me.tier.charAt(0).toUpperCase() + me.tier.slice(1)}
                kind={me.tier === "pro" ? "ready" : "draft"}
              />
              {trialActive && (
                <span className="ml-2 text-xs text-muted">
                  trial until {new Date(me.trial_ends_at!).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-5 text-xs font-medium text-muted">Email connections</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(["gmail", "outlook"] as const).map((provider) => {
            const connection = emailConnections.connections.find((item) => item.provider === provider);
            const connected = connection?.connected === true;
            const label = provider === "gmail" ? "Gmail" : "Outlook";
            return (
              <div key={provider} className="flex items-center justify-between rounded-inner border border-border bg-surface px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {!emailConnections.configured ? "Unavailable" : connected ? "Connected" : connection?.status === "EXPIRED" ? "Reconnect required" : "Not connected"}
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={!emailConnections.configured || connectionBusy !== null}
                  onClick={() => void (connected ? disconnectProvider(provider) : connectProvider(provider))}
                  variant={connected ? "secondary" : "primary"}
                  size="sm"
                >
                  {connectionBusy === provider ? "Working..." : connected ? "Disconnect" : connection?.status === "EXPIRED" ? "Reconnect" : "Connect"}
                </Button>
              </div>
            );
          })}
        </div>
        {me.email && (
          <details className="mt-6 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">Password</summary>
          <form onSubmit={changePassword} className="pt-4">
            <h3 className="text-sm font-medium text-ink">Set or change password</h3>
            <p className="mt-1 text-xs leading-5 text-muted">
              Use 15 to 128 characters. Changing it signs out every older session.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => { setCurrentPassword(event.target.value); setPasswordError(null); }}
                placeholder="Current password"
                aria-label="Current password"
                className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => { setNewPassword(event.target.value); setPasswordError(null); }}
                placeholder="New password"
                aria-label="New password"
                className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => { setConfirmPassword(event.target.value); setPasswordError(null); }}
                placeholder="Confirm new password"
                aria-label="Confirm new password"
                className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            {passwordError && (
              <p
                ref={passwordErrorRef}
                tabIndex={-1}
                className="mt-3 text-sm text-danger outline-none"
                role="alert"
                aria-live="assertive"
              >
                {passwordError}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={passwordBusy} >
                {passwordBusy ? "Updating..." : "Update password"}
              </Button>
              <button type="button" onClick={() => { clearSession(); router.push("/login?flow=recovery"); }} className="text-xs text-muted hover:text-ink">
                Sign out and verify email to reset it
              </button>
              {passwordNotice && <span className="text-xs text-positive" role="status">{passwordNotice}</span>}
            </div>
          </form>
          </details>
        )}
      </Card>

      <Card className="p-6">
        <details>
        <summary className="cursor-pointer text-base font-medium text-ink">Automation</summary>
        <div className="pt-1">
        <p className="text-sm leading-6 text-muted">Choose what Litos can do for you.</p>
        <div className="mt-5 space-y-4">
          {/* Locked until the student has personally approved a few real submissions. LazyApply
              sells exactly this switch and its Trustpilot split is 44% five-star / 52% one-star,
              with users reporting permanently restricted LinkedIn accounts. The lock is enforced on
              the server; this copy exists so the control is not an unexplained dead toggle. */}
          <label className="flex items-start justify-between gap-5 rounded-inner border border-border p-4">
            <span>
              <span className="block text-sm font-medium text-ink">Send an application without asking me again</span>
              <span className="mt-1 block text-xs leading-5 text-muted">Send the forms you start, but only when every answer is backed up and the site puts nothing in the way.</span>
              {consentEligibility && !consentEligibility.eligible && !automaticSubmission && (
                <span className="mt-2 block text-xs leading-5 text-warn">
                  Available after you have approved {consentEligibility.required} applications
                  yourself. {consentEligibility.remaining} to go. That way you have seen what Litos
                  fills in on a real form before it sends one without you.
                </span>
              )}
            </span>
            <input
              aria-label="Send an application without asking me again"
              type="checkbox"
              checked={automaticSubmission}
              // Never disabled while it is ON: a safety gate the student cannot re-arm is not one.
              disabled={savingAutomation || (!automaticSubmission && consentEligibility?.eligible === false)}
              onChange={(event) => void saveAutomation({ automatic_submission_enabled: event.target.checked })}
              className="mt-1 size-4 accent-[#6b84e8] disabled:opacity-40"
            />
          </label>
          <label className="flex items-start justify-between gap-5 rounded-inner border border-border p-4">
            <span><span className="block text-sm font-medium text-ink">Read the code a company emails me</span><span className="mt-1 block text-xs leading-5 text-muted">Use connected Gmail or Outlook only to find a code tied to an active application.</span></span>
            <input aria-label="Read the code a company emails me" type="checkbox" checked={automaticVerification} disabled={savingAutomation} onChange={(event) => void saveAutomation({ automatic_verification_enabled: event.target.checked })} className="mt-1 size-4 accent-[#6b84e8]" />
          </label>
        </div>
        <p className="mt-4 text-xs leading-5 text-faint">Litos stops when an answer is missing or the site needs you.</p>
        </div>
        </details>
      </Card>

      {/* VISA SPONSORSHIP.
          Its own card rather than a row inside "Answers you give every time", because it is not an
          answer Litos gives: it never reaches an employer's form (R-004), it decides which jobs
          exist on your board. Filed next to the automation card for the same reason - both are
          about what the product does on your behalf.

          The switch is deliberately dead when `locked`. Someone who declared a need for
          sponsorship during setup cannot turn the filter off (the server refuses either way), and a
          control that looks live and silently fails is worse than one that explains why it is
          fixed. */}
      {sponsorship && (
        <Card className="p-6" id="visa-sponsorship">
          <details>
          <summary className="cursor-pointer text-base font-medium text-ink">Visa sponsorship filter</summary>
          <div className="pt-1">
          <p className="text-sm leading-6 text-muted">Only show jobs where sponsorship is confirmed.</p>
          {sponsorError && <div className="mt-4"><ErrorNote message={sponsorError} /></div>}
          <label className="mt-5 flex items-start justify-between gap-5 rounded-inner border border-border p-4">
            <span>
              <span className="block text-sm font-medium text-ink">Only show jobs where sponsorship is confirmed</span>
              <span className="mt-1 block text-xs leading-5 text-muted">
                We check H-1B filings with the US government (approved petitions, and applications
                the Labor Department certified), and what each job post says about sponsorship. A
                post that rules sponsorship out is hidden even when the company sponsors for other
                roles.
              </span>
              {sponsorship.locked && (
                <span className="mt-2 block text-xs leading-5 text-warn">
                  You told us during setup that you need a work visa, so this stays on. Contact
                  support if that has changed.
                </span>
              )}
              {sponsorship.evidence && (
                <span className="mt-2 block text-xs leading-5 text-faint">
                  {sponsorship.evidence.confirmed_employers} of the{" "}
                  {sponsorship.evidence.checked_employers} companies Litos watches have H-1B filings
                  on record. Sources: {sponsorship.evidence.source} (FY
                  {sponsorship.evidence.fiscal_years[0]} to FY
                  {sponsorship.evidence.fiscal_years[sponsorship.evidence.fiscal_years.length - 1]})
                  {sponsorship.evidence.lca_source
                    ? `, and ${sponsorship.evidence.lca_source}${
                        sponsorship.evidence.lca_quarters?.length
                          ? ` (${sponsorship.evidence.lca_quarters[0].split("_")[0]})`
                          : ""
                      }.`
                    : "."}
                </span>
              )}
            </span>
            <input
              aria-label="Only show jobs where sponsorship is confirmed"
              type="checkbox"
              checked={sponsorship.sponsor_only_board}
              disabled={sponsorBusy || sponsorship.locked}
              onChange={async (event) => {
                setSponsorBusy(true);
                setSponsorError(null);
                try {
                  const next = await setSponsorFilter(event.target.checked);
                  setSponsorship({ ...next, evidence: sponsorship.evidence });
                } catch (reason) {
                  setSponsorError(reason instanceof Error ? reason.message : "Could not change that.");
                } finally {
                  setSponsorBusy(false);
                }
              }}
              className="mt-1 size-4 accent-[#6b84e8] disabled:opacity-40"
            />
          </label>
          <p className="mt-4 text-xs leading-5 text-faint">
            A filing record is not a promise to sponsor you. It is proof the company has sponsored
            people before.
          </p>
          </div>
          </details>
        </Card>
      )}

      {/* Application profile.
          id="application-details" is load-bearing: /dashboard/profile's "Edit
          details" button links to /dashboard/settings#application-details, and
          that id existed nowhere, so the button landed on Settings and scrolled
          to nothing. Found 2026-07-28 by the new anchor guard in
          tests/route-integrity.test.mjs, which now fails if it goes missing
          again.

          scroll-mt-24 is the other half, and screenshots are what caught it:
          the jump put this card's top at y=0, and the dashboard's sticky header
          runs to y=73, so the section's own heading landed 48px BEHIND the
          header. Every numeric check passed ("cardTop 0, inView true") while
          the thing the reader came for was invisible. Same scroll-margin the
          homepage sections use. */}
      <details className="scroll-mt-24 rounded-card border border-border bg-surface" id="application-details">
        <summary className="cursor-pointer p-6 text-base font-medium text-ink">
          Application details
          <span className="mt-1 block text-sm font-normal text-muted">Contact, links, and form answers</span>
        </summary>
        <div className="px-6 pb-6">
        <div className="flex justify-end">
          <div className="flex items-center gap-3">
            {savedAt && !saving && <span className="text-xs text-positive">Saved</span>}
            <Button
              onClick={save}
              disabled={saving} >
              {saving ? <PendingLabel onColor>Saving...</PendingLabel> : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Phone" value={profile.phone} onChange={(v) => patch({ phone: v })} placeholder="+1 213 555 0100" />
          <Input label="City" value={profile.address_city} onChange={(v) => patch({ address_city: v })} placeholder="Los Angeles" />
          <Input label="Country (where you're based)" value={profile.address_country} onChange={(v) => patch({ address_country: v })} placeholder="United States" />
          <Input label="State / region" value={profile.address_state} onChange={(v) => patch({ address_state: v })} placeholder="CA" />
          <Input label="ZIP / postal code" value={profile.address_zip} onChange={(v) => patch({ address_zip: v })} placeholder="90007" />
          <Input label="LinkedIn URL" value={profile.linkedin_url} onChange={(v) => patch({ linkedin_url: v })} placeholder="https://linkedin.com/in/you" />
          <Input label="GitHub URL" value={profile.github_url} onChange={(v) => patch({ github_url: v })} placeholder="https://github.com/you" />
          <Input label="Portfolio URL" value={profile.portfolio_url} onChange={(v) => patch({ portfolio_url: v })} placeholder="https://you.dev" />
          <Input label="Citizenship" value={profile.citizenship} onChange={(v) => patch({ citizenship: v })} placeholder="United States" />
          <Select
            label="Authorized to work?"
            value={profile.work_authorized}
            onChange={(v) => patch({ work_authorized: v })}
          />
          <Select
            label="Need sponsorship?"
            value={profile.needs_sponsorship}
            onChange={(v) => patch({ needs_sponsorship: v })}
          />
          <Input label="Major" value={profile.major} onChange={(v) => patch({ major: v })} placeholder="Computer Science" />
          <LanguagesInput
            label="Languages you are fluent in"
            value={profile.languages}
            onChange={(v) => patch({ languages: v })}
            placeholder="English, Hindi, Spanish"
          />
          {/* Value AND scale, both stored (R-005). A bare "3.89" cannot be answered onto a form
              asking for a percentage or a UK classification without knowing what it was earned
              on, and guessing there would be a fabricated academic claim. */}
          <Input label="GPA" value={profile.gpa} onChange={(v) => patch({ gpa: v })} placeholder="3.89" />
          <Input label="GPA scale" value={profile.gpa_scale} onChange={(v) => patch({ gpa_scale: v })} placeholder="4.0" />
          <Input label="Available from" value={profile.availability_date} onChange={(v) => patch({ availability_date: v })} placeholder="Immediately" />
          <Input label="Desired salary" value={profile.desired_salary} onChange={(v) => patch({ desired_salary: v })} placeholder="Open / market rate" />
          {/* A figure without a unit is not an answer: replaying "80000" from a Munich posting
              onto a Toronto one states something you never said. Both or neither get filled. */}
          <Input label="Salary currency" value={profile.desired_salary_currency} onChange={(v) => patch({ desired_salary_currency: v })} placeholder="USD" />
          <Input label="How did you hear about us? (default answer)" value={profile.referral_source_default} onChange={(v) => patch({ referral_source_default: v })} placeholder="Company careers page" />
        </div>

        <p className="mt-5 text-xs leading-5 text-faint">Personal questions stay unanswered unless you choose an answer.</p>
        </div>
      </details>

      {/* Plan + usage */}
      <Card className="p-6">
        <h2 className="text-base font-medium text-ink">Plan and usage</h2>
        <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Meter label="Verified contacts" used={me.usage.contacts.used} limit={me.usage.contacts.limit} />
          <Meter label="Outreach drafts" used={me.usage.drafts.used} limit={me.usage.drafts.limit} />
          <Meter label="Tailored resumes" used={me.usage.resumes.used} limit={me.usage.resumes.limit} />
        </div>
        {me.checkout_available && !trialActive ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-inner bg-brand-soft px-5 py-4">
            {/* No price or quota stated here. The plan is being reworked and
                a stale number is worse than none: checkout is the one place
                that shows the real price, and it is always current. */}
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">Need more room? </span>
              Cancelling takes the same number of clicks as signing up.
            </p>
            {me.is_guest ? <ButtonLink href="/login?claim=1&next=upgrade">
              Upgrade to Pro
            </ButtonLink> : <Button
              type="button"
              disabled={checkoutBusy}
              onClick={() => void startCheckout()} >
              {checkoutBusy ? "Opening..." : "Upgrade to Pro"}
            </Button>}
          </div>
        ) : me.tier === "pro" ? (
          <div className="mt-6 border-t border-border pt-5 text-sm text-muted">
            You are on Pro. {me.billing_portal_url ? <a className="font-medium text-brand hover:text-brand-ink" href={me.billing_portal_url}>Manage or cancel your subscription</a> : "Contact support to manage or cancel."}
          </div>
        ) : null}
      </Card>

      {/* Data */}
      <Card className="p-6">
        <h2 className="text-base font-medium text-ink">Your data</h2>
        <p className="mt-1 text-sm text-muted">Download your data or permanently remove your account.</p>
        <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5">
          <button type="button" onClick={() => void exportAccount()} disabled={dataBusy !== null} className="min-h-11 rounded-full border border-border px-5 text-sm font-medium text-ink disabled:opacity-50">{dataBusy === "export" ? "Preparing..." : "Export data"}</button>
          <button type="button" onClick={() => void deleteAccount()} disabled={dataBusy !== null} className="min-h-11 px-3 text-sm font-medium text-danger disabled:opacity-50">{dataBusy === "delete" ? "Deleting..." : "Delete account"}</button>
          <a href="/privacy" className="ml-auto inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">Privacy</a>
        </div>
      </Card>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted">{label}</label>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
    </div>
  );
}

/* Comma-separated text over a chip widget on purpose: every other field on this
   page is a plain input, and the backend wants a plain array of language names.
   Local text state keeps typing natural (a trailing comma is not destroyed by a
   re-render); the parsed array is what lands in the profile. */
function LanguagesInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[] | null | undefined;
  onChange: (v: string[] | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState((value ?? []).join(", "));
  return (
    <div>
      <label className="block text-xs font-medium text-muted">{label}</label>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(parsed.length > 0 ? parsed : null);
        }}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean | null) => void;
}) {
  const current = value === true ? "yes" : value === false ? "no" : "";
  return (
    <div>
      <label className="block text-xs font-medium text-muted">{label}</label>
      <select
        value={current}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value === "yes")
        }
        className="mt-1.5 w-full rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-ink outline-none focus:border-brand"
      >
        {TRI.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
