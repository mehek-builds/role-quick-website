import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/*
 * "Questions · 14 took two attempts, and the active pill still read JOB DESCRIPTION while the
 * 03 · FORMS section was on screen." Measured on trylitos.com, 2026-08-29.
 *
 * Both halves are one defect in the scroll spy. It named the last section whose top had crossed a
 * 24px threshold below the scroller's own top - and the questions section is the tail of a
 * two-column layout, so the pane reaches the end of its scroll with that heading plainly visible and
 * its top still well below the threshold. It could therefore never become active, however far the
 * reader scrolled or how many times they pressed its pill. The "two attempts" is the same fact seen
 * from the outside: the first press scrolled correctly, the rail refused to move, and the only
 * available reading was that the press had not registered.
 *
 * The two viewers are kept in step deliberately (see the header of components/PacketViewer.tsx:
 * it is the file the design is iterated in, and a sandbox that behaves differently from the real
 * thing stops being a sandbox), so both are asserted here.
 */
const VIEWERS = [
  ["components/app/ApplicationPacket.tsx", "the dashboard packet viewer"],
  ["components/PacketViewer.tsx", "the design sandbox viewer"],
];

for (const [path, name] of VIEWERS) {
  test(`${name}: a scroller at its end reports its last section, not the last one to cross the top`, async () => {
    const source = await readFile(path, "utf8");
    assert.match(
      source,
      /const atBottom = scrollable && box\.scrollTop \+ box\.clientHeight >= box\.scrollHeight - 2;/,
      "the end of the scroll has to be detected",
    );
    /* AND ONLY ON A PANE THAT MEANINGFULLY SCROLLS. `atBottom` is trivially true on one that barely
       overflows, and acting on it there marks the LAST section active while the reader is still at
       the top - the same defect this file's seeding comment records for a short packet. */
    assert.match(
      source,
      /const scrollable = box\.scrollHeight - box\.clientHeight > 24;/,
      "a pane that barely overflows must not be treated as scrolled to its end",
    );
    assert.match(
      source,
      /if \(atBottom && present\.length > 0\) \{\s*\n\s*setActive\(jumpTarget\.current \?\? present\[present\.length - 1\]\);/,
      "and at the end the answer is simply the last section that exists",
    );
    /* Scoped to sections that are actually rendered. The dashboard viewer's Proof section only
       exists once there is a receipt, and naming an absent id as "last" would leave the rail
       pointing at nothing on every packet that has not been sent. */
    assert.match(
      source,
      /const present = (?:ids|marks)\.filter\(\(id\) => root\.querySelector\(`#\$\{id\}`\) !== null\)/,
      "only sections present in this instance can be active",
    );
  });

  test(`${name}: a pressed pill takes immediately and is not overwritten mid-scroll`, async () => {
    const source = await readFile(path, "utf8");
    const jump = source.slice(source.indexOf("function jump(id: string)"));
    assert.match(jump, /setActive\(id\);/, "the pill the reader pressed is active at once");
    assert.match(jump, /jumpTarget\.current = id;/, "and is held while the smooth scroll runs");
    assert.match(jump, /jumpSettle\.current = window\.setTimeout\(/, "and released once it settles");
    /* Both reads of the spy defer to the click. Without this the rail repaints with every
       intermediate position of a smooth scroll and the press appears not to have taken. */
    assert.equal(
      (source.match(/setActive\(jumpTarget\.current \?\? /g) ?? []).length,
      2,
      "both exits from the spy must defer to an in-flight jump",
    );
  });

  test(`${name}: the rail still tracks the reader when they scroll it themselves`, async () => {
    /* The fix must not turn the rail into a record of the last thing clicked. Outside a jump,
       jumpTarget is null and the measured section wins, which is the behaviour that was already
       right and is the reason the rail exists. */
    const source = await readFile(path, "utf8");
    assert.match(source, /jumpTarget\.current = null;/);
    assert.match(source, /getBoundingClientRect\(\)\.top - (?:rect\.top|top) <= 24/);
  });
}
