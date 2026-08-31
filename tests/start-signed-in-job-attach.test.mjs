import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* THE SIGNED-IN HALF OF /start?job=<id>.
 *
 * The strong-match email promises "straight to the full posting and an apply-ready packet", and
 * for a guest that promise is kept: the guest branch opens a session, the click pins the posting,
 * and onboarding builds it. A SIGNED-IN account had no branch at all (measured live 2026-08-28):
 * the ordinary flow bounced a finished account to /dashboard and the job in the link was dropped
 * on the exact click where the email said the packet would be.
 *
 * These are source-shape assertions in the same spirit as tests/start-onboarding-defects.test.mjs:
 * they pin the three routing outcomes the fix promised and the two paths it promised NOT to touch.
 * Every assertion reads shipped copy with comments stripped, so no comment can satisfy one.
 */

const pageSource = readFileSync(new URL("../app/start/page.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

/** Source with every comment removed, so nothing here can be satisfied by prose about the code. */
function shippedCopy(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

const page = shippedCopy(pageSource);
const api = shippedCopy(apiSource);

/** The text from `from` up to and including the first `to` after it. Throws rather than slicing to
 *  -1, which is how an earlier test in this repo spent three weeks asserting against one character. */
function region(source, from, to, label) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `could not find the start of ${label}: ${from}`);
  const end = source.indexOf(to, start);
  assert.ok(end > start, `could not find the end of ${label}: ${to}`);
  return source.slice(start, end + to.length);
}

/* The guest branch, exactly as it has always been bounded: from the signed-out guard to the
 * redirect that ends it. Everything the fix added lives AFTER this region. */
const guestBranch = region(
  page,
  "if (!getToken()) {",
  "router.replace(loginRedirectPath(LOGIN_REDIRECT_REASON.SIGNIN_REQUIRED));",
  "the signed-out branch of the entry effect",
);

/* The signed-in attach branch: from the token guard's close to the ordinary signed-in flow. */
const attachBranch = region(
  page,
  'const attachJobId = new URLSearchParams(window.location.search).get("job");',
  "return () => {\n        cancelled = true;\n      };\n    }",
  "the signed-in job-attach branch",
);

describe("signed in with a job param: attach, then land selected on the application", () => {
  test("the branch calls the attach endpoint and replaces to the standard selection URL", () => {
    assert.match(
      attachBranch,
      /void attachMonitoredJob\(attachJobId\)\.then\(\(result\) => \{/,
      "a job param on a signed-in visit must reach POST /applications/from-job through the one lib/api call site",
    );
    assert.match(
      attachBranch,
      /router\.replace\(`\/dashboard\/applications\?application=\$\{encodeURIComponent\(result\.applicationId\)\}&intent=apply`\);/,
      "success must land the student SELECTED on the attached application, on the same " +
      "application=...&intent=apply URL every other jobs-to-tracker handoff uses",
    );
  });

  test("the branch runs once per session, honours unmount, and surfaces the server's refusal", () => {
    assert.match(
      attachBranch,
      /if \(!jobAttachStarted\.current\) \{\s*\n\s*jobAttachStarted\.current = true;/,
      "the attach must carry the same one-shot ref guard the guest bootstrap carries, or React 18 " +
      "dev StrictMode fires the request twice",
    );
    assert.match(
      attachBranch,
      /if \(cancelled\) return;/,
      "a navigation away from /start before the attach resolves must not route or set state on a gone component",
    );
    /* Two different refusals, two different obligations. A 402 or 422 is about the ACCOUNT and
       the server's sentence tells the student what to fix; a 404 is about the POSTING - the row
       left the board between the tile render and this request - and no sentence, retry button,
       or account fix brings it back. The first must stay visible; the second must rejoin the
       ordinary /start flow instead of parking the student on a dead end (measured live
       2026-08-31: "Job not found" over an otherwise empty page). */
    assert.match(
      attachBranch,
      /if \(!result\.ok\) \{\s*\n\s*if \(result\.jobGone\) \{\s*\n\s*window\.location\.replace\("\/start"\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*setError\(result\.error\);\s*\n\s*return;\s*\n\s*\}/,
      "a gone posting must rejoin /start without the param (location.replace, so the back button " +
      "cannot re-run the attach against the same dead id), while every other refusal still " +
      "reaches the student as the server's own sentence through the page's error state",
    );
    /* Its own ref, not the guest one: the two branches guard different requests, and sharing a
       flag would let whichever mounted first swallow the other. */
    assert.match(page, /const jobAttachStarted = useRef\(false\);/);
  });

  test("the attach branch sits between the guest branch and the ordinary signed-in flow", () => {
    const guestEnd = page.indexOf("router.replace(loginRedirectPath(LOGIN_REDIRECT_REASON.SIGNIN_REQUIRED));");
    const attachStart = page.indexOf('const attachJobId = new URLSearchParams(window.location.search).get("job");');
    const ordinaryFlow = page.indexOf("const s = await refresh();");
    assert.ok(guestEnd >= 0 && attachStart >= 0 && ordinaryFlow >= 0);
    assert.ok(
      guestEnd < attachStart && attachStart < ordinaryFlow,
      "the attach must be considered only once the visitor is known to be signed in, and must " +
      "short-circuit the ordinary flow whose dashboard bounce is what used to drop the job",
    );
  });
});

describe("the two paths the fix promised not to touch", () => {
  test("a guest with a job param still takes the guest bootstrap, untouched", () => {
    assert.match(
      guestBranch,
      /void createGuestSession\(jobId\)\.then\(\(result\) => \{/,
      "the guest half of job-first entry must still open the session that pins the posting",
    );
    assert.match(
      guestBranch,
      /window\.history\.replaceState\(null, "", "\/start"\);/,
      "the guest branch must still clear the id from the URL after the pin lands server-side",
    );
    assert.doesNotMatch(
      guestBranch,
      /attachMonitoredJob/,
      "the attach endpoint requires an authenticated account and must be unreachable from the " +
      "signed-out branch",
    );
  });

  test("a signed-in visit WITHOUT a job param still bounces a finished account to /dashboard", () => {
    const ordinaryFlow = region(
      page,
      "const s = await refresh();",
      'router.replace("/dashboard");',
      "the ordinary signed-in flow",
    );
    assert.match(
      ordinaryFlow,
      /if \(s\.requires_onboarding === false && s\.step === "done"\) \{\s*\n\s*router\.replace\("\/dashboard"\);/,
      "the no-param redirect must survive exactly as it was",
    );
    assert.match(
      attachBranch,
      /if \(attachJobId\) \{/,
      "the attach branch must be gated on the param actually being present, so a bare /start " +
      "visit falls through to the ordinary flow",
    );
  });
});

describe("attachMonitoredJob is the one honest call site for POST /applications/from-job", () => {
  test("it posts the job id and returns the application id from either outcome the route answers", () => {
    assert.match(
      api,
      /const attached = await api<\{ application_id: string \}>\("\/applications\/from-job", \{\s*\n\s*method: "POST",\s*\n\s*body: JSON\.stringify\(\{ job_id: jobId \}\),/,
      "the request shape is the route's contract: a POST carrying exactly { job_id }",
    );
    assert.match(
      api,
      /return \{ ok: true, applicationId: attached\.application_id \};/,
      "created and deduped answers both carry application_id, and both mean the same thing to the " +
      "caller: the application to select",
    );
  });

  test("it resolves to a refusal instead of throwing, like createGuestSession beside it", () => {
    const helper = region(
      api,
      "export async function attachMonitoredJob(",
      '"We could not add this job to your tracker. Try again.",',
      "the attach helper",
    );
    assert.match(
      helper,
      /\} catch \(reason\) \{/,
      "/start routes on the result object; a thrown ApiError would reach the student as an " +
      "unhandled rejection rather than as the server's own sentence about what to fix",
    );
    const callSites = api.split("/applications/from-job").length - 1;
    assert.equal(callSites, 1, "one call site, so the request shape and error contract cannot fork");
  });

  test("jobGone is derived from the status, never from the sentence", () => {
    assert.match(
      api,
      /jobGone: reason instanceof ApiError && reason\.status === 404,/,
      "the route's 404 is the one fact that means the posting left the board; matching on the " +
      "error TEXT would couple this to backend wording that can change under it",
    );
  });
});
