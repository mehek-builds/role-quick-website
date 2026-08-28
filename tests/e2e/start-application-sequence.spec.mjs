/* THE END-TO-END WALK OF THE APPLICATION SEQUENCE.
 *
 * Real components, real routing, real step transitions, stubbed backend. The backend is stubbed
 * for one reason that is not convenience: the last screen of this flow SENDS A REAL APPLICATION to
 * a real employer, and a test suite that runs on every push must never be the thing that does
 * that. So the send is asserted by the request it issues rather than by its effect, which is the
 * only honest way to test an irreversible action.
 *
 * What this proves:
 *   - all six screens render and advance in order, driven by the acknowledgement ledger;
 *   - the build screen's stages are driven by real calls, and the resume stage does not resolve
 *     until generation does;
 *   - the questions screen shows the EMPLOYER'S options and refuses to auto-advance a declaration;
 *   - the review screen shows the real resume and answers before one submit-request;
 *   - the trial screen discloses its payment-method gate before checkout;
 *   - the plan screen requires an explicit term choice before Stripe can open.
 */

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { spawn } from "node:child_process";
/* playwright-core, not playwright. Only the core package is a dependency here; the full package
   resolves locally because something else in the tree hoists it, and it is simply absent after a
   clean npm ci in CI. */
import { chromium } from "playwright-core";

const port = 3599;
const ORIGIN = `http://127.0.0.1:${port}`;
const API = "https://stub.local";

let server;
let browser;
let context;
let page;

/* Everything the flow reads, in one place, so a change to the contract fails here loudly rather
   than being absorbed by six separate hand-written mocks. */
const acknowledged = [];
/* Every body the notifications screen PUT. Kept rather than counted, because the thing worth
   asserting is not that it saved but WHAT it saved: an unticked box has to arrive as an explicit
   false, or the server reads it as "not mentioned" and leaves a stale grant on. */
const notificationSaves = [];
let submitRequests = 0;
const submitBodies = [];
const savedAnswers = [];
let checkoutRequests = 0;
const checkoutBodies = [];
let generationCalls = 0;
let releaseGeneration;
const generationHeld = new Promise((resolve) => { releaseGeneration = resolve; });

const JOB = {
  id: "job-1",
  company_name: "Ramp",
  title: "Software Engineer Intern",
  location: "New York",
  department: null,
  employment_type: "Internship",
  description: "Full job description with every requirement in it.",
  apply_url: "https://boards.greenhouse.io/ramp/jobs/1",
  posting_url: "https://boards.greenhouse.io/ramp/jobs/1",
  remote: false,
  posted_at: null,
  first_seen_at: new Date(Date.now() - 4 * 3_600_000 + 60_000).toISOString(),
  ats_name: "greenhouse",
  match_score: 91,
  is_active: true,
};

const PRESCRIPT = {
  job_id: "job-1",
  company: "Ramp",
  role: "Software Engineer Intern",
  apply_url: JOB.apply_url,
  portal: "greenhouse",
  discovery_status: "ok",
  discovered_at: new Date().toISOString(),
  scanned_now: true,
  question_count: 5,
  already_answered: 3,
  filled_answers: [
    { question: "Full legal name", answer: "A Candidate", source: "saved_details", input_type: "text", options: null, required: true, max_length: null },
    { question: "Email address", answer: "a@example.com", source: "saved_details", input_type: "email", options: null, required: true, max_length: null },
    { question: "Portfolio URL", answer: "https://candidate.example", source: "applicant_review", input_type: "url", options: null, required: true, max_length: null },
  ],
  ask: [
    {
      question: "Will you now or in the future require sponsorship for employment visa status?",
      input_type: "select",
      options: ["Yes", "No"],
      required: true,
      max_length: null,
      answer: "",
      reusable: true,
      remembered: false,
      reason: "self_declaration",
      explanation: "only you can state this",
    },
    {
      question: "What is your cumulative GPA?",
      input_type: "select",
      options: ["Below 3.0", "3.0 or above", "3.6 or above (out of 4.0)"],
      required: true,
      max_length: null,
      answer: "",
      reusable: true,
      remembered: false,
      reason: "choice_for_you",
      explanation: "this employer offers a fixed list of answers and the choice is yours",
    },
  ],
};

const CHECKOUT_REVISION = "checkout_terms_v1_e2e123";
const BILLING_PLANS = [
  { id: "litos_plus_week", amount: 1999, interval: "week", intervalCount: 1 },
  { id: "litos_plus_month", amount: 3999, interval: "month", intervalCount: 1 },
  { id: "litos_plus_quarter", amount: 8999, interval: "month", intervalCount: 3 },
].map((plan) => ({
  plan_id: plan.id,
  amount_cents: plan.amount,
  checkout_available: true,
  checkout_terms: {
    schema_version: 1,
    revision: CHECKOUT_REVISION,
    checkout_status: "available",
    blocker_code: null,
    payment_method_required: true,
    trial_eligible: true,
    trial_days: 7,
    due_at_checkout: { amount_cents: 0, currency: "USD", amount_kind: "exact" },
    first_charge: {
      regular_subtotal_cents: plan.amount,
      currency: "USD",
      timing: { kind: "days_after_checkout_completion", days: 7 },
    },
    renewal: {
      regular_subtotal_cents: plan.amount,
      currency: "USD",
      interval: plan.interval,
      interval_count: plan.intervalCount,
    },
    automatic_tax_enabled: true,
    promotion_codes_allowed: true,
    price_basis: "catalog_before_tax_and_promotions",
  },
}));

function onboardingState() {
  /* Mirrors APPLICATION_STEPS. `build` is not here: it is a PHASE of the match screen now, not a
     step, so the ledger never sees it. */
  const APPLICATION = ["match", "questions", "review", "trial", "notifications", "plan"];
  const step = APPLICATION.find((key) => !acknowledged.includes(key)) ?? "done";
  return {
    step,
    flow_version: 3,
    flow_completed: false,
    requires_onboarding: true,
    completed_at: null,
    has_focus: true,
    has_sponsorship_answer: true,
    sponsorship_answer: "no",
    sponsorship_required: false,
    has_resume: true,
    has_impact_review: true,
    has_base_resume: true,
    has_applied: false,
    has_targeting: true,
    learned: [],
    gaps: [],
    includes_gaps_step: false,
    includes_application_steps: true,
    includes_sponsorship_step: false,
    gap_suggestions: {},
  };
}

before(async () => {
  server = spawn("npx", ["next", "start", "--port", String(port)], {
    cwd: new URL("../../", import.meta.url).pathname,
    env: { ...process.env, NEXT_PUBLIC_API_URL: API },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${ORIGIN}/start`);
      if (response.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  browser = await chromium.launch();
  context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem("rq_token", "stub-token");
  });
  page = await context.newPage();

  /* Intercept by ORIGIN, not by a fixed API host. NEXT_PUBLIC_API_URL is baked into the client
     bundle at BUILD time, so setting it when `next start` runs changes nothing: the page calls
     whatever the shared build was compiled with. Matching "any origin that is not the app" catches
     the API wherever it points and keeps this spec independent of the build's env. */
  await page.route((url) => !url.href.startsWith(ORIGIN), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/onboarding/state") return json(onboardingState());
    if (path === "/onboarding/answers") {
      /* The write the questions screen used to skip entirely. Recorded so the walk can assert the
         answers actually left the browser, which is the defect this spec did not catch the first
         time: it asserted the submit fired, never that the answers persisted. */
      savedAnswers.push(...JSON.parse(route.request().postData()).answers);
      return json({ ok: true, remembered: 0, submitted: savedAnswers.length, declared_country: "US" });
    }
    if (path === "/onboarding/flow/steps") {
      acknowledged.push(JSON.parse(route.request().postData()).step);
      return json({ ok: true });
    }
    if (path === "/jobs") return json({ jobs: [JOB], ranked: true });
    /* THE ENVELOPE, because that is what the route actually sends: `{ job: {...} }`.
       This stub returned the bare posting, which is precisely how the production defect survived
       every run of this spec - getJob cast the envelope straight to the posting, so the client read
       undefined for description, title and company_name, and no stub here could ever show it. A
       stub that does not match the route it stands in for is a test asserting its own fiction. */
    if (path === "/jobs/job-1") return json({ job: JOB });
    if (path === "/profile") return json({ full_name: "A Candidate", resume_email: "a@example.com", school: "USC" });
    if (path === "/profile/application") return json({});
    if (path === "/resume/generate") {
      generationCalls += 1;
      await generationHeld;
      /* A WHOLE SPEC, because the build screen now RENDERS the resume rather than describing it.
         This stub returned `{ school: "USC" }` alone, which was enough while the right-hand pane
         was a sentence of prose and became a blank screen the moment it drew real lines. A stub
         thinner than the response it stands in for is how a render crash reaches production. */
      return json({
        resume_id: "r1",
        canonical_application_id: "app-1",
        application: {
          spec: {
            /* THE CONTACT BLOCK THE ROUTE ACTUALLY RETURNS. The build screen draws the resume with
               the shared ResumePaper, whose header is built from `_contact`; a stub without one
               produced a headerless document and no way to see that the real thing has a header. */
            _contact: {
              full_name: "A Candidate",
              email: "a@example.com",
              location: "Los Angeles, CA",
              linkedin_url: "linkedin.com/in/candidate",
            },
            school: "USC",
            degree: "BS Computer Science",
            grad_date: "May 2027",
            coursework: "Distributed Systems, Databases",
            experience: [
              {
                org: "Campus Lab",
                title: "Software Engineering Intern",
                date_range: "Jun 2026 - Aug 2026",
                bullets: [
                  "Built a TypeScript and React dashboard used by 40 researchers.",
                  "Cut PostgreSQL query time 60% by adding covering indexes.",
                ],
              },
            ],
            skills: ["TypeScript", "React", "PostgreSQL", "Python"],
          },
        },
      });
    }
    if (path === "/postings/job-1/questions") return json(PRESCRIPT);
    if (path === "/notifications/preferences") {
      if (route.request().method() === "PUT") {
        notificationSaves.push(JSON.parse(route.request().postData()));
        return json({
          strong_match: { enabled: false, granted_at: null },
          employer_reply: { enabled: false, granted_at: null },
          activity_digest: { enabled: false, granted_at: null },
          deliverable: true,
          unsubscribe_configured: true,
        });
      }
      return json({
        /* All off, which is what a fresh account holds: nothing is pre-ticked, so the walk below
           has to actually click a box for anything to be granted. */
        strong_match: { enabled: false, granted_at: null },
        employer_reply: { enabled: false, granted_at: null },
        activity_digest: { enabled: false, granted_at: null },
        deliverable: true,
        unsubscribe_configured: true,
      });
    }
    if (path === "/applications/app-1/submit-request") {
      submitRequests += 1;
      submitBodies.push(JSON.parse(route.request().postData()));
      return json({ review: {} });
    }
    if (path === "/billing/plans") {
      return json({ schema_version: 1, currency: "USD", checkout_available: true, plans: BILLING_PLANS });
    }
    if (path === "/billing/state") {
      return json({
        /* normalizeEntitlementSnapshot refuses anything that is not schema_version 2, which is why
           the first version of this fixture made every meter read "Not recorded". That fallback is
           the component behaving correctly, so the fixture is what had to change. */
        schema_version: 2,
        account_id: "acct-1",
        access_class: "free_new",
        product: null,
        term: null,
        features: {},
        trial: null,
        subscription: null,
      });
    }
    if (path === "/billing/checkout") {
      checkoutRequests += 1;
      checkoutBodies.push(JSON.parse(route.request().postData()));
      return json({
        checkout_url: "https://checkout.stripe.com/c/pay/stub",
        offer_id: "11111111-1111-4111-8111-111111111111",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    return json({});
  });
});

after(async () => {
  await context?.close();
  await browser?.close();
  server?.kill("SIGTERM");
});

describe("the application sequence, end to end", () => {
  test("03 the match: a real posting, with the freshness it actually has", async () => {
    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /we just detected this one/i }).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    assert.match(body, /Software Engineer Intern/i);
    /* The WORD matters more than the number here: "Found" is what Litos knows (first_seen_at),
       and "Posted" is the claim posted_at cannot support for most of the board. The count is left
       loose because it floors, so a fixture pinned at exactly four hours reads as three the moment
       any time passes. */
    assert.match(body, /Found \d+ hours? ago/i, "the meta line must report first_seen_at");
    assert.doesNotMatch(body, /Posted/i, "posted_at is nullable and must never be claimed");
    assert.match(body, /Litos can submit here/i);

    await page.getByRole("button", { name: "Build my application" }).click();
  });

  test("04 the build: stages driven by real calls, resume unresolved until generation is", async () => {
    await page.getByRole("heading", { name: /building your application/i }).waitFor({ timeout: 20_000 });

    /* Generation is held open by the stub, so the resume row must still be in flight.
     *
     * WAITED FOR, NOT SNAPSHOTTED. This read `innerText` once, the instant the heading appeared,
     * and asserted "composing" was already in it - a race between the posting stage resolving and
     * the assertion running. It passed locally and on most CI runs and failed one, which is the
     * worst kind of test: a real regression here would be indistinguishable from the flake. The
     * stub holds generation open until releaseGeneration(), so waiting cannot hang past that. */
    await page.getByText(/composing/i).waitFor({ timeout: 20_000 });
    const mid = await page.locator("main").innerText();
    assert.match(mid, /Writing your one page for it/i);
    assert.match(mid, /composing/i, "the resume stage is not active while generation is in flight");
    assert.equal(generationCalls, 1, "generation ran more than once for one build");

    releaseGeneration();

    await page.getByRole("button", { name: /questions? needs? you/i }).waitFor({ timeout: 20_000 });
    const done = await page.locator("main").innerText();
    assert.match(done, /Here is your application/i);

    /* THE SCREEN SHOWS THE REAL DOCUMENT, drawn by the paper the rest of the product draws.
     *
     * This pane used to be one sentence of prose asserting that tailoring had happened. Then it was
     * a hand-rolled reading view with its own markup, which drifted from the real thing immediately
     * - it had no contact line at all. It is `components/start/ResumePaper` now, the same component
     * the base-resume screen and the packet viewer use, so the header, the one-page fit and every
     * block come from one place.
     *
     * NO TERM MARKING is asserted here any more. It went out with the hand-rolled view: the shared
     * paper does not mark, so a mark in the posting would point at nothing in the resume, which is
     * the ISSUE-047 failure exactly. What is asserted instead is that the student's own lines and
     * their header are on screen. */
    assert.match(done, /Cut PostgreSQL query time 60%/i, "the resume's own bullets are not on screen");
    assert.match(done, /Software Engineering Intern/i, "the experience the resume was built from is not shown");
    assert.doesNotMatch(done, /Written for this posting from your own resume/i, "the pane still describes instead of showing");
    // The header the applicant is reachable at, which the hand-rolled view omitted entirely.
    assert.match(done, /a@example\.com/i, "the contact line is missing from the resume header");
    assert.match(done, /A Candidate/i, "the applicant is not named on their own resume");

    await page.getByRole("button", { name: "2 questions need you" }).click();
  });

  test("05 the questions: the employer's own options, and no swipe on a declaration", async () => {
    await page.getByRole("heading", { name: /questions Ramp asks/i }).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    // Their vocabulary, not ours. This is the fix for the largest class of stuck packets.
    assert.match(body, /Will you now or in the future require sponsorship/i);
    assert.match(body, /It already answered 3 for you/i);

    // A self-declaration must NOT auto-advance: answering it leaves the card where it is.
    await page.getByRole("radio", { name: /^A\s*Yes$/ }).click();
    await page.waitForTimeout(600);
    const afterDeclaration = await page.locator("main").innerText();
    assert.match(
      afterDeclaration,
      /Will you now or in the future require sponsorship/,
      "a self-declaration auto-advanced, turning a legal statement into a swipe",
    );

    // Move on deliberately, then answer the ordinary question.
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByText("What is your cumulative GPA?").waitFor({ timeout: 5000 });
    assert.match(await page.locator("main").innerText(), /3\.6 or above \(out of 4\.0\)/i);
    await page.getByRole("radio", { name: /3\.6 or above/ }).click();

    await page.getByRole("button", { name: "Save and review" }).click();
  });

  test("the answers actually left the browser", () => {
    /* The regression this spec missed on its first pass. The screen collected answers, advanced the
       flow, and discarded them; asserting the submit-request fired proved nothing about the data. */
    assert.equal(savedAnswers.length, 2, "the questions screen did not persist its answers");
    assert.ok(savedAnswers.some((a) => /sponsorship/i.test(a.question) && a.answer === "Yes"));
    assert.ok(savedAnswers.some((a) => /GPA/i.test(a.question) && /3\.6 or above/.test(a.answer)));
  });

  test("06 review: the exact packet is visible before one send is issued", async () => {
    await page.getByRole("heading", { name: /review before sending/i }).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    assert.match(body, /A Candidate/i, "the applicant name is missing from the reviewed resume");
    assert.match(body, /a@example\.com/i, "the reviewed resume has no contact email");
    assert.match(body, /Cut PostgreSQL query time 60%/i, "the actual tailored resume is not visible");
    assert.match(body, /Will you now or in the future require sponsorship/i, "the employer question is not visible");
    assert.match(body, /\bYes\b/i, "the confirmed sponsorship answer is not visible");
    assert.match(body, /What is your cumulative GPA/i, "the GPA question is not visible");
    assert.match(body, /3\.6 or above \(out of 4\.0\)/i, "the confirmed GPA answer is not visible");
    assert.match(body, /Full legal name\s+A Candidate\s+From your saved details/i);
    assert.match(body, /Email address\s+a@example\.com\s+From your saved details/i);
    assert.match(body, /Portfolio URL\s+https:\/\/candidate\.example\s+You confirmed/i);
    assert.match(body, /Change source resume/i);
    assert.match(body, /Change answers/i);
    assert.match(body, /cannot be unsent/i, "the irreversible screen must say so above the button");
    assert.match(body, /Anything Litos guessed/i);
    assert.match(body, /None/i);
    // No countdown anywhere: auto-submit's 15-second timer has no place in a first-run flow.
    assert.doesNotMatch(body, /\bcancel(ling)? in \d|\d+ seconds\b/i);

    assert.equal(submitRequests, 0, "something sent the application before the button was pressed");

    /* Every displayed value is genuinely editable, including one that came from saved details.
       The override belongs to this application and is sent in the exact body authorized here. */
    await page.getByRole("button", { name: "Change answers" }).click();
    await page.getByRole("heading", { name: /review these 5 application answers/i }).waitFor();
    await page.getByRole("textbox", { name: "Full legal name" }).fill("A Corrected Candidate");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("heading", { name: /review before sending/i }).waitFor();
    assert.match(await page.locator("main").innerText(), /Full legal name\s+A Corrected Candidate\s+You confirmed/i);

    await page.getByRole("button", { name: "Send my application" }).click();
    await page.getByRole("heading", { name: /here is your 7-day trial/i }).waitFor({ timeout: 20_000 });
    assert.equal(submitRequests, 1, "the send must be issued exactly once");
    assert.equal(submitBodies[0].questions.length, 5, "the reviewed values did not reach submit-request");
    assert.ok(submitBodies[0].questions.some((item) => item.question === "Full legal name" && item.answer === "A Corrected Candidate"));
    assert.ok(submitBodies[0].questions.some((item) => /sponsorship/i.test(item.question) && item.answer === "Yes"));
    assert.ok(submitBodies[0].questions.some((item) => /GPA/i.test(item.question) && /3\.6 or above/.test(item.answer)));
  });

  test("07 the trial: payment method requirement is disclosed before checkout", async () => {
    const body = await page.locator("main").innerText();
    assert.match(body, /7-day Litos\+ trial/i);
    assert.match(body, /days of Litos\+/i);
    assert.match(body, /Tailored resumes\s*\n?\s*5/i);
    assert.match(body, /\$0 is due when you complete Stripe checkout/i);
    assert.match(body, /payment method is required/i);
    assert.match(body, /after checkout completes/i);
    assert.doesNotMatch(body, /Active on your account/i);
    // The title follows what the student actually did, and this walk sent.
    assert.match(body, /Sent\. Here is your 7-day trial\./i);

    await page.getByRole("button", { name: "Continue" }).click();
  });

  test("08 notifications: two asks, nothing pre-ticked, and only what was ticked is granted", async () => {
    await page.getByRole("heading", { name: /when the next one opens/i }).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    assert.match(body, /Tell me when a strong match opens/i);
    assert.match(body, /Tell me when an employer replies/i);
    /* The two promises the backend actually enforces, said on the screen that asks. */
    assert.match(body, /at most once a day/i);
    assert.match(body, /unsubscribe link that works without signing in/i);
    /* Screen 08 is notifications ONLY. Auto-apply and the rest are asked at the moment their
       feature is first used, and a wall of checkboxes immediately before the price is both worse
       consent hygiene and a worse rung. */
    assert.doesNotMatch(body, /apply automatically|send without asking|auto-submit/i);

    /* Chromium in this harness supports the Push API, so the laptop-summary control renders and
       there are three boxes. It is deliberately NOT ticked here: doing so fires the real browser
       permission prompt, which Playwright answers by denying, and the assertion worth making is
       that a refused browser leaves the box off rather than that the prompt can be automated. */
    const boxes = page.locator('main input[type="checkbox"]');
    const count = await boxes.count();
    assert.ok(count === 2 || count === 3, `expected two asks plus the optional laptop one, saw ${count}`);
    for (let i = 0; i < count; i += 1) {
      assert.equal(await boxes.nth(i).isChecked(), false, "a pre-ticked consent is not a consent");
    }

    await page.getByRole("checkbox", { name: "Tell me when a strong match opens" }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("heading", { name: /choose your Litos\+ term/i }).waitFor({ timeout: 20_000 });
    assert.equal(notificationSaves.length, 1);
    assert.equal(notificationSaves[0].strong_match, true);
    assert.equal(notificationSaves[0].employer_reply, false, "an unticked box is a decline, not an omission");
    assert.equal(notificationSaves[0].activity_digest, false, "the laptop summary was never granted");
  });

  /* GOING BACK TO CHANGE AN ANSWER, and coming back to where you were.
   *
   * Run this before the Stripe navigation below. Stripe causes a full document navigation, so the
   * intentionally per-sitting application packet is rebuilt after returning to /start.
   *
   * The bug this pins: every screen's Continue acknowledges and refreshes, and the rendered step is
   * `revisiting ?? served`. Finish a revisited screen with that path and the acknowledgement writes
   * a second time while the override keeps the student standing on the screen they just finished,
   * so the button they pressed appears to do nothing. Two assertions, because either one alone
   * passes on the broken version: the ledger must not gain a row, AND the flow must move. */
  test("a revisited screen returns the student instead of pinning them, and writes nothing new", async () => {
    const before = acknowledged.length;

    await page.getByRole("button", { name: "Change something you answered" }).click();
    const list = page.locator("#start-revisit-list");
    await list.waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "what you told the employer" }).click();

    // The old screen, in its own words, with the answers still on it.
    await page.getByRole("heading", { name: /review these 5 application answers/i }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Save changes" }).click();

    /* Back where they were, which by this point in the suite is the plan screen. The server's own
       answer carries them there, so this is the real step rather than a second override. */
    await page.getByRole("button", { name: "Choose a term" }).waitFor({ timeout: 15_000 });
    assert.equal(
      acknowledged.length,
      before,
      `revisiting wrote ${acknowledged.length - before} acknowledgement(s); the ledger already held that screen`,
    );
  });

  test("09 the plan: explicit choice, exact terms, and no way past it without a payment method", async () => {
    /* THIS WALK HAS NOW BEEN OUT OF DATE TWICE IN ONE DAY, and the reason is worth keeping.

       #363 deleted the two-row "If you do nothing / You keep / You lose" table ON PURPOSE --
       it promised the student unlimited filling, free with no time limit, if they simply did
       not act, and that stopped being true when this screen started taking a payment method for a trial
       that converts on its own. Doing nothing is now the path that gets CHARGED. The assertion
       guarding that table was not deleted with it, and main went red.

       Then the free escape went too, because new accounts go seven-day trial then Litos+ and
       Free is somewhere you arrive by cancelling rather than a fork offered during setup. That
       control was the one thing that let a new account reach the dashboard having never given
       a payment method.

       And "$89.99 today" went with them: false once checkout started a trial rather than a
       purchase, since nothing is taken for seven days, and it sat directly above a sentence
       saying the opposite.

       So this pins what the screen must SAY -- when the charge lands, how to stop it -- and the
       absence of every exit, rather than any sentence the product no longer means. */
    await page.getByRole("heading", { name: /choose your Litos\+ term/i }).waitFor({ timeout: 20_000 });

    let body = await page.locator("main").innerText();
    assert.match(
      body,
      /Choose a renewal term to load the amount due in Stripe/i,
      "the paywall does not explain why a term is required",
    );
    const chooseTerm = page.getByRole("button", { name: "Choose a term" });
    assert.equal(await chooseTerm.isDisabled(), true, "checkout is enabled before an explicit term choice");
    assert.equal(await page.getByText("Selected", { exact: true }).count(), 0, "a renewal term was pre-selected");

    await page.getByRole("button", { name: /1 month/i }).click();
    body = await page.locator("main").innerText();
    assert.match(body, /\$0 is due when you complete Stripe checkout/i);
    assert.match(body, /regular \$39\.99 price, before any applicable tax or promotion/i);
    assert.match(body, /first charged 7 days after checkout completes/i);
    assert.match(body, /Cancel in Account before the trial ends/i);
    assert.doesNotMatch(body, /\$89\.99 today/i, "nothing is charged today, a trial starts");
    assert.doesNotMatch(body, /Continue on Free/i, "the free escape is the whole point of the gate");
    assert.doesNotMatch(body, /Finish later/i);

    // Exactly one way forward, and it is checkout.
    const actions = await page.locator("main button, main a").allInnerTexts();
    const forward = actions.map((t) => t.trim()).filter((t) => /start trial/i.test(t));
    assert.deepEqual(forward, ["Add payment method and start trial"]);
    assert.equal(checkoutRequests, 0, "checkout opened before the student pressed its button");

    await page.getByRole("button", { name: "Add payment method and start trial" }).click();
    await page.waitForURL("https://checkout.stripe.com/c/pay/stub", { timeout: 15_000 });
    assert.equal(checkoutRequests, 1, "one checkout click did not create exactly one session");
    assert.equal(checkoutBodies[0].plan_id, "litos_plus_month");
    assert.equal(checkoutBodies[0].checkout_terms_revision, CHECKOUT_REVISION);

    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /choose your Litos\+ term/i }).waitFor({ timeout: 15_000 });
    const returnContext = await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((item) => item.startsWith("litos_billing_return_v2:"));
      return key ? JSON.parse(sessionStorage.getItem(key)) : null;
    });
    assert.equal(returnContext?.returnRoute, "/start");
  });

  test("the whole sequence was walked in order", () => {
    assert.deepEqual(acknowledged, ["match", "questions", "review", "trial", "notifications"]);
  });

});
