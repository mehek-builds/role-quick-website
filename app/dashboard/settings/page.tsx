"use client";

import { useEffect, useState } from "react";
import {
  api,
  ApplicationProfile,
  createEmailConnection,
  disconnectEmailConnection,
  type EmailConnectionsResponse,
  type EmailProvider,
  getEmailConnections,
  getOnboardingState,
  Me,
  setAutomaticVerification,
} from "@/lib/api";
import { Card, Chip, Meter, PendingLabel, ShimmerRows, ErrorNote } from "@/components/app/ui";
import TargetingCard from "@/components/app/TargetingCard";

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
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<ApplicationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [automaticVerification, setAutomaticVerificationState] = useState<boolean | null>(null);
  const [savingVerification, setSavingVerification] = useState(false);
  const [emailConnections, setEmailConnections] = useState<EmailConnectionsResponse | null>(null);
  const [connectionBusy, setConnectionBusy] = useState<EmailProvider | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const callbackProvider = new URLSearchParams(window.location.search).get("connection") as EmailProvider | null;
        const callbackStatus = new URLSearchParams(window.location.search).get("status");
        const [meRes, profileRes, onboardingRes, initialConnections] = await Promise.all([
          api<Me>("/me"),
          api<ApplicationProfile>("/profile/application").catch(() => ({})),
          getOnboardingState(),
          getEmailConnections(),
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
        setAutomaticVerificationState(onboardingRes.automatic_verification_enabled);
        setEmailConnections(connectionRes);
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

  function patch(p: Partial<ApplicationProfile>) {
    setProfile((prev) => ({ ...(prev ?? {}), ...p }));
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

  async function changeAutomaticVerification(enabled: boolean) {
    const previous = automaticVerification;
    setAutomaticVerificationState(enabled);
    setSavingVerification(true);
    setError(null);
    try {
      const result = await setAutomaticVerification(enabled);
      setAutomaticVerificationState(result.automatic_verification_enabled);
    } catch (err) {
      setAutomaticVerificationState(previous);
      setError(err instanceof Error ? err.message : "Could not update verification permission.");
    } finally {
      setSavingVerification(false);
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

  if (error && !profile) return <ErrorNote message={error} />;
  if (!me || profile === null || automaticVerification === null || emailConnections === null)
    return (
      <div className="space-y-6">
        <div className="rq-shimmer h-8 w-48 rounded-full" />
        <ShimmerRows rows={3} />
      </div>
    );

  const trialActive =
    me.trial_ends_at && new Date(me.trial_ends_at).getTime() > Date.now();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Account, application details, and plan.
        </p>
      </div>

      {error && <ErrorNote message={error} />}
      {connectionNotice && (
        <div className="rounded-[12px] border border-teal/30 bg-teal-soft px-4 py-3 text-sm text-teal-ink">
          {connectionNotice}
        </div>
      )}

      {/* Account */}
      <Card className="p-6">
        <h2 className="text-base font-medium text-ink">Account</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-faint">Email</p>
            <p className="mt-0.5 font-mono text-sm text-ink">{me.email}</p>
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
              <div key={provider} className="flex items-center justify-between rounded-[12px] border border-border bg-surface px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {!emailConnections.configured ? "Unavailable" : connected ? "Connected" : connection?.status === "EXPIRED" ? "Reconnect required" : "Not connected"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!emailConnections.configured || connectionBusy !== null}
                  onClick={() => void (connected ? disconnectProvider(provider) : connectProvider(provider))}
                  className={connected ? "rounded-full border border-border px-4 py-2 text-xs font-medium text-ink disabled:opacity-50" : "rounded-full bg-brand px-4 py-2 text-xs font-medium text-white disabled:opacity-50"}
                >
                  {connectionBusy === provider ? "Working..." : connected ? "Disconnect" : connection?.status === "EXPIRED" ? "Reconnect" : "Connect"}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-base font-medium text-ink">Application verification</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              With your permission, Litos can use your connected Gmail or Outlook account to find verification codes related to an active application. Codes are used only for that application and are not saved.
            </p>
            <p className="mt-2 text-xs leading-5 text-faint">
              Connect Gmail or Outlook above. Authentication is handled by Composio. CAPTCHA and unsupported verification steps still pause for you in the secure browser.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={automaticVerification}
              disabled={savingVerification}
              onChange={(event) => void changeAutomaticVerification(event.target.checked)}
              className="size-4 accent-[#6b84e8]"
            />
            {savingVerification ? "Saving..." : "Allowed"}
          </label>
        </div>
      </Card>

      {/* Application profile */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-ink">Application details</h2>
            <p className="mt-1 text-sm text-muted">
              What autofill types into forms. Phone, location, citizenship,
              availability, and salary are encrypted at rest.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && !saving && <span className="text-xs text-positive">Saved</span>}
            <button
              onClick={save}
              disabled={saving}
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <PendingLabel onColor>Saving...</PendingLabel> : "Save changes"}
            </button>
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
          <Input label="Grade average" value={profile.gpa} onChange={(v) => patch({ gpa: v })} placeholder="3.89" />
          <Input label="Grade scale" value={profile.gpa_scale} onChange={(v) => patch({ gpa_scale: v })} placeholder="4.0" />
          <Input label="Available from" value={profile.availability_date} onChange={(v) => patch({ availability_date: v })} placeholder="Immediately" />
          <Input label="Desired salary" value={profile.desired_salary} onChange={(v) => patch({ desired_salary: v })} placeholder="Open / market rate" />
          {/* A figure without a unit is not an answer: replaying "80000" from a Munich posting
              onto a Toronto one states something you never said. Both or neither get filled. */}
          <Input label="Salary currency" value={profile.desired_salary_currency} onChange={(v) => patch({ desired_salary_currency: v })} placeholder="USD" />
          <Input label="How did you hear about us? (default answer)" value={profile.referral_source_default} onChange={(v) => patch({ referral_source_default: v })} placeholder="Company careers page" />
        </div>

        <p className="mt-5 text-xs leading-5 text-faint">
          Voluntary EEO self-identification always defaults to decline-to-answer
          and can only be changed by an explicit opt-in inside the extension.
          Work authorization is always asked, never inferred.
        </p>
      </Card>

      {/* What they're going after. Set at /start (categories and type at step 00, the rest at
          step 05) and, before this, editable nowhere - a student finished onboarding and could
          never change their own targeting again. */}
      <TargetingCard />

      {/* Plan + usage */}
      <Card className="p-6">
        <h2 className="text-base font-medium text-ink">Plan and usage</h2>
        <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Meter label="Verified contacts" used={me.usage.contacts.used} limit={me.usage.contacts.limit} />
          <Meter label="Outreach drafts" used={me.usage.drafts.used} limit={me.usage.drafts.limit} />
          <Meter label="Tailored resumes" used={me.usage.resumes.used} limit={me.usage.resumes.limit} />
        </div>
        {me.upgrade_url ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[14px] bg-brand-soft px-5 py-4">
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">Pro covers 500 jobs a month. </span>
              $49.99/mo. Canceling takes the same clicks as signing up, from
              the billing portal linked in your receipt email.
            </p>
            <a
              href={me.upgrade_url}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Upgrade to Pro
            </a>
          </div>
        ) : me.tier === "pro" ? (
          <p className="mt-6 border-t border-border pt-5 text-sm text-muted">
            You are on Pro. Manage or cancel any time from the billing portal
            linked in your receipt email, it takes the same clicks as signing
            up did.
          </p>
        ) : null}
      </Card>

      {/* Data */}
      <Card className="p-6">
        <h2 className="text-base font-medium text-ink">Your data</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Export or delete everything Litos stores about you by emailing{" "}
          <a href="mailto:mehekman@usc.edu" className="text-ink underline">
            mehekman@usc.edu
          </a>{" "}
          from your account address. Deletion removes your account, profile,
          experience bank, saved application details, drafts, autofill history,
          and every resume we generated for you, including the files. See{" "}
          <a href="/privacy" className="text-ink underline">
            Privacy
          </a>{" "}
          for what that covers and the one thing it does not.
        </p>
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
