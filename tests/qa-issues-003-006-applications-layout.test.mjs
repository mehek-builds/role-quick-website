import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/dashboard/applications/page.tsx", import.meta.url),
  "utf8",
);

test("the Applications heading and filters occupy separate mobile rows", () => {
  const heading = source.indexOf('id="application-ledger-heading"');
  const controls = source.indexOf('className="flex flex-col gap-2 border-t border-border py-3 sm:flex-row', heading);
  const filter = source.indexOf('id="application-filter"', controls);

  assert.notEqual(heading, -1);
  assert.notEqual(controls, -1);
  assert.notEqual(filter, -1);
  assert.ok(heading < controls && controls < filter);
});

test("an open application owns the header action hierarchy on every task screen", () => {
  assert.match(
    source,
    /!applicationTaskOpen && \(showNewApplication \|\| packets === null \|\| reviewablePackets\.length > 0\)/,
  );
  assert.doesNotMatch(source, /!reviewOpen && \(showNewApplication/);
});
