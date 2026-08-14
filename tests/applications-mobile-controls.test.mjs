import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* Three defects a local sweep at 375px and 768px found on 2026-08-03.
 *
 * 1. The Applications ledger section, which carries the filter select, the sort select AND the
 *    packet switcher, was `hidden ... lg:block`. Filter and sort being desktop-only was a known
 *    trade. The switcher going with them was not: it is the only in-context way to move between
 *    applications, so on a phone and on a tablet the one escape from an open packet was the
 *    "All applications" link. Litos's traffic is TikTok and Instagram, so the widths that lost the
 *    control are the widths most sessions arrive at.
 * 2. The inline resume-editor fields rendered 16-20px tall on a phone: under the 44px comfort
 *    figure and under the 24px WCAG 2.5.8 AA floor, on the primary editing affordance of the
 *    product's core screen.
 * 3. AccountFooter guarded its count with `=== null`, so a /funnel response missing
 *    `applications_submitted` printed the literal "undefined applications" in the rail.
 *
 * Static, in the style of tests/header-mobile-nav.test.mjs and
 * tests/packet-dialog-accessibility.test.mjs: these run in milliseconds on every `npm test` with
 * no build, no port and no DOM. They cannot prove the strip feels right under a thumb. They can
 * prove the things that made all three invisible, which is that the controls are not behind a
 * desktop-only display gate, that the touch sizing is scoped to below lg rather than applied
 * everywhere, and that the footer guard admits both empty shapes.
 */

const applications = await readFile(
  new URL("../app/dashboard/applications/page.tsx", import.meta.url),
  "utf8",
);
/* The rail lives in dashboard-shell.tsx, not layout.tsx. The chrome was split out of the layout so
   the layout could go back to being a server component and declare a tab title. Reading layout.tsx
   here would still PASS, because the assertion below is a doesNotMatch and the layout no longer
   contains the code it guards: a silent pass that stops catching the regression it was written for. */
const dashboardLayout = await readFile(
  new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url),
  "utf8",
);

const ledgerSection = (() => {
  const start = applications.indexOf('<section aria-labelledby="application-ledger-heading"');
  assert.notEqual(start, -1, "expected the ledger section to still be labelled by its heading id");
  const end = applications.indexOf("</section>", start);
  assert.notEqual(end, -1, "expected the ledger section to close");
  return applications.slice(start, end);
})();

test("the ledger section itself is not gated on a desktop width", () => {
  /* The whole regression was one `hidden ... lg:block` on the opening tag. Nothing inside the
     section can be reached on a phone while that class sits on the wrapper, whatever the children
     say, so the wrapper is what this asserts on. */
  const openingTag = ledgerSection.slice(0, ledgerSection.indexOf(">") + 1);
  assert.doesNotMatch(
    openingTag,
    /\bhidden\b/,
    "the ledger section carries the filter, the sort and the packet switcher: it cannot be display:none below lg",
  );
});

test("filter and sort are reachable at every width, at a 44px target", () => {
  for (const id of ["application-filter", "application-sort"]) {
    const select = ledgerSection.slice(ledgerSection.indexOf(`id="${id}"`));
    const className = select.match(/className="([^"]+)"/)?.[1] ?? "";
    assert.match(className, /min-h-11/, `${id} needs a 44px control height for a thumb`);
    assert.doesNotMatch(className, /\bhidden\b/, `${id} must not be hidden at any width`);
  }
});

test("the packet switcher has a phone shape and a desktop shape, and exactly one shows at a time", () => {
  /* The strip is the idiom this codebase already uses for the same overflow problem: the Board's
     stage picker and the Account tab strip. A four-column table does not survive 375px, and a
     vertical list of every application between the page header and the review surface would bury
     the packet the student actually opened. */
  assert.match(
    ledgerSection,
    /-mx-4 overflow-x-auto[^"]*lg:hidden/,
    "expected a horizontally scrolling, edge-bleeding switcher strip below lg",
  );
  assert.match(
    ledgerSection,
    /hidden max-h-\[280px\] overflow-y-auto[^"]*lg:block/,
    "expected the existing scrolling table to survive, desktop-only",
  );
  /* Both branches read the same filtered, sorted list. Two hand-maintained sources is how the
     header nav lost its phone copy in the first place (ISSUE-016). */
  assert.equal(
    (ledgerSection.match(/visiblePackets\.map\(/g) ?? []).length,
    2,
    "expected the phone strip and the desktop table to render from one visiblePackets list",
  );
  /* Both branches answer the empty filter, or filtering to "Sent" with nothing sent renders a
     silent blank box on whichever width lacks the message. */
  assert.equal(
    (ledgerSection.match(/No applications in this view\./g) ?? []).length,
    2,
    "expected both the phone strip and the desktop table to state an empty filter",
  );
});

test("every switcher chip is a 44px target that reports which packet is open", () => {
  const strip = ledgerSection.slice(ledgerSection.indexOf("-mx-4 overflow-x-auto"));
  const chip = strip.slice(0, strip.indexOf("</button>"));
  assert.match(chip, /min-h-11/, "a chip a thumb has to hit needs 44px");
  /* Optional chaining, re-pointed 2026-08-04 with ISSUE-037. The section now also renders as the
     landing view for a ?state= deep link, where nothing is open yet, so a bare `selected.id` here
     would throw on the exact arrival the deep link exists to serve. What this asserts is unchanged:
     the open packet is announced and not only coloured. */
  assert.match(
    chip,
    /aria-pressed=\{packet\.id === selected\?\.id \|\| packet\.id === canonicalSelected\?\.id\}/,
    "which legacy or canonical application is open has to be announced, not only coloured",
  );
  assert.match(chip, /onClick=\{\(\) => selectPacket\(packet\)\}/, "the chip is the in-context switch");
});

const editableLine = applications.slice(applications.indexOf("function EditableLine("));

test("the resume editor is touch-sized below lg and compact from lg up", () => {
  /* The desktop editor is deliberately tight so it reads like a document rather than a form. The
     touch sizing has to be scoped, not global, or the fix trades one defect for a worse one. */
  const className = editableLine.match(/className=\{`([^`]+)`\}/)?.[1] ?? "";
  assert.match(className, /min-h-11/, "a floor for the smallest type in the editor");
  assert.match(className, /lg:min-h-0/, "lifted from lg up, or every field stays pinned at 44px on a laptop");
  assert.match(className, /content-center/, "the value sits in the middle of the taller box, not along its top edge");
  assert.match(className, /lg:content-normal/, "and back to normal flow once the box is the height of the text");
});

test("the editor's touch floor is height only, never padding", () => {
  /* The first attempt at this used py-3 to make the target. Padding is counted by scrollHeight, so
     the 44px got written into the inline height that `resize` sets, and an inline height outranks
     min-height: all nine fields then stayed 44px on the desktop layout after dragging a window
     past lg, roughly 250px of dead space on the core screen. Anything that changes the measured
     height cannot be used to build the floor. */
  const className = editableLine.match(/className=\{`([^`]+)`\}/)?.[1] ?? "";
  assert.match(className, /\bp-0\b/, "the editor field carries no padding of its own at any width");
  assert.doesNotMatch(className, /(^|\s)(lg:)?(p|py|pt|pb)-(?!0\b)/, "padding would be measured into the inline height and would not come back off");
});

test("the measurement suspends the touch floor, so it records the text and not the target", () => {
  /* scrollHeight reports the padding box when the box is taller than its text, so measuring with
     min-h-11 in force returns 44px rather than the height of the words. Suspending it for the
     measurement is what keeps the inline height breakpoint-independent, which in turn is what lets
     a viewport cross lg with no re-measure at all. That matters because it makes the crossing free
     rather than dependent on an asynchronous re-measure landing in time.

     This comment used to assert, as fact, that "the ResizeObserver below does not currently fire".
     That was wrong, and it is corrected here rather than deleted because the wrong version was
     itself cited as evidence in a later audit. The observer fires. The measurement that said
     otherwise was taken in a tab with document.visibilityState === "hidden", where the browser
     suspends the rendering lifecycle and delivers no ResizeObserver records at all. Re-measured
     2026-08-03 in headless Chromium with rendering running: forcing the parent 446px -> 120px ->
     446px moved the school headline 28 -> 168 -> 28px. Nothing here depends on the observer either
     way, but the claim should not keep being repeated. */
  /* Comments stripped before the ordering check below: this one explains the measurement, so the
     word scrollHeight appears in the prose ahead of the statement that reads it. */
  const resize = editableLine
    .slice(editableLine.indexOf("const resize ="), editableLine.indexOf("useLayoutEffect"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(resize, /style\.minHeight = "0"/, "the floor comes off before scrollHeight is read");
  assert.match(resize, /style\.height = `\$\{node\.scrollHeight\}px`/);
  assert.match(resize, /style\.minHeight = ""/, "and goes straight back on, so the rendered box keeps its 44px");
  assert.ok(
    resize.indexOf('style.minHeight = "0"') < resize.indexOf("scrollHeight"),
    "suspending the floor after the measurement would measure the floor",
  );
});

test("the account footer states the plan and no count beside it", () => {
  /* Supersedes an undefined-guard on the same line, 2026-08-03. The count it was guarding is gone.
     It printed "Free · 5 applications" one separator away from the tier, where a bare noun reads as
     the allowance the plan grants rather than as what the account has already done, and free
     grants 20 resumes a month, so the rail was quoting a quota four times under the real one.
     Momentum on Home reports the same figure labelled, so nothing was lost by removing it.

     Asserted on the funnel call rather than on any copy: the wording of the misreading is not the
     thing to pin, the rail having a throughput number next to a plan name is. */
  assert.doesNotMatch(
    dashboardLayout,
    /fetchFunnel|applications_submitted/,
    "the rail must not read throughput; a count beside the tier reads as the tier's allowance",
  );
});
