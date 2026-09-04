import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgePacketEvidence,
  reconcilePacketEvidenceAfterResumeRegeneration,
  reconcilePacketEvidenceWithSubmission,
  reconcilePacketPdfVerification,
  type PacketEvidenceSession,
} from "./packet-evidence-session.ts";

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

/* THE GAP reconcilePacketEvidenceAfterResumeRegeneration CLOSES, PINNED DIRECTLY.
 *
 * POST /applications/:id/resume/contact-refresh (volley-backend PR #945) regenerates the resume PDF
 * but deliberately leaves `_review.packet_audit` untouched - see that function's own doc comment for
 * the route's exact wording. Handed that unchanged audit, the identity-diffing reconcile above
 * cannot tell a regeneration happened at all: it compares the exact same bytes it already cached
 * against itself and reports a match, so a stale acknowledgement survives a PDF that has already
 * changed underneath it. This is not a bug in reconcilePacketEvidenceWithSubmission - the audit
 * really has not moved yet, by the backend's own design - which is exactly why a second, narrower
 * function exists for this one event rather than teaching the identity diff to see something it
 * structurally cannot. */
test("the identity-diffing reconcile alone cannot see a resume regeneration - the gap the new function closes", () => {
  // session() returns `never` (see its own definition above) so every other test in this file can
  // pass it straight into a PacketEvidenceSession | null parameter with no per-call cast. This is
  // the first test that needs to read a field back off it, which a `never` cannot do - `never` is
  // assignable to any type, including this one, so an explicit annotation is enough.
  const acknowledged: PacketEvidenceSession = session({ acknowledged: true });
  const unchangedAudit = acknowledged.response.packet_audit;
  assert.equal(
    reconcilePacketEvidenceWithSubmission(acknowledged, "app-1", [], unchangedAudit),
    acknowledged,
    "an audit that is byte-identical to what was already cached reads as a match, even though the"
    + " PDF behind it may already have been regenerated - refreshResumeContact must not rely on this"
    + " call alone",
  );
});

describe("reconcilePacketEvidenceAfterResumeRegeneration", () => {
  test("a regeneration clears cached evidence for that packet outright, acknowledged or not", () => {
    assert.equal(reconcilePacketEvidenceAfterResumeRegeneration(session({ acknowledged: true }), "app-1"), null);
    assert.equal(reconcilePacketEvidenceAfterResumeRegeneration(session({ acknowledged: false }), "app-1"), null);
  });

  test("evidence cached for a different packet is untouched - this event is not about it", () => {
    const other = session({ applicationId: "app-2", acknowledged: true });
    assert.equal(reconcilePacketEvidenceAfterResumeRegeneration(other, "app-1"), other);
  });

  test("nothing cached is a no-op, not a crash", () => {
    assert.equal(reconcilePacketEvidenceAfterResumeRegeneration(null, "app-1"), null);
  });
});
