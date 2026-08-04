import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

// Regression: PR #192, the Apply button rendered off the right edge of every job row on
// /dashboard/jobs, the tab title was wrong on a hard load, and the Remote only checkbox
// announced itself as "on".
//
// All three fixes are a single token each, and all three read as decoration to anyone tidying
// the file: a class name in a list of class names, a one-word string, an aria-label on a control
// that visibly has words next to it. Nothing in the type system or the build objects if any of
// them is removed, and the failure is only visible at a width, on a hard load, or through a
// screen reader. So they are pinned here.

const page = readFileSync("app/dashboard/jobs/page.tsx", "utf8");

describe("the job list column cannot be widened by its own contents", () => {
  // The list is one <ul> in this file, and it is the one the rows are mapped into.
  const listTag = page.slice(page.indexOf("<ul"), page.indexOf(">", page.indexOf("<ul")) + 1);

  test("the list is the element the rows are mapped into", () => {
    // Guards the slice above: if the <ul> stops being the rows' parent, every assertion below is
    // reading the wrong tag and would keep passing while proving nothing.
    assert.match(page.slice(page.indexOf("<ul")), /^<ul[^>]*>\s*\{jobs\.map\(/);
  });

  test("the list carries grid-cols-1, not a bare grid", () => {
    // A bare `grid` leaves the single column an `auto` track, and an auto track is floored by the
    // min-content width of its widest item. The rows below carry `truncate`, `truncate` is
    // `white-space: nowrap`, and a nowrap line's min-content IS its max-content. So one long
    // "Company, City" string argued the shared track wider than the list and took the Apply
    // button off the right edge of the page, on every row at once.
    //
    // Tailwind's grid-cols-1 is `repeat(1, minmax(0, 1fr))`. The 0 minimum is the whole fix: the
    // track can no longer be argued wider than its container, so the truncation does its job
    // instead of the page scrolling sideways.
    assert.match(listTag, /className="[^"]*\bgrid-cols-1\b/);
  });

  test("the rows still truncate, which is why the 0 minimum is load-bearing", () => {
    // If these ever stop being nowrap the min-content floor stops biting and the class above
    // starts looking removable. It is not removable while this is true.
    assert.match(page, /className="mt-1 truncate text-sm text-muted"/);
    assert.match(page, /className="mt-1 truncate text-sm text-ink"/);
  });
});

describe("the /dashboard/jobs tab title is declared, and declared once", () => {
  const layoutPath = "app/dashboard/jobs/layout.tsx";

  test("the route segment has its own layout", () => {
    // app/dashboard/layout.tsx is a client component, so it cannot export metadata and titles its
    // segments from an effect instead. That effect loses a race on a hard load: Next streams the
    // resolved metadata as a deferred RSC chunk that lands after the first hydration commit, so
    // the root layout's marketing title is written over the top of the effect's. Only a segment
    // that declares its own metadata wins, so the file existing is itself the fix.
    assert.ok(existsSync(layoutPath), `${layoutPath} is what makes the title survive a hard load`);
  });

  // Read inside the tests, not beside them. Deleting the file is one of the two ways this fix gets
  // reverted, and a readFileSync in the suite body would throw while node is still collecting
  // tests: the suite would report zero failures rather than the three it should.
  const layout = () => readFileSync(layoutPath, "utf8");

  test("the title is exactly Jobs", () => {
    assert.match(layout(), /export const metadata: Metadata = \{\s*title: "Jobs",/);
  });

  test("the product name is not typed into the title", () => {
    // The root layout appends it. Writing the full string here renders "Jobs: Litos: Litos".
    assert.doesNotMatch(layout(), /title: "Jobs: Litos"/);
    assert.doesNotMatch(layout(), /title: "[^"]*Litos[^"]*"/);
  });

  test("the root layout is still the thing appending the product name", () => {
    // The bare "Jobs" above is only correct while this template exists. If the template is
    // dropped or renamed, the title silently loses the product name rather than doubling it, so
    // the two files are asserted together.
    const root = readFileSync("app/layout.tsx", "utf8");
    assert.match(root, /template: `%s: \$\{PRODUCT_NAME\}`/);
    assert.match(readFileSync("lib/product.ts", "utf8"), /export const PRODUCT_NAME = "Litos"/);
  });
});

describe("the Remote only checkbox has a name a screen reader can announce", () => {
  test("the name is on the input itself", () => {
    // The wrapping <label> reads as an association to a person looking at the markup, but it was
    // the only thing carrying the name and the control announced as "on": the checkbox's value
    // attribute, which is the fallback when nothing else supplies a name. A student who cannot
    // see the words beside it was being offered a switch with no subject.
    const input = page.slice(page.indexOf('type="checkbox"') - 400, page.indexOf('type="checkbox"') + 200);
    assert.match(input, /<input aria-label="Remote only" type="checkbox"/);
  });

  test("the announced name matches the words printed next to it", () => {
    // Two names for one control is its own defect. They have to stay the same string. The tag
    // cannot be matched with [^>]* because the onChange handler contains an arrow.
    assert.match(page, /aria-label="Remote only"[\s\S]*?\/>\s*Remote only/);
  });
});
