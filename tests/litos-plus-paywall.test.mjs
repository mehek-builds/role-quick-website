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
  assert.match(modal, /request\.onManual\?\.\(\)/);
  assert.match(modal, /onClose\(\)/);
  assert.match(modal, /LITOS_PLUS_PLANS\.map/);
  assert.match(modal, /Most popular/);
  assert.match(modal, /href="\/terms"/);
  assert.match(modal, /href="\/privacy"/);
  assert.match(provider, /triggerRef\.current/);
  assert.match(provider, /triggerRef\.current\?\.focus\(\)/);
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
  const [provider, paywall, applications, outreach, home] = await Promise.all([
    read("components/billing/BillingProvider.tsx"),
    read("features/billing/domain/paywall.ts"),
    read("app/dashboard/applications/page.tsx"),
    read("app/dashboard/outreach/page.tsx"),
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
    "contact_discovery",
    "outreach_email_generation",
  ]) {
    assert.match(paywall, new RegExp(`"${feature}"`));
  }

  assert.equal((applications.match(/\{ source: "server_denial" \}/g) ?? []).length, 2);
  assert.match(applications, /isStructuredUpgradeDenial\(reason, "ai_resume_tailoring"\)/);
  assert.match(applications, /isStructuredUpgradeDenial\(reason, "ai_cover_letter_generation"\)/);
  assert.equal((outreach.match(/\{ source: "server_denial" \}/g) ?? []).length, 2);
  assert.match(outreach, /isStructuredUpgradeDenial\(reason, "contact_discovery"\)/);
  assert.match(outreach, /isStructuredUpgradeDenial\(reason, "outreach_email_generation"\)/);
  assert.match(home, /isStructuredUpgradeDenial\(reason, "ai_resume_tailoring"\)[\s\S]*\{ source: "server_denial" \}/);
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

test("Free filling uses canonical application seams and never generation", async () => {
  const [applications, bridge] = await Promise.all([
    read("app/dashboard/applications/page.tsx"),
    read("lib/extension-bridge.ts"),
  ]);
  const fill = applications.slice(
    applications.indexOf("async function fillApplication"),
    applications.indexOf("async function createApplication"),
  );
  assert.match(fill, /api<\{ application: CanonicalApplication; created: boolean \}>\("\/applications"/);
  assert.match(fill, /`\/applications\/\$\{encodeURIComponent\(created\.application\.id\)\}\/fill`/);
  assert.match(fill, /source_surface: "dashboard"/);
  assert.doesNotMatch(fill, /source_surface: "applications"/);
  assert.match(fill, /ensureCurrentExtensionSession/);
  assert.match(fill, /await startFreeFillThroughExtension/);
  assert.match(fill, /companyTab\.location\.replace\(handoff\.portal_url\)/);
  assert.ok(
    fill.indexOf("await startFreeFillThroughExtension") < fill.indexOf("companyTab.location.replace"),
    "the employer portal must not load until the extension explicitly arms the canonical fill",
  );
  assert.doesNotMatch(fill, /armHandoffs\(/);
  assert.doesNotMatch(fill, /\/resume\/generate/);
  assert.match(bridge, /type: "LITOS_START_FREE_FILL"/);
  assert.doesNotMatch(bridge.slice(bridge.indexOf("export async function startFreeFillThroughExtension"), bridge.indexOf("export async function armHandoffs")), /fill_data_url/);
  assert.doesNotMatch(applications, /Factual fields prepared/);
  assert.match(applications, /Click Fill in the Litos extension card/);
  assert.match(applications, /variant="secondary" onClick=\{onTailor\}[\s\S]*"Tailor resume"/);
  assert.match(applications, /onClick=\{onFill\}[\s\S]*"Fill application"/);
  const routedJob = applications.slice(
    applications.indexOf("if (!pendingJob || packets === null) return;"),
    applications.indexOf("/* Fail closed during query-only navigation."),
  );
  assert.doesNotMatch(routedJob, /fillApplication\(draft\)/, "a route effect cannot open a popup reliably");
  assert.match(routedJob, /Choose Fill application to verify the extension and open the employer form/);
});

test("Tracker merges canonical Free applications with legacy packets", async () => {
  const applications = await read("app/dashboard/applications/page.tsx");
  assert.match(applications, /api<\{ applications: CanonicalApplication\[\] \}>\("\/applications\?limit=100"\)/);
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
    applications.indexOf("function ApplicationFillReceipt"),
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

test("network ownership controls stay available when discovery is locked", async () => {
  const network = await read("app/dashboard/network/page.tsx");
  assert.match(network, /if \(!premium \|\| status\?\.connected !== true\) \{[\s\S]*setPeople\(\[\]\);[\s\S]*setCompanies\(\[\]\);[\s\S]*return/);
  assert.match(network, /tab === "linkedin"/);
  assert.match(network, /\/network\/linkedin\/import\/preview/);
  assert.match(network, /\/network\/linkedin\/import\/commit/);
  assert.match(network, /\/network\/linkedin\/disconnect/);
  assert.match(network, /\/network\/linkedin\/data/);
  assert.match(network, /Disconnect stops future use/);
  assert.match(network, /retained_people_count/);
  assert.match(network, /setPeople\(\[\]\);[\s\S]*setCompanies\(\[\]\);/);
  assert.match(network, /Delete imported data/);
});

test("recruiter visibility stays out of the production Account UI until it is functional", async () => {
  const settings = await read("app/dashboard/settings/page.tsx");
  assert.doesNotMatch(settings, /\/account\/recruiter-visibility/);
  assert.doesNotMatch(settings, /Recruiter visibility/);
  assert.doesNotMatch(settings, /recruiter_visibility/);
});

test("checkout return restores context only after an explicit consume", async () => {
  const [provider, billingReturn, applications, outreach] = await Promise.all([
    read("components/billing/BillingProvider.tsx"),
    read("app/billing/return/page.tsx"),
    read("app/dashboard/applications/page.tsx"),
    read("app/dashboard/outreach/page.tsx"),
  ]);
  assert.match(provider, /createPendingBillingAction/);
  assert.match(billingReturn, /readPendingBillingAction/);
  assert.match(billingReturn, /consumePendingBillingAction/);
  assert.match(billingReturn, /"Resume your action"/);
  assert.doesNotMatch(billingReturn, /\/resume\/generate|\/draft|\/resolve/);
  assert.match(applications, /rememberCheckoutDraft/);
  assert.match(applications, /checkout_action/);
  assert.match(outreach, /rememberOutreachCheckoutState/);
  assert.match(outreach, /checkout_action/);
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

test("resolved contacts and drafts share the exact company domain", async () => {
  const [outreach, provider, billingApi] = await Promise.all([
    read("app/dashboard/outreach/page.tsx"),
    read("components/billing/BillingProvider.tsx"),
    read("features/billing/infrastructure/billing-api.ts"),
  ]);
  assert.match(outreach, /api<\{ contacts\?: ResolvedContact\[\] \}>\("\/resolve"/);
  assert.match(outreach, /setCompanyDomain\(resolved\.contact\.company_domain\)/);
  assert.equal((outreach.match(/company_domain: companyDomain\.trim\(\)/g) ?? []).length, 4);
  assert.match(outreach, /company_scope_conflict|company domain you enter to keep contact and draft usage together/i);
  assert.match(outreach, /api<\{ application: \{ id: string \} \}>\("\/applications"/);
  assert.equal((outreach.match(/application_id: canonicalApplicationId/g) ?? []).length, 3);
  assert.match(outreach, /draft_type: draftType/);
  for (const draftType of ["first_note", "follow_up", "thank_you", "referral_ask", "offer_stage"]) {
    assert.match(outreach, new RegExp(`\\["${draftType}",`));
  }
  assert.match(outreach, /contactTitle/);
  assert.match(outreach, /title: contactTitle\.trim\(\)/);
  assert.match(outreach, /contactId: canonicalContactId/);
  assert.match(provider, /contactId: request\.contactId/);
  assert.match(billingApi, /contact_id: input\.contactId/);
});

test("durable outreach drafts survive reload and remain editable", async () => {
  const outreach = await read("app/dashboard/outreach/page.tsx");
  assert.match(outreach, /api<\{ drafts\?: DurableOutreachDraft\[\] \}>\("\/drafts\?limit=100"/);
  assert.match(outreach, /durableDraft: saved/);
  assert.match(outreach, /editSavedDraft\(e\.durableDraft!\)/);
  assert.match(outreach, /`\/drafts\/\$\{encodeURIComponent\(editingDraftId\)\}`/);
  assert.match(outreach, /method: "PATCH"/);
  assert.match(outreach, /"Save changes"/);
  assert.match(outreach, /api<DurableOutreachDraft>\("\/drafts\/manual"/);
  assert.match(outreach, /generation_source: "ai_generated" \| "user_written"/);
  assert.match(outreach, /contact_email: contactEmail\.trim\(\) \|\| null/);
  assert.match(outreach, /saved\.contact\.email \?\? saved\.contact_email/);
  assert.match(outreach, /"Save draft"/);
});

test("the public dashboard area makes Network discoverable before sign-in", async () => {
  const home = await read("app/page.tsx");
  assert.match(home, /\["Network", "\/dashboard\/network"\]/);
  assert.match(home, /network paths/);
});
