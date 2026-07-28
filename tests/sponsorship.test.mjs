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
    assert.match(browseLib, /return \{ jobs: \[\], total: 0, ok: false \}/);
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
  test("offers all four answers", () => {
    for (const value of ["needs_now", "needs_future", "not_authorized", "no"]) {
      assert.match(startStep, new RegExp(`value: "${value}"`), `missing ${value}`);
    }
  });

  test("states that the answer is permanent BEFORE it is given", () => {
    // A consequence disclosed after the fact is not a disclosure. The copy has to be on the screen
    // that asks, above the button that saves.
    const permanence = startStep.indexOf("This answer is permanent");
    // The RENDERED button, not the import of the same name at the top of the file.
    const button = startStep.indexOf("<PrimaryButton");
    assert.ok(permanence > 0, "the screen never says the answer is permanent");
    assert.ok(permanence < button, "the permanence note renders after the save button");
  });

  test("repeats that Litos never fills this answer into a form", () => {
    // R-004: work-authorization questions on real forms are location-scoped, and replaying a global
    // answer once shipped a false legal declaration on a live application. This screen is the most
    // likely place for somebody to assume the opposite.
    assert.match(startStep, /never fill it in for you/i);
  });
});
