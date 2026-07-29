import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Imported straight from the .ts, the way lib/daily-matches is: `npm test` runs node with
   --experimental-strip-types, so there is no build step between this test and the code the pages
   actually import. */
import { formatPay, jobTypeLabel } from "../lib/pay.ts";

const pay = (min, max, currency, interval) => ({
  salary_min: min,
  salary_max: max,
  salary_currency: currency,
  salary_interval: interval,
});

test("an annual range is abbreviated, because a tile has one line for it", () => {
  // Databricks' live range.
  assert.equal(formatPay(pay(145_700, 200_300, "USD", "year")), "$146K – $200K/yr");
});

test("an hourly rate is never abbreviated, and keeps its cents", () => {
  assert.equal(formatPay(pay(35, 35, "USD", "hour")), "$35/hr");
  assert.equal(formatPay(pay(22.5, 28.75, "USD", "hour")), "$22.5 – $28.75/hr");
});

test("below 100K a decimal survives, because that difference is real money", () => {
  assert.equal(formatPay(pay(50_000, 63_000, "USD", "year")), "$50K – $63K/yr");
  assert.equal(formatPay(pay(62_500, 67_500, "USD", "year")), "$62.5K – $67.5K/yr");
});

test("a single published figure prints once, not as a range against itself", () => {
  assert.equal(formatPay(pay(180_000, 180_000, "USD", "year")), "$180K/yr");
});

test("only unambiguous currencies get a symbol; the rest print their code", () => {
  assert.equal(formatPay(pay(200_000, 255_000, "EUR", "year")), "€200K – €255K/yr");
  assert.equal(formatPay(pay(110_000, 185_000, "GBP", "year")), "£110K – £185K/yr");
  /* The important one. "$600K" on a Chilean posting reads as a US salary worth 60 times what it
     is, and several live currencies share the "$" and "kr" symbols. */
  assert.equal(formatPay(pay(600_000, 700_000, "SEK", "year")), "SEK 600K – 700K/yr");
  assert.equal(formatPay(pay(499_800, 588_000, "CLP", "month")), "CLP 499,800 – 588,000/mo");
});

test("a very large figure reads in millions rather than four-digit thousands", () => {
  // The largest annual figure on the live board, in yen.
  assert.equal(formatPay(pay(11_000_000, 14_878_400, "JPY", "year")), "¥11M – ¥14.9M/yr");
});

test("NOTHING is rendered when the employer published no pay", () => {
  /* Two thirds of the board. This must stay null rather than becoming "Competitive" or
     "Not listed", so that a figure on a tile always means an employer published one. */
  assert.equal(formatPay({}), null);
  assert.equal(formatPay(pay(null, null, null, null)), null);
});

test("a partial row renders nothing rather than a bare number", () => {
  /* The four columns are written together and cleared together, so a row missing one of them is
     most likely a Greenhouse figure whose period the poller declined to guess — exactly the case
     that must never reach a reader as an unlabelled number. */
  assert.equal(formatPay(pay(150_000, 180_000, "USD", null)), null);
  assert.equal(formatPay(pay(150_000, 180_000, null, "year")), null);
  assert.equal(formatPay(pay(null, 180_000, "USD", "year")), null);
  // A period this formatter has no suffix for is also a period it must not print.
  assert.equal(formatPay(pay(1_500, 1_800, "USD", "week")), null);
});

test("a numeric string still renders, and a zero never does", () => {
  assert.equal(formatPay(pay("150000", "180000", "USD", "year")), "$150K – $180K/yr");
  assert.equal(formatPay(pay(0, 0, "USD", "year")), null);
});

test("a job type shows only when the posting stated one", () => {
  assert.equal(jobTypeLabel("Internship"), "Internship");
  assert.equal(jobTypeLabel("Full-time"), "Full-time");
  /* Greenhouse is 84% of the board and states no type at all. Those rows show no chip; filling
     the silence with "Full-time" would put a fact no employer stated on ~18,000 tiles. */
  assert.equal(jobTypeLabel(null), null);
  assert.equal(jobTypeLabel(undefined), null);
  assert.equal(jobTypeLabel("  "), null);
});

test("every job surface imports the one formatter, so a job cannot read two ways", () => {
  /* Three surfaces show a job: the public board, the dashboard list, and the dashboard home
     (whose match card and pre-send review drawer both render one). Missing one is how the same
     posting ends up with a salary on two screens and none on the third. */
  for (const page of ["../app/browse-jobs/page.tsx", "../app/dashboard/jobs/page.tsx", "../app/dashboard/page.tsx"]) {
    const text = readFileSync(new URL(page, import.meta.url), "utf8");
    assert.match(text, /from "@\/lib\/pay"/, `${page} must format pay through lib/pay.ts`);
  }
});

test("neither surface ships a placeholder for missing pay", () => {
  /* The board's standing rule, and the reason it says UPDATED rather than POSTED on Greenhouse
     rows. If a future edit adds "Not listed" or "Competitive" to a card, this fails the build. */
  for (const page of ["../app/browse-jobs/page.tsx", "../app/dashboard/jobs/page.tsx", "../app/dashboard/page.tsx", "../lib/pay.ts"]) {
    const text = readFileSync(new URL(page, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\/.*$/gm, "");
    for (const banned of [/"Competitive"/, /"Not listed"/, /"Salary not/i, /"DOE"/]) {
      assert.doesNotMatch(text, banned, `${page} must leave unpublished pay blank`);
    }
  }
});
