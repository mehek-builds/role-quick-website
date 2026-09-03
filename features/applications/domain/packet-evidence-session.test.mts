import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgePacketEvidence, reconcilePacketPdfVerification } from "./packet-evidence-session.ts";

/* THE TWO FUNCTIONS THE SEND GATE RESTS ON, AND THEY HAD NO DIRECT TEST.
 *
 * Both surfaces that can reach an employer - the dashboard and the /start review screen - decide
 * whether the applicant has approved this exact packet by asking these. Until now they were covered
 * only sideways, through one happy-path browser walk, which is the coverage shape that cannot see a
 * revocation being silently restored. Every case below is a way the approval could outlive the proof
 * it was given to.
 */

const DIGEST = "a".repeat(64);
const SHA = "b".repeat(64);

function session(overrides = {}) {
  return {
    applicationId: "app-1",
    specJson: '{"school":"USC"}',
    questionsSnapshot: "[]",
    pdfVerified: true,
    acknowledged: false,
    serverRevalidatedAt: null,
    response: {
      packet_audit: {
        version: "packet_audit_v2",
        audit_digest: DIGEST,
        packet_version: "c".repeat(64),
        identities: { resume_email: "her@example.com", applicant_email: "apply.app-1@litos.email" },
        bindings: {
          ownerSha256: "d".repeat(64),
          applicationId: "app-1",
          jdSha256: "e".repeat(64),
          specSha256: "f".repeat(64),
          jobContextSha256: "0".repeat(64),
          questionsSha256: "1".repeat(64),
          applicantSnapshotSha256: "2".repeat(64),
          resumeContactEmailSha256: "3".repeat(64),
          applicantEmailSha256: "4".repeat(64),
          pdf: { objectKey: "users/u/resumes/app-1.pdf", sha256: SHA, sizeBytes: 3256 },
          employerDelivery: { version: "employer_delivery_v1", mode: "browser", sha256: "5".repeat(64) },
        },
      },
      pdf: { object_key: "users/u/resumes/app-1.pdf", sha256: SHA, size_bytes: 3256, download_url: "/resume/download?t=x" },
    },
    ...overrides,
  } as never;
}

const verification = { auditDigest: DIGEST, sha256: SHA, sizeBytes: 3256 };

test("a matching verification is a bail-out, not a new object", () => {
  const current = session();
  assert.equal(reconcilePacketPdfVerification(current, verification), current);
});

test("a verification for different bytes revokes the proof and the approval with it", () => {
  for (const wrong of [
    { ...verification, sha256: "9".repeat(64) },
    { ...verification, sizeBytes: 3257 },
    { ...verification, auditDigest: "9".repeat(64) },
    null,
  ]) {
    const next = reconcilePacketPdfVerification(session({ acknowledged: true }), wrong);
    assert.equal(next?.pdfVerified, false);
    assert.equal(next?.acknowledged, false, "an approval must not survive the bytes it was given to");
  }
});

test("acknowledging needs proof on both the live evidence and the snapshot that was pressed on", () => {
  const pressed = session();
  assert.ok(acknowledgePacketEvidence(pressed, pressed), "a verified packet is acknowledgeable");
  assert.equal(
    acknowledgePacketEvidence(session({ pdfVerified: false }), pressed),
    null,
    "a revocation that lands during the acknowledge round trip must refuse the send",
  );
  assert.equal(acknowledgePacketEvidence(null, pressed), null);
});

test("acknowledging refuses when the live evidence stopped naming the packet that was pressed on", () => {
  const pressed = session();
  assert.equal(acknowledgePacketEvidence(session({ applicationId: "app-2" }), pressed), null);
  assert.equal(acknowledgePacketEvidence(session({ specJson: '{"school":"UCLA"}' }), pressed), null);
  assert.equal(acknowledgePacketEvidence(session({ questionsSnapshot: '[{"id":"q1"}]' }), pressed), null);
});

test("the acknowledged session drops any stale server revalidation stamp", () => {
  const acknowledged = acknowledgePacketEvidence(session({ serverRevalidatedAt: 123 }), session());
  assert.equal(acknowledged?.acknowledged, true);
  assert.equal(acknowledged?.serverRevalidatedAt, null);
});
