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
  // Anchored to the rows, not to the file. Taking the first <ul> in the file would quietly start
  // reading a different element the moment an unrelated list is added above this one, so the
  // opening tag is found by walking back from the map that renders the rows. That is the only
  // <ul> whose track width is the thing under test.
  const listTag = () => {
    const rowsAt = page.indexOf("{jobs.map(");
    assert.notEqual(rowsAt, -1, "the rows are no longer rendered by a jobs.map in this file");
    const opensAt = page.lastIndexOf("<ul", rowsAt);
    assert.notEqual(opensAt, -1, "the rows are no longer inside a <ul>");
    const tag = page.slice(opensAt, page.indexOf(">", opensAt) + 1);
    // Nothing but whitespace may sit between the tag and the map, or the tag found by walking
    // back is an ancestor rather than the rows' own parent.
    assert.match(page.slice(opensAt, rowsAt), /^<ul[^>]*>\s*$/);
    return tag;
  };

  test("the list is the element the rows are mapped into", () => {
    // The resolution above is itself asserted, so it cannot silently drift onto the wrong tag and
    // keep reporting green about an element nobody is looking at.
    assert.match(listTag(), /^<ul /);
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
    assert.match(listTag(), /className="[^"]*\bgrid-cols-1\b/);
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

  // Read inside the tests, not beside them. Deleting the file is one of the ways this fix gets
  // reverted, and a readFileSync in the suite body would throw while node is still collecting
  // tests: the suite would report zero failures rather than the several it should.
  const layout = () => readFileSync(layoutPath, "utf8");

  test("the title is exactly Jobs", () => {
    assert.match(layout(), /export const metadata: Metadata = \{\s*title: "Jobs",/);
  });

  // What actually has to hold is a property of the composition, not of either file alone: the
  // segment title and the root template are only correct with respect to each other. Asserting
  // them side by side would accept a pair that reads fine line by line and still renders wrong,
  // so the rendered title is reconstructed the way Next composes it and checked as one string.
  // This is the assertion that survives someone editing either end.
  const renderedTitle = () => {
    const segment = /title: "([^"]*)"/.exec(layout());
    assert.ok(segment, "the jobs segment declares no title");

    const template = /template: `([^`]*)`/.exec(readFileSync("app/layout.tsx", "utf8"));
    assert.ok(template, "the root layout declares no title template to append the product name");

    const product = /export const PRODUCT_NAME = "([^"]*)"/.exec(readFileSync("lib/product.ts", "utf8"));
    assert.ok(product, "PRODUCT_NAME is no longer declared where the root layout reads it from");

    // `%s: ${PRODUCT_NAME}` with the segment's own title substituted in, which is the whole of
    // what the browser tab ends up showing.
    return template[1].replace("${PRODUCT_NAME}", product[1]).replace("%s", segment[1]);
  };

  test("the tab renders Jobs: Litos, with the product name appearing once", () => {
    assert.equal(renderedTitle(), "Jobs: Litos");
  });

  test("the product name is not typed into the segment title", () => {
    // The failure this is really about. "Jobs: Litos" here renders "Jobs: Litos: Litos", which
    // the composition test above already catches; this one names the cause at the line that
    // causes it, so the diff that breaks it gets pointed at directly.
    assert.doesNotMatch(layout(), /title: "[^"]*Litos[^"]*"/);
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
