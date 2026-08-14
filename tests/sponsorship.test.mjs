import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* THE SPONSOR-ONLY BOARD, on the pages that draw it.
 *
 * The rule itself lives in the backend and is tested there against a real database. What can go
 * wrong HERE is different and is what these check: a filter that silently drops out of a URL, a
 * badge printed from silence, and a switch rendered as live when the server will refuse it.
 */

const browseJobs = readFileSync("app/browse-jobs/page.tsx", "utf8");
const browseLib = readFileSync("lib/browse-jobs.ts", "utf8");
const dashboardJobs = readFileSync("app/dashboard/jobs/page.tsx", "utf8");
const settings = readFileSync("app/dashboard/settings/page.tsx", "utf8");
const startStep = readFileSync("components/start/SponsorshipStep.tsx", "utf8");

test("work eligibility keeps the persistent setup exit", () => {
  assert.match(startStep, /LaterLink/);
  assert.match(startStep, /onLater: \(\) => void/);
  assert.match(startStep, /<LaterLink onClick=\{onLater\} \/>/);
});
/* The same file with every block comment removed, so that a promise the screen no longer makes can
   be asserted absent from the SHIPPED copy while the header comment is still free to quote it and
   say why it went. Without this the file's own account of the bug re-creates the bug's text. */
const startStepRendered = startStep.replace(/\/\*[\s\S]*?\*\//g, " ");

describe("the public board carries the filter through every link", () => {
  test("sponsor_only is forwarded to the API", async () => {
    // The board is server-rendered and paginated, so a filter that is not on the request is a
    // filter that stops applying on page 2 - the exact failure that would show hidden jobs back to
    // somebody who asked not to see them.
    assert.match(browseLib, /"title", "company", "location", "q", "sponsor_only"/);
  });

  test("the checkbox only ever emits the literal true", () => {
    /* The value is echoed into the checkbox and into every pagination link, so reflecting whatever
       arrived would put an attacker-chosen string on the page. */
    assert.match(browseJobs, /params\.sponsor_only === "true"/);
    assert.match(browseJobs, /sponsor_only: sponsorOnly \? "true" : ""/);
  });

  test("facets are asked for the same board the visitor is looking at", () => {
    assert.match(browseJobs, /fetchFacets\(sponsorOnly\)/);
    assert.match(browseLib, /sponsor_only=true/);
  });

  test("an unreachable API is still a fault, not an empty board", () => {
    /* The filter added a new way for the page to show zero jobs, and it must keep reading
       differently from a board that failed to load. Asserted on the source rather than by calling
       fetchJobs: the module's `./config` import is extensionless and node --experimental-strip-types
       cannot resolve it, which is the same reason fetchJobs is not covered in browse-jobs.test.mjs. */
    assert.match(browseLib, /return \{ jobs: \[\], total: 0, postingsTotal: null, ok: false \}/);
  });
});

describe("badges never speak for an employer who said nothing", () => {
  test("every sponsorship badge is guarded on evidence being present", () => {
    // Absence means "we do not know". A badge drawn without this guard would be the product
    // inventing a policy the employer never stated, in the one place someone is deciding whether
    // to spend an evening on an application.
    assert.match(browseJobs, /job\.sponsorship_evidence &&/);
    assert.match(dashboardJobs, /if \(!evidence\) return null;/);
  });

  test("no surface prints a negative sponsorship claim", () => {
    for (const [name, source] of [
      ["browse-jobs", browseJobs],
      ["dashboard jobs", dashboardJobs],
      ["settings", settings],
      ["start step", startStep],
    ]) {
      assert.doesNotMatch(
        source,
        /"(No sponsorship|Does not sponsor|Will not sponsor)/i,
        `${name} claims an employer refuses sponsorship`,
      );
    }
  });

  test("the H-1B badge says what it is not", () => {
    // A filing record is evidence, not an offer. The tooltip is where that qualification lives, so
    // it is the thing worth pinning down.
    // Whitespace-tolerant: JSX wraps these sentences across lines.
    assert.match(dashboardJobs, /not a promise to sponsor\s+you/i);
    assert.match(browseJobs, /not a promise to sponsor\s+you/i);
  });
});

describe("the filtered board says it is filtered", () => {
  test("the dashboard reads sponsor_only off the response, not the account", () => {
    // The server decides: an account that declared a need at setup is filtered whether or not the
    // page asked. Deriving it client-side would let the banner disagree with the list.
    assert.match(dashboardJobs, /setSponsorOnly\(result\.sponsor_only === true\)/);
    assert.match(dashboardJobs, /sponsorOnly && \(/);
  });

  test("and links to the reason", () => {
    assert.match(dashboardJobs, /\/dashboard\/settings#visa-sponsorship/);
    assert.match(settings, /id="visa-sponsorship"/);
  });
});

describe("the settings switch tells the truth about being locked", () => {
  test("it is disabled when the server would refuse it", () => {
    assert.match(settings, /disabled=\{sponsorBusy \|\| sponsorship\.locked\}/);
  });

  test("and says why rather than failing silently", () => {
    assert.match(settings, /sponsorship\.locked && \(/);
    assert.match(settings, /you need a work visa, so this stays on/i);
  });
});

describe("the onboarding question", () => {
  test("collects a complete country-scoped declaration", () => {
    assert.match(startStep, /<CountryEligibilityEditor rows=\{records\}/);
    assert.match(startStep, /countryEligibilityProblem\(records\)/);
    assert.match(startStep, /putOnboardingWorkEligibility\(normalizedCountryEligibility\(records\)\)/);
  });

  test("states that country records stay editable", () => {
    assert.match(startStep, /You can edit the country records later in Settings\./);
    assert.doesNotMatch(startStepRendered, /answer is permanent/i);
  });

  /* WHAT THIS SCREEN PROMISES ABOUT EMPLOYER FORMS, pinned to what the backend does.
   *
   * It used to say "We never fill it in for you." That was false: the backend had answered a work
   * authorization or sponsorship question from these same two columns on dozens of real
   * applications, and it had done it inconsistently, so nothing predicted which forms it would fill
   * and which it would leave blank. The copy now states the rule, and the rule has two halves that
   * are deliberately different from each other.
   *
   * These assertions are the drift alarm. The two repos deploy separately and cannot import from
   * each other, so the pairing is held by a test on each side against the same three sentences:
   * this one fails if the words change, and src/lib/workAuthorizationScope.test.ts in
   * student-outreach-backend fails if the behaviour stops matching them. */
  test("states the rule the backend actually follows on employer forms", () => {
    assert.match(startStep, /only when the question names a country or the job has one exact/);
    assert.match(startStep, /If that country is missing here, the question stays with you\./);
    assert.match(startStep, /never copies an answer across borders/);
  });

  test("no longer claims a blanket refusal it does not honour", () => {
    /* The specific sentence that was untrue, plus the two other ways of writing the same absolute
       promise. Any of them reappearing means the screen has gone back to describing a product that
       does not exist. */
    assert.doesNotMatch(startStepRendered, /never fill it in for you/i);
    assert.doesNotMatch(startStepRendered, /never (?:fills?|types?)[^<]*(?:form|application)/i);
  });

  test("the authorization form requires an explicit country", () => {
    assert.match(startStep, /Add each country separately\./);
    assert.match(startStep, /Being allowed to work in one country says nothing about/);
    assert.doesNotMatch(startStepRendered, /the job's country/i);
  });
});
