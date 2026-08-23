import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url),
  "utf8",
);

test("every visible dashboard navigation surface exposes the current destination", () => {
  assert.match(source, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(source, /aria-current=\{isActive\(item\.href, pathname\) \? "page" : undefined\}/);
  assert.match(source, /aria-current=\{moreActive \? "page" : undefined\}/);
  assert.match(source, /aria-label=\{moreActive \? "More, current section" : "More"\}/);

  const moreLinks = source.slice(
    source.indexOf('aria-label="More dashboard destinations"'),
    source.indexOf("{/* No marketing footer"),
  );
  assert.match(moreLinks, /aria-current=\{isActive\(item\.href, pathname\) \? "page" : undefined\}/);
});
