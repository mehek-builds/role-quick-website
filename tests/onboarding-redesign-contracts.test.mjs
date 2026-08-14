import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function shipped(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/* These are the screens the current server-derived flow can stop on and ask the student to do
 * work. Done is a destination, not a substantive step, and the removed install, apply and
 * targeting values are rolling-deploy aliases for Done. */
const SUBSTANTIVE_STEPS = [
  ["resume", "ResumeStep", "components/start/steps.tsx"],
  ["impact", "RecentExperienceStep", "components/start/RecentExperienceStep.tsx"],
  ["focus", "FocusStep", "components/start/steps.tsx"],
  ["sponsorship", "SponsorshipStep", "components/start/SponsorshipStep.tsx"],
  ["base", "BaseResumeStep", "components/start/BaseResumeStep.tsx"],
  ["gaps", "GapsStep", "components/start/steps.tsx"],
];

test("every substantive onboarding step receives and renders the same Finish later escape", async () => {
  const page = shipped(await read("app/start/page.tsx"));
  const sources = new Map();

  for (const [step, component, path] of SUBSTANTIVE_STEPS) {
    const branch = page.slice(page.indexOf(`case "${step}":`));
    assert.ok(branch.length > 0, `${step} is missing from the onboarding router`);
    const nextCase = branch.slice(1).search(/\n\s*case "/);
    const body = nextCase === -1 ? branch : branch.slice(0, nextCase + 1);
    assert.match(body, new RegExp(`<${component}\\b[\\s\\S]*?onLater=\\{later\\}`), `${step} does not receive the shared exit`);

    if (!sources.has(path)) sources.set(path, shipped(await read(path)));
    const componentSource = sources.get(path);
    const start = componentSource.indexOf(`export function ${component}`);
    assert.notEqual(start, -1, `${component} is missing from ${path}`);
    const nextExport = componentSource.indexOf("\nexport function ", start + 1);
    const implementation = componentSource.slice(start, nextExport === -1 ? undefined : nextExport);
    assert.match(implementation, /<LaterLink\s+onClick=\{onLater\}\s*\/>/, `${component} does not render Finish later`);
  }
});

test("Finish later remains a visible, touch-sized button with one product-wide name", async () => {
  const ui = shipped(await read("components/start/ui.tsx"));
  const later = ui.slice(ui.indexOf("export function LaterLink"), ui.indexOf("export function SkipLink"));

  assert.match(later, /<button\b/);
  assert.match(later, />\s*Finish later\s*</);
  assert.match(ui, /const QUIET_ACTION\s*=\s*["'][^"']*min-h-11/);
  assert.doesNotMatch(later, /sr-only|hidden|aria-hidden/);
});

test("the onboarding disclosure exposes one controlled region in both states", async () => {
  const welcome = shipped(await read("components/start/Welcome.tsx"));
  const highlights = welcome.slice(welcome.indexOf("export function Highlights"));

  assert.match(welcome, /const BODY_ID = "how-litos-works-body"/);
  assert.match(highlights, /aria-expanded=\{false\}[\s\S]*?aria-controls=\{BODY_ID\}/);
  assert.match(highlights, /aria-expanded=\{true\}[\s\S]*?aria-controls=\{BODY_ID\}/);
  assert.match(highlights, /<div id=\{BODY_ID\}>/);
  assert.match(highlights, /<h2[\s\S]*?id="how-litos-works"/);
  assert.match(highlights, /<section aria-labelledby="how-litos-works"/);
});

test("onboarding never presents keyword coverage as a percentage", async () => {
  const paths = [
    "app/start/page.tsx",
    "components/start/BaseResumeStep.tsx",
    "components/start/RecentExperienceStep.tsx",
    "components/start/ResumePaper.tsx",
    "components/start/SponsorshipStep.tsx",
    "components/start/Welcome.tsx",
    "components/start/steps.tsx",
    "components/start/ui.tsx",
  ];

  for (const path of paths) {
    const source = shipped(await read(path));
    assert.doesNotMatch(
      source,
      /\{[^}\n]*keyword_coverage_pct[^}\n]*\}\s*%/,
      `${path} renders the keyword coverage percentage during onboarding`,
    );
    assert.doesNotMatch(
      source,
      /keyword coverage\s*(?:is|:)?\s*\{[^}]+\}\s*%/i,
      `${path} labels a keyword coverage percentage during onboarding`,
    );
  }
});

test("resume approval waits for the saved application profile instead of treating a failed read as blank", async () => {
  const page = shipped(await read("app/start/page.tsx"));

  assert.doesNotMatch(page, /getApplicationProfile\(\)\.catch\(\(\) => null\)/);
  assert.match(page, /appProfileStatus[^\n]*"loading"[^\n]*"ready"[^\n]*"error"/);
  assert.match(page, /case "base":[\s\S]*?appProfileStatus !== "ready"[\s\S]*?applicationProfileGate\("base"\)/);
  assert.match(page, /Try loading again/);
});
