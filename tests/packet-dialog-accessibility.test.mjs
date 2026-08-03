import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ISSUE-025, filed as "the application packet dialog has no accessible name"
 * because a live check on /dashboard/applications read `aria-labelledby` and
 * found null. It is null, and the dialog is named anyway: the name comes from
 * `aria-label`, which is the other half of the accname spec and the half that
 * suits this component. The review drawer in app/dashboard/page.tsx can point
 * `aria-labelledby` at `id="review-title"` because there is exactly one drawer
 * on that page. The packet dialog is instantiated per packet and its own scroll
 * spy already scopes every lookup to `dialog.current` rather than to
 * document.getElementById, on the recorded grounds that its section ids are not
 * unique across instances. Naming it by id would reintroduce the collision the
 * rest of the file works to avoid, and the interpolated label carries the role
 * AND the company, where the visible heading carries only the role.
 *
 * Driving the real thing at /qa/packet/dashboard confirmed the rest of the
 * modal contract on the same pass: focus is trapped in both directions, Escape
 * closes, focus returns to the trigger, and body scroll is restored. So this
 * suite exists to pin what was found working rather than to guard a fix, which
 * is the honest reason a false positive should still leave a test behind: the
 * next reader who greps for `aria-labelledby` will find this instead of the
 * ticket again.
 *
 * Static, in the style of tests/header-mobile-nav.test.mjs. These assertions
 * cannot prove the trap holds in a browser, only that the code that made it
 * hold is still there. */

const packet = await readFile(new URL("../components/app/ApplicationPacket.tsx", import.meta.url), "utf8");
const sandbox = await readFile(new URL("../components/PacketViewer.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

/* The dashboard component and the sandbox it is iterated in, held to the same
   contract on purpose: a sandbox that behaves differently stops being one. */
const DIALOGS = [
  ["ApplicationPacket", packet, /aria-label=\{`Application packet: \$\{role\} at \$\{company\}`\}/],
  ["PacketViewer", sandbox, /aria-label=\{`Application packet: \$\{packet\.role\} at \$\{packet\.company\}`\}/],
];

for (const [name, source, label] of DIALOGS) {
  test(`${name} names its dialog, and the name says which packet`, () => {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    /* A generic "Dialog" would satisfy an automated name check and tell a
       screen reader nothing. The role and the company are both on screen in the
       header, so both belong in the name. */
    assert.match(source, label, "the dialog must be named after the role and the company");
  });

  test(`${name} traps Tab in DOM order, both directions`, () => {
    /* querySelectorAll returns document order, so first and last are the real
       ends of the ring. Written from a hand-listed array instead, the ends can
       disagree with the order the browser actually walks, the wrap never fires,
       and Tab lands in the page behind the overlay. That is the shape of the
       bug ISSUE-016 shipped in the header. */
    assert.match(source, /dialog\.current\.querySelectorAll<HTMLElement>\(/);
    assert.match(source, /const first = focusable\[0\]/);
    assert.match(source, /const last = focusable\[focusable\.length - 1\]/);
    assert.match(source, /event\.shiftKey && document\.activeElement === first/);
    assert.match(source, /!event\.shiftKey && document\.activeElement === last/);
  });

  test(`${name} closes on Escape, returns focus, and restores scroll`, () => {
    assert.match(source, /event\.key === "Escape"/, "Escape must close the dialog");
    assert.match(source, /closeButton\.current\?\.focus\(\)/, "opening moves focus into the dialog");
    assert.match(source, /previous\?\.focus\?\.\(\)/, "closing returns focus to the trigger");
    /* The prior overflow is captured and put back, not blanked: a blanket reset
       would clobber whatever a surface behind had set for its own reasons. */
    assert.match(source, /const overflow = document\.body\.style\.overflow/);
    assert.match(source, /document\.body\.style\.overflow = "hidden"/);
    assert.match(source, /document\.body\.style\.overflow = overflow/);
  });

  test(`${name} holds onClose in a ref, so the trap survives a parent render`, () => {
    /* The trap effect runs on [] deps. If it keyed on onClose, a caller passing
       an inline arrow would tear it down every parent commit, and the cleanup's
       focus restore would throw focus out of an open dialog onto the page
       behind it. Reading through a ref survives a caller that forgets. */
    assert.match(source, /onCloseRef\.current\(\)/);
    assert.match(source, /\}, \[\]\);/);
  });
}

test("the review drawer keeps its own naming pattern, which is the one-per-page case", () => {
  /* Pinned so the two are not "made consistent" in the wrong direction. The
     drawer is a singleton with a stable heading id, and aria-labelledby is
     right there for the same reason it is wrong in the packet dialog. */
  assert.match(dashboard, /aria-labelledby="review-title"/);
  assert.match(dashboard, /id="review-title"/);
});
