import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
const template = await readFile(new URL("../app/dashboard/template.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const packet = await readFile(new URL("../components/app/ApplicationPacket.tsx", import.meta.url), "utf8");

test("dashboard route changes enable and use one ViewTransition boundary", () => {
  assert.match(
    config,
    /experimental:\s*\{[\s\S]*?viewTransition:\s*true,?[\s\S]*?\}/,
    "Next must enable React ViewTransition support",
  );
  assert.match(template, /import \{ ViewTransition \} from "react";/);
  assert.match(
    template,
    /<ViewTransition enter="rq-dashboard-page" exit="rq-dashboard-page" default="none">/,
    "the dashboard route body, rather than the persistent shell, owns the page handoff",
  );
  assert.match(template, /<div className="rq-dashboard-page">\{children\}<\/div>/);
});

test("dashboard motion stays brief and spatially restrained", () => {
  const durations = Object.fromEntries(
    [...globals.matchAll(/--motion-(exit|state|enter):\s*(\d+)ms;/g)]
      .map(([, name, value]) => [name, Number(value)]),
  );

  assert.deepEqual(Object.keys(durations).sort(), ["enter", "exit", "state"]);
  assert.ok(durations.exit >= 100 && durations.exit <= 150, "exit should finish first");
  assert.ok(durations.state >= 150 && durations.state <= 200, "small state changes should stay quick");
  assert.ok(durations.enter >= 200 && durations.enter <= 250, "entry may settle, but must remain responsive");
  assert.ok(durations.exit < durations.state && durations.state < durations.enter);

  const motionStart = globals.indexOf("/* Dashboard motion.");
  const reducedMotionStart = globals.indexOf("@media (prefers-reduced-motion: reduce)", motionStart);
  assert.notEqual(motionStart, -1, "the dashboard motion section must remain explicit");
  assert.notEqual(reducedMotionStart, -1, "the dashboard motion section must lead into its reduced-motion override");
  const fullMotion = globals.slice(motionStart, reducedMotionStart);

  assert.doesNotMatch(fullMotion, /translateX\(/, "route and panel changes should not imply a navigation direction");
  const verticalOffsets = [...fullMotion.matchAll(/translateY\((-?\d+)px\)/g)]
    .map(([, value]) => Math.abs(Number(value)));
  assert.ok(verticalOffsets.length >= 5, "the route, panel, and dialog should all use the shared settling language");
  assert.ok(verticalOffsets.every((value) => value <= 12), `vertical offsets must stay subtle: ${verticalOffsets.join(", ")}`);

  const scales = [...fullMotion.matchAll(/scale\((\d+(?:\.\d+)?)\)/g)]
    .map(([, value]) => Number(value));
  assert.ok(scales.length >= 1, "the dialog should have one restrained scale settle");
  assert.ok(scales.every((value) => value >= 0.98 && value <= 1.02), `scale changes must stay subtle: ${scales.join(", ")}`);
});

test("reduced motion disables dashboard snapshots, entries, and scoped loaders", () => {
  const reducedMotionStart = globals.indexOf("@media (prefers-reduced-motion: reduce)");
  const nextSection = globals.indexOf("/* ============================================================", reducedMotionStart);
  assert.notEqual(reducedMotionStart, -1);
  const reducedMotion = globals.slice(reducedMotionStart, nextSection === -1 ? undefined : nextSection);

  assert.match(
    reducedMotion,
    /\.dashboard-shell \.animate-pulse,\s*\.rq-dashboard-backdrop,\s*\.rq-dashboard-dialog,\s*dialog\.rq-dashboard-dialog::backdrop\s*\{\s*animation:\s*none;/,
    "dashboard loading, backdrop, and dialog animation must stop together",
  );
  assert.doesNotMatch(
    reducedMotion,
    /(?<!dashboard-shell )\.animate-pulse/,
    "the loader override must stay scoped to the dashboard",
  );
  assert.match(reducedMotion, /::view-transition-old\(\*\),/);
  assert.match(reducedMotion, /::view-transition-new\(\*\),/);
  assert.match(reducedMotion, /::view-transition-group\(\*\)\s*\{/);
  assert.match(reducedMotion, /animation-duration:\s*0s !important;/);
  assert.match(reducedMotion, /animation-delay:\s*0s !important;/);
});

test("packet section jumps honor reduced motion", () => {
  assert.match(
    packet,
    /matchMedia\(["']\(prefers-reduced-motion: reduce\)["']\)\.matches/,
    "the packet rail must query the user's motion preference before scrolling",
  );
  assert.match(
    packet,
    /const behavior = window\.matchMedia\(["']\(prefers-reduced-motion: reduce\)["']\)\.matches \? ["']auto["'] : ["']smooth["'];/,
    "reduced motion must use an instant jump while full motion may scroll smoothly",
  );
  assert.match(packet, /scrollIntoView\(\{ behavior, block: ["']start["'] \}\)/);
});
