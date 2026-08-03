import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES, defaultBackup, defaultPrimary, periodsFor, targetingHeadline } from "./periods.ts";

const august2026 = new Date("2026-08-02T12:00:00Z");

test("defaults every enrolled student to the next available summer", () => {
  assert.equal(defaultPrimary(2028, august2026), "summer-2027");
  assert.equal(defaultPrimary(2030, august2026), "summer-2027");
});

test("the primary and backup defaults are always different", () => {
  for (const gradYear of [2027, 2028, 2029, 2030, 2031, 2032]) {
    assert.notEqual(defaultPrimary(gradYear, august2026), defaultBackup(gradYear, august2026));
  }
});

test("keeps the visible timing choices to one glance", () => {
  assert.ok(periodsFor(2032, august2026).length <= 8);
});

test("a saved title is what the header says", () => {
  assert.equal(targetingHeadline(["Quantitative Researcher"], ["software-engineering"]), "Quantitative Researcher");
  // Blank strings are not an answer; the categories behind them are.
  assert.equal(targetingHeadline(["  "], ["product"]), "Product");
});

test("with no titles the header names the saved categories, in the settings order", () => {
  // The live case from ISSUE-010: ticked in this order, shown in the order the chips are shown.
  assert.equal(
    targetingHeadline([], ["quant-trading", "software-engineering", "product"]),
    "Software engineering, Product, Quant / trading",
  );
});

test("many categories stay one short line", () => {
  const everything = CATEGORIES.map((c) => c.slug);
  const headline = targetingHeadline(null, everything);
  assert.equal(headline, "Software engineering, Data / ML, Product +5 more");
  assert.ok((headline ?? "").length <= 60);
});

test("a category the frontend list does not know still gets named", () => {
  assert.equal(targetingHeadline(null, ["legal-ops"]), "legal-ops");
});

test("categories is the rung between a title and nothing at all", () => {
  // The whole precedence, in order, on one set of inputs. Clearing titles drops to categories;
  // clearing categories too drops to nothing, and never to some other saved string.
  assert.equal(targetingHeadline(["Trading Analyst"], ["product"]), "Trading Analyst");
  assert.equal(targetingHeadline([], ["product"]), "Product");
  assert.equal(targetingHeadline([], []), null);
});

test("nothing saved is nothing claimed, so the caller can say so", () => {
  // Both cleared is reachable: TargetingCard lets a student remove every title chip and untick
  // every category. There is no further rung by design - profile.target_roles is editable, but on
  // a different screen, for a different question, and the link beside this label cannot reach it.
  assert.equal(targetingHeadline(null, null), null);
  assert.equal(targetingHeadline([], []), null);
  assert.equal(targetingHeadline([" "], [" "]), null);
});

test("a malformed targeting payload degrades the header instead of throwing", () => {
  // The expression this replaced was total. Nothing validates /dashboard/bootstrap, and there is
  // no error.tsx under app/, so a throw here blanks the whole dashboard, not just this line.
  const malformed: [unknown, unknown][] = [
    [[], [null, "product"]],
    [[null], ["product"]],
    [[], { a: 1 }],
    [[], [7, "product"]],
    [[], "product"],
    [undefined, undefined],
    ["Analyst", ["product"]],
    [[["a"]], [["b"]]],
    [[NaN], [true, () => 1, "product"]],
  ];
  for (const [titles, categories] of malformed) {
    assert.doesNotThrow(() => targetingHeadline(titles as never, categories as never));
  }
});

test("a bare string where an array belongs is refused, not spread", () => {
  // "product".includes("product") is true and iterating it yields characters, so the unguarded
  // read rendered "Product, p, r +5 more": corrupt, and confident-looking, which is worse.
  assert.equal(targetingHeadline([], "product" as never), null);
  assert.equal(targetingHeadline("Trading Analyst" as never, []), null);
  // Non-strings are dropped from an otherwise good array rather than taking the line down.
  assert.equal(targetingHeadline([], [null, "product"] as never), "Product");
  assert.equal(targetingHeadline([null] as never, ["product"]), "Product");
});
