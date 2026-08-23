import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Applications opens the board by default and keeps selected detail first on mobile", () => {
  const source = read("app/dashboard/applications/page.tsx");
  assert.doesNotMatch(source, /requested\s*\?\?\s*reviewable\[0\]/);
  /* This used to pin the whole ledger section as `hidden ... lg:block`. That kept the tall table
     off a phone, which was the intent here, but it also took the filter, the sort and the packet
     switcher with it, and the switcher is the only in-context way to move between applications.
     What actually has to stay true is narrower: the multi-row TABLE does not push the selected
     detail down the screen on a phone. The switcher itself now rides above it as a one-row
     scrolling strip, asserted in tests/applications-mobile-controls.test.mjs. */
  assert.match(source, /className="hidden max-h-\[280px\] overflow-y-auto border-t border-border lg:block"/);
  assert.equal(source.match(/← All applications/g)?.length, 1, "selected workspaces render one application escape control");
});

test("dashboard navigation and hero use the simplified product language", () => {
  /* The NAV table moved to dashboard-shell.tsx when the chrome was split out of the layout, so the
     layout could go back to being a server component and declare a tab title. Three of the four
     assertions here are doesNotMatch, so pointing at layout.tsx would still pass while checking
     nothing. */
  const layout = read("app/dashboard/dashboard-shell.tsx");
  const demo = read("components/flow/data.ts");
  assert.doesNotMatch(layout, /label: "Resume"/);
  assert.doesNotMatch(layout, /label: "Contact"/);
  assert.doesNotMatch(layout, /label: "Job search"/);
  assert.match(layout, /label: "Account"/);
  assert.match(demo, /resume: "Fill the form", form: "Send it"/);
  assert.doesNotMatch(demo, /name: "Resume"/);
  assert.doesNotMatch(demo, /\{ name: "emailOpen"/);
  assert.doesNotMatch(read("components/FlowDemo.tsx"), />Contact</);
});

test("internal resume language is not shown to users", () => {
  const resume = read("app/dashboard/resume/page.tsx");
  assert.doesNotMatch(resume, /<Chip label="Parsed"/);
  assert.doesNotMatch(resume, /Different ways to write this line/);
  assert.doesNotMatch(resume, /Tags \(comma-separated\)/);
});

test("the board keeps required approval visible", () => {
  assert.match(read("components/app/Board.tsx"), /"ready_for_final_approval"[^\n]+return "Needs you"/);
});

test("the board shows only the active application pipeline columns", () => {
  const board = read("components/app/Board.tsx");
  assert.match(board, /const visibleStages = activeBoardStages\(stages\)/);
  assert.match(board, /useState<Stage>\("applied"\)/);
  assert.equal(board.match(/visibleStages\.map\(\(stage\)/g)?.length, 2);
  assert.match(board, /<MoveControl card=\{card\} stages=\{visibleStages\}/);
  assert.doesNotMatch(board, /xl:grid-cols-5/);
});
