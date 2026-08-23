import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [css, shell] = await Promise.all([
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url), "utf8"),
]);

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
  assert.match(dialogExit, /var\(--rq-dashboard-dialog-exit-from, none\)/);
  assert.doesNotMatch(dialogExit, /opacity\s*:/);
});

test("an interrupted More entry hands its live state to the exit", () => {
  const dialogEnter = section(
    "@keyframes rq-dashboard-dialog-enter",
    "@keyframes rq-dashboard-backdrop-exit",
  );

  assert.doesNotMatch(dialogEnter, /opacity\s*:/);
  assert.match(shell, /getComputedStyle\(dialog\)\.transform/);
  assert.match(shell, /--rq-dashboard-dialog-exit-from/);
  assert.match(shell, /getComputedStyle\(backdrop\)\.opacity/);
  assert.match(shell, /--rq-dashboard-backdrop-exit-from/);
});
