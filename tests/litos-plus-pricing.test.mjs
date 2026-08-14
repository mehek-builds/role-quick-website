import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_LITOS_PLUS_PLAN_ID,
  FEATURE_COMPARISON,
  LITOS_PLUS_PLANS,
} from "../features/billing/domain/plans.ts";
import { verifiedPlanCatalog } from "../features/billing/domain/catalog.ts";

test("paid terms use the approved prices, daily rates, savings, and default", () => {
  assert.equal(DEFAULT_LITOS_PLUS_PLAN_ID, "litos_plus_quarter");
  assert.deepEqual(LITOS_PLUS_PLANS.map((plan) => ({
    id: plan.id,
    cents: plan.amountCents,
    daily: plan.daily,
    savings: plan.savings,
    popular: plan.mostPopular,
  })), [
    { id: "litos_plus_week", cents: 1999, daily: "$2.85/day", savings: null, popular: false },
    { id: "litos_plus_month", cents: 3999, daily: "$1.33/day", savings: 53, popular: false },
    { id: "litos_plus_quarter", cents: 8999, daily: "$0.99/day", savings: 65, popular: true },
  ]);
});

test("trial meters are independent and exact", () => {
  const byFeature = new Map(FEATURE_COMPARISON.map((row) => [row.feature, row]));
  assert.equal(byFeature.get("New tailored resumes")?.trial, "5 successful generations");
  assert.equal(byFeature.get("New cover letters")?.trial, "5 successful generations");
  assert.equal(byFeature.get("New generated application answers")?.trial, "For 5 distinct applications");
  assert.equal(byFeature.get("Contact discovery")?.trial, "Up to 2 per represented company, up to 5 companies");
  assert.equal(byFeature.get("Outreach draft generation")?.trial, "Up to 2 per represented company, up to 5 companies");
  assert.equal(FEATURE_COMPARISON.some((row) => /interview-preparation/i.test(row.feature)), false);
  assert.equal(FEATURE_COMPARISON.some((row) => /5 distinct packets|within the 5 packets/i.test(row.trial)), false);
});

test("server plan catalog requires explicit checkout availability", () => {
  const plans = LITOS_PLUS_PLANS.map((plan) => ({
    plan_id: plan.id,
    amount_cents: plan.amountCents,
  }));

  assert.equal(verifiedPlanCatalog({ checkout_available: false, plans }).checkoutAvailable, false);
  assert.equal(verifiedPlanCatalog({ checkout_available: true, plans }).checkoutAvailable, true);
  assert.equal(verifiedPlanCatalog({ plans }).checkoutAvailable, false);
});

test("public pricing clearly separates the no-card trial from a later purchase", async () => {
  const [cards, pricing] = await Promise.all([
    readFile(new URL("../components/pricing/PlanCards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pricing/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(cards, /authenticated \|\| extensionCheckout \? plan\.total : "\$0"/);
  assert.match(cards, /stay on Free unless you return and explicitly purchase/);
  assert.match(cards, /No charge begins with the 7-day trial/);
  assert.match(cards, /window\.location\.assign\("\/dashboard\/settings#plan"\)/);
  assert.doesNotMatch(cards, /settings\?section=plan/);
  assert.match(cards, /authenticated \? "\/dashboard\/applications\?new=1&intent=fill"/);
  assert.match(cards, /expiresAt: checkout\.expires_at/);
  assert.doesNotMatch(cards, /Date\.now\(\) \+ 30 \* 60 \* 1000/);
  assert.match(pricing, /5 tailored resumes, 5 cover letters, and generated answers for 5 applications/);
  assert.match(pricing, /Each trial generation requires an explicit click/);
});

test("extension-origin pricing keeps checkout on the extension account", async () => {
  const [cards, bridge, billingReturn] = await Promise.all([
    readFile(new URL("../components/pricing/PlanCards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/extension-bridge.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/billing/return/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(cards, /params\.get\("surface"\) === "extension"/);
  assert.match(cards, /params\.get\("trigger"\)/);
  assert.match(cards, /params\.get\("action_nonce"\)/);
  assert.match(cards, /actionNonce,/);
  assert.match(cards, /createCheckoutThroughExtension/);
  assert.match(bridge, /type: "LITOS_CREATE_CHECKOUT"/);
  assert.match(bridge, /isStripeCheckoutUrl\(reply\.checkout_url\)/);
  assert.match(billingReturn, /verifyExtensionCheckoutReturn/);
  assert.match(bridge, /type: "LITOS_CHECKOUT_RETURN"/);
  assert.match(bridge, /type: "LITOS_RETRY_PREMIUM_ACTION"/);
  assert.match(billingReturn, /actionReady: reply\.action_ready === true/);
  assert.match(billingReturn, /"Retry last action"/);
  assert.match(billingReturn, /retryPremiumActionThroughExtension\(actionNonce\)/);
  assert.doesNotMatch(billingReturn, /result\.kind === "extension_active"[\s\S]*consumePendingBillingAction/);
  const extensionBranchStart = billingReturn.indexOf("if (extensionReturn) {");
  const extensionBranchEnd = billingReturn.indexOf(
    "return () => { stopped = true; };\n    }",
    extensionBranchStart,
  );
  assert.notEqual(extensionBranchStart, -1);
  assert.notEqual(extensionBranchEnd, -1);
  const extensionBranch = billingReturn.slice(extensionBranchStart, extensionBranchEnd);
  assert.match(extensionBranch, /verifyExtensionCheckoutReturn/);
  assert.doesNotMatch(extensionBranch, /api<Me>|getBillingState/);
  assert.match(billingReturn, /We could not confirm the extension account yet\. Open Litos and refresh Plan\./);
});
