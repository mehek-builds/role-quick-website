import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ISSUE: on /dashboard/applications, "Open tailored packet" on a Tracker row older than
 * `/resume/history`'s 50-full-spec cap opened ApplicationPacket with a placeholder spec - no
 * `_contact`, no `experience` - and the component rendered it straight through `stripMetadata`,
 * which defaults the missing fields rather than throwing. The result was a resume box with nothing
 * in it: no error, no console warning, no loading state, nothing to tell the student their real
 * packet had not loaded.
 *
 * Static, in the style of tests/packet-dialog-accessibility.test.mjs: these assertions pin that the
 * hydration path exists in source, not that it behaves correctly at runtime (features/applications/
 * domain/packet-stub-detection.test.mts covers the actual stub-detection logic against real input).
 */
const source = await readFile(new URL("../components/app/ApplicationPacket.tsx", import.meta.url), "utf8");

test("ApplicationPacket detects a stub packet before rendering it", () => {
  assert.match(source, /isStubPacketSpec\(packet\.spec\)/, "must check the packet it was actually given, not a copy");
});

test("a detected stub triggers a re-fetch of the real spec, keyed to the packet", () => {
  assert.match(source, /api<\{ resumes: GeneratedResume\[\] \}>\(`\/resume\/history\?application=\$\{encodeURIComponent\(hydrationId\)\}`\)/);
  // Prefers the canonical envelope's own link to the legacy packet, which is the id that survives
  // for an application whose canonical id and legacy packet id genuinely differ.
  assert.match(source, /canonicalApplicationFromPacket\(packet\)\?\.legacy_generated_resume_id \|\| packet\.id/);
  // Re-runs whenever the packet identity changes, so switching from one stub straight to another
  // (no unmount in between) does not keep showing the first fetch's result.
  assert.match(source, /\}, \[packet\.id, stub\]\);/);
});

test("neither the loading wait nor a failed fetch falls through to a blank resume box", () => {
  // The three-way branch: mid-fetch, fetch found nothing, or a real spec to draw. `stripMetadata`
  // only ever runs in the third branch now.
  assert.match(source, /stub && !hydratedPacket && !hydrationFailed \?/, "must show something while the fetch is in flight");
  assert.match(source, /stub && !hydratedPacket && hydrationFailed \?/, "must show something when the fetch finds nothing");
  assert.match(source, /Litos could not load the resume for this application/);
  assert.match(source, /stripMetadata\(contentPacket\.spec\)/, "the real render path must read the hydrated packet, not the original stub");
});

test("a fetched spec is re-checked before being trusted", () => {
  // A resume that fetches back as its own stub (e.g. `/resume/history` genuinely has nothing under
  // this id) must not be swapped in as though it were real content.
  assert.match(source, /full && !isStubPacketSpec\(full\.spec\)/);
});

test("status and the submission timeline stay pinned to the packet's own review, not the hydrated one", () => {
  // canonical-tracker.ts already resolves the canonical row's status as authoritative over a linked
  // packet's own (see canonicalStatus there). Swapping in a hydrated packet's older review wholesale
  // would silently undo that resolution on exactly the packets it protects.
  assert.match(source, /status: review\.status,/);
  assert.match(source, /submitted_at: review\.submitted_at,/);
});

test("the download link and resume timestamp follow the same hydrated-or-original packet the resume itself draws from", () => {
  assert.match(source, /contentPacket\.download_url && contentPacket\.download_url !== "#"/);
  assert.match(source, /formatMoment\(contentPacket\.created_at\)/);
});
