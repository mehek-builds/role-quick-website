import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  ledgerRendersOnLanding,
  statusMatchesApplicationFilter,
} from "../features/applications/domain/application-filter.ts";
import {
  activeBoardStages,
  boardCoverage,
  boardCoverageNote,
} from "../features/applications/domain/board-stages.ts";

/**
 * The Tracker's own link showed nothing.
 *
 * MEASURED IN PRODUCTION, 2026-08-08, owner account a18f774b (mehekmandal05@gmail.com):
 *
 *   GET /applications/board  -> 200, 83 cards, EVERY card at stage "saved"
 *   generated_resumes        -> pipeline_stage NULL on all 83 rows, 0 ever submitted
 *   by submission status     -> 49 needs_attention, 29 ready_to_submit, 5 failed, 0 submitted
 *   GET /metrics/funnel      -> resumes_tailored 83, applications_submitted 0
 *
 * The board draws applied/interview/offer only, and deriveStage sends anything not submitted to
 * "saved", so the sidebar's Tracker link rendered three columns reading "Nothing here" over 83
 * applications, plus "0 applied today". 49 of those had stopped on a question the applicant could
 * have answered in seconds.
 *
 * NOTHING WAS MISSING. The list of every application, its status badges, its "Needs you" filter and
 * the blocker panel all existed and all rendered. They rendered only beside a SELECTED packet, and
 * the one URL that selects one on arrival is /dashboard/applications?job=<uuid>, which is where the
 * Jobs page's Apply button points. The sidebar goes to the bare path. So the product's main screen
 * was reachable only by applying to another job.
 *
 * This file pins the three things that were wrong at once: the list renders on the bare path, the
 * board says what it is not drawing, and Home's zero has somewhere to go.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
/** Comments carry the words this file asserts on, so they come off before any structural check. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const applications = stripComments(read("app/dashboard/applications/page.tsx"));
const home = stripComments(read("app/dashboard/page.tsx"));
const board = stripComments(read("components/app/Board.tsx"));
const funnel = stripComments(read("components/app/Funnel.tsx"));
const shell = stripComments(read("app/dashboard/dashboard-shell.tsx"));

describe("the route the sidebar actually links to", () => {
  test("Tracker still goes to the bare path, with no query to rescue it", () => {
    /* If this ever grows a ?state= or ?job=, the landing view has been worked around rather than
       fixed, and the next person to type the URL is back where this started. */
    assert.match(shell, /\{ href: "\/dashboard\/applications", label: "Applications"/);
  });

  test("the bare path renders the list of applications", () => {
    // filter "all" is what applicationFilterFromSearch returns for a URL with no query at all.
    assert.equal(ledgerRendersOnLanding("all", 83), true);
    assert.equal(ledgerRendersOnLanding("all", 1), true);
  });

  test("and the list is not gated on a packet being selected", () => {
    const start = applications.indexOf('<section aria-labelledby="application-ledger-heading"');
    assert.notEqual(start, -1, "expected the ledger section to still be labelled by its heading id");
    const gate = applications.slice(Math.max(0, start - 400), start);
    assert.match(
      gate,
      /applicationTaskOpen \? reviewablePackets\.length > 0 : ledgerRendersOnLanding\(applicationFilter, reviewablePackets\.length\)/,
      "the landing branch has to be the tested predicate, over the real count",
    );
  });

  test("an unfiltered landing holds every reviewable application, not a subset", () => {
    for (const status of ["needs_attention", "ready_to_submit", "failed", "submitted", "ready_for_final_approval"]) {
      assert.equal(statusMatchesApplicationFilter(status, "all"), true, `${status} belongs in the unfiltered list`);
    }
  });

  test("the Needs you view is still one select away from that landing", () => {
    /* The list is where a stopped application becomes reachable. If the filter control ever leaves
       the ledger, the landing goes back to being a wall of rows with no way to narrow it. */
    const start = applications.indexOf('id="application-filter"');
    assert.notEqual(start, -1, "the filter select has to render with the list");
    const select = applications.slice(start, start + 600);
    assert.match(select, /<option value="action">/, "and it has to offer the stopped applications");
  });
});

describe("the board says what it is not drawing", () => {
  test("the measured account: 83 cards, none on a column, one honest sentence", () => {
    const cards = Array.from({ length: 83 }, () => ({ stage: "saved" }));
    const visible = activeBoardStages(["saved", "applied", "interview", "offer", "closed"]);
    const note = boardCoverageNote(boardCoverage(cards, visible));
    assert.ok(note, "83 cards and three empty columns must not render in silence");
    assert.match(note, /83 applications/);
    assert.match(note, /none sent yet/);
  });

  test("the board renders that note, counted off the ledger printed above it", () => {
    /* Counted client-side, never from a number the server sent separately: that could disagree with
       the columns beside it, which is the failure mode the whole response-shape boundary exists to
       prevent.

       WHICH client-side array changed on 2026-08-29. It was `cards`, this board's own
       /applications/board fetch, while the ledger header six pixels above counted the merged
       canonical inventory - so one screen carried "Your applications 100" directly over "187 of 200
       have not been sent yet". The sentence is now about the list it sits under. The card fallback
       stays for callers with no inventory to hand it (the QA harness). */
    assert.match(board, /const ordinaryCards = \(cards \?\? \[\]\)\.filter/);
    assert.match(board, /inventory \? pipelineCoverage\(inventory\) : boardCoverage\(ordinaryCards, visibleStages\)/);
    assert.match(board, /\{coverageNote\}/);
    assert.match(
      applications,
      /\(\) => \(\{ total: reviewablePackets\.length, sent: pipelineCounts\(reviewablePackets\)\.sent \}\)/,
      "and the Tracker hands it the exact expression its own header renders",
    );
    assert.match(applications, /inventory=\{boardInventory\}/);
  });

  test("a board that is drawing everything stays silent", () => {
    assert.equal(boardCoverageNote(boardCoverage([{ stage: "applied" }], ["applied", "interview", "offer"])), null);
    assert.equal(boardCoverageNote(boardCoverage([], ["applied", "interview", "offer"])), null);
  });
});

describe("Home's zero has somewhere to go", () => {
  test("Momentum is told how many are stopped, from Home's own count", () => {
    /* The same number the Tracker tile prints, so the two figures on one row cannot disagree.
     *
     * `sent` is matched LOOSELY, and that is the fix for a break this pinning caused. The contract
     * this test is named for is the STOPPED half: that Momentum is handed Home's own count and a
     * route to spend it on. `sent` only has to still come from `pipeline.sent`. Pinning the whole
     * element meant an unrelated and deliberate change to the OTHER prop failed this assertion:
     * #503 made the sent figure wait for the inventory, so that a 0 printed before the packets
     * land stops reading as "you have sent nothing". That is the behaviour this file wants, and it
     * turned the suite red on main anyway. */
    assert.match(home, /<Funnel sent=\{[^}]*pipeline\.sent[^}]*\} stopped=\{\{ count: applicationSummary\.needsAction, href: "\/dashboard\/applications\?state=action" \}\} \/>/);
  });

  test("the explanation only appears when the zero actually needs explaining", () => {
    /* Work prepared, none sent, and something genuinely waiting. Any other combination prints
       nothing: inventing a gap on a brand new account is the same class of lie as printing a zero
       nobody measured. */
    assert.match(funnel, /\(sent \?\? f\.applications_submitted\) === 0 && f\.resumes_tailored > 0 && \(stopped\?\.count \?\? 0\) > 0/);
  });

  test("and it is a link, not a sentence with nowhere to go", () => {
    const start = funnel.indexOf("None sent yet.");
    assert.notEqual(start, -1, "the gap between prepared and sent has to be named");
    assert.match(funnel.slice(start - 200, start + 400), /<Link href=\{stopped!\.href\}/);
  });

  test("the counters themselves are untouched: still only what was measured", () => {
    /* "sent in total" takes the caller's canonical count when it has one, for the same reason
       `stopped` is passed in: Home already counts sent from the merged inventory its Tracker tile
       counts. On 2026-08-29 this Stat printed /metrics/funnel's 13 six inches from a Sent tile
       reading 12. The backend figure stays as the fallback for a caller with no inventory, and it
       still feeds the bars and the two windowed stats, which this page does not recompute. */
    assert.match(funnel, /<Stat value=\{sent \?\? f\.applications_submitted\} label="sent in total" \/>/);
    assert.match(funnel, /<Stat value=\{f\.resumes_tailored\} label="resume versions prepared" \/>/);
    assert.match(funnel, /One job can have more than one resume version, so this number will not match Applications\./);
  });
});

describe("the autopilot pill is a countdown, not a stopwatch", () => {
  const autopilot = stripComments(read("components/app/Autopilot.tsx"));

  test("it says a send is N seconds away rather than N seconds old", () => {
    /* "Sending 8s" beside "0 applied today" read as a broken counter. Nothing is being sent during
       those seconds: this is the cancel window, per HOLD_SECONDS at the top of that file. */
    assert.match(autopilot, /Sending in \{remaining\}s/);
    assert.doesNotMatch(autopilot, /Sending \{remaining\}s/);
  });

  test("the number is the hold window counting down, and it stops at zero", () => {
    assert.match(autopilot, /const HOLD_SECONDS = \d+/);
    assert.match(autopilot, /Math\.max\(0, current\.left - 1\)/, "it decrements toward zero");
    assert.match(autopilot, /remaining !== null && remaining > 0/, "and the number is dropped once the ask has left");
  });

  test("the day's count still counts only confirmed sends", () => {
    /* "0 applied today" was correct: nothing had ever been submitted. The fix belonged on the pill
       claiming otherwise beside it, not on the counter.
       The rule moved into pipeline-counts.ts so the day figure and the all-time figure read the
       same inventory by the same predicate; sentSince is still the server's `submitted_at` stamp
       and nothing else. */
    assert.match(applications, /sentSince\(reviewablePackets, startOfLocalDay\(new Date\(\)\)\)/);
    assert.match(read("features/applications/domain/pipeline-counts.ts"), /_review\?\.submitted_at/);
  });
});
