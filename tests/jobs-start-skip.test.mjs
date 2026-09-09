import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Jobs list parity with Home.
 *
 * Home's card offers exactly two controls on an unsent job: Skip, which hides it from today's
 * suggestions, and Start, which opens the posting beside its resume being written against it
 * (intent=tailor). The Jobs list board offered neither: a brand-new posting linked straight past
 * tailoring (intent=fill), and there was no way to say "not interested" at all. These assertions
 * pin the two pages to the same dismissal key (so a skip on one hides the row on the other for the
 * rest of the day) and the same tailoring entry point, source-guard style like the rest of this
 * directory: read from source, not run in a browser, because the failure this protects against is
 * the two screens quietly disagreeing about what "start" or "skip" means for the same posting. */

const home = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const jobsPage = readFileSync(new URL("../app/dashboard/jobs/page.tsx", import.meta.url), "utf8");
const dismissal = readFileSync(new URL("../lib/dismissal.ts", import.meta.url), "utf8");

function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("Jobs shares Home's same-day dismissal key", () => {
  test("both pages import the one dismissal module, rather than each declaring their own key", () => {
    assert.match(code(dismissal), /export function dailyDismissalKey\(\): string \{\s*return `litos-dismissed-\$\{localDayKey\(\)\}`;/);
    /* lib/, not a features domain module: readDismissed touches window.localStorage, and
       tests/architecture-boundaries.test.mjs refuses any feature's domain/ file that touches a
       browser global. */
    assert.match(code(home), /import \{ dailyDismissalKey, readDismissed \} from "@\/lib\/dismissal";/, "Home must import, not redeclare, the shared key");
    assert.match(code(jobsPage), /import \{ dailyDismissalKey, readDismissed \} from "@\/lib\/dismissal";/, "Jobs must import, not redeclare, the shared key");
    assert.doesNotMatch(code(home), /function dailyDismissalKey\(\)/, "a local redeclaration would let Home and Jobs drift apart again");
    assert.doesNotMatch(code(jobsPage), /function dailyDismissalKey\(\)/);
  });

  test("Jobs reads the stored list on mount, the same shape Home reads", () => {
    assert.match(code(jobsPage), /queueMicrotask\(\(\) => setDismissed\(readDismissed\(dailyDismissalKey\(\)\)\)\);/);
  });

  test("dismissing a job persists under that key, additively", () => {
    const fn = /function dismiss\(jobId: string\) \{([\s\S]*?)\n  \}/.exec(code(jobsPage));
    assert.ok(fn, "Jobs no longer declares a dismiss function");
    assert.match(fn[1], /\[\.\.\.new Set\(\[\.\.\.dismissed, jobId\]\)\]/, "a skip must not drop a job dismissed earlier today");
    assert.match(fn[1], /window\.localStorage\.setItem\(dailyDismissalKey\(\), JSON\.stringify\(next\)\)/);
  });
});

describe("Skip moves focus instead of dropping it to the page body", () => {
  test("dismiss computes the next skip button (or the heading, if none remain) before the row unmounts", () => {
    const fn = /function dismiss\(jobId: string\) \{([\s\S]*?)\n  \}/.exec(code(jobsPage));
    assert.ok(fn);
    assert.match(
      fn[1],
      /skipFocusTargetRef\.current = remaining\[index\]\?\.id \?\? remaining\[index - 1\]\?\.id \?\? null;/,
      "the target must be picked from the list as it will look AFTER removal, not before",
    );
    assert.match(
      fn[1],
      /const skippable = visibleJobs\.filter\(\(job\) => !isJobApplied\(job, applications\)\);/,
      "the candidate pool must exclude Applied rows: they render no Skip button, so a target picked from among them is unfindable in the DOM and strands focus at document.body",
    );
    assert.match(fn[1], /const index = skippable\.findIndex\(\(job\) => job\.id === jobId\);/);
    assert.match(fn[1], /const remaining = skippable\.filter\(\(job\) => job\.id !== jobId\);/);
  });

  test("the heading is a valid fallback focus target", () => {
    assert.match(code(jobsPage), /<h1 id="jobs-heading" tabIndex=\{-1\}[^>]*>/, "jobs-heading must exist and be programmatically focusable");
  });

  test("the restore effect re-runs off the filtered list, so it fires after the row is actually gone", () => {
    const src = code(jobsPage);
    const effectAt = src.indexOf("if (skipFocusTargetRef.current === undefined) return;");
    assert.notEqual(effectAt, -1, "the focus-restore effect must exist");
    const depsAt = src.indexOf("}, [visibleJobs]);", effectAt);
    assert.ok(depsAt !== -1 && depsAt - effectAt < 600, "the focus-restore effect must depend on visibleJobs, not fire once on mount");
  });

  test("the Skip button carries the id the restore effect looks for, found by dataset rather than an interpolated selector", () => {
    assert.match(code(jobsPage), /data-jobs-skip-id=\{job\.id\}/, "JobRow's Skip button must carry the lookup key");
    assert.match(
      code(jobsPage),
      /\[\.\.\.document\.querySelectorAll<HTMLButtonElement>\("\[data-jobs-skip-id\]"\)\]\s*\.find\(\(button\) => button\.dataset\.jobsSkipId === targetId\)/,
      "the id must be matched via .dataset, not built into a CSS attribute-selector string",
    );
  });
});

describe("Jobs' row hides once skipped, and the loaded count follows it", () => {
  test("the rendered list and the count both read the dismissed-filtered array", () => {
    const src = code(jobsPage);
    assert.match(
      src,
      /const visibleJobs = useMemo\(\s*\(\) => \(jobs \?\? \[\]\)\.filter\(\(job\) => !dismissed\.includes\(job\.id\)\),\s*\[jobs, dismissed\],\s*\);/,
    );
    assert.match(src, /\{visibleJobs\.map\(\(job\) => \(/, "the list must render the filtered array, not the raw fetch");
    assert.match(
      src,
      /\{visibleJobs\.length\} role\{visibleJobs\.length === 1 \? "" : "s"\} loaded/,
      "the loaded count must shrink the same way the list does, or the two disagree about how many roles are here",
    );
    assert.doesNotMatch(src, /\{jobs\.map\(\(job\)/, "the raw fetch must not be mapped directly into the list any more");
  });

  test("a fully-skipped loaded page gets its own message, not a blank list under a nonzero count", () => {
    const src = code(jobsPage);
    assert.match(src, /jobs\.length === 0 \? \(/, "the raw-empty board state must still exist");
    assert.match(src, /visibleJobs\.length === 0 \? \(/, "an all-skipped board needs its own branch, distinct from a genuinely empty one");
    const emptyAt = src.indexOf("visibleJobs.length === 0 ? (");
    const closeAt = src.indexOf(") : (", emptyAt);
    assert.ok(emptyAt !== -1 && closeAt !== -1 && closeAt > emptyAt, "the all-skipped branch must close before the row list branch opens");
    const allSkippedBranch = src.slice(emptyAt, closeAt);
    assert.match(allSkippedBranch, /hasMore && \(/, "Show more roles must still be reachable when every loaded role is hidden");
  });

  test("an all-skipped, pool-exhausted board still names the larger unranked pool", () => {
    const src = code(jobsPage);
    const emptyAt = src.indexOf("visibleJobs.length === 0 ? (");
    const closeAt = src.indexOf(") : (", emptyAt);
    const allSkippedBranch = src.slice(emptyAt, closeAt);
    assert.match(
      allSkippedBranch,
      /!hasMore && poolExhausted/,
      "the all-skipped empty state must distinguish the pool-exhausted case, the same way the row-list footer does",
    );
    assert.match(
      allSkippedBranch,
      /More roles exist than Litos ranks at once/,
      "an all-skipped AND out-of-pages board must still say a larger pool exists, matching the row-list footer's own sentence",
    );
  });
});

describe("Jobs' unsent row offers Skip beside the same tailoring door Home's Start opens", () => {
  const rowSource = () => {
    const src = code(jobsPage);
    const start = src.indexOf("function JobRow");
    const end = src.length;
    return src.slice(start, end);
  };

  test("Skip appears for every unsent row, never for Applied", () => {
    const row = rowSource();
    assert.match(row, /\{applied \? \(/);
    const appliedBranch = row.slice(row.indexOf("{applied ? ("), row.indexOf(") : (", row.indexOf("{applied ? (")));
    assert.doesNotMatch(appliedBranch, /Skip/, "an already-applied row has nothing left to skip");
    const restOfRow = row.slice(row.indexOf(") : (", row.indexOf("{applied ? (")));
    assert.match(
      restOfRow,
      /aria-label=\{`Skip \$\{job\.title\} at \$\{job\.company_name\}`\}/,
      "every unsent state (has a record or not) must offer Skip",
    );
    assert.match(restOfRow, /onClick=\{onDismiss\}/);
  });

  test("a brand-new posting's action opens the tailoring screen, not a direct fill", () => {
    const row = rowSource();
    assert.match(
      row,
      /href=\{`\/dashboard\/applications\?job=\$\{job\.id\}&intent=tailor`\}/,
      "the no-application branch must open intent=tailor, the same door Home's Start opens",
    );
    assert.doesNotMatch(row, /intent=fill/, "a fresh row must not skip tailoring the way it used to");
    assert.match(row, />\s*Start\s*<\/Link>/, "the label for a never-started row must read Start");
  });

  test("a row with an existing application keeps its own state-specific words", () => {
    const row = rowSource();
    assert.match(
      row,
      /href=\{jobApplicationHref\(application\)\}[\s\S]*?\{jobApplicationActionLabel\(application\)\}/,
      "an in-progress application must keep printing its own next-step word, not be forced to Start",
    );
  });

  test("JobRow accepts onDismiss and the caller wires it per row", () => {
    assert.match(
      code(jobsPage),
      /<JobRow job=\{job\} application=\{jobApplicationFor\(job, applications\)\} applied=\{isJobApplied\(job, applications\)\} match=\{badgeMatchFor\(job, matches\[job\.id\]\)\} preferredLocations=\{targeting\?\.locations \?\? \[\]\} onDismiss=\{\(\) => dismiss\(job\.id\)\}\s*\/>/,
    );
  });
});

describe("every derived count on the page reads the skipped-filtered list, not the raw fetch", () => {
  test("the \"N new today\" pill counts visibleJobs", () => {
    /* A skipped role is not "new today" any more than it is "loaded": this pill disagreeing with
       the list and the "roles loaded" count below it while a skip stayed uncounted is the same
       divergence bug that visibleJobs was introduced to fix for the list and the footer. */
    assert.match(
      code(jobsPage),
      /const newToday = useMemo\(\(\) => countNewToday\(visibleJobs\), \[visibleJobs\]\);/,
    );
    assert.doesNotMatch(code(jobsPage), /countNewToday\(jobs\)/, "the raw fetch must not feed this count any more");
  });
});
