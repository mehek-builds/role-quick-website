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
//
// These assertions read source text, which is the convention in this directory. The risk that
// carries is an assertion that matches the words without meaning them, so everything below is
// resolved structurally: comments are stripped before matching, elements are found by walking
// from the thing they render, class names are compared as list members rather than substrings,
// and the product name is read from its declaration rather than typed in. The failure mode being
// designed against is a test that stays green while the page is broken.

const PAGE = "app/dashboard/jobs/page.tsx";
const JOBS_LAYOUT = "app/dashboard/jobs/layout.tsx";
const ROOT_LAYOUT = "app/layout.tsx";
const PRODUCT = "lib/product.ts";

// Read at call time, never in a suite body. Deleting or moving a file this suite asserts against
// is one of the ways these fixes get reverted, and a read beside the tests would throw while node
// is still collecting them: the run reports one opaque ENOENT instead of the assertions that
// actually describe what broke.
function source(path) {
  assert.ok(existsSync(path), `${path} is missing, and this suite asserts against it`);
  return readFileSync(path, "utf8");
}

// Comments are prose, not code, and an assertion that reads them is an assertion that can be
// satisfied by someone describing the fix in a sentence while the code does the opposite. The
// jobs layout is roughly three quarters JSDoc and that JSDoc quotes the very string under test.
function code(path) {
  return source(path)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // {/* JSX comment */}
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, ""); // whole-line only, so "https://" survives
}

// The end of a JSX opening tag is not the next ">". Attribute values hold arrow functions, and
// `ref={(el) => ...}` would cut the tag in half. Brace depth is what actually delimits it.
function openingTag(src, at) {
  let depth = 0;
  for (let i = at; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return src.slice(at, i + 1);
  }
  assert.fail(`unterminated JSX tag at index ${at}`);
}

// Tailwind classes are list members, not substrings. `md:grid-cols-1` contains "grid-cols-1" and
// means something entirely different: the base breakpoint keeps the auto track, so the overflow
// is back at exactly the widths where it was reported.
function classList(tag) {
  const match = /className="([^"]*)"/.exec(tag);
  assert.ok(match, `no className on ${tag.slice(0, 60)}`);
  return match[1].split(/\s+/).filter(Boolean);
}

describe("the job list column cannot be widened by its own contents", () => {
  // Anchored to the rows, not to the file. The first <ul> in the file is the rows' parent only by
  // coincidence of there being one list on the page, so the search starts at the <JobRow> being
  // rendered and walks back to the list that contains it.
  const jobListTag = () => {
    const src = code(PAGE);
    const rowAt = src.indexOf("<JobRow");
    assert.notEqual(rowAt, -1, `${PAGE} no longer renders <JobRow>`);
    const opensAt = src.lastIndexOf("<ul", rowAt);
    assert.notEqual(opensAt, -1, `<JobRow> is no longer inside a <ul> in ${PAGE}`);

    const tag = openingTag(src, opensAt);
    const between = src.slice(opensAt + tag.length, rowAt);
    // Structure, not formatting. A wrapped tag, a comment, or a renamed map variable are all fine;
    // another list opening in between is not, because then this tag is an ancestor and its track
    // width is not the one under test.
    assert.match(between, /\.map\(/, "the <ul> does not wrap a mapped list");
    assert.match(between, /<li\b/, "the rows are not <li> children of the <ul>");
    assert.doesNotMatch(between, /<ul\b/, "a nested <ul> sits between this list and its rows");
    return tag;
  };

  test("the rows are mapped directly into the list", () => {
    // The resolution above carries its own assertions, so it fails loudly rather than drifting
    // onto some other element and reporting green about markup nobody is looking at.
    assert.match(jobListTag(), /^<ul\b/);
  });

  test("the list is a grid whose single column has a zero minimum", () => {
    // A bare `grid` leaves the single column an `auto` track, and an auto track is floored by the
    // min-content width of its widest item. The rows carry `truncate`, `truncate` is
    // `white-space: nowrap`, and a nowrap line's min-content IS its max-content. So one long
    // "Company, City" string argued the shared track wider than the list and took the Apply
    // button off the right edge of the page, on every row at once.
    //
    // Tailwind's grid-cols-1 is `repeat(1, minmax(0, 1fr))`. The 0 minimum is the whole fix.
    // Both halves are asserted: grid-cols-1 sets grid-template-columns and does nothing at all
    // without a grid display, so `flex grid-cols-1` would be just as broken as a bare `grid`.
    const classes = classList(jobListTag());
    assert.ok(classes.includes("grid"), `the list is not a grid: ${classes.join(" ")}`);
    assert.ok(
      classes.includes("grid-cols-1"),
      `the single column has no zero minimum: ${classes.join(" ")}`,
    );
  });

  test("the rows still truncate, which is why the zero minimum is load-bearing", () => {
    // If these ever stop being nowrap the min-content floor stops biting and the class above
    // starts looking removable. It is not removable while this is true. Asserted as class-list
    // membership so spacing and type-scale edits on the row do not read as the row un-truncating.
    const src = code(PAGE);
    const rowAt = src.indexOf("function JobRow");
    assert.notEqual(rowAt, -1, `${PAGE} no longer defines JobRow`);

    const truncating = [...src.slice(rowAt).matchAll(/className="([^"]*)"/g)].filter((match) =>
      match[1].split(/\s+/).includes("truncate"),
    );
    assert.ok(truncating.length >= 2, `JobRow has ${truncating.length} truncating lines, expected 2`);
  });
});

describe("the /dashboard/jobs tab title is declared, and declared once", () => {
  // Anchored to the declaration. A bare /title: "([^"]*)"/ takes the first match in the file,
  // and in this file that could be the JSDoc above the export, which quotes the string under test.
  const segmentTitle = () => {
    const match = /export const metadata[^=]*=\s*\{[\s\S]*?\btitle:\s*"([^"]*)"/.exec(
      code(JOBS_LAYOUT),
    );
    assert.ok(match, `${JOBS_LAYOUT} declares no metadata title`);
    return match[1];
  };

  const productName = () => {
    const match = /export const PRODUCT_NAME = "([^"]*)"/.exec(code(PRODUCT));
    assert.ok(match, `PRODUCT_NAME is no longer declared in ${PRODUCT}`);
    return match[1];
  };

  test("the route segment has its own layout", () => {
    // app/dashboard/layout.tsx used to be a client component, so it could not export metadata and
    // titled its segments from an effect instead. That effect lost a race on a hard load: Next
    // streams the resolved metadata as a deferred RSC chunk that lands after the first hydration
    // commit, so the root layout's marketing title was written over the top of the effect's. Only a
    // segment that declares its own metadata wins, so the file existing is itself the fix. The
    // dashboard layout is a server component again now and declares /dashboard's own title, but
    // that does not make this file optional: a parent title is what a segment INHERITS when it
    // declares none, so without this layout the Jobs tab would read "Home".
    assert.ok(existsSync(JOBS_LAYOUT), `${JOBS_LAYOUT} is what makes the title survive a hard load`);
  });

  test("the segment declares the title Jobs", () => {
    // The value, not the punctuation around it. A type annotation, a second metadata key or a
    // `satisfies Metadata` rewrite all leave the tab reading exactly the same.
    assert.equal(segmentTitle(), "Jobs");
  });

  test("the tab renders Jobs then the product name, once", () => {
    // What actually has to hold is a property of the composition, not of either file alone: the
    // segment title and the root template are only correct with respect to each other. Asserting
    // them side by side accepts a pair that reads fine line by line and still renders wrong, so
    // the title is reconstructed the way Next composes it and checked as one string.
    const template = /template: `([^`]*)`/.exec(code(ROOT_LAYOUT));
    assert.ok(template, `${ROOT_LAYOUT} declares no title template to append the product name`);

    const rendered = template[1]
      .replace("${PRODUCT_NAME}", productName())
      .replace("%s", segmentTitle());
    assert.equal(rendered, `Jobs: ${productName()}`);
  });

  test("the product name is not typed into the segment title", () => {
    // The failure this is really about: "Jobs: Litos" here renders "Jobs: Litos: Litos". Read from
    // the declaration rather than hardcoded, because this repo has renamed its product before and
    // a hardcoded name turns this into an assertion that can never fail again.
    const title = segmentTitle();
    assert.ok(
      !title.includes(productName()),
      `the root template already appends the product name, so "${title}" renders it twice`,
    );
  });
});

describe("the Remote only checkbox has a name a screen reader can announce", () => {
  // Anchored to the visible words, so a second checkbox appearing on the page cannot silently
  // become the one under test.
  const remoteOnlyLabel = () => {
    const src = code(PAGE);
    const textAt = src.search(/Remote only\s*<\/label>/);
    assert.notEqual(textAt, -1, `${PAGE} no longer prints a "Remote only" label`);
    const opensAt = src.lastIndexOf("<label", textAt);
    assert.notEqual(opensAt, -1, `the "Remote only" text is not inside a <label>`);
    return src.slice(opensAt, textAt + "Remote only".length);
  };

  const checkboxTag = () => {
    const label = remoteOnlyLabel();
    const inputAt = label.indexOf("<input");
    assert.notEqual(inputAt, -1, "the Remote only label contains no <input>");
    const tag = openingTag(label, inputAt);
    assert.match(tag, /type="checkbox"/, "the Remote only control is not a checkbox");
    return tag;
  };

  test("the name is on the input itself", () => {
    // The wrapping <label> reads as an association to a person looking at the markup, but it was
    // the only thing carrying the name and the control announced as "on": the checkbox's value
    // attribute, which is the fallback when nothing else supplies a name. A student who cannot
    // see the words beside it was being offered a switch with no subject.
    //
    // Attribute order is not part of the invariant, so the tag is matched as a whole.
    assert.match(checkboxTag(), /aria-label="[^"]+"/);
  });

  test("the announced name matches the words printed next to it", () => {
    // Two names for one control is its own defect. They have to stay the same string.
    const announced = /aria-label="([^"]*)"/.exec(checkboxTag());
    assert.ok(announced, "the Remote only checkbox carries no accessible name");
    assert.equal(announced[1], "Remote only");
  });
});
