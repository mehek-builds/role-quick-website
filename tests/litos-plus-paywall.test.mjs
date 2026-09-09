import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the shared Litos+ modal preserves context and a manual way forward", async () => {
  const [modal, provider] = await Promise.all([
    read("components/billing/UpgradeModal.tsx"),
    read("components/billing/BillingProvider.tsx"),
  ]);
  assert.match(modal, /<dialog/);
  assert.match(modal, /onCancel=/);
  assert.match(modal, /const manualAction = presentRequest\.onManual/);
  assert.match(modal, /manualAction\?\.\(\)/);
  assert.match(modal, /onCloseRef\.current\(\)/);
  // Currency-aware: the modal maps over catalog.plans (falling back to the static USD table
  // before the server catalog loads), not always the static import directly.
  assert.match(modal, /const plans = catalog\?\.plans \?\? LITOS_PLUS_PLANS;/);
  assert.match(modal, /\{plans\.map\(\(candidate\) => \{/);
  // "Popular" since 2026-09-08, matching the approved plan cards on /pricing and /start.
  assert.match(modal, /Popular/);
  assert.doesNotMatch(modal, /Most popular/);
  /* NO FREE COLUMN, and no Free feature list anywhere in this modal. Mehek's call 2026-09-08.
     The modal opens at the moment somebody reaches for a paid feature, so a Free column beside
     the terms is offering the alternative at the exact moment it costs the most. Pinned as the
     absence of the list and of its old side-by-side grid, not merely of the word: the per-feature
     copy still has to be free to say what stays available when somebody declines. */
  assert.doesNotMatch(modal, /FREE_FEATURES/);
  assert.doesNotMatch(modal, /Free and Litos\+ comparison/);
  assert.doesNotMatch(modal, /title="Free"/);
  /* Whether they are ON Free is a fact about their own account, not an offer, so this stays. */
  assert.match(modal, /Current plan: \{accessLabel\(access\)\}/);
  assert.match(modal, /href="\/terms"/);
  assert.match(modal, /href="\/privacy"/);
  assert.match(provider, /triggerRef\.current/);
  assert.match(provider, /trigger\?: HTMLElement \| null/);
  assert.match(provider, /options\?\.trigger\?\.isConnected[\s\S]*\? options\.trigger[\s\S]*: document\.activeElement/);
  assert.match(provider, /const trigger = triggerRef\.current;[\s\S]*restoreUpgradeFocus\(trigger\)/);
  assert.match(provider, /createPendingBillingAction/);
  assert.match(provider, /actionNonce: action\.action_nonce/);
  assert.match(provider, /rememberBillingReturnContext/);
  assert.match(provider, /expiresAt: response\.expires_at/);
  assert.doesNotMatch(provider, /expiresAt: action\.expires_at/);
  assert.match(provider, /contextualCheckoutAttempt\(checkoutAttemptRef\.current, requestId, planId\)/);
  assert.match(provider, /idempotencyKey: attempt\.actionIdempotencyKey/);
  assert.match(provider, /idempotencyKey: attempt\.checkoutIdempotencyKey/);
  assert.match(provider, /const action = attempt\.action \?\?/);
  assert.match(provider, /attempt\.action = action/);
});

test("paywall telemetry uses the authenticated server event contract", async () => {
  const billingApi = await read("features/billing/infrastructure/billing-api.ts");
  assert.match(billingApi, /event_key: crypto\.randomUUID\(\)/);
  assert.match(billingApi, /event_name: event/);
  assert.match(billingApi, /occurred_at: new Date\(\)\.toISOString\(\)/);
  assert.match(billingApi, /surface,/);
  assert.doesNotMatch(billingApi, /JSON\.stringify\(\{ event, properties \}\)/);
});

test("authoritative exhausted-meter denials bypass cached trial feature grants", async () => {
  /* Outreach was a fourth surface here until 2026-09-08. The invariant is unchanged and still
     covered by applications and home; there is simply one fewer place that can break it. */
  const [provider, paywall, applications, home] = await Promise.all([
    read("components/billing/BillingProvider.tsx"),
    read("features/billing/domain/paywall.ts"),
    read("app/dashboard/applications/page.tsx"),
    read("app/dashboard/page.tsx"),
  ]);

  assert.match(provider, /shouldOpenUpgrade\(access, next\.feature, options\?\.source\)/);
  assert.match(paywall, /if \(source === "server_denial"\) return true/);
  assert.match(paywall, /"entitlement_required"/);
  assert.match(paywall, /"quota_exceeded"/);
  for (const feature of [
    "ai_resume_tailoring",
    "ai_cover_letter_generation",
    "ai_application_answer_generation",
  ]) {
    assert.match(paywall, new RegExp(`"${feature}"`));
  }

  assert.equal((applications.match(/\{ source: "server_denial", trigger \}/g) ?? []).length, 2);
  assert.match(applications, /isStructuredUpgradeDenial\(reason, "ai_resume_tailoring"\)/);
  assert.match(applications, /isStructuredUpgradeDenial\(reason, "ai_cover_letter_generation"\)/);
  assert.match(home, /isStructuredUpgradeDenial\(reason, "ai_resume_tailoring"\)[\s\S]*source: "server_denial",[\s\S]*trigger: homeUpgradeFocusTarget\(jobId, upgradeTrigger\)/);
});

test("delayed dashboard denials retain their activation target or a stable local fallback", async () => {
  const [provider, applications, home] = await Promise.all([
    read("components/billing/BillingProvider.tsx"),
    read("app/dashboard/applications/page.tsx"),
    read("app/dashboard/page.tsx"),
  ]);

  assert.match(provider, /options\?\.trigger\?\.isConnected[\s\S]*\? options\.trigger/);
  assert.match(provider, /function restoreUpgradeFocus\(trigger: HTMLElement \| null\)/);
  assert.match(provider, /main \[role="tab"\]\[aria-selected="true"\]/);
  assert.match(provider, /nav \[aria-current="page"\][\s\S]*aside \[aria-current="page"\]/);
  assert.match(provider, /\.dashboard-shell main h1/);
  assert.match(provider, /candidate\.focus\(\{ preventScroll: true \}\)[\s\S]*document\.activeElement === candidate/);
  assert.match(provider, /const trigger = triggerRef\.current;[\s\S]*restoreUpgradeFocus\(trigger\)/);

  /* Home's card no longer starts a generation, so it no longer raises a paywall of its own: its one
     action is a link to the tailoring screen, and that screen owns the denial and the focus restore
     asserted below. Paid hover can still be denied here, so the focus target itself stays pinned. */
  assert.doesNotMatch(home, /onPrepare|onRetry/);
  assert.match(home, /onHoverPrepare=\{\(\) => void preparePacket\(job\.id, "hover_prewarm"\)\}/);
  assert.match(home, /if \(trigger\?\.isConnected\) return trigger;[\s\S]*data-dashboard-job-focus-id[\s\S]*getElementById\("matches-heading"\)/);
  assert.match(home, /tabIndex=\{-1\}[\s\S]*data-dashboard-job-focus-id=\{job\.id\}/);
  assert.match(home, /id="matches-heading" tabIndex=\{-1\}/);
  assert.match(home, /source: "server_denial",[\s\S]*trigger: homeUpgradeFocusTarget\(jobId, upgradeTrigger\)/);

  assert.match(applications, /function applicationUpgradeFocusTarget\([\s\S]*if \(trigger\?\.isConnected\) return trigger/);
  assert.match(applications, /"application-ledger-heading", "new-application-heading", "applications-heading"/);
  assert.match(applications, /async function createApplication\([\s\S]*upgradeTrigger: HTMLElement \| null = null/);
  assert.match(applications, /onTailor=\{\(upgradeTrigger\) => void createApplication\(newApplication, upgradeTrigger\)\}/);
  assert.match(applications, /onTailor=\{\(upgradeTrigger\) => void tailorCanonicalApplication\(canonicalSelected, upgradeTrigger\)\}/);
  assert.match(applications, /upgradeTrigger\?: HTMLElement \| null/);
  assert.match(applications, /generateCoverLetter\(undefined, \{ upgradeTrigger: event\.currentTarget \}\)/);
  assert.match(applications, /source === "server_denial"[\s\S]*\{ source: "server_denial", trigger \}/);
});

test("explicit plan entry points open for grandfathered accounts with preserved feature allowances", async () => {
  const [paywall, status, settings] = await Promise.all([
    read("features/billing/domain/paywall.ts"),
    read("components/billing/PlanStatus.tsx"),
    read("app/dashboard/settings/page.tsx"),
  ]);

  assert.match(paywall, /source === "plan_management"/);
  assert.match(status, /trigger: "account_upgrade"[\s\S]*source: "plan_management"/);
  assert.match(settings, /trigger: "choose_litos_plus"[\s\S]*source: "plan_management"/);
});

test("manual applications stay inside Litos through tailoring", async () => {
  const applications = await read("app/dashboard/applications/page.tsx");
  const fill = applications.slice(
    applications.indexOf("async function fillApplication"),
    applications.indexOf("async function createApplication"),
  );
  const tailor = applications.slice(
    applications.indexOf("async function createApplication"),
    applications.indexOf("async function generateCoverLetter"),
  );
  assert.match(fill, /if \(draft\.jobId\)[\s\S]*prepareMonitoredApplication/);
  assert.match(fill, /choose Tailor resume first to prepare this application in Litos/);
  assert.doesNotMatch(fill, /window\.open|location\.replace|startFreeFillThroughExtension|ensureCurrentExtensionSession/);
  assert.doesNotMatch(fill, /api<[^>]+>\("\/applications"|\/applications\/[^\s]*\/fill/);
  assert.match(tailor, /api<ResumeGenerationResponse>\("\/resume\/generate"/);
  assert.match(tailor, /manualLabel: draft\.jobId \? "Fill with my main resume" : "Keep editing"/);
  assert.match(tailor, /draft\.jobId[\s\S]*explanation: "You can keep editing the application details without upgrading\."/);
  assert.match(tailor, /\.\.\.\(draft\.jobId[\s\S]*onManual:/);
  assert.match(applications, /variant="secondary"[\s\S]*onClick=\{\(event\) => onTailor\(event\.currentTarget\)\}[\s\S]*"Tailor resume first"/);
  assert.match(applications, /\{managedPrepare && \([\s\S]*onClick=\{onFill\}[\s\S]*"Prepare in Litos"/);
  assert.doesNotMatch(applications, /Open and fill employer form|extension fallback|Click Fill in the Litos extension card/);
  const routedJob = applications.slice(
    applications.indexOf("if (!pendingJob || packets === null) return;"),
    applications.indexOf("/* Fail closed during query-only navigation."),
  );
  assert.doesNotMatch(routedJob, /fillApplication\(draft\)/, "a route effect cannot open a popup reliably");
  assert.match(routedJob, /Choose Prepare in Litos to use your main resume without opening another tab/);
});

test("Tracker merges canonical Free applications with legacy packets", async () => {
  const applications = await read("app/dashboard/applications/page.tsx");
  assert.match(applications, /api<\{ applications: CanonicalApplication\[\] \}>\("\/applications\?limit=200"\)/);
  assert.match(applications, /Promise\.allSettled/);
  assert.match(applications, /historyResult\.status === "rejected" && !requestedCanonical/);
  assert.match(applications, /mergeCanonicalApplicationHistory\(legacy, canonical\)/);
  assert.match(applications, /canonicalApplicationFromPacket\(packet\)/);
  assert.match(applications, /<CanonicalApplicationDetail/);
});

test("a canonical Free application upgrades documents without creating another Tracker row", async () => {
  const applications = await read("app/dashboard/applications/page.tsx");
  const tailoring = applications.slice(
    applications.indexOf("async function createApplication"),
    applications.indexOf("async function generateCoverLetter"),
  );
  const coverLetter = applications.slice(
    applications.indexOf("async function generateCoverLetter"),
    applications.indexOf("async function saveCoverLetter"),
  );
  const canonicalDetail = applications.slice(
    applications.indexOf("function CanonicalApplicationDetail"),
    applications.indexOf("function packetTimestamp"),
  );

  assert.match(tailoring, /application_id: draft\.canonicalApplicationId/);
  assert.match(tailoring, /canonicalId !== draft\.canonicalApplicationId/);
  assert.match(tailoring, /canonicalApplicationFromPacket\(packet\)\?\.id !== canonicalId/);
  assert.match(tailoring, /packet\.id !== previousPacketId/);
  assert.match(tailoring, /legacy_generated_resume_id: created\.id/);
  assert.match(coverLetter, /targetApplicationId = options\.canonicalApplicationId/);
  assert.match(coverLetter, /`\/applications\/\$\{targetApplicationId\}\/cover-letter`/);
  assert.match(coverLetter, /result\.application_id !== targetApplicationId/);
  assert.match(coverLetter, /async function saveCanonicalCoverLetter/);
  assert.match(coverLetter, /\/cover-letter\/upload/);
  assert.match(coverLetter, /method: "DELETE"/);
  assert.match(canonicalDetail, /"Tailor resume"/);
  assert.match(canonicalDetail, /"Write cover letter"/);
  assert.doesNotMatch(canonicalDetail, /disabled=\{!hasTailoredResume/);
  assert.match(canonicalDetail, /Manual writing and uploads do not use a Litos\+ generation/);
  assert.match(applications, /requestedCanonicalApplication && requestedApplicationIntent === "detail"/);
  assert.match(applications, /\/resume\/history\?application=\$\{encodeURIComponent\(linkedPacketId\)\}/);
});

test("Documents lists and reuses canonical cover letters without a tailored resume", async () => {
  const documents = await read("app/dashboard/documents/page.tsx");
  assert.match(documents, /api<\{ cover_letters\?: CanonicalCoverLetterResponse\[\] \}>\("\/cover-letters"/);
  assert.match(documents, /function CoverLetterLibrary/);
  assert.match(documents, /\/cover-letter\/reuse/);
  assert.match(documents, /artifact_id: item\.cover_letter\.artifact_id/);
  assert.match(documents, /Manual cover letters stay free/);
});

test("paid hover and sending without another prompt use separate server features", async () => {
  const [home, settings] = await Promise.all([
    read("app/dashboard/page.tsx"),
    read("app/dashboard/settings/page.tsx"),
  ]);
  assert.match(home, /canUse\("hover_generation"\) === true/);
  assert.match(home, /if \(!autoSubmitEnabled \|\| !backgroundGenerationAllowed\) return/);
  assert.match(home, /backgroundGenerationAllowed \? rankedJobs\.slice/);
  assert.match(settings, /canUse\("automatic_submission"\) !== true/);
  assert.match(settings, /feature: "automatic_submission"/);
});

test("recruiter visibility stays out of the production Account UI until it is functional", async () => {
  const settings = await read("app/dashboard/settings/page.tsx");
  assert.doesNotMatch(settings, /\/account\/recruiter-visibility/);
  assert.doesNotMatch(settings, /Recruiter visibility/);
  assert.doesNotMatch(settings, /recruiter_visibility/);
});

test("checkout return restores context only after an explicit consume", async () => {
  const [provider, billingReturn, applications] = await Promise.all([
    read("components/billing/BillingProvider.tsx"),
    read("app/billing/return/page.tsx"),
    read("app/dashboard/applications/page.tsx"),
  ]);
  assert.match(provider, /createPendingBillingAction/);
  assert.match(billingReturn, /readPendingBillingAction/);
  assert.match(billingReturn, /consumePendingBillingAction/);
  assert.match(billingReturn, /"Resume your action"/);
  assert.doesNotMatch(billingReturn, /\/resume\/generate|\/draft|\/resolve/);
  assert.match(applications, /rememberCheckoutDraft/);
  assert.match(applications, /checkout_action/);
});

test("a missing local checkout context does not by itself fail the return as a wrong account", async () => {
  /* Regression for the 2026-09-08 incident: a real, successful onboarding checkout
     came back to "This checkout belongs to a different Litos account" because
     sessionStorage never held a context for it (safeReturnRoute rejected "/start"
     at write time). Losing that local context can happen for reasons that have
     nothing to do with which account is signed in -- a different tab or device
     than the one that started checkout, cleared site data, a stale entry outside
     its few-hour window, or a future route this build's allowlist does not know
     about yet -- so the return page must not treat "no local context" as proof of
     the wrong account. The offer id from Stripe's own redirect is still required:
     with nothing at all to look up, there is genuinely no checkout to resolve. */
  const billingReturn = await read("app/billing/return/page.tsx");
  assert.match(billingReturn, /if \(!context\) \{\s*\n\s*setResult\(\{ kind: "mismatch" \}\);/);
  assert.doesNotMatch(billingReturn, /if \(!context \|\| !storedContext\)/);
  // The real ownership proof server-side, not a client-only heuristic: both
  // reconcileBillingCheckout and getBillingOffer are called with the offer id and
  // resolve against the caller's own JWT on the backend (routes/billing.ts's
  // POST /billing/reconcile, routes/billingV2.ts's GET /billing/offers/:id).
  assert.match(billingReturn, /storedContext\?\.accountId \?\? state\?\.account_id/);
});

test("premium action handlers fail closed while entitlements are unresolved", async () => {
  const [home, applications, jobs, autopilot] = await Promise.all([
    read("app/dashboard/page.tsx"),
    read("app/dashboard/applications/page.tsx"),
    read("app/dashboard/jobs/page.tsx"),
    read("components/app/Autopilot.tsx"),
  ]);
  assert.match(home, /canUse\("ai_resume_tailoring"\) !== true/);
  assert.match(home, /tailoringAccess === null[\s\S]*Checking plan/);
  assert.match(applications, /canUse\("ai_resume_tailoring"\) !== true/);
  assert.match(applications, /canUse\("ai_cover_letter_generation"\) !== true/);
  assert.match(jobs, /premiumLoading=\{canUse\("automatic_submission"\) === null\}/);
  assert.match(autopilot, /!enabled && premiumLoading/);
});

