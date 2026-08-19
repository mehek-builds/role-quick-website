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

test("public pricing states the charge and the cancel window, and never promises Free", async () => {
  /* THE CONTRACT REVERSED, and the test changed with it rather than being deleted.
     It used to require "stay on Free unless you return and explicitly purchase" and
     "No charge begins with the 7-day trial", on the reasoning that nothing could be
     charged without a second deliberate act. That was true while the trial was granted
     at signup and a purchase was a separate decision. The trial now rides on a Stripe
     subscription and CONVERTS ON ITS OWN, so those sentences promised the opposite of
     what the product does, which is the one kind of billing copy that produces
     chargebacks. What is pinned now is the pair a student needs: what will be taken,
     and by when they can stop it. */
  const [cards, pricing] = await Promise.all([
    readFile(new URL("../components/pricing/PlanCards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pricing/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(cards, /authenticated \|\| extensionCheckout \? plan\.total : "\$0"/);
  assert.match(cards, /Then \$\{plan\.total\} \$\{plan\.renewal\}\. Cancel any time\./);
  assert.match(cards, /Nothing is charged for 7 days\. Cancel any time\./);
  // The claims that said the money would not be taken must not come back anywhere.
  assert.doesNotMatch(cards, /stay on Free unless you return/);
  assert.doesNotMatch(cards, /only after a later, explicit purchase/);
  assert.doesNotMatch(pricing, /Your account moves to Free/);
  assert.match(cards, /window\.location\.assign\("\/dashboard\/settings#plan"\)/);
  assert.doesNotMatch(cards, /settings\?section=plan/);
  assert.match(cards, /authenticated \? "\/dashboard\/applications\?new=1&intent=fill"/);
  assert.match(cards, /expiresAt: checkout\.expires_at/);
  assert.doesNotMatch(cards, /Date\.now\(\) \+ 30 \* 60 \* 1000/);
  assert.match(pricing, /5 tailored resumes, 5 cover letters, and generated answers for 5 applications/);
  assert.match(pricing, /Each trial generation requires an explicit click/);
});

test("every plan is its own column, and the term is not a radio inside one card", async () => {
  /* The three paid terms used to be radio rows inside a single Litos+ card, which
     printed one price at a time and read as two products where there are four
     prices. Mehek's call 2026-08-19: a term is not a setting on a plan, it is the
     plan, so each one gets a column and its own button. What is pinned here is the
     shape that regressed the copy last time: a shared `selected` term feeding one
     shared button, which is why the checkout call takes the term as an argument
     rather than reading state that a click has not flushed yet. */
  const cards = await readFile(new URL("../components/pricing/PlanCards.tsx", import.meta.url), "utf8");
  assert.match(cards, /lg:grid-cols-4/);
  assert.match(cards, /LITOS_PLUS_PLANS\.map\(\(plan\) => \{/);
  assert.match(cards, /continueWithPlan\(planId: LitosPlusPlanId\)/);
  assert.match(cards, /onClick=\{\(\) => void continueWithPlan\(plan\.id\)\}/);
  assert.doesNotMatch(cards, /type="radio"/);
  assert.doesNotMatch(cards, /name="pricing-term"/);
});

test("no surface promises anything about a card", async () => {
  /* Removed 2026-08-19 on Mehek's call: the terms of the trial changed and a
     promise the product may no longer keep is worse than no promise at all. The
     page still says what it charges and when, which is the part that has to be
     true; it just no longer says what it collects to do it. Pinned across every
     surface that carried the line, because it was written five separate times and
     a sweep that misses one is the version students screenshot. */
  const files = [
    "../components/pricing/PlanCards.tsx",
    "../components/cinema/CinematicHero.tsx",
    "../components/start/TrialStep.tsx",
    "../app/login/page.tsx",
    "../app/for-career-centres/page.tsx",
    "../lib/pricing.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /no card|without a card|card is needed|card needed|card required/i, `${file} still promises something about a card`);
  }
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
