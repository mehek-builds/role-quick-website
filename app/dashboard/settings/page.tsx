"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  ApplicationProfile,
  clearSession,
  createEmailConnection,
  disconnectEmailConnection,
  type EmailConnectionsResponse,
  type EmailProvider,
  getEmailConnections,
  getOnboardingState,
  getToken,
  Me,
  setSession,
  setAutomationSettings,
} from "@/lib/api";
import { Card, Chip, Meter, PendingLabel, ShimmerRows, ErrorNote } from "@/components/app/ui";
import { API_URL } from "@/lib/config";
import { passwordFormProblem } from "@/app/login/password-form";
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
  const [emailConnections, setEmailConnections] = useState<EmailConnectionsResponse | null>(null);
  const [connectionBusy, setConnectionBusy] = useState<EmailProvider | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());
  const [dataBusy, setDataBusy] = useState<"export" | "delete" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

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
        setAutomaticSubmission(onboardingRes.automatic_submission_enabled);
        setAutomaticVerification(onboardingRes.automatic_verification_enabled);
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
      setAutomaticSubmission(result.automatic_submission_enabled);
      setAutomaticVerification(result.automatic_verification_enabled);
    } catch (err) {
      setAutomaticSubmission(previousSubmission);
      setAutomaticVerification(previousVerification);
      setError(err instanceof Error ? err.message : "Could not update automation permissions.");
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
    const passwordProblem = passwordFormProblem(newPassword, confirmPassword);
    if (passwordProblem) {
      setError(passwordProblem);
      return;
    }
    setPasswordBusy(true);
    setPasswordNotice(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
          ...litosClientHeaders(),
        },
        body: JSON.stringify({
          password: newPassword,
          ...(currentPassword ? { current_password: currentPassword } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        if (data?.code === "recent_verification_required") {
          setError("Verify your email from the sign-in page, then choose a password.");
        } else {
          setError(data?.error ?? "Could not update your password.");
        }
        return;
      }
      setSession(data.token, data.email ?? me?.email ?? null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice("Password updated. Older sessions have been signed out.");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function deleteAccount() {
    if (!me?.email) {
      setError("Save this guest workspace with an email before deleting the account.");
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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-ink">Account</h2>
          <button type="button" onClick={() => { clearSession(); router.replace("/"); }} className="min-h-11 px-2 text-sm text-muted hover:text-ink">Sign out</button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-faint">Email</p>
            <p className="mt-0.5 font-mono text-sm text-ink">{me.email ?? "Guest workspace"}</p>
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
        {me.email && (
          <form onSubmit={changePassword} className="mt-6 border-t border-border pt-6">
            <h3 className="text-sm font-medium text-ink">Set or change password</h3>
            <p className="mt-1 text-xs leading-5 text-muted">
              Use 15 to 128 characters. Changing it signs out every older session.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                aria-label="Current password"
                className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
              <input
                type="password"
                required
                minLength={15}
                maxLength={128}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                aria-label="New password"
                className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
              <input
                type="password"
                required
                minLength={15}
                maxLength={128}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                aria-label="Confirm new password"
                className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button type="submit" disabled={passwordBusy} className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
                {passwordBusy ? "Updating..." : "Update password"}
              </button>
              <button type="button" onClick={() => { clearSession(); router.push("/login?flow=recovery"); }} className="text-xs text-muted hover:text-ink">
                Sign out and verify email to reset it
              </button>
              {passwordNotice && <span className="text-xs text-positive" role="status">{passwordNotice}</span>}
            </div>
          </form>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-medium text-ink">Application automation</h2>
        <p className="mt-1 text-sm leading-6 text-muted">These permissions are separate and can be revoked at any time. A revocation is checked again before a final portal submission.</p>
        <div className="mt-5 space-y-4">
          <label className="flex items-start justify-between gap-5 rounded-[14px] border border-border p-4">
            <span><span className="block text-sm font-medium text-ink">Automatic submission</span><span className="mt-1 block text-xs leading-5 text-muted">Submit applications you start when all answers are supported and the portal has no safety blocker.</span></span>
            <input aria-label="Automatic submission" type="checkbox" checked={automaticSubmission} disabled={savingAutomation} onChange={(event) => void saveAutomation({ automatic_submission_enabled: event.target.checked })} className="mt-1 size-4 accent-[#6b84e8]" />
          </label>
          <label className="flex items-start justify-between gap-5 rounded-[14px] border border-border p-4">
            <span><span className="block text-sm font-medium text-ink">Application verification codes</span><span className="mt-1 block text-xs leading-5 text-muted">Use connected Gmail or Outlook only to find a code tied to an active application.</span></span>
            <input aria-label="Application verification codes" type="checkbox" checked={automaticVerification} disabled={savingAutomation} onChange={(event) => void saveAutomation({ automatic_verification_enabled: event.target.checked })} className="mt-1 size-4 accent-[#6b84e8]" />
          </label>
        </div>
        <p className="mt-4 text-xs leading-5 text-faint">Litos still pauses for missing or contradictory facts, sensitive attestations, CAPTCHA, unsupported portal behavior, and uncertain confirmation.</p>
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

      {/* Plan + usage */}
      <Card className="p-6">
        <h2 className="text-base font-medium text-ink">Plan and usage</h2>
        <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Meter label="Verified contacts" used={me.usage.contacts.used} limit={me.usage.contacts.limit} />
          <Meter label="Outreach drafts" used={me.usage.drafts.used} limit={me.usage.drafts.limit} />
          <Meter label="Tailored resumes" used={me.usage.resumes.used} limit={me.usage.resumes.limit} />
        </div>
        {me.upgrade_url && !trialActive ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[14px] bg-brand-soft px-5 py-4">
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">Pro covers 500 jobs a month. </span>
              $49.99/mo. Canceling takes the same clicks as signing up, from
              the billing portal linked in your receipt email.
            </p>
            <a
              href={me.is_guest ? "/login?claim=1&next=upgrade" : me.upgrade_url}
              onClick={() => {
                if (me.is_guest && me.upgrade_url) {
                  window.sessionStorage.setItem("litos_pending_upgrade_url", me.upgrade_url);
                }
              }}
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
