import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [outreachSource, buttonSource] = await Promise.all([
  readFile(new URL("../app/dashboard/outreach/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/app/Button.tsx", import.meta.url), "utf8"),
]);

const outreach = outreachSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const composerStart = outreach.indexOf('id="outreach-composer"');
const composerEnd = outreach.indexOf('<div className="flex flex-wrap gap-2">', composerStart);
assert.ok(composerStart >= 0 && composerEnd > composerStart, "the Outreach composer must be findable");
const composer = outreach.slice(composerStart, composerEnd);

const trayStart = composer.indexOf("<TerminalActionBar");
const trayEnd = composer.indexOf("</TerminalActionBar>", trayStart);
assert.ok(trayStart >= 0 && trayEnd > trayStart, "the composer terminal tray must be findable");
const tray = composer.slice(trayStart, trayEnd);

test("the Outreach completion tray stays reachable through the full dashboard viewport range", () => {
  assert.match(outreach, /import \{[^}]*TerminalActionBar[^}]*\} from "@\/components\/app\/ui"/);
  assert.match(composer, /className="pb-44 sm:pb-24"/);
  assert.match(
    tray,
    /className="-mt-40[^\"]*sm:-mt-20[^\"]*lg:!sticky[^\"]*lg:!bottom-\[var\(--dashboard-action-sticky-offset,2\.5rem\)\][^\"]*lg:!shadow-raised"/,
  );
  assert.equal((composer.match(/scroll-mb-52/g) ?? []).length, 3, "each lower composer control needs clearance from the parked tray");
  assert.equal((composer.match(/sm:scroll-mb-32/g) ?? []).length, 3, "desktop controls need the compact tray clearance too");
});

test("save is the only filled terminal action", () => {
  const primarySaveButtons = tray.match(/<Button[^>]*variant="primary"[^>]*>[\s\S]*?(?:Save changes|Save draft)/g) ?? [];
  assert.equal(primarySaveButtons.length, 2, "both create and edit modes must use the filled save action");
  assert.match(tray, /<Button[^>]*variant="secondary"[^>]*>[\s\S]*?Draft with Litos\+/);
  assert.doesNotMatch(tray, /variant="secondary"[^>]*>[\s\S]*?(?:Save changes|Save draft)/);

  const emailLink = tray.match(/<a href=\{contactEmail[\s\S]*?>Open in email<\/a>/)?.[0] ?? "";
  assert.ok(emailLink, "Open in email must remain in the terminal tray");
  assert.match(emailLink, /text-muted/);
  assert.match(emailLink, /hover:bg-surface-alt/);
  assert.doesNotMatch(emailLink, /border(?:-|\s)/, "Open in email must remain the quiet action");
});

test("the compact mobile tray keeps every action reachable and the save action unmistakable", () => {
  assert.match(tray, /grid w-full grid-cols-2 gap-2 sm:order-2 sm:flex sm:w-auto/);
  assert.equal((tray.match(/col-span-2 w-full[^\"]*sm:order-3 sm:w-auto/g) ?? []).length, 2);
  assert.match(buttonSource, /const BASE =\s*\n\s*"[^"]*min-h-11/);
  assert.match(tray, /<a[^>]*className="[^"]*min-h-11[^"]*"[^>]*>Open in email<\/a>/);
  assert.equal((tray.match(/motion-reduce:transition-none/g) ?? []).length, 5);
});

test("composer failures stay attached to the controls that raised them", () => {
  const error = tray.indexOf("<ErrorNote message={composeError} />");
  const controls = tray.indexOf('className="order-1 grid w-full grid-cols-2');
  assert.ok(error >= 0 && controls > error, "the local error must render inside the sticky tray before its controls");
  assert.equal((composer.match(/<ErrorNote message=\{composeError\} \/>/g) ?? []).length, 1);
  assert.match(tray, /Your email app opens a draft\. You still review it and press Send\./);
  assert.match(tray, /aria-describedby="outreach-email-handoff-note"/);
});
