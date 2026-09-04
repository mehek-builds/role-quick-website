/* THE PACKET REVIEW SCREEN'S resume_contact_stale NOTICE, TRACED BACK TO THE ROW THAT ACTUALLY
 * SEEDS IT ON A FRESH LOAD.
 *
 * MEASURED on trylitos.com 2026-09-04: opening the packet review screen for a stale packet
 * (Pony.ai fdcf4ccb, Mercari 8b3d8b2d) never called GET /applications/:id/submission at all - the
 * `submission` state resumeContactStaleNotice reads (features/applications/domain/
 * resume-contact-stale.ts) is seeded by selectPacket's own board-row literal
 * (application-history-deeplink.test.mjs pins the effect that feeds selectPacket its packet), and
 * that literal names every field it copies rather than spreading the packet - see its own comment,
 * a few lines above the object below. volley-backend now publishes resume_contact_stale on
 * /resume/history rows off the same resumeContactStaleness comparison GET
 * /applications/:id/submission already used; this file is the other half, pinning that the seed
 * literal actually carries the field through and that GeneratedResume's own type admits it, so a
 * future edit to either cannot silently reintroduce the gap by dropping an unlisted field the way
 * this one did.
 *
 * SOURCE ASSERTIONS, LIKE application-history-deeplink.test.mjs, NOT A RENDER. selectPacket is a
 * closure inside this one huge client component with dozens of hooks or context it would take a
 * full app mount to satisfy; what actually broke was a literal naming its fields, and reading that
 * exact literal back off disk is the narrowest test that can fail the way the bug did.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const pageSource = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const page = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const api = apiSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("GeneratedResume admits the board row's resume_contact_stale", () => {
  test("the type declares the field, not just the wire payload", () => {
    const typeStart = api.indexOf("export type GeneratedResume = {");
    assert.notEqual(typeStart, -1, "expected the GeneratedResume type to still be declared here");
    const nextType = api.indexOf("export type CanonicalApplication = {", typeStart);
    assert.notEqual(nextType, -1, "expected a type boundary right after GeneratedResume");
    const generatedResume = api.slice(typeStart, nextType);

    assert.match(
      generatedResume,
      /resume_contact_stale\?:\s*\{\s*stored: Record<string, string \| undefined>;\s*current: Record<string, string \| undefined>;\s*\};/,
      "GeneratedResume must type resume_contact_stale, or selectPacket's own read of packet.resume_contact_stale cannot compile",
    );
  });
});

describe("selectPacket seeds resume_contact_stale from the board row", () => {
  const selectPacketStart = page.indexOf("const selectPacket = useCallback");
  const openApplicationStart = page.indexOf("const openApplication = useCallback", selectPacketStart);

  test("the function under test is where it is expected to be", () => {
    assert.notEqual(selectPacketStart, -1, "expected selectPacket to still be declared here");
    assert.notEqual(openApplicationStart, -1, "expected openApplication right after it, as the scoping boundary");
  });

  const selectPacket = page.slice(selectPacketStart, openApplicationStart);

  test("the partial submission seed names resume_contact_stale alongside the other board-row fields", () => {
    const seedStart = selectPacket.indexOf("setSubmission(rememberedSubmission ?? (status");
    assert.notEqual(seedStart, -1, "expected the board-row submission seed inside selectPacket");
    const seedEnd = selectPacket.indexOf(": null));", seedStart);
    assert.notEqual(seedEnd, -1, "expected the seed's closing null branch");
    const seed = selectPacket.slice(seedStart, seedEnd);

    // Every field this seed already named before this change, still present: the fix must add a
    // field, not replace the mechanism that already threads the rest of the packet through.
    for (const existingField of [
      "application_id: packet.id",
      "submission_authority: packet.submission_authority",
      "submission_projection: packet.submission_projection",
      "cover_letter: packet.spec._cover_letter ?? null",
      "documents: documentsFromSpecMarks(packet.spec._documents)",
    ]) {
      assert.ok(seed.includes(existingField), `expected the pre-existing seed field ${JSON.stringify(existingField)}`);
    }

    assert.match(
      seed,
      /resume_contact_stale: packet\.resume_contact_stale,/,
      "the seed literal names every field it copies rather than spreading the packet - an unlisted "
      + "field is silently dropped, which is exactly how resume_contact_stale went missing here",
    );
  });

  test("the local `packet` this literal reads is GeneratedResume-typed, all the way back to the fetch", () => {
    // packet.resume_contact_stale only compiles, and only carries a real value, if every step
    // between the /resume/history fetch and this seed keeps the same GeneratedResume-typed row
    // rather than rebuilding a narrower one - which is exactly the class of bug a whitelist
    // literal (like the seed itself) can reintroduce at any link in the chain.
    assert.match(
      selectPacket,
      /const selectPacket = useCallback\(\(incoming: GeneratedResume\) => \{/,
      "the packet this function receives must still be GeneratedResume-typed",
    );
    assert.match(
      selectPacket,
      /const packet = qaMode === true \? packetCandidate : packetForSubmissionDisplay\(packetCandidate\);/,
      "the seed literal's `packet` must still come from packetForSubmissionDisplay, which spreads "
      + "its input rather than rebuilding it field by field",
    );
  });

  test("packetForSubmissionDisplay spreads its input and declares a GeneratedResume return, so it cannot narrow the row", () => {
    const fnStart = page.indexOf("function packetForSubmissionDisplay(packet: GeneratedResume): GeneratedResume {");
    assert.notEqual(fnStart, -1, "expected packetForSubmissionDisplay's exact signature");
    const fnEnd = page.indexOf("\nfunction ", fnStart + 1);
    assert.notEqual(fnEnd, -1, "expected a function boundary after packetForSubmissionDisplay");
    const body = page.slice(fnStart, fnEnd);

    assert.match(
      body,
      /if \(!storedReview\) return packet;/,
      "the no-op early return must still hand back the untouched packet",
    );
    assert.match(
      body,
      /return \{\s*\.\.\.packet,/,
      "the built return must still spread the input packet rather than listing only some of its fields",
    );
  });
});
