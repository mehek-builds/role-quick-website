import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/dashboard/applications/page.tsx"),
  "utf8",
);

const saveStart = source.indexOf("async function saveResume()");
const continueStart = source.indexOf("async function continueFromResume()", saveStart);
const verifiedStart = source.indexOf("async function continueFromVerifiedPacket()", continueStart);
const saveResume = source.slice(saveStart, continueStart);
const continueFromResume = source.slice(continueStart, verifiedStart);

test("a successful save adopts the server canonical spec only for the application still selected", () => {
  assert.ok(saveStart >= 0 && continueStart > saveStart, "save and audit functions must remain discoverable");
  assert.match(saveResume, /const applicationId = selected\.id;/);
  assert.match(saveResume, /const savedSpec = stripMetadata\(updated\.spec\);/);
  assert.match(saveResume, /if \(selectedIdRef\.current !== applicationId\) return null;\s*setSpec\(savedSpec\);/s);
  assert.match(saveResume, /return savedSpec;/);
});

test("the audit binds the exact saved spec instead of the stale request copy", () => {
  assert.ok(continueStart >= 0 && verifiedStart > continueStart, "audit function must remain discoverable");
  assert.match(continueFromResume, /const auditedSpec = packetDraftChanged \? await saveResume\(\) : spec;/);
  assert.match(continueFromResume, /if \(!auditedSpec \|\| selectedIdRef\.current !== applicationId\) return;/);
  assert.match(continueFromResume, /specJson: JSON\.stringify\(auditedSpec\)/);
  assert.doesNotMatch(continueFromResume, /specJson: JSON\.stringify\(spec\)/);
});

test("a ready packet with a real edit is saved, while an unchanged packet avoids a no-op PATCH", () => {
  assert.match(continueFromResume, /const auditedSpec = packetDraftChanged \? await saveResume\(\) : spec;/);
  assert.doesNotMatch(continueFromResume, /alreadyFilled \? spec : await saveResume\(\)/);
});

test("a selection change stops every post-save route from installing the wrong packet", () => {
  const guards = continueFromResume.match(/selectedIdRef\.current !== applicationId/g) ?? [];
  assert.ok(guards.length >= 3, "save, review, and audit awaits must each re-check the selected application");
  assert.match(continueFromResume, /const response = await api<PacketAuditResponse>[\s\S]+?if \(selectedIdRef\.current !== applicationId\) return;\s*const auditedReview/);
  assert.match(saveResume, /catch \(reason\) \{\s*if \(selectedIdRef\.current === applicationId\)/s);
  assert.match(continueFromResume, /catch \(reason\) \{\s*if \(selectedIdRef\.current !== applicationId\) return;/s);
});
