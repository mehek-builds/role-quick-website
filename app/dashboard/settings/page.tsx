"use client";

import { useEffect, useMemo, useState } from "react";
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
  getPricingOffer,
  Me,
  setAutomationSettings,
  type BillingInterval,
  type PricingOffer,
} from "@/lib/api";
import { countryName, formatUsd, isLemonSqueezyCheckoutUrl, loadPricingSelection, savePricingSelection } from "@/lib/billing";
import { track } from "@/lib/analytics";
import { Card, Chip, Meter, PendingLabel, ShimmerRows, ErrorNote } from "@/components/app/ui";

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
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [pricingSubject, setPricingSubject] = useState<string | null>(null);
  const [pricingCountry, setPricingCountry] = useState<string | null>(null);
  const [pricingInterval, setPricingInterval] = useState<BillingInterval>("yearly");
  const [pricingOffer, setPricingOffer] = useState<PricingOffer | null>(null);
  const [pricingCountries, setPricingCountries] = useState<string[]>([]);
  const [pricingError, setPricingError] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());
  const [dataBusy, setDataBusy] = useState<"export" | "delete" | null>(null);

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

  useEffect(() => {
    const selection = loadPricingSelection();
    queueMicrotask(() => {
      setPricingSubject(selection.subjectId);
      setPricingCountry(selection.countryCode);
      setPricingInterval(selection.interval);
    });
  }, []);

  useEffect(() => {
    if (!pricingSubject) return;
    let cancelled = false;
    void getPricingOffer(pricingSubject, pricingCountry, pricingInterval).then((response) => {
      if (cancelled) return;
      setPricingOffer(response.offer);
      setPricingCountries(response.countries);
      setPricingLoading(false);
      savePricingSelection(response.offer);
      track("pricing_quote_viewed", {
        source: "settings",
        band: response.offer.band,
        country: response.offer.country_code,
        interval: response.offer.interval,
        amount_cents: response.offer.amount_cents,
        experiment_variant: response.offer.experiment_variant,
      });
    }).catch(() => {
      if (!cancelled) {
        setPricingError(true);
        setPricingLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [pricingCountry, pricingInterval, pricingSubject]);

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

  async function startCheckout() {
    setCheckoutBusy(true);
    setError(null);
    try {
      if (!pricingOffer || !pricingSubject || pricingLoading) throw new Error("Pricing is still loading.");
      const checkout = await createCheckout({
        subject_id: pricingSubject,
        country_code: pricingCountry,
        interval: pricingInterval,
        quote_token: pricingOffer.quote_token,
      });
      if (!isLemonSqueezyCheckoutUrl(checkout.url)) throw new Error("Checkout returned an unsafe URL.");
      track("pricing_checkout_started", {
        source: "settings",
        country: checkout.offer.country_code,
        band: checkout.offer.band,
        interval: checkout.offer.interval,
        amount_cents: checkout.offer.amount_cents,
        experiment_variant: checkout.offer.experiment_variant,
      });
      window.location.assign(checkout.url);
    } catch (checkoutError) {
      track("pricing_checkout_failed", { source: "settings" });
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout is temporarily unavailable.");
      setCheckoutBusy(false);
    }
  }

  const pricingCountryOptions = useMemo(() => pricingCountries
    .filter((code) => code !== "ZZ")
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [pricingCountries]);

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
        {(me.checkout_intervals?.monthly || me.checkout_intervals?.yearly || me.checkout_available) && !trialActive ? (
          <div className="mt-6 rounded-[14px] bg-brand-soft px-5 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-muted">
                Billing period
                <select value={pricingInterval} onChange={(event) => {
                  const next = event.target.value as BillingInterval;
                  setPricingLoading(true);
                  setPricingError(false);
                  setPricingInterval(next);
                  track("pricing_interval_changed", { source: "settings", interval: next });
                }} className="mt-1 block rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label className="min-w-56 text-xs font-medium text-muted">
                Billing country
                <select value={pricingCountry ?? ""} onChange={(event) => {
                  const next = event.target.value || null;
                  setPricingLoading(true);
                  setPricingError(false);
                  setPricingCountry(next);
                  track("pricing_country_changed", { source: "settings", country: next ?? "automatic" });
                }} className="mt-1 block w-full rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink">
                  <option value="">Detect my country</option>
                  {pricingCountryOptions.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-muted">
                <p><span className="font-medium text-ink">Pro covers 1,000 resumes a month. </span>
                  {!pricingLoading && pricingOffer ? `${formatUsd(pricingOffer.amount_cents / (pricingOffer.interval === "yearly" ? 12 : 1))}/mo` : pricingError ? "Standard price will be verified at checkout." : "Loading regional price..."}
                </p>
                {pricingOffer && <p className="mt-1 text-xs">{pricingOffer.interval === "yearly" ? `Billed ${formatUsd(pricingOffer.amount_cents)} yearly. ` : "Billed monthly. "}{countryName(pricingOffer.country_code)} pricing in USD. Cancel from the billing portal.</p>}
                {pricingOffer?.band === "access" && <p className="mt-1 text-xs font-medium text-positive">Regional access discount applied.</p>}
              </div>
              {me.is_guest ? <button
                type="button"
                disabled={!pricingOffer || pricingLoading}
                onClick={() => {
                  if (pricingOffer) savePricingSelection(pricingOffer);
                  router.push("/login?claim=1&next=upgrade");
                }}
                className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >Upgrade to Pro</button> : <button
                type="button"
                disabled={checkoutBusy || pricingLoading || !pricingOffer || me.checkout_intervals?.[pricingInterval] === false}
                onClick={() => void startCheckout()}
                className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >{checkoutBusy ? "Opening checkout..." : "Upgrade to Pro"}</button>}
            </div>
          </div>
        ) : me.tier === "pro" ? (
          <div className="mt-6 border-t border-border pt-5 text-sm text-muted">
            You are on Pro. {me.billing_portal_url ? <a className="font-medium text-brand hover:text-brand-ink" href={me.billing_portal_url}>Manage or cancel in Lemon Squeezy</a> : "Use the billing portal linked in your receipt email to manage or cancel."}
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
