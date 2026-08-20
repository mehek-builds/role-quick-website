import assert from "node:assert/strict";
import test from "node:test";
import { isStubPacketSpec } from "./application-review.ts";

/**
 * ISSUE: "Open tailored packet" on an older Tracker row rendered a completely blank resume, no
 * error, nothing. Root cause: `mergeCanonicalApplicationHistory` (canonical-tracker.ts) fills a
 * canonical Tracker row whose linked legacy packet fell outside `/resume/history`'s 50-full-spec cap
 * with `canonicalTrackerPacket(application)` - no `linkedPacket` - and that writes `spec: { _review:
 * review }`: no `_contact`, no `experience`. `ApplicationPacket` rendered that straight through
 * `stripMetadata`, which defaults the missing `experience` to `[]` rather than throwing, so the
 * component never got a chance to notice anything was wrong.
 *
 * `isStubPacketSpec` is the check that used to be missing: it names that exact placeholder shape so
 * `ApplicationPacket` can hydrate the real spec instead of silently drawing an empty resume.
 */
test("a canonicalTrackerPacket placeholder (no linked packet) is a stub", () => {
  assert.equal(isStubPacketSpec({}), true);
  assert.equal(isStubPacketSpec({ experience: [] }), true);
  assert.equal(isStubPacketSpec({ _contact: {}, experience: [] }), true, "an empty _contact carries no name and is not evidence of a real packet");
  assert.equal(isStubPacketSpec({ _contact: { full_name: "" }, experience: [] }), true, "a blank name is the same as no name");
  assert.equal(isStubPacketSpec({ _contact: { full_name: "   " }, experience: [] }), true, "whitespace is not a name");
});

test("a real packet, even a genuinely zero-experience one, is not a stub", () => {
  // The distinguishing signal is `_contact`, not `experience` alone: `_contact.full_name` is written
  // verbatim from the generation request onto every packet a real generation produced, so a student
  // with no work history yet - applying before their first internship - still has one.
  assert.equal(isStubPacketSpec({ _contact: { full_name: "Mehek Mandal" }, experience: [] }), false);
  assert.equal(
    isStubPacketSpec({
      _contact: { full_name: "Mehek Mandal" },
      experience: [{ org: "Litos", title: "Founder", date_range: "2026", bullets: ["Shipped it"] }],
    }),
    false,
  );
});

test("a packet with real experience content is never a stub, even without _contact", () => {
  // Requiring BOTH an empty experience list AND no _contact (rather than either alone) means a
  // packet that carries real content on only one of the two fields is never mistaken for the
  // placeholder, which has neither.
  assert.equal(
    isStubPacketSpec({ experience: [{ org: "Litos", title: "Founder", date_range: "2026", bullets: [] }] }),
    false,
  );
});
