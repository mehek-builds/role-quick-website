import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [hook, packet, transcript, documents, upgrade, settings, css] = await Promise.all([
  read("components/app/useDashboardOverlayExit.ts"),
  read("components/app/ApplicationPacket.tsx"),
  read("components/app/TranscriptModal.tsx"),
  read("components/app/DocumentsCard.tsx"),
  read("components/billing/UpgradeModal.tsx"),
  read("app/dashboard/settings/page.tsx"),
  read("app/globals.css"),
]);

test("the shared lifecycle retains one idempotent 130ms exit and cleans its timer", () => {
  assert.match(hook, /DASHBOARD_OVERLAY_EXIT_MS = 130/);
  assert.match(hook, /if \(closingRef\.current\) return false/);
  assert.match(hook, /closingRef\.current = true/);
  assert.match(hook, /setClosing\(true\)/);
  assert.match(hook, /window\.setTimeout\(finish, DASHBOARD_OVERLAY_EXIT_MS\)/);
  assert.match(hook, /useEffect\(\(\) => \(\) => clearTimer\(\), \[clearTimer\]\)/);
  assert.match(hook, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches[\s\S]*?finish\(\)/);
});

test("an interrupted overlay entry hands its live transform and backdrop opacity to exit", () => {
  assert.match(hook, /window\.getComputedStyle\(dialog\)\.transform/);
  assert.match(hook, /--rq-dashboard-dialog-exit-from/);
  assert.match(hook, /window\.getComputedStyle\(backdrop\)\.opacity/);
  assert.match(hook, /window\.getComputedStyle\(dialog, "::backdrop"\)\.opacity/);
  assert.match(hook, /--rq-dashboard-backdrop-exit-from/);
});

for (const [name, source] of [["packet", packet], ["transcript", transcript]]) {
  test(`${name} stays present but leaves the accessibility and pointer trees while closing`, () => {
    assert.match(source, /useDashboardOverlayExit\(\{/);
    assert.match(source, /aria-hidden=\{closing \|\| undefined\}/);
    assert.match(source, /inert=\{closing \|\| undefined\}/);
    assert.doesNotMatch(source, /fixed inset-0[^\n]+closing \? "pointer-events-none"/);
    assert.match(source, /rq-dashboard-dialog[^\n]+closing \? "rq-dashboard-dialog-exit"/);
    assert.match(source, /closing \? "rq-dashboard-backdrop-exit"/);
    assert.match(source, /closing \? "rq-dashboard-dialog-exit"/);
    assert.match(source, /event\.key === "Escape"[\s\S]*?requestClose\(\)/);
    assert.match(source, /hasAttribute\("inert"\)[\s\S]{0,120}?event\.key === "Tab"[\s\S]{0,60}?event\.preventDefault\(\)/);
    assert.match(source, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*?previous\?\.focus\?\.\(\)/);
  });
}

test("transcript completion and forward navigation share the retained close path", () => {
  assert.match(transcript, /recordOrderedApplicationDocument[\s\S]*?requestClose\(\)/);
  assert.match(transcript, /requestClose\(onReviewApplication\)/);
  assert.doesNotMatch(transcript, /onClick=\{onReviewApplication\}/);
});

test("native upgrade and deletion dialogs animate before close and reset before reopen", () => {
  for (const source of [documents, upgrade, settings]) {
    assert.match(source, /nativeBackdrop: true/);
    assert.match(source, /aria-hidden=\{[^}]*Closing|aria-hidden=\{closing/);
    assert.match(source, /inert=\{[^}]*Closing|inert=\{closing/);
    assert.match(source, /rq-dashboard-dialog-exit/);
    assert.match(source, /reset[^();]*Exit\(\)/);
    assert.match(source, /if \((?:dialog|node)\?\.open\) (?:dialog|node)\.close\(\)/);
  }
  assert.match(upgrade, /const \[presentRequest, setPresentRequest\] = useState<UpgradeRequest \| null>\(request\)/);
  assert.match(upgrade, /if \(!presentRequest\) return null/);
  assert.match(upgrade, /setPresentRequest\(null\)/);
  assert.match(upgrade, /if \(open\) return;[\s\S]*?requestClose\(\)/);
  assert.match(upgrade, /onCancel=\{\(event\) => \{\s*event\.preventDefault\(\)/);
  assert.match(documents, /onCancel=\{\(event\) => \{\s*event\.preventDefault\(\);\s*if \(!deleting\) requestDocumentDialogClose\(\)/);
  assert.match(documents, /event\.target === dialog\.current && !deleting/);
  assert.match(settings, /onClose=\{\(\) => window\.requestAnimationFrame/);
  assert.match(settings, /event\.target === deleteDialogRef\.current && dataBusy !== "delete"/);
});

test("manual, route, and delete-dialog actions finish only after the retained exit", () => {
  assert.match(upgrade, /requestClose\(continueManually\)/);
  assert.match(upgrade, /requestClose\(\(\) => window\.location\.assign\(href\)\)/);
  assert.match(documents, /setRemoved\([\s\S]*?requestDocumentDialogClose\(\)/);
  assert.match(documents, /if \(trigger\?\.isConnected\) trigger\.focus\(\);\s*else status\.current\?\.focus\(\)/);
  assert.match(settings, /requestDeleteDialogClose\(\(\) => router\.replace\("\/"\)\)/);
  assert.match(settings, /onClick=\{\(\) => requestDeleteDialogClose\(\)\}/);
});

test("native dialog backdrops use the same entry, exit, and reduced-motion rules", () => {
  assert.match(css, /dialog\.rq-dashboard-dialog::backdrop\s*\{\s*animation: rq-dashboard-backdrop-enter/);
  assert.match(css, /dialog\.rq-dashboard-dialog-exit::backdrop\s*\{\s*animation: rq-dashboard-backdrop-exit/);
  assert.match(css, /dialog\.rq-dashboard-dialog::backdrop\s*\{\s*animation: none;/);
});
