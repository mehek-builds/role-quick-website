/* THE END-TO-END WALK OF THE APPLICATION SEQUENCE.
 *
 * Real components, real routing, real step transitions, stubbed backend. The backend is stubbed
 * for one reason that is not convenience: the last screen of this flow SENDS A REAL APPLICATION to
 * a real employer, and a test suite that runs on every push must never be the thing that does
 * that. So the send is asserted by the request it issues rather than by its effect, which is the
 * only honest way to test an irreversible action.
 *
 * What this proves:
 *   - every screen renders and advances in order, driven by the acknowledgement ledger, which by
 *     itself is six entries answered across five screens: the trial screen answers two of them;
 *   - the build screen's stages are driven by real calls, and the resume stage does not resolve
 *     until generation does;
 *   - the questions screen shows the EMPLOYER'S options and refuses to auto-advance a declaration;
 *   - the review screen audits the exact packet, shows the real PDF, records the applicant's
 *     acknowledgement of it and only then issues exactly one submit-request;
 *   - the trial screen counts what is LEFT after the build spent one generation, and carries the
 *     staying-in-touch ask that used to be a screen of its own;
 *   - the plan screen's Continue hands off to Stripe with the onboarding return route.
 */

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
/* Every body the staying-in-touch switches PUT. Kept rather than counted, because the thing worth
   asserting is not that it saved but WHAT it saved: an unticked box has to arrive as an explicit
   false, or the server reads it as "not mentioned" and leaves a stale grant on. */
const notificationSaves = [];
/* And every READ, which the walk needs for a reason the saves do not: the switches hydrate from
   this GET and setState from it, so a tick landing before it resolves would be silently undone.
   Counted rather than kept, because the only question asked of it is whether it has happened. */
let notificationReads = 0;
let submitRequests = 0;
const savedAnswers = [];
let checkoutRequests = 0;
let generationCalls = 0;
let releaseGeneration;
const generationHeld = new Promise((resolve) => { releaseGeneration = resolve; });

/* Polls a condition only the STUB can see. Playwright's waits are all about the page, and the
   assertions below are about requests the app did or did not make; a bare read of a counter is a
   snapshot that races the fetch it is asking about. Failing loudly on timeout rather than
   returning false keeps a missing request from reading as a passed assertion. */
async function waitFor(condition, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(message);
}

/* THE SEND GATE, STUBBED AS THE BACKEND ACTUALLY ENFORCES IT.
 *
 * This spec used to answer POST /submit-request with a bare 200, and that single line is why the
 * walk certified a screen that could not send. In production that route gates on
 * currentAcknowledgedPacketAudit: no packet audit on the row and it answers 409
 * PACKET_AUDIT_REQUIRED, "Audit this exact packet before submitting."; an audit with no
 * acknowledgement and it answers 409 PACKET_AUDIT_ACK_REQUIRED. The onboarding review screen wrote
 * neither record, so every onboarding send in production was refused, and this file was green
 * throughout. A stub more permissive than the route it stands in for is a test asserting its own
 * fiction, so the three counters below reproduce the real order and the submit stub refuses
 * anything that skips it. */
let packetAudits = 0;
const acknowledgements = [];
const submittedQuestionBodies = [];
let submitRefusals = 0;
/* Failure injection for the refusal walks. Every one of these is a state the production routes can
   actually be in, and none of them had a test until the branches that handle them were written. */
let auditFailure = null;
let acknowledgeStaleOnce = false;

/* The committed PDF the exact-packet viewer suite uses, served by the app's own /public. The
   review screen downloads it, hashes it against the audit's binding, parses it and counts painted
   pixels, so this walk exercises the real gate rather than a stubbed claim of one. Read from disk
   rather than pinned as a literal: a fixture swap should fail on a render assertion, never on a
   hash this file quietly disagreed with. */
const FIXTURE_PDF = readFileSync(new URL("../../public/qa/exact-packet-fixture.pdf", import.meta.url));
const FIXTURE_SHA256 = createHash("sha256").update(FIXTURE_PDF).digest("hex");
const FIXTURE_SIZE_BYTES = FIXTURE_PDF.length;

/* Fabricated but well-formed. packetAuditResponseMatchesApplication validates every one of these
   as 64 hex characters before the client renders anything, so a lazier fixture fails closed and
   proves nothing about the screen. */
const digest = (seed) => createHash("sha256").update(seed).digest("hex");
const AUDIT_DIGEST = digest("audit-digest");
const PACKET_VERSION = digest("packet-version");
const PACKET_OBJECT_KEY = "users/stub/resumes/app-1.pdf";

/* The questions the audit hashed, which is what the review screen must submit back. The screen
   used to submit `[]`, and an empty body is not "no opinion" on the other end: the merge strips
   every stored answer's provenance and the refresh then blanks the ones nothing proves the
   applicant supplied, so the packet the send gate hashes stops being the packet she acknowledged.
   Test 06 asserts these arrive verbatim.

   SHAPED BY THE SERVER'S OWN questionSchema, not by what reads nicely here. `kind` is
   z.enum(['essay','required']) and there is no `options` key, so the first version of this fixture -
   kind "select" with an options array - described a body POST /submit-request would have answered
   400 "Invalid answers" on, while this file stayed green. That is the same defect as the bare-200
   submit stub below it: a fixture more permissive than the route it stands in for. */
const AUDITED_QUESTIONS = [
  {
    id: "q-sponsorship",
    question: "Will you now or in the future require sponsorship for employment visa status?",
    kind: "required",
    required: true,
    answer: "Yes",
  },
  {
    id: "q-gpa",
    question: "What is your cumulative GPA?",
    kind: "required",
    required: true,
    answer: "3.6 or above (out of 4.0)",
  },
];

function packetAuditResponse() {
  const pdf = { objectKey: PACKET_OBJECT_KEY, sha256: FIXTURE_SHA256, sizeBytes: FIXTURE_SIZE_BYTES };
  return {
    packet_audit: {
      version: "packet_audit_v2",
      status: "passed",
      complete: true,
      degraded: false,
      rejectedCount: 0,
      clauses: [],
      identities: { resume_email: "a@example.com", applicant_email: "apply.app-1@litos.email" },
      audit_digest: AUDIT_DIGEST,
      packet_version: PACKET_VERSION,
      bindings: {
        ownerSha256: digest("owner"),
        applicationId: "app-1",
        jdSha256: digest("jd"),
        specSha256: digest("spec"),
        jobContextSha256: digest("job-context"),
        questionsSha256: digest("questions"),
        applicantSnapshotSha256: digest("applicant-snapshot"),
        resumeContactEmailSha256: digest("a@example.com"),
        applicantEmailSha256: digest("apply.app-1@litos.email"),
        pdf,
        employerDelivery: { version: "employer_delivery_v1", mode: "browser", sha256: digest("delivery") },
      },
    },
    /* Served by the app's own origin, which this file's interceptor deliberately does not match,
       so the bytes the viewer hashes are the real file off disk. */
    pdf: {
      object_key: PACKET_OBJECT_KEY,
      sha256: FIXTURE_SHA256,
      size_bytes: FIXTURE_SIZE_BYTES,
      download_url: `${ORIGIN}/qa/exact-packet-fixture.pdf`,
    },
    questions: AUDITED_QUESTIONS,
  };
}

const JOB = {
  id: "job-1",
  company_name: "Ramp",
  title: "Software Engineer Intern",
  location: "New York",
  department: null,
  employment_type: "Internship",
  /* Named technologies rather than filler prose, because the two panes mark requirement terms and
     a description with nothing markable would leave that path unexercised: TypeScript, React and
     PostgreSQL are on the fixture resume, Kubernetes deliberately is not. */
  description: "We build with TypeScript and React on PostgreSQL. Kubernetes experience preferred.",
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
      /* TWO IDS, DELIBERATELY DIFFERENT, because they are different in production and this stub
         once said otherwise. The real route returns the canonical application's id AND the
         generated_resumes row under application.id, and only the latter is the id space
         POST /applications/:id/submit-request resolves (ownedResume reads generated_resumes
         alone). While this stub reused one string for both, the client could send either id and
         this spec stayed green; in production the canonical id 404'd every onboarding send with
         "Application not found" (2026-09-01). The submit stub below answers app-1 only, so a
         client that regresses to canonical_application_id counts zero sends and fails test 06. */
      return json({
        resume_id: "app-1",
        canonical_application_id: "canon-1",
        application: {
          id: "app-1",
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
    /* The requirement match both panes are coloured with. Terms mirror JOB.description: the three
       matched ones are on the fixture resume, Kubernetes is asked for and absent. */
    if (path === "/jd-match") {
      return json({
        score: 78,
        scorable: true,
        band: { label: "Strong match", tone: "strong" },
        term_count: 4,
        min_scorable_terms: 4,
        matched: [
          { term: "typescript", display: "TypeScript", weight: 1 },
          { term: "react", display: "React", weight: 1 },
          { term: "postgresql", display: "PostgreSQL", weight: 1 },
        ],
        missing: [{ term: "kubernetes", display: "Kubernetes", weight: 0.6 }],
      });
    }
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
      notificationReads += 1;
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
    if (path === "/applications/app-1/packet-audit") {
      packetAudits += 1;
      if (auditFailure) return json(auditFailure.body, auditFailure.status);
      return json(packetAuditResponse());
    }
    if (path === "/applications/app-1/packet-audit/acknowledge") {
      const body = JSON.parse(route.request().postData());
      if (acknowledgeStaleOnce) {
        acknowledgeStaleOnce = false;
        return json({
          error: "The rendered packet no longer matches the saved application. Reload it before continuing.",
          code: "PACKET_AUDIT_STALE",
        }, 409);
      }
      /* The route's own exact-CAS, reproduced. An acknowledgement is only an acknowledgement OF a
         specific audit and a specific file, and one that names anything else is a 409 in
         production rather than a record. */
      if (body.audit_digest !== AUDIT_DIGEST
        || body.packet_version !== PACKET_VERSION
        || body.pdf_sha256 !== FIXTURE_SHA256
        || body.size_bytes !== FIXTURE_SIZE_BYTES) {
        return json({ error: "The rendered packet no longer matches the saved application.", code: "PACKET_AUDIT_STALE" }, 409);
      }
      acknowledgements.push(body);
      return json({ acknowledged: true });
    }
    if (path === "/applications/app-1/submit-request") {
      if (packetAudits === 0) {
        submitRefusals += 1;
        return json({ error: "Audit this exact packet before submitting.", code: "PACKET_AUDIT_REQUIRED" }, 409);
      }
      if (acknowledgements.length === 0) {
        submitRefusals += 1;
        return json({
          error: "Approve the exact packet Litos prepared before it is sent.",
          code: "PACKET_AUDIT_ACK_REQUIRED",
        }, 409);
      }
      /* AN ACKNOWLEDGEMENT OF *THIS* AUDIT, which is what currentAcknowledgedPacketAudit checks and
         what "any acknowledgement at all" would not. A client that approves audit N and then submits
         after N+1 replaced it passes the weaker gate here and is refused PACKET_AUDIT_STALE in
         production, which is precisely the class of drift this whole file exists to catch. */
      if (acknowledgements[acknowledgements.length - 1].audit_digest !== AUDIT_DIGEST) {
        submitRefusals += 1;
        return json({
          error: "This application changed after you approved the exact packet Litos prepared, so it was not sent.",
          code: "PACKET_AUDIT_STALE",
        }, 409);
      }
      submitRequests += 1;
      submittedQuestionBodies.push(JSON.parse(route.request().postData()).questions);
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

    /* Generation is held open by the stub, so the resume row must still be in flight.
     *
     * WAITED FOR, NOT SNAPSHOTTED. This read `innerText` once, the instant the heading appeared,
     * and asserted "composing" was already in it - a race between the posting stage resolving and
     * the assertion running. It passed locally and on most CI runs and failed one, which is the
     * worst kind of test: a real regression here would be indistinguishable from the flake. The
     * stub holds generation open until releaseGeneration(), so waiting cannot hang past that. */
    await page.getByText(/composing/i).waitFor({ timeout: 20_000 });
    const mid = await page.locator("main").innerText();
    assert.match(mid, /Writing your resume for it/i);
    assert.match(mid, /composing/i, "the resume stage is not active while generation is in flight");
    assert.equal(generationCalls, 1, "generation ran more than once for one build");

    releaseGeneration();

    await page.getByRole("button", { name: /questions? needs? you/i }).waitFor({ timeout: 20_000 });
    const done = await page.locator("main").innerText();
    assert.match(done, /Your application is built/i);
    // It still names what it built against, so the screen is not anonymous while it works.
    assert.match(done, /Software Engineer Intern/i, "the build screen does not name the posting");
    assert.match(done, /Ramp/i, "the build screen does not name the employer");

    /* IT DOES NOT DRAW THE DOCUMENT, AND THAT IS THE GUARANTEE (Mehek, 2026-09-01).
     *
     * This screen used to draw the posting and the finished resume in two panes, and the review
     * screen drew the same two panes again after the questions, that time with "it cannot be
     * unsent" attached. The student met the document twice and the warning landed only on the
     * repeat, so the repeat read as a screen they had already dealt with. The panes belong to the
     * review screen alone now, which is where test 06 asserts them in full.
     *
     * Asserted as absence rather than by counting screens, because the failure this guards is
     * exactly a pane quietly coming back here: the resume's own bullets, the applicant's contact
     * line, and the requirement marks are the three things that only the document can produce. */
    assert.doesNotMatch(done, /Cut PostgreSQL query time 60%/i, "the resume is being drawn on the build screen again");
    assert.doesNotMatch(done, /a@example\.com/i, "the resume header is being drawn on the build screen again");
    assert.doesNotMatch(done, /We build with TypeScript and React/i, "the posting's body is being drawn on the build screen again");
    /* The resume's own experience entry, which is one letter away from the posting's title above:
       "Software Engineering Intern" is on the paper, "Software Engineer Intern" is the job. Only
       the paper can produce the first, so it is the sharpest absence to assert here. */
    assert.doesNotMatch(done, /Software Engineering Intern/i, "the resume's experience is being drawn on the build screen again");
    assert.equal(await page.locator("mark").count(), 0, "requirement marks belong to the review screen's panes");

    // What it promises instead, which is what makes one document screen enough.
    assert.match(done, /before anything is sent/i, "the build screen does not promise the document is still coming");

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

  test("the answers actually left the browser", () => {
    /* The regression this spec missed on its first pass. The screen collected answers, advanced the
       flow, and discarded them; asserting the submit-request fired proved nothing about the data. */
    assert.equal(savedAnswers.length, 2, "the questions screen did not persist its answers");
    assert.ok(savedAnswers.some((a) => /sponsorship/i.test(a.question) && a.answer === "Yes"));
    assert.ok(savedAnswers.some((a) => /GPA/i.test(a.question) && /3\.6 or above/.test(a.answer)));
  });

  /* THE REFUSAL WALK, and it runs BEFORE the successful send because the review screen only exists
   * until the send leaves it.
   *
   * Every branch here was written by this change and none of them had a test: the whole point of the
   * fix is that a refused packet is a stop with a reason and a way forward instead of the dead end
   * this screen used to be, and "no failure is a dead end" is a claim, not an assertion, until
   * something actually refuses. Two refusals in sequence, because they compose: a stale-packet 409
   * from the acknowledge route is a refusal whose only recovery IS a fresh audit, so it must open
   * one on its own - and that fresh audit is then the thing this walk fails, to reach the audit
   * block underneath it. */
  test("06a review: a refused packet states the reason, keeps both exits, and recovers", async () => {
    await page.getByRole("heading", { name: /happy with this/i }).waitFor({ timeout: 20_000 });
    await page.getByText("Exact audited PDF loaded, 1 page.").waitFor({ timeout: 30_000 });

    acknowledgeStaleOnce = true;
    auditFailure = { status: 500, body: { error: "The packet audit service is unavailable." } };
    await page.getByRole("button", { name: "Send my application" }).click();

    /* The server's own sentence, on screen, above a pane that is now asking to be checked again. */
    await page.getByText(/no longer matches the saved application/i).waitFor({ timeout: 15_000 });
    assert.equal(submitRequests, 0, "a refused acknowledgement must never reach submit-request");
    assert.equal(acknowledgements.length, 0, "a refused acknowledgement is not a recorded review");
    /* WAITED FOR, NOT READ, for the reason the waitFor helper above already gives. The refusal
       sentence and the fresh audit are two different effects of the same rejection and nothing
       sequences them: the screen can paint the server's reason before the request it triggers has
       reached this stub. Read bare, this line failed roughly one run in three - measured on this
       tree - a flake nobody had seen, because this file sits below the onboarding-checklist walk in
       the sequential browser job and that walk was red. The assertion is unchanged; only the moment
       it is taken is. */
    await waitFor(() => packetAudits === 2, "a stale-packet refusal must open a fresh audit by itself");

    const blocked = page.getByText("The packet audit service is unavailable.");
    await blocked.waitFor({ timeout: 15_000 });
    const retry = page.getByRole("button", { name: "Check this packet again" });
    assert.equal(await retry.count(), 1, "a 500 can change on the next request and must offer a retry");
    /* THE EXIT THAT MUST SURVIVE EVERY FAILURE. A refused audit with no way past it and no way out
       is the dead end this whole change exists to remove. */
    const saveLater = page.getByRole("button", { name: "Save it and send later" });
    assert.equal(await saveLater.isEnabled(), true, "the save exit did not survive a refused audit");
    assert.equal(
      await page.getByRole("button", { name: "Send my application" }).isDisabled(),
      true,
      "the send stayed live over a packet Litos could not check",
    );

    auditFailure = null;
    await retry.click();
    await page.getByText("Exact audited PDF loaded, 1 page.").waitFor({ timeout: 30_000 });
    assert.equal(packetAudits, 3, "the retry must actually re-audit");
    /* The refusal retires with the thing it was about. A red sentence telling her the packet no
       longer matches, over a green pane saying the exact PDF is loaded, under a button that has just
       re-opened, is three controls describing two different packets. */
    assert.equal(
      await page.getByText(/no longer matches the saved application/i).count(),
      0,
      "the refusal outlived the packet it refused",
    );
    assert.equal(
      await page.getByRole("button", { name: "Send my application" }).isEnabled(),
      true,
      "a recovered packet must be sendable again",
    );
  });

  test("06 review: the exact packet is audited and shown, approved by the press, and sent once", async () => {
    await page.getByRole("heading", { name: /happy with this/i }).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    /* THE SCREEN SHOWS WHAT IT ASKS ABOUT (Mehek, 2026-09-01). This used to be a bare recap: two
       labelled boxes naming the posting and asserting a resume existed, one screen after both had
       been shown in full, which asked the same question twice with less to look at the second
       time. The review draws the real panes: the posting's own words and the actual one page,
       marked the same way. It is also the ONLY screen that draws them - the build screen used to
       draw the same two panes before the questions, so the document arrived twice and the warning
       only ever landed on the second one. Test 04 asserts that absence; this asserts the presence
       it moved to. */
    assert.match(body, /We build with TypeScript and React/i, "the posting's words are not on the review screen");
    assert.doesNotMatch(body, /Your resume, written for this posting from the one you uploaded/i, "the review still describes the resume instead of showing it");
    /* ONE PANE MARKS NOW, AND THAT IS THE TRADE THIS SCREEN MADE. Both panes used to mark: the
       posting's words and the spec re-render of the resume beside it. The Attached pane draws the
       audited PDF instead, and a canvas carries no marks - so the posting keeps its highlighting and
       its legend, and what the resume covers is read off the match legend rather than off the
       document. Asserted as "still marked" rather than deleted, because losing the posting's marks
       too would leave the requirement colours with nowhere to land. */
    assert.ok(await page.locator("mark", { hasText: /TypeScript/i }).count() >= 1, "the posting pane lost its requirement marks");
    assert.match(body, /cannot be unsent/i, "the irreversible screen must say so above the button");
    assert.match(body, /Anything Litos guessed/i);
    assert.match(body, /None/i);
    // No countdown anywhere: auto-submit's 15-second timer has no place in a first-run flow.
    assert.doesNotMatch(body, /\bcancel(ling)? in \d|\d+ seconds\b/i);

    /* THE DOCUMENT IS THE REAL FILE, and this assertion is why the resume's own words are no
       longer read out of `body`. The pane used to draw a re-render of the resume spec, which is
       faithful but is not the bytes the employer receives - and the acknowledgement this screen now
       writes binds that file's sha256 and length. So the pane draws the audited PDF through the
       dashboard's own ExactPacketPdf: downloaded, hashed against the audit's binding, parsed, and
       painted.

       WAITING ON THE STATUS LINE AND THE INK, NOT ON THE CANVAS ELEMENT. ExactPacketPdf appends the
       canvas with its aria-label BEFORE it calls page.render and before the painted-pixel floor is
       checked, so a locator for that element matches a sheet that has drawn nothing - which is the
       exact failure (a correctly sized, entirely white canvas) that component's own header records
       from production. The status line is written only after the floor passes. */
    await page.getByText("Exact audited PDF loaded, 1 page.").waitFor({ timeout: 30_000 });
    const ink = await page.evaluate(() => {
      const canvas = document.querySelector("main canvas");
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] <= 250 || data[i + 1] <= 250 || data[i + 2] <= 250) painted += 1;
      }
      return painted;
    });
    assert.ok(ink > 10_000, `the audited page was verified without being drawn: ${ink} ink pixels`);
    /* The text alternative comes out of the same parse that painted the page, so a screen reader
       meets the document rather than a labelled picture of one. */
    assert.match(await page.locator("main").innerText(), /as text:/i, "the audited PDF has no text alternative");
    assert.equal(packetAudits, 3, "the review screen re-audited without being asked (06a left it at three)");

    /* AN AUDIT APPROVES NOTHING. The backend states an acknowledgement "must never be preceded by a
       machine-written one", so arriving on this screen must not write one: only her press may. */
    assert.equal(acknowledgements.length, 0, "the screen acknowledged the packet before the student pressed anything");
    assert.equal(submitRequests, 0, "something sent the application before the button was pressed");

    /* ENABLED, not merely present. The label alone proves nothing: it reads "Send my application"
       whenever the screen is not mid-audit, including while the pane is still parsing and after it
       has failed - the disabled attribute is the gate. */
    const send = page.getByRole("button", { name: "Send my application" });
    assert.equal(await send.isEnabled(), true, "the send gate did not open on a verified packet");
    await send.click();
    await page.getByRole("heading", { name: /here's something from us/i }).waitFor({ timeout: 20_000 });

    assert.equal(acknowledgements.length, 1, "the press must record exactly one acknowledgement of the audited packet");
    assert.equal(submitRequests, 1, "the send must be issued exactly once");
    /* ZERO, and this is the assertion the whole rewrite of this stub exists for. Every onboarding
       send in production was one of these until 2026-09-03: a submit-request with no audit and no
       acknowledgement behind it, refused 409 with no control on the screen that could clear it. */
    assert.equal(submitRefusals, 0, "the send gate refused this application, which is the onboarding dead end");
    /* The audited questions travelled, not `[]`. See AUDITED_QUESTIONS for what an empty body costs
       on the other end. */
    assert.deepEqual(submittedQuestionBodies[0], AUDITED_QUESTIONS, "the send submitted a different packet than the one that was audited");
  });

  test("07 the trial: the gift, counted after the build spent one generation", async () => {
    /* WAITED FOR, NOT SNAPSHOTTED, and this line is the whole test.
     *
     * Every assertion below reads a value that arrives from getBillingState(), which TrialStep
     * fires on mount and does not block its first paint on. Before it resolves the screen is
     * honestly in its other state: `holdsTrial` is false, so the meters print what the seven days
     * INCLUDE (5, 5, 5, 5), row 05 names the length instead of an end date, and the line reads
     * "Nothing is charged for the first seven days." Reading innerText the instant test 06's
     * heading appeared raced that fetch, and on a loaded CI runner the fetch lost: main went red on
     * `/Tailored resumes\s*\n?\s*4/` against a receipt showing 5, which is not a wrong number but
     * a number read too early.
     *
     * This was invisible for as long as it existed, because this spec sits below the onboarding
     * checklist walk in the sequential browser job and that walk was red, so step 18 was SKIPPED
     * rather than passing. The first CI run that reached it found this on the second attempt.
     *
     * WAITED ON A SIGNAL THIS TEST DOES NOT ASSERT, which took two tries to get right. The first
     * version waited on "Already on your account" - one of the strings asserted below - and that
     * made the assertion on it unfalsifiable: the wait guaranteed the very thing the assert was
     * written to catch, so a regression to the wrong branch would have surfaced as a bare 20-second
     * locator timeout instead of as "the trial line is wrong".
     * Row 05's key is the honest signal. It reads "Ends" only when `holdsTrial` is true and
     * "Length" until then, and nothing below reads it, so it says the snapshot has landed without
     * standing in for any assertion. Anchored, so it cannot match a longer word ending in it. */
    await page.getByText(/^Ends$/i).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    assert.match(body, /A gift, on us/i);
    assert.match(body, /days of Litos\+/i);
    // 5 limit minus the 1 the build used. Printing 5 here would be a number the account does not have.
    assert.match(body, /Tailored resumes\s*\n?\s*4/i);
    /* THIS ACCOUNT HOLDS A TRIAL, so the screen may say so. The line used to be unconditional and
       read "Nothing to confirm. Already on your account." for everyone, which stopped being true
       the moment the trial became a Stripe subscription rather than a signup grant: a real new
       account arrives here holding nothing. The other half of that conditional is the case below. */
    assert.match(body, /Already on your account/i);
    assert.doesNotMatch(body, /Nothing is charged for the first seven days/i);
    // The title follows what the student actually did, and this walk sent.
    assert.match(body, /Sent\. And here's something from us\./i);

    /* NO PRESS HERE. "Start using it" leaves this screen AND answers the staying-in-touch ask
       folded into it, so pressing it in this test would walk past the consent assertions in 08
       before they could be made. The press belongs to the screen's last property, not its first. */
  });

  /* 08 THE STAYING-IN-TOUCH ASK, ON THE SCREEN THAT NOW CARRIES IT.
   *
   * This was written against a notifications screen of its own and waited on that screen's
   * heading, which stopped rendering when the two folded together: `case "trial"` acknowledges
   * BOTH `trial` and `notifications` in one motion, so the server serves `plan` next and the
   * standalone screen is now reached only by an account that acked `trial` before the fold
   * shipped. The wait timed out and main went red.
   *
   * THE SCREEN MOVED; THE PROPERTIES DID NOT, so they moved with it rather than being deleted.
   * Every one of them is still pinned below, now against the trial screen's switches:
   *   - both asks are present, and they are the two the backend actually enforces;
   *   - the two promises it keeps are said on the screen that asks;
   *   - NOTHING is pre-ticked, because a pre-ticked consent is not a consent;
   *   - the PUT carries EVERY key, so an untouched box arrives as an explicit `false` rather than
   *     as an omission the server reads as "not mentioned" and leaves a stale grant on;
   *   - the wall of standing permissions is still not here.
   *
   * One property is new and belongs to the fold itself: the switches save AS THEY ARE TICKED
   * rather than on Continue, because as a section of the trial screen save-on-continue would
   * couple "Start using it" to a second write that can fail after both acks have landed. So the
   * save is asserted BEFORE the button is pressed, and the button is asserted to add nothing.
   */
  test("08 staying in touch: two asks on the trial screen, nothing pre-ticked, and only what was ticked is granted", async () => {
    /* Text, not a heading. This is a section of the trial screen now, under that screen's own
       title; asking for a heading here is what the old assertion did and it is exactly the thing
       that no longer exists. */
    await page.getByText(/Want to know when the next one opens\?/i).waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    assert.match(body, /Tell me when a strong match opens/i);
    assert.match(body, /Tell me when an employer replies/i);
    /* The two promises the backend actually enforces, said on the screen that asks. */
    assert.match(body, /at most once a day/i);
    assert.match(body, /unsubscribe link that works without signing in/i);
    /* Auto-apply, send-without-asking and the rest are asked at the moment their feature is first
       used. Folding this ask into the trial screen did not make that screen the place to put them:
       a wall of checkboxes immediately before the price is still both worse consent hygiene and a
       worse rung. */
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

    /* AN ASSERTION, NOT A WAIT, and the distinction is worth being exact about because the first
       draft of this line claimed to be a hydration race guard and could not have been one. The GET
       fires when TrialStep mounts, and TrialStep's own title is the heading test 06 already waited
       on, so by the time this runs the read landed a whole test ago. It could not synchronise
       anything even if it needed to: the counter increments when the STUB serves the response,
       which says nothing about React having applied the setState behind it.
       Kept because it is worth asserting on its own. A switch that never reads shows a returning
       student two empty boxes no matter what she already chose, and nothing else in this walk
       would notice. */
    assert.ok(notificationReads > 0, "the switches never read the account's preferences");

    await page.getByRole("checkbox", { name: "Tell me when a strong match opens" }).check();

    /* Saved on the tick. Waited for rather than read once, because the assertion is about a request
       in flight and a bare read here is a snapshot that races it.
       AT LEAST ONE, then the exact count separately. Polling for `=== 1` would be polling for a
       value the counter passes THROUGH: a regression that issues two saves per tick could go 0 to 2
       between two 50ms samples, and this would then spend its whole timeout and report "did not
       save it" about a switch that saved twice. The two failures are opposites and must not wear
       each other's message. */
    await waitFor(() => notificationSaves.length >= 1, "ticking a switch did not save it");
    assert.equal(notificationSaves.length, 1, "one tick must issue exactly one save");
    assert.equal(notificationSaves[0].strong_match, true);
    assert.equal(notificationSaves[0].employer_reply, false, "an unticked box is a decline, not an omission");
    assert.equal(notificationSaves[0].activity_digest, false, "the laptop summary was never granted");

    /* AND THE FOLD'S OWN CONTRACT: one press, both ledger entries, the price screen next. Reaching
       `after the seven days` is the proof the server was told about `notifications` too -- had only
       `trial` been acked, the server would derive the standalone notifications screen and this wait
       would be the one that timed out. */
    await page.getByRole("button", { name: "Start using it" }).click();
    await page.getByRole("heading", { name: /after the seven days/i }).waitFor({ timeout: 20_000 });
    assert.equal(notificationSaves.length, 1, "Continue wrote again; the switches had already saved");
  });

  test("09 the plan: pre-selected, one control, and no way past it without a card", async () => {
    /* THIS WALK HAS NOW BEEN OUT OF DATE TWICE IN ONE DAY, and the reason is worth keeping.

       #363 deleted the two-row "If you do nothing / You keep / You lose" table ON PURPOSE --
       it promised the student unlimited filling, free with no time limit, if they simply did
       not act, and that stopped being true when this screen started taking a card for a trial
       that converts on its own. Doing nothing is now the path that gets CHARGED. The assertion
       guarding that table was not deleted with it, and main went red.

       Then the free escape went too, because new accounts go seven-day trial then Litos+ and
       Free is somewhere you arrive by cancelling rather than a fork offered during setup. That
       control was the one thing that let a new account reach the dashboard having never given
       a card.

       And "$89.99 today" went with them: false once the card started a trial rather than a
       purchase, since nothing is taken for seven days, and it sat directly above a sentence
       saying the opposite.

       So this pins what the screen must SAY -- when the charge lands, how to stop it -- and the
       absence of every exit, rather than any sentence the product no longer means. */
    await page.getByRole("heading", { name: /after the seven days/i }).waitFor({ timeout: 20_000 });
    /* AND THEN FOR THE SHIMMER TO GO, because that heading does not mean what it looks like it
       means. PlanStep renders the SAME title in both branches: while `settled` is false it draws
       the title over a shimmer, deliberately, so that somebody who has just paid is never flashed a
       sales pitch. So waiting on the heading is waiting for the loading screen, and every assertion
       below would then be read off it.
       Not observed in CI, unlike the same defect in 07 above, but reproduced here on purpose: with
       the billing stub held 1500ms this case fails on "the paywall must state when the charge
       lands" - the copy is absent because the plans have not arrived, not because the paywall
       stopped saying it.
       WAITED ON WHAT IS THERE, NOT ON WHAT IS GONE. The first version waited for `.rq-shimmer` to
       disappear, which is a wait that cannot fail: rename that class, restyle the loading state, or
       swap the shimmer for a spinner, and querySelector returns null on the first poll, the wait
       passes instantly, and this case is silently reading the loading screen again with nothing
       red to say so. The plan options carry `aria-pressed` and exist only in the settled branch, so
       waiting for one to appear says the same thing and fails loudly when its hook moves. It is not
       among the things asserted below, which read button text. */
    await page.locator("main button[aria-pressed]").first().waitFor({ timeout: 20_000 });

    const body = await page.locator("main").innerText();
    assert.match(
      body,
      /Free for seven days\. After that, Litos\+ continues at/i,
      "the paywall must state when the charge lands",
    );
    assert.match(
      body,
      /any time before then and you are not charged/i,
      "the paywall must state how to stop the charge",
    );
    assert.doesNotMatch(body, /\$89\.99 today/i, "nothing is charged today, a trial starts");
    assert.doesNotMatch(body, /Continue on Free/i, "the free escape is the whole point of the gate");
    assert.doesNotMatch(body, /Finish later/i);

    // Exactly one way forward, and it is checkout.
    const actions = await page.locator("main button, main a").allInnerTexts();
    const forward = actions.map((t) => t.trim()).filter((t) => /^Continue/i.test(t));
    assert.deepEqual(forward, ["Continue with 3 months"]);
  });

  test("the whole sequence was walked in order", () => {
    assert.deepEqual(acknowledged, ["match", "questions", "review", "trial", "notifications"]);
  });

  /* GOING BACK TO CHANGE AN ANSWER, and coming back to where you were.
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
    await page.getByText("questions", { exact: false }).first().waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Save and review" }).click();

    /* Back where they were, which by this point in the suite is the plan screen. The server's own
       answer carries them there, so this is the real step rather than a second override. */
    await page.getByRole("button", { name: "Continue with 3 months" }).waitFor({ timeout: 15_000 });
    assert.equal(
      acknowledged.length,
      before,
      `revisiting wrote ${acknowledged.length - before} acknowledgement(s); the ledger already held that screen`,
    );
  });
});
