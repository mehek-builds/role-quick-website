"use client";

import { Button, ButtonLink } from "@/components/app/Button";
import { AvailabilityWindowTable } from "@/components/app/AvailabilityWindowTable";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  ApplicationProfile,
  type ApplicationEmailStatusResponse,
  clearSession,
  createBillingPortal,
  createCheckout,
  createEmailConnection,
  disconnectEmailConnection,
  type EmailConnectionsResponse,
  type EmailProvider,
  getApplicationEmailStatus,
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
import { isSafeCheckoutUrl, isStripePortalUrl } from "@/lib/billing";
import { applicationEmailAddressInUse, applicationEmailBadge } from "@/lib/application-email-status";
import { Card, Chip, Meter, PendingLabel, ShimmerRows, ErrorNote } from "@/components/app/ui";
import { API_URL } from "@/lib/config";
import { passwordFormProblem } from "@/app/login/password-form";
import { updatePasswordSession } from "@/app/login/password-session";
import { litosClientHeaders } from "@/lib/product";
import { track } from "@/lib/analytics";
import {
  hasActiveInbox,
  shouldEnableVerificationAfterCallback,
  VERIFICATION_CONNECTION_INTENT_KEY,
  verificationEnableDecision,
  verificationRouteAvailability,
} from "./email-verification-flow";
import TargetingCard from "@/components/app/TargetingCard";
import DocumentsCard from "@/components/app/DocumentsCard";
import {
  editableProfileText,
  nullableProfileList,
  nullableProfileText,
} from "@/lib/application-profile-form";
import { CountryEligibilityEditor } from "@/components/app/CountryEligibilityEditor";
import {
  captchaConsentedAt,
  captchaConsentedAtReported,
  captchaConsentGranted,
  captchaConsentPatch,
  captchaConsentVerdict,
} from "@/lib/captcha-consent";
import { CaptchaConsentControl } from "@/components/app/CaptchaConsentControl";
import { ConsentAcknowledgementControl } from "@/components/app/ConsentAcknowledgementControl";
import {
  CONSENT_GRANTS,
  consentAcknowledgedAt,
  consentAcknowledgementGranted,
  consentAcknowledgementPatch,
  consentAcknowledgementVerdict,
  type ConsentGrantField,
} from "@/lib/consent-acknowledgement";
import {
  countryEligibilityProblem,
  eligibilitySeed,
  normalizedCountryEligibility,
  type CountryWorkEligibilityDraft,
} from "@/lib/work-eligibility";
import { MAX_COUNTRY_ELIGIBILITY_RECORDS } from "@/lib/work-eligibility-limit";

/* Application profile: exactly the fields the backend stores, including legacy
   fields retained only so a full-profile save cannot erase them. Rendering a
   field below does not by itself authorize the extension to reuse it. */

const TRI = [
  { value: "", label: "Not set" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const SELF_ID_OPTIONS = {
  gender: ["", "Female", "Male", "Non-binary", "Decline to self-identify"],
  transgender_status: ["", "Yes", "No", "Decline to self-identify"],
  sexual_orientation: ["", "Heterosexual", "Gay or lesbian", "Bisexual", "Decline to self-identify"],
  disability_status: ["", "Yes", "No", "Decline to self-identify"],
  veteran_status: ["", "Yes", "No", "Decline to self-identify"],
  race: ["", "White", "Asian", "Black or African American", "Hispanic or Latino", "Middle Eastern or North African", "Native American or Alaska Native", "Native Hawaiian or Pacific Islander", "Decline to self-identify"],
} as const;

const ACCOUNT_TABS = [
  { id: "job-search", label: "Job search" },
  { id: "application-details", label: "Application details" },
  { id: "automation", label: "Automation" },
  { id: "plan", label: "Plan & usage" },
  { id: "sign-in", label: "Sign-in & data" },
] as const;

const DELETE_CONFIRMATION_PHRASE =
  "I am willingly deleting my account and I confirm that all of my history will be erased.";

type AccountTab = (typeof ACCOUNT_TABS)[number]["id"];

function tabFromHash(hash: string): AccountTab {
  const requested = hash.replace(/^#/, "");
  return ACCOUNT_TABS.some((tab) => tab.id === requested)
    ? (requested as AccountTab)
    : "job-search";
}

export default function Settings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<ApplicationProfile | null>(null);
  const [eligibilityDraft, setEligibilityDraft] = useState<CountryWorkEligibilityDraft[]>([]);
  const [eligibilityTouched, setEligibilityTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [automaticSubmission, setAutomaticSubmission] = useState<boolean | null>(null);
  const [automaticVerification, setAutomaticVerification] = useState<boolean | null>(null);
  /* The human-check permission, held as the server's VERDICT rather than as anything derived here.
     A plain boolean and not `boolean | null`: an API that predates this column omits it, and
     "absent" and "off" are the same state for a permission that account cannot hold. */
  const [captchaConsent, setCaptchaConsent] = useState(false);
  const [captchaConsentGrantedAt, setCaptchaConsentGrantedAt] = useState<string | null>(null);
  /* Its own in-flight flag, not savingAutomation. Sharing that one would re-couple through UI state
     the two writers the payload split exists to keep apart: whichever request settled first would
     clear the flag and re-enable both controls while the other was still in flight. */
  const [savingCaptchaConsent, setSavingCaptchaConsent] = useState(false);
  /* THE CONTROL /start's COPY PROMISES. That screen says "you can turn either of these off at any
     time in Settings", and until this existed that sentence was false: this page rendered only
     submission, verification and human checks. A revocation path that does not exist is not a
     revocation path. */
  const [consentGrants, setConsentGrants] = useState<Partial<Record<ConsentGrantField, boolean>>>({});
  const [consentGrantedAt, setConsentGrantedAt] = useState<Partial<Record<ConsentGrantField, string | null>>>({});
  const [savingConsentGrant, setSavingConsentGrant] = useState<ConsentGrantField | null>(null);
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
  const [applicationEmail, setApplicationEmail] = useState<ApplicationEmailStatusResponse | null>(null);
  const [connectionBusy, setConnectionBusy] = useState<EmailProvider | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState<"success" | "cancelled" | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [verificationConnectionPrompt, setVerificationConnectionPrompt] = useState(false);
  const [mountedAt] = useState(() => Date.now());
  const [dataBusy, setDataBusy] = useState<"export" | "delete" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordErrorRef = useRef<HTMLParagraphElement>(null);
  const [activeTab, setActiveTab] = useState<AccountTab>("job-search");
  const [savedProfileJson, setSavedProfileJson] = useState("");
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteComplete, setDeleteComplete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteConfirmed = deleteConfirmation === DELETE_CONFIRMATION_PHRASE;

  useEffect(() => {
    const syncTab = () => setActiveTab(tabFromHash(window.location.hash));
    syncTab();
    window.addEventListener("hashchange", syncTab);
    window.addEventListener("popstate", syncTab);
    return () => {
      window.removeEventListener("hashchange", syncTab);
      window.removeEventListener("popstate", syncTab);
    };
  }, []);

  function selectTab(tab: AccountTab) {
    setActiveTab(tab);
    window.history.pushState({}, "", `${window.location.pathname}${window.location.search}#${tab}`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function moveTab(current: AccountTab, key: string) {
    const currentIndex = ACCOUNT_TABS.findIndex((tab) => tab.id === current);
    const nextIndex = key === "Home"
      ? 0
      : key === "End"
        ? ACCOUNT_TABS.length - 1
        : key === "ArrowRight"
          ? (currentIndex + 1) % ACCOUNT_TABS.length
          : key === "ArrowLeft"
            ? (currentIndex - 1 + ACCOUNT_TABS.length) % ACCOUNT_TABS.length
            : currentIndex;
    const next = ACCOUNT_TABS[nextIndex];
    if (!next || next.id === current) return;
    selectTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const callbackProvider = query.get("connection") as EmailProvider | null;
        const callbackStatus = query.get("status");
        const billingReturn = query.get("billing");
        if (billingReturn === "success" || billingReturn === "cancelled") {
          setBillingNotice(billingReturn);
          setActiveTab("plan");
          window.history.replaceState({}, "", `${window.location.pathname}#plan`);
        }
        const [meRes, profileRes, onboardingRes, initialConnections, applicationEmailRes, sponsorRes] = await Promise.all([
          api<Me>("/me"),
          api<ApplicationProfile>("/profile/application").catch(() => ({})),
          getOnboardingState(),
          getEmailConnections(),
          getApplicationEmailStatus().catch(() => null),
          /* Null on a backend that predates this, which renders no card at all rather than an
             empty one. The two repos deploy separately and in either order. */
          getSponsorship().catch(() => null),
        ]);
        let connectionRes = initialConnections;
        let currentApplicationEmail = applicationEmailRes;
        if (callbackProvider && callbackStatus) {
          if (callbackStatus === "success") {
            for (let attempt = 0; attempt < 4 && !connectionRes.connections.some((item) => item.provider === callbackProvider && item.connected); attempt += 1) {
              await new Promise((resolve) => window.setTimeout(resolve, 750));
              connectionRes = await getEmailConnections();
            }
          }
          // A provider callback is a route-status change. Re-read the independent Litos inbox
          // probe too, so this screen never carries an old green status through the callback.
          currentApplicationEmail = await getApplicationEmailStatus().catch(() => null);
        }
        let resolvedVerification = onboardingRes.automatic_verification_enabled;
        let verificationEnableProblem: string | null = null;
        const intendedProvider = callbackProvider
          ? window.sessionStorage.getItem(VERIFICATION_CONNECTION_INTENT_KEY)
          : null;
        if (shouldEnableVerificationAfterCallback({
          callbackProvider,
          callbackStatus,
          intendedProvider,
          connections: connectionRes,
        })) {
          try {
            const enabled = await setAutomationSettings({ automatic_verification_enabled: true });
            resolvedVerification = enabled.automatic_verification_enabled;
          } catch (reason) {
            verificationEnableProblem = reason instanceof Error
              ? reason.message
              : "The inbox connected, but email verification could not be turned on.";
          }
        }
        if (callbackProvider && callbackStatus && intendedProvider === callbackProvider) {
          window.sessionStorage.removeItem(VERIFICATION_CONNECTION_INTENT_KEY);
        }
        if (cancelled) return;
        setMe(meRes);
        setProfile(profileRes);
        setSavedProfileJson(JSON.stringify(profileRes));
        setEligibilityDraft(eligibilitySeed(profileRes, onboardingRes.sponsorship_answer));
        setAutomaticSubmission(onboardingRes.automatic_submission_enabled);
        setConsentEligibility(onboardingRes.standing_consent_eligibility ?? null);
        setAutomaticVerification(resolvedVerification);
        /* Straight from the verdict field. A row whose stored consent version has been superseded
           arrives as false with its original date still attached, and the toggle must read that as
           not granted rather than reconstructing a grant from the date. For the accounts carrying
           the stale version this is the screen where they can grant it again. */
        setCaptchaConsent(captchaConsentGranted(onboardingRes));
        setCaptchaConsentGrantedAt(captchaConsentedAt(onboardingRes));
        setConsentGrants(Object.fromEntries(
          CONSENT_GRANTS.map((grant) => [grant.field, consentAcknowledgementGranted(onboardingRes, grant.field)]),
        ));
        setConsentGrantedAt(Object.fromEntries(
          CONSENT_GRANTS.map((grant) => [grant.field, consentAcknowledgedAt(onboardingRes, grant.grantedAtField)]),
        ));
        setEmailConnections(connectionRes);
        setApplicationEmail(currentApplicationEmail);
        setSponsorship(sponsorRes);
        if (verificationEnableProblem) setError(verificationEnableProblem);
        if (callbackProvider && callbackStatus) {
          const label = callbackProvider === "gmail" ? "Gmail" : "Outlook";
          const connected = connectionRes.connections.some((item) => item.provider === callbackProvider && item.connected);
          const callbackAvailability = verificationRouteAvailability({
            applicationEmail: currentApplicationEmail,
            connections: connectionRes,
            personalInboxConsent: resolvedVerification,
          });
          setConnectionNotice(
            callbackStatus === "success" && connected
              ? `${label} connected.${resolvedVerification ? " Your personal inbox fallback is on." : " Personal inbox fallback is off."}`
              : callbackAvailability === "litos_inbox"
                ? `${label} connection was not completed. Personal inbox fallback is unchanged. The Litos application inbox remains active.`
                : callbackAvailability === "personal_inbox"
                  ? `${label} connection was not completed. Your other connected personal inbox remains available as a fallback.`
                  : callbackAvailability === "personal_inbox_disconnected"
                    ? `${label} connection was not completed. Personal inbox fallback still needs a connected inbox.`
                    : `${label} connection was not completed. No verification inbox is active.`,
          );
          setActiveTab("automation");
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("connection");
          cleanUrl.searchParams.delete("status");
          cleanUrl.searchParams.delete("connected_account_id");
          cleanUrl.hash = "automation";
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

  function patchRaceAndGender(key: keyof typeof SELF_ID_OPTIONS, value: string) {
    setProfile((prev) => {
      const current = prev ?? {};
      const nextPrefs = { ...(current.eeo_prefs ?? {}) };
      if (value) nextPrefs[key] = value;
      else delete nextPrefs[key];
      return {
        ...current,
        eeo_prefs: Object.keys(nextPrefs).length > 0 ? nextPrefs : null,
      };
    });
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

  /* Its own writer rather than a branch of saveAutomation, and the payload is the reason.
     PUT /onboarding/automation reads an omitted field as "leave it alone" and an explicit false as a
     revocation, so a request that also named the submission or verification columns could revoke a
     permission the applicant never touched. saveAutomation rolls that PAIR back together on failure,
     which is exactly the coupling this permission must not have. */
  /* ONE FIELD PER REQUEST, for the reason consentAcknowledgementPatch states: the API reads an
     omitted key as "leave it alone" and an explicit false as a revocation, so a patch naming both
     would revoke the grant she never touched. The optimistic value is rolled back per field too,
     so a failure on one cannot disturb the other. */
  async function changeConsentGrant(field: ConsentGrantField, enabled: boolean) {
    const previous = consentGrants[field];
    setConsentGrants((current) => ({ ...current, [field]: enabled }));
    setSavingConsentGrant(field);
    setError(null);
    try {
      const result = await setAutomationSettings(consentAcknowledgementPatch(field, enabled));
      // The server's verdict, not the checkbox's optimism. An API that answers without the field
      // keeps what was there rather than being read as a revocation.
      const verdict = consentAcknowledgementVerdict(result, field);
      setConsentGrants((current) => ({ ...current, [field]: verdict ?? previous }));
      if (verdict === true) {
        const grant = CONSENT_GRANTS.find((candidate) => candidate.field === field);
        const reportedAt = grant ? consentAcknowledgedAt(result, grant.grantedAtField) : null;
        if (reportedAt) setConsentGrantedAt((current) => ({ ...current, [field]: reportedAt }));
      }
    } catch (err) {
      setConsentGrants((current) => ({ ...current, [field]: previous }));
      setError(err instanceof Error ? err.message : "Could not save that change.");
    } finally {
      setSavingConsentGrant(null);
    }
  }

  async function changeCaptchaConsent(enabled: boolean) {
    const previous = captchaConsent;
    const previousGrantedAt = captchaConsentGrantedAt;
    setCaptchaConsent(enabled);
    setSavingCaptchaConsent(true);
    setError(null);
    try {
      const result = await setAutomationSettings(captchaConsentPatch(enabled));
      /* The server's verdict, not the checkbox's own optimism: a grant recorded against wording that
         has since been superseded comes back false, and the box has to follow it. An API that
         answers without the field keeps what was there rather than being read as a revocation. */
      const verdict = captchaConsentVerdict(result);
      setCaptchaConsent(verdict ?? previous);
      /* The DATE gets the same treatment as the verdict above, and for the same reason. Not sent is
         not the same as sent-as-null: reading a missing field as null would wipe a date that
         GET /onboarding/state still returns, so the row would lose its date on every toggle and get
         it back on every reload. */
      const reportedAt = captchaConsentedAtReported(result);
      setCaptchaConsentGrantedAt(reportedAt === undefined ? previousGrantedAt : reportedAt);
    } catch (err) {
      setCaptchaConsent(previous);
      setCaptchaConsentGrantedAt(previousGrantedAt);
      setError(err instanceof Error ? err.message : "Could not save that change.");
    } finally {
      setSavingCaptchaConsent(false);
    }
  }

  async function save() {
    if (!profile) return;
    const eligibilityProblem = countryEligibilityProblem(eligibilityDraft);
    if (eligibilityTouched && eligibilityProblem) {
      // An oversized server payload is already announced beside the repeater.
      // Avoid adding a duplicate page-level alert while still blocking the PUT.
      if (eligibilityDraft.length <= MAX_COUNTRY_ELIGIBILITY_RECORDS) setError(eligibilityProblem);
      return;
    }
    /* A complete legacy seed is safe to migrate even when the student edited a different field.
       Omitting it made the successful response look blank because the response carries only the
       legacy scalars, while the first load also had the onboarding answer needed to interpret them.
       An incomplete or expired untouched draft stays omitted so an unrelated edit is never blocked. */
    const eligibilityPayload = eligibilityProblem
      ? null
      : normalizedCountryEligibility(eligibilityDraft);
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...profile };
      // GET echoes back row metadata the PUT schema doesn't accept.
      delete body.id;
      delete body.user_id;
      delete body.created_at;
      delete body.updated_at;
      if (eligibilityPayload) body.work_eligibility_by_country = eligibilityPayload;
      else delete body.work_eligibility_by_country;
      const res = await api<ApplicationProfile>("/profile/application", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setProfile(res);
      setSavedProfileJson(JSON.stringify(res));
      if (eligibilityPayload) setEligibilityDraft(eligibilitySeed(res));
      setEligibilityTouched(false);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function connectProvider(provider: EmailProvider, enableVerificationAfterConnect = false) {
    setConnectionBusy(provider);
    setError(null);
    if (enableVerificationAfterConnect) {
      window.sessionStorage.setItem(VERIFICATION_CONNECTION_INTENT_KEY, provider);
    }
    try {
      const result = await createEmailConnection(provider);
      window.location.assign(result.redirect_url);
    } catch (err) {
      if (enableVerificationAfterConnect) {
        window.sessionStorage.removeItem(VERIFICATION_CONNECTION_INTENT_KEY);
      }
      setConnectionBusy(null);
      setError(err instanceof Error ? err.message : "Could not start the email connection.");
    }
  }

  function changeAutomaticVerification(enabled: boolean) {
    if (!enabled) {
      setVerificationConnectionPrompt(false);
      void saveAutomation({ automatic_verification_enabled: false });
      return;
    }
    if (!emailConnections) return;
    // This switch grants access to a connected personal inbox only. A healthy Litos application
    // inbox is a separate route and must never turn this permission on.
    const decision = verificationEnableDecision(emailConnections);
    if (decision === "enable") {
      void saveAutomation({ automatic_verification_enabled: true });
      return;
    }
    if (decision === "unavailable") {
      setError("Email connections are unavailable right now. Email verification is still off.");
      return;
    }
    setError(null);
    setVerificationConnectionPrompt(true);
  }

  async function disconnectProvider(provider: EmailProvider) {
    const label = provider === "gmail" ? "Gmail" : "Outlook";
    if (!window.confirm(`Disconnect ${label}? Litos will no longer be able to read verification codes from this account.`)) return;
    setConnectionBusy(provider);
    setError(null);
    try {
      await disconnectEmailConnection(provider);
      const [connections, refreshedApplicationEmail, refreshedOnboarding] = await Promise.all([
        getEmailConnections(),
        getApplicationEmailStatus().catch(() => null),
        getOnboardingState(),
      ]);
      setEmailConnections(connections);
      setApplicationEmail(refreshedApplicationEmail);
      setAutomaticVerification(refreshedOnboarding.automatic_verification_enabled);
      const aliasAvailable = refreshedApplicationEmail?.tracking_active === true;
      const personalFallbackActive = refreshedOnboarding.automatic_verification_enabled && hasActiveInbox(connections);
      if (!refreshedOnboarding.automatic_verification_enabled) {
        setVerificationConnectionPrompt(false);
      }
      setConnectionNotice(
        aliasAvailable
          ? `${label} disconnected.${personalFallbackActive ? " Your personal inbox fallback is still on through your other inbox." : " Personal inbox fallback is off."} The Litos application inbox remains active.`
          : `${label} disconnected.${personalFallbackActive ? " Your personal inbox fallback is still on through your other inbox." : " Personal inbox fallback is off. No verification inbox is active."}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not disconnect ${label}.`);
    } finally {
      setConnectionBusy(null);
    }
  }

  async function startCheckout(interval: "weekly" | "monthly") {
    setCheckoutBusy(true);
    setError(null);
    try {
      const checkout = await createCheckout(interval);
      if (!isSafeCheckoutUrl(checkout.url)) throw new Error("Checkout returned an unsafe URL.");
      track("checkout_started");
      window.location.assign(checkout.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout is temporarily unavailable.");
      setCheckoutBusy(false);
    }
  }

  async function openBillingPortal() {
    setPortalBusy(true);
    setError(null);
    try {
      const portal = await createBillingPortal();
      if (!isStripePortalUrl(portal.url)) throw new Error("Billing portal returned an unsafe URL.");
      window.location.assign(portal.url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Billing portal is temporarily unavailable.");
      setPortalBusy(false);
    }
  }

  async function exportAccount() {
    const inDeleteDialog = deleteDialogRef.current?.open ?? false;
    setDataBusy("export");
    if (inDeleteDialog) setDeleteError(null);
    else setError(null);
    try {
      const account = await api<Record<string, unknown>>("/account/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(account, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `litos-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      track("account_data_exported");
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not export your data.";
      if (inDeleteDialog) setDeleteError(message);
      else setError(message);
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
    if (!me || !deleteConfirmed) return;
    setDataBusy("delete");
    setDeleteError(null);
    try {
      await api("/account", { method: "DELETE", body: JSON.stringify({ confirm_email: me.email }) });
      track("account_deleted");
      clearSession();
      setDeleteComplete(true);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete your account.");
      setDataBusy(null);
    }
  }

  if (error && !profile) return <ErrorNote message={error} />;
  if (!me || profile === null || automaticSubmission === null || automaticVerification === null || emailConnections === null)
  return (
    <div className="space-y-6">
      <span id="plan" className="sr-only" aria-hidden="true" />
        <div className="rq-shimmer h-8 w-48 rounded-full" />
        <ShimmerRows rows={3} />
      </div>
    );

  const verificationAvailability = verificationRouteAvailability({
    applicationEmail,
    connections: emailConnections,
    personalInboxConsent: automaticVerification,
  });

  const trialActive =
    me.trial_ends_at && new Date(me.trial_ends_at).getTime() > mountedAt;
  const profileDirty = eligibilityTouched || JSON.stringify(profile) !== savedProfileJson;
  const billingFailed = ["past_due", "unpaid", "failed", "payment_failed"].includes((me.billing_status ?? "").toLowerCase());
  const billingCanceled = ["canceled", "cancelled"].includes((me.billing_status ?? "").toLowerCase()) || Boolean(me.billing_ends_at);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink">Account</h1>
        <p className="mt-1 text-sm text-muted">Everything Litos uses for your job search, in one place.</p>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          className="flex min-w-max gap-1 rounded-full border border-border bg-surface-alt p-1"
          role="tablist"
          aria-label="Account categories"
        >
          {ACCOUNT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={tab.id === "job-search" ? "job-search" : `panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  moveTab(tab.id, event.key);
                }
              }}
              className={`min-h-10 rounded-full px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                activeTab === tab.id
                  ? "bg-surface font-medium text-ink shadow-rest"
                  : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {connectionNotice && (
        <div className="rounded-inner border border-border bg-surface-alt px-4 py-3 text-sm text-ink">
          {connectionNotice}
        </div>
      )}

      {activeTab === "job-search" && (
        <section id="job-search" role="tabpanel" aria-labelledby="tab-job-search" className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h2 className="text-base font-medium text-ink">Main resume</h2>
              <p className="mt-1 text-sm leading-6 text-muted">Keep the experience Litos tailors for each job up to date.</p>
            </div>
            <ButtonLink href="/dashboard/resume">Edit resume</ButtonLink>
          </Card>

          {/* DOCUMENTS: the account-level home for a file the student handed Litos herself.
              /privacy publishes "We encrypt it and keep it until you remove it or delete your
              account", and until this card the removing half was reachable only from a control on
              an application screen. A stored file outlives the application it was attached to: once
              that application is sent its screen renders no document control at all, which is the
              normal end state and not an edge case, so the promise was untrue for most of the file's
              life. Twice it was patched by binding the control to per-application UI state, and
              twice it leaked, because a document is an ACCOUNT object and that is where its home
              belongs.

              Filed here, beside Main resume, for two reasons. It is the first thing on the panel
              /dashboard/profile redirects to (#job-search), so the page a student is sent to for
              her own data holds it without a hunt; and it sits with the other card about what Litos
              is keeping of hers rather than among the filters that decide which jobs she sees.

              INSIDE the tabpanel, never a sibling of it (ISSUE-013b), and its id is not a tab id, so
              tabFromHash falls back to job-search and the browser scrolls here. scroll-mt-24 lives
              on the card itself: the dashboard's sticky header runs to y=73, and without it a jump
              to #documents puts this heading behind the header while every numeric check passes. */}
          <DocumentsCard />

          <TargetingCard />

          {/* VISA SPONSORSHIP.
              Its own card rather than a row inside "Answers you give every time", because it is not an
              answer Litos gives: it never reaches an employer's form (R-004), it decides which jobs
              exist on your board. Filed next to the automation card for the same reason - both are
              about what the product does on your behalf.

              Rendered INSIDE the tabpanel, not as a sibling of it (ISSUE-013b). It used to be its own
              top-level `activeTab === "job-search"` block, so the tab's aria-controls named a region
              that did not contain it and a screen reader moving by panel never reached the filter.
              The id stays "visa-sponsorship" verbatim: /dashboard/jobs deep-links to
              /dashboard/settings#visa-sponsorship, which is not a tab id, so tabFromHash falls back
              to the job-search tab and the browser scrolls to this card. Renaming it breaks that.

              The switch is deliberately dead when `locked`. Someone who declared a need for
              sponsorship during setup cannot turn the filter off (the server refuses either way), and a
              control that looks live and silently fails is worse than one that explains why it is
              fixed. */}
          {sponsorship && (
            <Card className="p-6" id="visa-sponsorship">
              <h2 className="text-base font-medium text-ink">Visa sponsorship filter</h2>
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
                    <span className="mt-2 block text-xs leading-5 text-muted">
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
                  className="mt-1 size-4 accent-brand disabled:opacity-40"
                />
              </label>
              <p className="mt-4 text-xs leading-5 text-muted">
                A filing record is not a promise to sponsor you. It is proof the company has sponsored
                people before.
              </p>
              </div>
            </Card>
          )}
        </section>
      )}

      {/* Account, and the data controls under it.

          One <section role="tabpanel"> around BOTH cards, matching the job-search panel above
          (ISSUE-013b). "Your data" used to be its own top-level `activeTab === "sign-in"` block with
          no id, no role and no aria-labelledby, which put Export data and Delete account - the two
          most destructive controls in the product - outside the region the tab's aria-controls names.
          A screen reader user moving by panel never reached them. The panel id stays "panel-sign-in"
          so aria-controls on the tab still resolves; it is not a hash target ("#sign-in" is the tab
          id, resolved by tabFromHash, not by scrolling). */}
      {activeTab === "sign-in" && (
        <section id="panel-sign-in" role="tabpanel" aria-labelledby="tab-sign-in" className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-medium text-ink">Account</h2>
            <button type="button" onClick={() => { clearSession(); router.replace("/"); }} className="min-h-11 px-2 text-sm text-muted hover:text-ink">Sign out</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Email</p>
              <p className="mt-0.5 font-mono text-sm text-ink">{me.email ?? "Not saved yet"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Plan</p>
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
                  className="rounded-full border border-control-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
                />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => { setNewPassword(event.target.value); setPasswordError(null); }}
                  placeholder="New password"
                  aria-label="New password"
                  className="rounded-full border border-control-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
                />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => { setConfirmPassword(event.target.value); setPasswordError(null); }}
                  placeholder="Confirm new password"
                  aria-label="Confirm new password"
                  className="rounded-full border border-control-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
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

        {/* Data */}
        <Card className="p-6">
          <h2 className="text-base font-medium text-ink">Your data</h2>
          <p className="mt-1 text-sm text-muted">Download your data or permanently remove your account.</p>
          <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5">
            <Button variant="secondary" type="button" onClick={() => void exportAccount()} disabled={dataBusy !== null}>{dataBusy === "export" ? "Preparing..." : "Export data"}</Button>
            <button ref={deleteTriggerRef} type="button" onClick={() => { setDeleteConfirmation(""); setDeleteComplete(false); setDeleteError(null); deleteDialogRef.current?.showModal(); }} disabled={dataBusy !== null} className="min-h-11 px-3 text-sm font-medium text-danger disabled:opacity-50">Delete account</button>
            <a href="/privacy" className="ml-auto inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">Privacy</a>
          </div>
        </Card>
        <dialog ref={deleteDialogRef} aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={(event) => { if (dataBusy === "delete") event.preventDefault(); }} onClose={() => deleteTriggerRef.current?.focus()} className="m-auto w-[min(92vw,560px)] rounded-card border border-border bg-surface p-0 text-ink shadow-overlay backdrop:bg-ink/35">
          {deleteComplete ? (
            <div className="p-6" role="status">
              <p className="text-label text-positive">Complete</p>
              <h2 id="delete-title" className="mt-2 text-heading">Your Litos account was deleted.</h2>
              <p id="delete-description" className="mt-3 text-body text-muted">The account-linked data named in the Privacy policy was removed. This cannot be undone.</p>
              <Button className="mt-6" onClick={() => { deleteDialogRef.current?.close(); router.replace("/"); }}>Continue to Litos</Button>
            </div>
          ) : (
            <form method="dialog" className="p-6" onSubmit={(event) => { event.preventDefault(); void deleteAccount(); }}>
              <div className="rounded-inner border border-danger/20 bg-danger-soft p-4">
                <p className="text-label text-danger">Permanent action</p>
                <h2 id="delete-title" className="mt-2 text-heading">Delete your account?</h2>
                <div id="delete-description" className="mt-3 space-y-3 text-sm leading-6 text-muted">
                  <p>This removes all account-linked history, including your saved profile and answers, resumes, applications, outreach, and linked PostHog profile. Shared public company contacts and de-identified reply-pattern notes remain. You cannot undo this.</p>
                  <p>Export first if you want a copy of your account data.</p>
                </div>
              </div>
              <button type="button" onClick={() => void exportAccount()} disabled={dataBusy !== null} className="mt-4 text-sm font-medium text-brand-ink underline underline-offset-4">Export data</button>
              <label htmlFor="delete-confirmation" className="mt-5 block text-sm font-medium">Confirmation sentence</label>
              <p id="delete-confirmation-instructions" className="mt-1 text-sm text-muted">Type this exact sentence, including capitalization and punctuation:</p>
              <p id="delete-confirmation-phrase" className="mt-2 rounded-inner border border-border bg-surface-alt px-3 py-2 font-mono text-xs leading-5 text-ink">{DELETE_CONFIRMATION_PHRASE}</p>
              <input id="delete-confirmation" aria-describedby="delete-confirmation-instructions delete-confirmation-phrase" autoComplete="off" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="rq-field mt-3 w-full rounded-inner px-4 py-3 text-sm" />
              {deleteError && <div className="mt-3"><ErrorNote message={deleteError} /></div>}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button variant="secondary" type="button" disabled={dataBusy === "delete"} onClick={() => deleteDialogRef.current?.close()}>Keep account</Button>
                <Button variant="danger" type="submit" disabled={dataBusy !== null || !deleteConfirmed}>{dataBusy === "delete" ? "Deleting..." : "Delete account permanently"}</Button>
              </div>
            </form>
          )}
        </dialog>
        </section>
      )}

      {activeTab === "automation" && <Card className="p-6" id="panel-automation" role="tabpanel" aria-labelledby="tab-automation">
        <h2 className="text-base font-medium text-ink">Automation</h2>
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
              className="mt-1 size-4 accent-brand disabled:opacity-40"
            />
          </label>
          {/* Directly under the submission switch because it is the same moment on the same form,
              and ungated unlike that switch, which is the server's rule rather than this screen's:
              resuming a fill sends nothing to anybody. It re-reads a form that still stops at the
              submit button, and whether anything is ever sent stays with the permission above.
              Revoking is allowed from any state.

              THIS CONTROL IS ALSO THE ONLY RE-CONSENT PATH. Accounts stamped with the superseded
              version arrive here unticked with a real date on the row; ticking the box writes the
              current version and makes the extension's resume path work for them again. */}
          <ConsentAcknowledgementControl
            idPrefix="settings"
            values={consentGrants}
            grantedAt={consentGrantedAt}
            disabled={savingConsentGrant !== null}
            onChange={(field, enabled) => void changeConsentGrant(field, enabled)}
          />
          <CaptchaConsentControl
            idPrefix="settings"
            value={captchaConsent}
            grantedAt={captchaConsentGrantedAt}
            disabled={savingCaptchaConsent}
            onChange={(enabled) => void changeCaptchaConsent(enabled)}
          />
          <div className="rounded-inner border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">Use a Litos application email</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  New application packets use a Litos address when replies to it are arriving. Employer mail forwards to your account email.
                </p>
              </div>
              {/* THE BADGE READS THE LIVE PROBE, NOT THE CONFIGURATION. It used to read
                  `configured`, which is true whenever an environment variable is set. Measured on
                  2026-08-08: configured was true, /health reported this subsystem degraded with
                  deliverable false, every run that day fell back to the plain account address with
                  tracked false, and this panel said the feature was on. See
                  lib/application-email-status.ts. */}
              <Chip label={applicationEmailBadge(applicationEmail).label} kind={applicationEmailBadge(applicationEmail).kind} />
            </div>
            {applicationEmailBadge(applicationEmail).note && (
              <p className="mt-3 text-xs leading-5 text-warn">{applicationEmailBadge(applicationEmail).note}</p>
            )}
            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                {/* "Address", not "domain": the value the backend sends here is a full mailbox
                    (applications@trylitos.com), and the aliases minted off it are
                    applications+app-<id>@trylitos.com. Calling it a domain invited the reading that
                    aliases live on a subdomain, which they do not. */}
                <p className="text-xs font-medium text-muted">Address on your applications</p>
                <p className="mt-1 break-words text-sm text-ink">
                  {applicationEmailAddressInUse(applicationEmail, me.email)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Forwarding</p>
                <p className="mt-1 text-sm text-ink">
                  {applicationEmail?.forward_to ?? applicationEmail?.aliases[0]?.forward_to ?? me.email ?? "Your account email"}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-inner border border-border p-4">
            <div className="flex items-start justify-between gap-5">
              <label htmlFor="automatic-email-verification">
                <span className="block text-sm font-medium text-ink">Use my connected inbox as a fallback</span>
                <span className="mt-1 block text-xs leading-5 text-muted">Allow Litos to read an application code from Gmail or Outlook only when a company sends it to that personal inbox.</span>
              </label>
              <input
                id="automatic-email-verification"
                aria-label="Use my connected inbox as a fallback"
                type="checkbox"
                checked={automaticVerification}
                disabled={savingAutomation || connectionBusy !== null || (!automaticVerification && !emailConnections.configured)}
                onChange={(event) => changeAutomaticVerification(event.target.checked)}
                className="mt-1 size-4 accent-brand disabled:opacity-40"
              />
            </div>
            {verificationConnectionPrompt && !hasActiveInbox(emailConnections) && (
              <p className="mt-3 text-xs leading-5 text-warn">Connect Gmail or Outlook below to turn this on.</p>
            )}
            {verificationAvailability === "personal_inbox_disconnected" && (
              <p className="mt-3 text-xs leading-5 text-warn">Reconnect Gmail or Outlook. Litos cannot read a code until one verification inbox is available.</p>
            )}
            {verificationAvailability === "litos_inbox" && (
              <p className="mt-3 text-xs leading-5 text-muted">The Litos application inbox is active. Codes sent to its packet-specific address do not require access to Gmail or Outlook.</p>
            )}
            {verificationAvailability === "personal_inbox" && (
              <p className="mt-3 text-xs leading-5 text-muted">Your connected personal inbox is available as a fallback.</p>
            )}
            {verificationAvailability === "none" && (
              <p className="mt-3 text-xs leading-5 text-warn">No verification inbox is active. Litos will stop and ask you for the code.</p>
            )}
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted">Inbox access</p>
              <p className="mt-1 text-xs leading-5 text-muted">Your provider shows exactly what Litos can access before you approve it.</p>
              <p className="mt-2 text-xs leading-5 text-muted">Litos requests access only to find a recent application verification code while a form is waiting. It does not use this connection to send mail or read unrelated messages. Connection time and the latest provider state appear below; Litos does not currently keep a user-visible sync activity log.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["gmail", "outlook"] as const).map((provider) => {
                  const connection = emailConnections.connections.find((item) => item.provider === provider);
                  const connected = connection?.connected === true;
                  const label = provider === "gmail" ? "Gmail" : "Outlook";
                  return (
                    <div key={provider} className="flex items-center justify-between gap-3 rounded-inner border border-border bg-surface px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-ink">{label}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {!emailConnections.configured ? "Unavailable" : connected ? "Connected" : connection?.status === "EXPIRED" ? "Reconnect required" : "Not connected"}
                        </p>
                        {connection?.connected_at && <p className="mt-1 text-xs text-muted">Connected {new Date(connection.connected_at).toLocaleDateString()}</p>}
                      </div>
                      <Button
                        type="button"
                        disabled={!emailConnections.configured || connectionBusy !== null}
                        onClick={() => void (connected ? disconnectProvider(provider) : connectProvider(provider, verificationConnectionPrompt))}
                        variant={connected ? "secondary" : "primary"}
                        size="sm"
                      >
                        {connectionBusy === provider ? "Working..." : connected ? "Disconnect" : connection?.status === "EXPIRED" ? "Reconnect" : "Connect"}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">Need another provider? <a href="/contact" className="font-medium text-brand-ink underline underline-offset-4">Request an integration through Contact.</a></p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">Litos stops when an answer is missing or the site needs you.</p>
        <p className="mt-2 text-xs leading-5 text-muted">Litos sends transactional account, application, and billing messages only. There are no marketing notification subscriptions or configurable notification channels in the current product.</p>
        </div>
      </Card>}

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
      {activeTab === "application-details" && <Card className="p-6" id="panel-application-details" role="tabpanel" aria-labelledby="tab-application-details">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">Application details</h2>
            <p className="mt-1 text-sm text-muted">Reusable profile facts. Authorization, sponsorship, and questions about race and gender stay applicant-owned.</p>
          </div>
        <div className="flex justify-end">
          <div className="flex items-center gap-3">
            {savedAt && !saving && <span className="text-xs text-positive">Saved</span>}
            <Button
              onClick={save}
              disabled={saving || !profileDirty} >
              {saving ? <PendingLabel onColor>Saving...</PendingLabel> : "Save changes"}
            </Button>
          </div>
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
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-ink">Work authorization by country</p>
            <p className="mt-1 mb-3 text-xs leading-5 text-muted">
              Litos uses a row only for a form or job that names this exact country. It never treats
              one country as worldwide authorization. A record whose expiry has already passed
              cannot be saved. If a saved record expires later, it stays in your profile but Litos
              stops using it to answer applications.
            </p>
            <CountryEligibilityEditor
              rows={eligibilityDraft}
              onChange={(rows) => {
                setEligibilityDraft(rows);
                setEligibilityTouched(true);
              }}
            />
          </div>
          <Input label="Major" value={profile.major} onChange={(v) => patch({ major: v })} placeholder="Computer Science" />
          <StringListInput
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
          {/* LEGACY, and kept honest by its own hint. Litos has never answered an employer's date
              question from this box and still does not: it carries no recruiting cycle and no
              expiry, so a date typed for one summer would go on answering the next summer's forms.
              The four controls below it are the scoped replacement. */}
          <Input label="Available from (saved reference only)" value={profile.availability_date} onChange={(v) => patch({ availability_date: v })} placeholder="Immediately" hint="Reference only. Employer date questions are answered from the internship window below, never from this." />
          {/* THE INTERNSHIP WINDOW. The same semantic date table appears during onboarding so the
              reuse rule cannot drift between the first-run flow and Account. */}
          <div className="sm:col-span-2">
            <AvailabilityWindowTable
              value={{
                start: profile.availability_window_start ?? "",
                end: profile.availability_window_end ?? "",
                cycle: profile.availability_cycle ?? "",
                validThrough: profile.availability_valid_through ?? "",
              }}
              onChange={(value) => patch({
                availability_window_start: value.start || null,
                availability_window_end: value.end || null,
                availability_cycle: value.cycle || null,
                availability_valid_through: value.validThrough || null,
              })}
            />
          </div>
          <Input label="Date of birth" value={profile.date_of_birth} onChange={(v) => patch({ date_of_birth: v })} placeholder="YYYY-MM-DD" hint="Used when an application asks for your birth date, and to answer &quot;are you 18 or older?&quot;. Blank leaves both for you." />
          <Input label="Current degree start" value={profile.education_start_date} onChange={(v) => patch({ education_start_date: v })} placeholder="August 2024" hint="Month and year when your current degree began." />
          <Input label="Desired salary" value={profile.desired_salary} onChange={(v) => patch({ desired_salary: v })} placeholder="Open / market rate" />
          {/* A figure without a unit is not an answer: replaying "80000" from a Munich posting
              onto a Toronto one states something you never said. Both or neither get filled. */}
          <Input label="Salary currency" value={profile.desired_salary_currency} onChange={(v) => patch({ desired_salary_currency: v })} placeholder="USD" />
          <Input label="How did you hear about us? (default answer)" value={profile.referral_source_default} onChange={(v) => patch({ referral_source_default: v })} placeholder="LinkedIn, university career fair, recruiter" />
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <p className="text-xs font-medium text-muted">Personal questions</p>
          <h3 className="text-sm font-medium text-ink">Optional questions about race and gender</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            These saved values are reference only. Litos does not use them to answer a form. You decide on each application.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StringSelect label="Gender identity" value={profile.eeo_prefs?.gender} options={SELF_ID_OPTIONS.gender} onChange={(v) => patchRaceAndGender("gender", v)} />
            <StringSelect label="Transgender experience" value={profile.eeo_prefs?.transgender_status} options={SELF_ID_OPTIONS.transgender_status} onChange={(v) => patchRaceAndGender("transgender_status", v)} />
            <StringSelect label="Sexual orientation" value={profile.eeo_prefs?.sexual_orientation} options={SELF_ID_OPTIONS.sexual_orientation} onChange={(v) => patchRaceAndGender("sexual_orientation", v)} />
            <StringSelect label="Disability status" value={profile.eeo_prefs?.disability_status} options={SELF_ID_OPTIONS.disability_status} onChange={(v) => patchRaceAndGender("disability_status", v)} />
            <StringSelect label="Veteran status" value={profile.eeo_prefs?.veteran_status} options={SELF_ID_OPTIONS.veteran_status} onChange={(v) => patchRaceAndGender("veteran_status", v)} />
            <StringSelect label="Race / ethnicity" value={profile.eeo_prefs?.race} options={SELF_ID_OPTIONS.race} onChange={(v) => patchRaceAndGender("race", v)} />
          </div>
        </div>

        <p className="mt-5 text-xs leading-5 text-muted">Applicant-owned questions are never inferred, automatically declined, or reused from this page.</p>
      </Card>}

      {/* Plan + usage */}
      {activeTab === "plan" && <Card className="p-6" id="panel-plan" role="tabpanel" aria-labelledby="tab-plan">
        <h2 className="text-base font-medium text-ink">Plan and usage</h2>
        {billingNotice === "success" && <p role="status" className="mt-4 rounded-inner bg-positive-soft px-4 py-3 text-sm text-positive">Payment received. Stripe is confirming your Pro access now.</p>}
        {billingNotice === "cancelled" && <p role="status" className="mt-4 rounded-inner bg-warn-soft px-4 py-3 text-sm text-warn">Checkout was cancelled. Nothing was charged.</p>}
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
            </ButtonLink> : <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={checkoutBusy} onClick={() => void startCheckout("weekly")}>
                {checkoutBusy ? "Opening..." : "$19.99 weekly"}
              </Button>
              <Button variant="secondary" type="button" disabled={checkoutBusy} onClick={() => void startCheckout("monthly")}>
                {checkoutBusy ? "Opening..." : "$39.99 monthly"}
              </Button>
            </div>}
          </div>
        ) : me.tier === "pro" ? (
          <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
            <p>You are on Pro.</p>
            {billingFailed && <ErrorNote message="Your last payment did not complete. Update the payment method in the secure billing portal to keep access active." />}
            {billingCanceled && me.billing_ends_at && <p role="status" className="rounded-inner bg-warn-soft px-4 py-3 text-warn">Subscription canceled. Pro access continues through {new Date(me.billing_ends_at).toLocaleDateString()}.</p>}
            {me.billing_renews_at && !billingCanceled && <p>Next billing date: <span className="font-mono text-ink">{new Date(me.billing_renews_at).toLocaleDateString()}</span>. The amount is confirmed in the billing portal.</p>}
            <p>{me.billing_portal_available ? <button type="button" disabled={portalBusy} onClick={() => void openBillingPortal()} className="font-medium text-brand-ink underline-offset-4 hover:underline disabled:opacity-50">{portalBusy ? "Opening billing portal..." : "Open secure billing portal"}</button> : me.billing_portal_url ? <a className="font-medium text-brand-ink underline-offset-4 hover:underline" href={me.billing_portal_url}>Open secure billing portal</a> : <a className="font-medium text-brand-ink underline-offset-4 hover:underline" href="/contact">Contact support about billing</a>} {me.billing_portal_available || me.billing_portal_url ? "Payment method, receipts, invoices, discounts, and cancellation are managed there." : "Litos cannot show a billing portal for this account."}</p>
          </div>
        ) : null}
      </Card>}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  hint,
  /* "date" for the internship window, which the backend validates as ISO YYYY-MM-DD and rejects in
     any other shape. A native picker is what makes that shape the only one the student can produce;
     typed free text here would 400 the whole save, including every unrelated field on the panel. */
  type,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  hint?: string;
  type?: "text" | "date";
}) {
  /* htmlFor/id, not aria-label: the visible text IS the accessible name, so tying
     them together means a future copy edit cannot leave a screen reader reading
     the old wording. Without the association the label is only a sibling of the
     input, so nothing computes a name and every field on this panel announced as
     a bare "edit text" (WCAG 4.1.2). useId gives a value that matches between the
     server render and the client render, which a hand-rolled counter would not. */
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  return (
    <div>
      <label htmlFor={fieldId} className="block text-xs font-medium text-muted">{label}</label>
      <input
        id={fieldId}
        type={type ?? "text"}
        aria-describedby={hint ? hintId : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(editableProfileText(e.target.value))}
        onBlur={(e) => onChange(nullableProfileText(e.target.value))}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-full border border-control-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
      {hint && <p id={hintId} className="mt-1 text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

/* Comma-separated text over a chip widget on purpose: every other field on this
   page is a plain input, and the backend wants a plain array of factual names.
   Local text state keeps typing natural (a trailing comma is not destroyed by a
   re-render); the parsed array is what lands in the profile. */
function StringListInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string[] | null | undefined;
  onChange: (v: string[] | null) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [text, setText] = useState((value ?? []).join(", "));
  /* Same label association as Input: this field looks identical to the reader,
     so it has to announce identically too. */
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  return (
    <div>
      <label htmlFor={fieldId} className="block text-xs font-medium text-muted">{label}</label>
      <input
        id={fieldId}
        aria-describedby={hint ? hintId : undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(nullableProfileList(e.target.value));
        }}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-full border border-control-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
      {hint && <p id={hintId} className="mt-1 text-xs leading-5 text-muted">{hint}</p>}
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
  /* The two selects are the work-authorization and sponsorship questions, the
     highest-stakes answers on the page: unnamed, they announce only "Yes / No /
     Prefer not to say" with no hint of which question is being answered. */
  const fieldId = useId();
  return (
    <div>
      <label htmlFor={fieldId} className="block text-xs font-medium text-muted">{label}</label>
      <select
        id={fieldId}
        disabled
        value={current}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value === "yes")
        }
        className="mt-1.5 w-full rounded-full border border-control-border bg-surface-alt px-3.5 py-2 text-sm text-muted outline-none disabled:cursor-not-allowed"
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

function StringSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const fieldId = useId();
  return (
    <div>
      <label htmlFor={fieldId} className="block text-xs font-medium text-muted">{label}</label>
      <select
        id={fieldId}
        disabled
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-full border border-control-border bg-surface-alt px-3.5 py-2 text-sm text-muted outline-none disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option || "not-set"} value={option}>
            {option || "Not set"}
          </option>
        ))}
      </select>
    </div>
  );
}
