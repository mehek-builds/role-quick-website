import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url),
  "utf8",
);

test("the 320px mobile navigation reserves room for long destination names", () => {
  assert.match(
    source,
    /grid-cols-\[0\.8fr_0\.8fr_1\.35fr_1\.2fr_0\.85fr\]/,
  );
  assert.match(source, /aria-current=\{isActive\(item\.href, pathname\) \? "page" : undefined\}/);
  assert.match(source, /className="relative whitespace-nowrap">\{item\.label\}/);
  assert.doesNotMatch(source, /aria-label="Dashboard" className="[^"]*grid-cols-5/);
});
