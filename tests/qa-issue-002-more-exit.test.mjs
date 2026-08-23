import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function section(startMarker, endMarker) {
  const start = css.indexOf(startMarker);
  const end = css.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return css.slice(start, end);
}

test("the mobile More sheet stays opaque while it settles out", () => {
  const backdropExit = section(
    "@keyframes rq-dashboard-backdrop-exit",
    "@keyframes rq-dashboard-dialog-exit",
  );
  const dialogExit = section(
    "@keyframes rq-dashboard-dialog-exit",
    ".rq-dashboard-backdrop",
  );

  assert.match(backdropExit, /opacity:\s*0/);
  assert.match(dialogExit, /translateY\(8px\)\s+scale\(0\.99\)/);
  assert.doesNotMatch(dialogExit, /opacity\s*:/);
});
