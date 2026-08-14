import assert from "node:assert/strict";
import test from "node:test";
import type { Me } from "../../../lib/api.ts";
import {
  featureAccess,
  hydrateLegacyTrialUsage,
  legacySnapshotFromMe,
  normalizeEntitlementSnapshot,
} from "./access.ts";

function me(overrides: Partial<Me> = {}): Me {
  return {
    email: "person@example.com",
    is_guest: false,
    tier: "free",
    trial_ends_at: null,
    usage: {
      resumes: { used: 7, limit: 20 },
      contacts: { used: 8, limit: 30 },
      drafts: { used: 9, limit: 60 },
    },
    ...overrides,
  };
}

test("rolling fallback preserves original Free access and exact usage", () => {
  const snapshot = legacySnapshotFromMe(me());
  assert.equal(snapshot.access_class, "free_grandfathered");
  assert.equal(featureAccess(snapshot, "ai_resume_tailoring"), true);
  assert.equal(featureAccess(snapshot, "ai_cover_letter_generation"), true);
  assert.equal(featureAccess(snapshot, "contact_discovery"), true);
  assert.equal(featureAccess(snapshot, "outreach_email_generation"), true);
  assert.equal(featureAccess(snapshot, "networking_discovery"), false);
  assert.equal(featureAccess(snapshot, "automatic_submission"), false);
  assert.equal(featureAccess(snapshot, "hover_generation"), false);
  assert.deepEqual(snapshot.legacy_usage, {
    tailored_resumes: { used: 7, limit: 20 },
    contacts: { used: 8, limit: 30 },
    drafts: { used: 9, limit: 60 },
  });
  assert.deepEqual(snapshot.legacy_limits, {
    tailored_resumes_monthly: 20,
    contacts_monthly: 30,
    drafts_monthly: 60,
    cover_letters_unmetered: true,
    application_answers_unmetered: true,
  });
});

test("legacy paid fallback keeps paid tools and paid-only hover", () => {
  const snapshot = legacySnapshotFromMe(me({ tier: "pro", billing_provider: "lemonsqueezy" }));
  assert.equal(snapshot.access_class, "legacy_paid");
  assert.equal(featureAccess(snapshot, "hover_generation"), true);
  assert.equal(featureAccess(snapshot, "automatic_submission"), true);
  assert.equal(snapshot.subscription?.provider, "lemonsqueezy");
});

test("trial fallback is explicit-click only", () => {
  const snapshot = legacySnapshotFromMe(me({
    tier: "trial",
    trial_ends_at: new Date(Date.now() + 60_000).toISOString(),
    usage: {
      resumes: { used: 2, limit: 5 },
      contacts: { used: 0, limit: 2 },
      drafts: { used: 0, limit: 2 },
    },
  }));
  assert.equal(snapshot.access_class, "trial_plus");
  assert.equal(featureAccess(snapshot, "ai_resume_tailoring"), true);
  assert.equal(featureAccess(snapshot, "hover_generation"), false);
  assert.equal(snapshot.trial?.meter_policy, "legacy_monthly_allowances");
  assert.equal(snapshot.legacy_usage?.tailored_resumes.used, 2);
  assert.equal(snapshot.legacy_usage?.tailored_resumes.limit, 5);
});

test("legacy active trial markers never invent the new 5/5/5 meters", () => {
  const snapshot = normalizeEntitlementSnapshot({
    schema_version: 2,
    access_class: "trial_plus",
    features: { ai_resume_tailoring: true, hover_generation: false },
    trial: {
      meter_policy: "legacy_monthly_allowances",
      starts_at: "2026-08-10T00:00:00.000Z",
      ends_at: "2026-08-17T00:00:00.000Z",
      active: true,
    },
  });
  assert.ok(snapshot);
  assert.deepEqual(snapshot.trial, {
    meter_policy: "legacy_monthly_allowances",
    starts_at: "2026-08-10T00:00:00.000Z",
    ends_at: "2026-08-17T00:00:00.000Z",
    active: true,
  });
  const hydrated = hydrateLegacyTrialUsage(snapshot, me({
    usage: {
      resumes: { used: 4, limit: 20 },
      contacts: { used: 11, limit: 30 },
      drafts: { used: 12, limit: 60 },
    },
  }));
  assert.equal(hydrated.legacy_usage?.tailored_resumes.limit, 20);
  assert.equal(hydrated.legacy_usage?.contacts.used, 11);
  assert.equal(hydrated.legacy_usage?.drafts.limit, 60);
});

test("new trial meters are accepted only when the full independent contract is present", () => {
  const baseTrial = {
    meter_policy: "litos_plus_v2_lifetime",
    starts_at: "2026-08-10T00:00:00.000Z",
    ends_at: "2026-08-17T00:00:00.000Z",
    active: true,
    tailored_resumes_used: 1,
    tailored_resumes_limit: 5,
    cover_letters_used: 2,
    cover_letters_limit: 5,
    answer_applications_used: 3,
    answer_applications_limit: 5,
    outreach_companies_used: 4,
    outreach_companies_limit: 5,
    company_usage: [],
  };
  const complete = normalizeEntitlementSnapshot({
    schema_version: 2,
    access_class: "trial_plus",
    features: {},
    trial: baseTrial,
  });
  assert.equal(complete?.trial?.meter_policy, "litos_plus_v2_lifetime");
  if (complete?.trial?.meter_policy === "litos_plus_v2_lifetime") {
    assert.equal(complete.trial.cover_letters_used, 2);
    assert.equal(complete.trial.answer_applications_used, 3);
  }
  const incomplete = normalizeEntitlementSnapshot({
    schema_version: 2,
    access_class: "trial_plus",
    features: {},
    trial: { ...baseTrial, cover_letters_limit: undefined },
  });
  assert.equal(incomplete?.trial, null);
});

test("v2 normalization retains server feature booleans and original plan limits", () => {
  const snapshot = normalizeEntitlementSnapshot({
    schema_version: 2,
    policy_version: "litos-entitlements-v2",
    account_id: "account-1",
    revision: "9:free_grandfathered",
    evaluated_at: "2026-08-14T00:00:00.000Z",
    access_class: "free_grandfathered",
    product: null,
    term: null,
    features: {
      ai_resume_tailoring: true,
      recruiter_visibility: false,
      hover_generation: false,
      automatic_submission: true,
    },
    trial: null,
    legacy_limits: {
      tailored_resumes_monthly: 20,
      contacts_monthly: 30,
      drafts_monthly: 60,
      cover_letters_unmetered: true,
      application_answers_unmetered: true,
    },
    subscription: null,
  });
  assert.ok(snapshot);
  assert.equal(snapshot.account_id, "account-1");
  assert.equal(featureAccess(snapshot, "automatic_submission"), true);
  assert.equal(featureAccess(snapshot, "hover_generation"), false);
  assert.equal(snapshot.legacy_limits?.contacts_monthly, 30);
});
