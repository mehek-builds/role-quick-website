import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the paid receipt follows the supplied printer state sequence", () => {
  const page = read("app/billing/return/page.tsx");
  assert.match(page, /type ReceiptStage = "processing" \| "printing" \| "complete"/);
  assert.match(page, /setStage\("printing"\)/);
  assert.match(page, /setStage\("complete"\), 1750/);
  assert.match(page, /}, 650\)/);
  assert.match(page, /data-receipt-stage=\{stage\}/);
  assert.match(page, /aria-hidden=\{stage !== "complete"\}/);
  assert.match(page, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
});

test("the paid receipt keeps the supplied stepped feed and paper teeth", () => {
  const page = read("app/billing/return/page.tsx");
  const css = read("app/billing/return/receipt.module.css");
  assert.match(page, /const receiptToothCount = 40/);
  assert.match(page, /style=\{\{ clipPath: receiptClipPath \}\}/);
  assert.match(css, /litos-receipt-print-stepped 1\.75s linear forwards/);
  assert.match(css, /7\.5%, 10\.5%.*translateY\(-91%\)/);
  assert.match(css, /49\.5%, 52\.5%.*translateY\(-45%\)/);
  assert.match(css, /91\.5%, 94\.5%.*translateY\(-3%\)/);
});
