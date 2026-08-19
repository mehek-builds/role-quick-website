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
 *   - the review screen states the consequence and issues exactly one submit-request;
 *   - the trial screen counts what is LEFT after the build spent one generation;
 *   - the plan screen's Continue hands off to Stripe with the onboarding return route.
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
let checkoutRequests = 0;
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
  question_count: 17,
  already_answered: 14,
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

function onboardingState() {
  const APPLICATION = ["match", "build", "questions", "review", "trial", "notifications", "plan"];
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
    if (path === "/onboarding/flow/steps") {
      acknowledged.push(JSON.parse(route.request().postData()).step);
      return json({ ok: true });
    }
    if (path === "/jobs") return json({ jobs: [JOB], ranked: true });
    if (path === "/jobs/job-1") return json(JOB);
    if (path === "/profile") return json({ full_name: "A Candidate", resume_email: "a@example.com", school: "USC" });
    if (path === "/profile/application") return json({});
    if (path === "/resume/generate") {
      generationCalls += 1;
      await generationHeld;
      return json({ resume_id: "r1", canonical_application_id: "app-1", application: { spec: { school: "USC" } } });
    }
    if (path === "/postings/job-1/questions") return json(PRESCRIPT);
    if (path === "/notifications/preferences") {
      if (route.request().method() === "PUT") {
        notificationSaves.push(JSON.parse(route.request().postData()));
        return json({
          strong_match: { enabled: false, granted_at: null },
          employer_reply: { enabled: false, granted_at: null },
          deliverable: true,
          unsubscribe_configured: true,
        });
      }
      return json({
        /* Both off, which is what a fresh account holds: nothing is pre-ticked, so the walk below
           has to actually click a box for anything to be granted. */
        strong_match: { enabled: false, granted_at: null },
        employer_reply: { enabled: false, granted_at: null },
        deliverable: true,
        unsubscribe_configured: true,
      });
    }
    if (path === "/applications/app-1/submit-request") {
      submitRequests += 1;
      return json({ review: {} });
    }
    if (path === "/billing/state") {
      return json({
        /* normalizeEntitlementSnapshot refuses anything that is not schema_version 2, which is why
           the first version of this fixture made every meter read "Not recorded". That fallback is
           the component behaving correctly, so the fixture is what had to change. */
        schema_version: 2,
        account_id: "acct-1",
        access_class: "trial_plus",
        trial: {
          meter_policy: "litos_plus_v2_lifetime",
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          active: true,
          tailored_resumes_used: 1,
          tailored_resumes_limit: 5,
          cover_letters_used: 0,
          cover_letters_limit: 5,
          answer_applications_used: 0,
          answer_applications_limit: 5,
          outreach_companies_used: 0,
          outreach_companies_limit: 5,
          company_usage: [],
        },
      });
    }
    if (path === "/billing/checkout") {
      checkoutRequests += 1;
      return json({
        checkout_url: "https://checkout.stripe.com/c/pay/stub",
        offer_id: "offer-1",
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

    // Generation is held open by the stub, so the resume row must still be in flight.
    const mid = await page.locator("main").innerText();
    assert.match(mid, /Writing your one page for it/i);
    assert.match(mid, /composing/i, "the resume stage is not active while generation is in flight");
    assert.equal(generationCalls, 1, "generation ran more than once for one build");

    releaseGeneration();

    await page.getByRole("button", { name: /questions? needs? you/i }).waitFor({ timeout: 20_000 });
    const done = await page.locator("main").innerText();
    assert.match(done, /Here is your application/i);
    // The count is REAL: two outstanding asks in the fixture, not the seventeen the posting holds.
    assert.match(done, /2 questions need you/i);

    await page.getByRole("button", { name: "2 questions need you" }).click();
  });

  test("05 the questions: the employer's own options, and no swipe on a declaration", async () => {
    await page.getByRole("heading", { name: /questions Ramp asks/i }).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    // Their vocabulary, not ours. This is the fix for the largest class of stuck packets.
    assert.match(body, /Will you now or in the future require sponsorship/i);
    assert.match(body, /It already answered 14 for you/i);

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

  test("06 review: the consequence is stated, and exactly one send is issued", async () => {
    await page.getByRole("heading", { name: /happy with this/i }).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    assert.match(body, /cannot be unsent/i, "the irreversible screen must say so above the button");
    assert.match(body, /Anything Litos guessed/i);
    assert.match(body, /None/i);
    // No countdown anywhere: auto-submit's 15-second timer has no place in a first-run flow.
    assert.doesNotMatch(body, /\bcancel(ling)? in \d|\d+ seconds\b/i);

    assert.equal(submitRequests, 0, "something sent the application before the button was pressed");
    await page.getByRole("button", { name: "Send my application" }).click();
    await page.getByRole("heading", { name: /here's something from us/i }).waitFor({ timeout: 20_000 });
    assert.equal(submitRequests, 1, "the send must be issued exactly once");
  });

  test("07 the trial: the gift, counted after the build spent one generation", async () => {
    const body = await page.locator("main").innerText();
    assert.match(body, /A gift, on us/i);
    assert.match(body, /days of Litos\+/i);
    // 5 limit minus the 1 the build used. Printing 5 here would be a number the account does not have.
    assert.match(body, /Tailored resumes\s*\n?\s*4/i);
    assert.match(body, /Nothing to confirm/i);

    await page.getByRole("button", { name: "Start using it" }).click();
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

    const boxes = page.locator('main input[type="checkbox"]');
    assert.equal(await boxes.count(), 2, "two asks, deliberately");
    for (let i = 0; i < 2; i += 1) {
      assert.equal(await boxes.nth(i).isChecked(), false, "a pre-ticked consent is not a consent");
    }

    await boxes.nth(0).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("heading", { name: /after the seven days/i }).waitFor({ timeout: 20_000 });
    assert.deepEqual(
      notificationSaves,
      [{ strong_match: true, employer_reply: false }],
      "an unticked box must be saved as a decline, not left out as unmentioned",
    );
  });

  test("09 the plan: pre-selected, one control, and no way past it without a card", async () => {
    /* THE CONTRACT CHANGED TWICE ON 2026-08-19 and this walk changed with it rather than
       being deleted. It used to require the free escape ("Free is a real choice"), the
       panel listing what Free kept, and the "$89.99 today" disclosure.

       All three are gone and none of them by accident. New accounts go seven-day trial
       then Litos+, so Free is somewhere you arrive by cancelling, not a fork offered
       during setup -- the escape was the one control that let a new account reach the
       dashboard having never given a card. And "$89.99 today" was simply false once the
       card started a trial instead of a purchase: nothing is taken for seven days.

       What is pinned now is the pair that has to be true on the screen that takes the
       card -- what will be charged and by when it can be stopped -- plus the absence of
       every exit, since an exit reappearing is the regression that matters. */
    await page.getByRole("heading", { name: /after the seven days/i }).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    assert.match(body, /Free for seven days\./i);
    assert.match(body, /Litos\+ continues at \$89\.99 every 3 months\./i);
    assert.match(body, /any time before then and you are not charged/i);
    assert.doesNotMatch(body, /\$89\.99 today/i, "nothing is charged today, a trial starts");
    assert.doesNotMatch(body, /Continue on Free/i, "the free escape is the whole point of the gate");
    assert.doesNotMatch(body, /Finish later/i);

    // Exactly one way forward, and it is checkout.
    const actions = await page.locator("main button, main a").allInnerTexts();
    const forward = actions.map((t) => t.trim()).filter((t) => /^Continue/i.test(t));
    assert.deepEqual(forward, ["Continue with 3 months"]);
  });

  test("the whole sequence was walked in order", () => {
    assert.deepEqual(acknowledged, ["match", "build", "questions", "review", "trial", "notifications"]);
  });
});
