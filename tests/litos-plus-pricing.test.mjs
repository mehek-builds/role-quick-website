import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_LITOS_PLUS_PLAN_ID,
  FEATURE_COMPARISON,
  LITOS_PLUS_PLANS,
  litosPlusPlansForCurrency,
  zeroDue,
} from "../features/billing/domain/plans.ts";
import { verifiedPlanCatalog } from "../features/billing/domain/catalog.ts";

test("paid terms use the approved prices, daily rates, discount pair, and default", () => {
  assert.equal(DEFAULT_LITOS_PLUS_PLAN_ID, "litos_plus_quarter");
  assert.deepEqual(LITOS_PLUS_PLANS.map((plan) => ({
    id: plan.id,
    label: plan.label,
    cents: plan.amountCents,
    total: plan.total,
    daily: plan.daily,
    list: plan.listTotal,
    discount: plan.discountLabel,
    apps: plan.applicationsLine,
    popular: plan.mostPopular,
  })), [
    { id: "litos_plus_week", label: "Weekly", cents: 2999, total: "$29.99", daily: "$4.28/day", list: null, discount: null, apps: "50 applications / week", popular: false },
    { id: "litos_plus_month", label: "Monthly", cents: 5999, total: "$59.99", daily: "$2.00/day", list: null, discount: null, apps: "200 applications / month", popular: false },
    { id: "litos_plus_quarter", label: "Quarterly", cents: 11999, total: "$119.99", daily: "$1.33/day", list: "$359.99", discount: "70% off", apps: "600 applications / 3 months", popular: true },
  ]);
});

test("the audience and closing lines are the approved copy, and carry no em dash", () => {
  assert.deepEqual(LITOS_PLUS_PLANS.map((plan) => plan.audience), [
    "For light job seekers testing the market.",
    "For active job seekers ready to move fast.",
    "For go-getters ready to land their next role.",
  ]);
  assert.deepEqual(LITOS_PLUS_PLANS.map((plan) => plan.closer), [
    "Perfect if you're applying occasionally or exploring new roles.",
    "Ideal if you're applying weekly and want to stay top of mind with every opportunity.",
    "Go all in. Apply to more roles, faster, and let Litos handle the busywork.",
  ]);
  /* The approved copy's closing line carries an em dash and names a different product. Neither
     survives into Litos, and neither may creep back in on a later copy edit. */
  for (const plan of LITOS_PLUS_PLANS) {
    assert.equal(/[\u2014\u2013]/.test(`${plan.audience} ${plan.closer}`), false, `${plan.id} must not use a dash for punctuation`);
    assert.equal(/sprout/i.test(`${plan.audience} ${plan.closer}`), false, `${plan.id} must not name another product`);
  }
});

test("a struck-through price and a discount badge only ever appear together, in every currency", () => {
  for (const currency of ["USD", "EUR", "GBP", "ZAR", "CAD", "INR"]) {
    for (const plan of litosPlusPlansForCurrency(currency)) {
      assert.equal(
        (plan.listTotal === null) === (plan.discountLabel === null),
        true,
        `${currency} ${plan.id} must show both halves of the discount claim or neither`,
      );
      if (plan.listTotal === null) continue;
      /* The "was" price must be converted with the price it strikes through. A USD $359.99 next
         to a localized amount reads as a far larger discount than the one being offered. */
      assert.equal(plan.listTotal.startsWith(plan.total.slice(0, 1)), true, `${currency} ${plan.id} list price must be in the shown currency`);
      assert.ok(
        Number(plan.listTotal.replace(/[^0-9.]/g, "")) > Number(plan.total.replace(/[^0-9.]/g, "")),
        `${currency} ${plan.id} was-price must exceed its now-price`,
      );
    }
  }
});

test("every non-USD currency converts every plan and keeps the curated USD daily rate untouched", () => {
  for (const currency of ["EUR", "GBP", "ZAR", "CAD", "INR"]) {
    const plans = litosPlusPlansForCurrency(currency);
    assert.equal(plans.length, LITOS_PLUS_PLANS.length);
    for (const [index, plan] of plans.entries()) {
      const usdPlan = LITOS_PLUS_PLANS[index];
      assert.equal(plan.id, usdPlan.id);
      assert.ok(plan.amountCents > 0, `${currency} ${plan.id} must have a positive amount`);
      assert.notEqual(plan.amountCents, usdPlan.amountCents, `${currency} ${plan.id} must differ from its USD amount`);
      assert.equal(plan.disclosure, `${plan.total} today. Renews ${plan.renewal} until canceled.`);
      assert.match(plan.daily, /\/day$/);
    }
  }
  /* Every USD daily rate is now the honest rounding of its own amount over its own days; the
     old curated "$0.99/day" quarterly figure went with the old price. Asserted as arithmetic
     rather than as a literal so a future curated figure has to be a deliberate edit here. */
  for (const plan of LITOS_PLUS_PLANS) {
    const days = { litos_plus_week: 7, litos_plus_month: 30, litos_plus_quarter: 90 }[plan.id];
    assert.equal(plan.daily, `$${(Math.round(plan.amountCents / days) / 100).toFixed(2)}/day`);
  }
});

test("verifiedPlanCatalog trusts the server's detected currency but verifies its amounts independently", () => {
  const eurPlans = litosPlusPlansForCurrency("EUR").map((plan) => ({
    plan_id: plan.id,
    amount_cents: plan.amountCents,
  }));
  const verified = verifiedPlanCatalog({ currency: "EUR", checkout_available: true, plans: eurPlans });
  assert.equal(verified.currency, "EUR");
  assert.equal(verified.source, "server");
  assert.equal(verified.plans[0].id, "litos_plus_week");
  assert.notEqual(verified.plans[0].amountCents, LITOS_PLUS_PLANS[0].amountCents, "EUR amounts must differ from USD");

  // A currency claim with USD amounts underneath it (or any other mismatch) must not be
  // trusted -- the whole catalog falls back to the static USD table instead.
  const mismatched = verifiedPlanCatalog({
    currency: "EUR",
    checkout_available: true,
    plans: LITOS_PLUS_PLANS.map((plan) => ({ plan_id: plan.id, amount_cents: plan.amountCents })),
  });
  assert.equal(mismatched.currency, "USD");
  assert.equal(mismatched.source, "fallback");

  // An unrecognized currency string must never reach a plan card.
  const unsupported = verifiedPlanCatalog({ currency: "AED", checkout_available: true, plans: eurPlans });
  assert.equal(unsupported.currency, "USD");
});

test("zeroDue formats a bare zero in the given currency with no decimals, matching the original hardcoded \"$0\"", () => {
  assert.equal(zeroDue("USD"), "$0");
  assert.equal(zeroDue("EUR"), "€0");
});

test("the mandatory onboarding payment screen also reads the currency-aware catalog, not the static USD table", async () => {
  /* Caught by review, not by design: PlanCards and UpgradeModal were wired to the verified
     server catalog, but /start's PlanStep -- the actual card-collection screen, per its own
     file header "THE ONLY RUNG THAT ASKS FOR MONEY" -- was missed, so a non-US student could
     see a correct localized price everywhere else and then be shown USD at the one screen
     that takes their card. */
  const step = await readFile(new URL("../components/start/PlanStep.tsx", import.meta.url), "utf8");
  assert.match(step, /getPlanCatalog/);
  assert.match(step, /const plans = catalog\?\.plans \?\? LITOS_PLUS_PLANS;/);
  assert.match(step, /\{plans\.map\(\(option\) => \{/);
});

test("the trial is one pool of jobs, not a meter per document kind", () => {
  /* WAS "trial meters are independent and exact", pinning three separate 5s. They were never
     independent from the student's point of view and they are one pool now: a job that needs a
     resume, a cover letter and answers spends ONE of the 20. Pinned as identical strings across
     the three rows precisely because a future edit that makes one of them differ would be
     reintroducing the per-kind meter this replaced. */
  const byFeature = new Map(FEATURE_COMPARISON.map((row) => [row.feature, row]));
  const pooled = ["New tailored resumes", "New cover letters", "New generated application answers"];
  for (const feature of pooled) {
    assert.equal(byFeature.get(feature)?.trial, "Part of the 20-job trial", `${feature} must draw on the shared trial pool`);
    assert.equal(byFeature.get(feature)?.plus, "Shared pool of jobs: 50/week, 200/month, or 600/quarter", `${feature} must draw on the shared paid pool`);
  }
  assert.equal(new Set(pooled.map((feature) => byFeature.get(feature)?.trial)).size, 1, "the three kinds must not describe different trial allowances");
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

test("extension checkout states the charge and the cancel window, and never promises Free", async () => {
  /* THE CONTRACT REVERSED, and the test changed with it rather than being deleted.
     It used to require "stay on Free unless you return and explicitly purchase" and
     "No charge begins with the 7-day trial", on the reasoning that nothing could be
     charged without a second deliberate act. That was true while the trial was granted
     at signup and a purchase was a separate decision. The trial now rides on a Stripe
     subscription and CONVERTS ON ITS OWN, so those sentences promised the opposite of
     what the product does, which is the one kind of billing copy that produces
     chargebacks. What is pinned now is the pair a student needs: what will be taken,
     and by when they can stop it. */
  const cards = await readFile(new URL("../components/pricing/PlanCards.tsx", import.meta.url), "utf8");
  // "$0" became zeroDue(catalog?.currency ?? "USD") so a EUR/GBP/etc visitor doesn't see a
  // dollar sign glued to their local-currency renewal price in the same sentence.
  assert.match(cards, /authenticated \|\| extensionCheckout \? plan\.total : zeroDue\(catalog\?\.currency \?\? "USD"\)/);
  assert.match(cards, /Then \$\{plan\.total\} \$\{plan\.renewal\}\. Cancel any time\./);
  assert.match(cards, /Nothing is charged for 7 days\. Cancel any time\./);
  // The claims that said the money would not be taken must not come back anywhere.
  assert.doesNotMatch(cards, /stay on Free unless you return/);
  assert.doesNotMatch(cards, /only after a later, explicit purchase/);
  assert.match(cards, /window\.location\.assign\("\/dashboard\/settings#plan"\)/);
  assert.doesNotMatch(cards, /settings\?section=plan/);
  /* The "Start free" link went with the Free column on 2026-09-08. What replaces the
     assertion is the reason the column went: Free must not be offered as a choice at the point
     of sale, so no control here may route anyone into it. */
  assert.doesNotMatch(cards, /intent=start-free|Start free/);
  assert.match(cards, /expiresAt: checkout\.expires_at/);
  assert.doesNotMatch(cards, /Date\.now\(\) \+ 30 \* 60 \* 1000/);
});

test("pricing is absent from the public website but remains as an extension checkout handoff", async () => {
  const [page, header, footer, home, terms] = await Promise.all([
    readFile(new URL("../app/pricing/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Header.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SiteFooter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /if \(surface !== "extension"\) redirect\("\/login"\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.doesNotMatch(header, /href: "\/pricing"/);
  assert.doesNotMatch(footer, /href="\/pricing"/);
  assert.doesNotMatch(home, /id="pricing"|href="\/pricing"/);
  assert.doesNotMatch(terms, /href="\/pricing"/);
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
  /* Three columns since 2026-09-08, one per PAID term. The Free column is gone on Mehek's
     call: Free is where an account lands by cancelling, not a thing sold on the checkout
     page, and a column offering it there contradicted /start, which has refused to offer it
     since the card gate went in. */
  assert.match(cards, /md:grid-cols-3/);
  assert.doesNotMatch(cards, /grid-cols-4/);
  assert.doesNotMatch(cards, /FREE_FEATURES/);
  // Currency-aware since the visitor's plan list can come from the verified server catalog
  // (catalog.plans) rather than the static USD fallback; either way it is still one map over
  // one plan array producing one column per plan, which is the property this test pins.
  assert.match(cards, /\(catalog\?\.plans \?\? LITOS_PLUS_PLANS\)\.map\(\(plan\) => \{/);
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

test("the plan step has no way past it except paying", async () => {
  /* THE CONTRACT CHANGED, on Mehek's call 2026-08-19. New accounts go seven-day trial then
     Litos+, and Free is somewhere you arrive by cancelling rather than a fork offered during
     setup. "Continue on Free" acknowledged the plan step and finished the flow, so it was the
     one control that let a new account reach the dashboard having never given a card.

     Pinned by ABSENCE, and the second half matters as much as the first: `onSettled` is not
     that control renamed. It fires only for an account that already holds Litos+, which is how
     someone returning from a completed Stripe checkout gets off this screen instead of being
     sold what they just bought. Required rather than optional, because an optional callback is
     one a caller can omit and strand a paid student here forever. */
  const [step, start] = await Promise.all([
    readFile(new URL("../components/start/PlanStep.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/start/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(step, /Continue on Free/);
  assert.doesNotMatch(step, /onboarding_plan_declined/);
  assert.match(step, /\{ onSettled \}: \{ onSettled: \(\) => void \}/);
  // holdsLitosPlusAccess, not isPaidAccess: a completed checkout lands on `trial_plus` first
  // (every subscription starts as the seven-day trial), and isPaidAccess alone never counts
  // that, so the account that had just paid kept seeing this screen indefinitely.
  assert.match(step, /holdsLitosPlusAccess\(access\)[\s\S]{0,600}?onSettled\(\);/);
  // The caller must always supply it, so a paid return is never stranded.
  assert.match(start, /<PlanStep onSettled=\{\(\) => \{ stepDone\("plan"\)/);
  assert.doesNotMatch(start, /requires_payment_method\s*\?/);
});

test("the return from Stripe reconciles before it polls our own database", async () => {
  /* THE STUCK LOOP THIS ENDS. Paid state is written by the webhook, and this page
     used to poll our database for ~7 seconds and then give up, which assumed the
     webhook would land inside that window. It can lag the redirect, be retried for
     minutes after a 5xx, or never arrive at all -- production answered 503 to every
     Stripe event on 2026-08-19 because STRIPE_WEBHOOK_SECRET was not a whsec_ value.
     Meanwhile the student is back on the site having just handed over a card, and
     with no free escape on the plan screen there is no way out of being asked to buy
     what they just bought.

     Order is the whole assertion: reconciling AFTER the poll would still time out in
     exactly the case this exists for. */
  const [ret, apiClient] = await Promise.all([
    readFile(new URL("../app/billing/return/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/billing/infrastructure/billing-api.ts", import.meta.url), "utf8"),
  ]);
  assert.match(ret, /await reconcileBillingCheckout\(context\);/);
  const reconcileAt = ret.indexOf("await reconcileBillingCheckout(context);");
  const pollAt = ret.indexOf("for (let attempt = 0; attempt < 6; attempt += 1)");
  assert.notEqual(reconcileAt, -1);
  assert.notEqual(pollAt, -1);
  assert.ok(reconcileAt < pollAt, "reconcile must run before the poll, or it cannot help the case it exists for");

  // It must never throw: a failed reconcile has to fall through to the poll rather
  // than replacing a slow success with a hard error.
  assert.match(apiClient, /export async function reconcileBillingCheckout[\s\S]{0,700}?catch \{\s*return false;\s*\}/);
});
