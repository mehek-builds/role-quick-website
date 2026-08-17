import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalApplication, GeneratedResume } from "../../../lib/api.ts";
import {
  canonicalApplicationFromPacket,
  linkedLegacyPacketFromCanonicalTrackerPacket,
  sendableLinkedPacketFromCanonicalEnvelope,
  mergeCanonicalApplicationHistory,
  upsertCanonicalApplicationHistory,
} from "./canonical-tracker.ts";

function legacy(overrides: Partial<GeneratedResume> = {}): GeneratedResume {
  return {
    id: "legacy-resume",
    job_context: {
      company: "Acme",
      role: "Product Intern",
      job_id: "11111111-1111-4111-8111-111111111111",
    },
    spec: {
      _review: {
        jd_text: "",
        portal_url: "https://jobs.lever.co/acme/requisition-1",
        status: "resume_ready",
        edited_terms: [],
        questions: [],
        skipped_reasons: [],
        updated_at: "2026-08-13T00:00:00.000Z",
      },
    } as unknown as GeneratedResume["spec"],
    created_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function canonical(overrides: Partial<CanonicalApplication> = {}): CanonicalApplication {
  return {
    id: "canonical-application",
    legacy_generated_resume_id: null,
    job_id: null,
    company: "Acme",
    role: "Product Intern",
    portal_url: "https://jobs.lever.co/acme/requisition-2",
    tracker_state: "applying",
    review_state: "filling",
    submission_state: "not_started",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

test("canonical-only Free fills become visible Tracker rows that cannot enter autopilot", () => {
  const merged = mergeCanonicalApplicationHistory([], [canonical()]);
  assert.equal(merged.length, 1);
  const application = canonicalApplicationFromPacket(merged[0]);
  assert.equal(application?.id, "canonical-application");
  assert.equal(merged[0].spec._review?.status, "needs_attention");
  assert.equal(merged[0].spec._review?.portal_url, "https://jobs.lever.co/acme/requisition-2");
});

test("the canonical envelope retains linked packet data without a duplicate", () => {
  const packet = legacy();
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    company: "Renamed company",
    role: "Renamed role",
    portal_url: "https://example.com/different",
  })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "canonical-application");
  assert.equal(merged[0].spec._review?.status, "needs_attention");
  assert.equal(canonicalApplicationFromPacket(merged[0])?.id, "canonical-application");
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0])?.id, packet.id);
});

test("a submitted canonical application owns the linked packet lifecycle and visible id", () => {
  const packet = legacy({
    download_url: "https://files.example/resume.pdf",
  });
  const application = canonical({
    legacy_generated_resume_id: packet.id,
    tracker_state: "applied",
    review_state: "submitted",
    submission_state: "submitted",
  });

  const merged = mergeCanonicalApplicationHistory([packet], [application]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, application.id);
  assert.equal(merged[0].spec._review?.status, "submitted");
  assert.equal(merged[0].download_url, packet.download_url);
  assert.equal(canonicalApplicationFromPacket(merged[0])?.tracker_state, "applied");
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0])?.id, packet.id);
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0])?.spec._review?.status, "submitted");
});

test("exact job and portal identities dedupe during a rolling migration", () => {
  const packet = legacy();
  assert.equal(mergeCanonicalApplicationHistory([packet], [canonical({
    job_id: packet.job_context.job_id,
  })]).length, 1);
  assert.equal(mergeCanonicalApplicationHistory([packet], [canonical({
    portal_url: `${packet.spec._review?.portal_url}/?utm_source=litos#apply`,
  })]).length, 1);
});

test("same company and role do not collapse distinct portal requisitions", () => {
  const merged = mergeCanonicalApplicationHistory([legacy()], [canonical()]);
  assert.equal(merged.length, 2);
  assert.equal(canonicalApplicationFromPacket(merged[1])?.id, "canonical-application");
});

test("canonical rows with no stronger identity use company and role only as a last resort", () => {
  const packet = legacy({
    job_context: { company: "Acme Inc.", role: "Product Intern", job_id: null },
    spec: {
      _review: {
        jd_text: "",
        status: "resume_ready",
        edited_terms: [],
        questions: [],
        skipped_reasons: [],
        updated_at: "2026-08-13T00:00:00.000Z",
      },
    } as unknown as GeneratedResume["spec"],
  });
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    job_id: null,
    company: "ACME, Inc",
    role: "Product Intern",
    portal_url: null,
  })]);
  assert.equal(merged.length, 1);
});

test("a Tracker retry replaces canonical state without duplicating the row", () => {
  const initial = mergeCanonicalApplicationHistory([], [canonical({ review_state: "not_started" })]);
  const updated = upsertCanonicalApplicationHistory(initial, canonical({ review_state: "filling" }));
  assert.equal(updated.length, 1);
  assert.equal(canonicalApplicationFromPacket(updated[0])?.review_state, "filling");
});

test("a canonical lifecycle refresh keeps the linked packet while changing its visible status", () => {
  const packet = legacy();
  const initial = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
  })]);
  const updated = upsertCanonicalApplicationHistory(initial, canonical({
    legacy_generated_resume_id: packet.id,
    tracker_state: "applied",
    review_state: "submitted",
    submission_state: "submitted",
  }));

  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "canonical-application");
  assert.equal(updated[0].spec._review?.status, "submitted");
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(updated[0])?.id, packet.id);
});

test("a canonical row that declares itself ready reaches the Ready queue", () => {
  /* Measured on production 2026-08-17. DRW and Databricks carry submission_state=ready_to_submit AND
     review_state=ready_to_submit on the CANONICAL row, agreeing with their linked packet rather than
     contradicting it, and the Tracker still reported "0 ready to send" over them with no reachable
     send control. */
  const packet = legacy();
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
    tracker_state: "saved",
  })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].spec._review?.status, "ready_to_submit");
  // The linked packet is still reachable, so opening it still routes to the packet's own id.
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0])?.id, packet.id);
});

test("readiness needs BOTH canonical fields, not review_state alone", () => {
  /* The adversary that can win, and it is a real row rather than an invention: Mercari and Jump
     Trading both carry review_state=ready while submission_state says not_started. Those two DO have
     a next human step, and promoting them would send an application the ledger never called ready.
     A fix keyed on review_state alone passes the test above and breaks these. */
  const packet = legacy();
  for (const overrides of [
    { submission_state: "not_started" as const, review_state: "ready" as const },
    { submission_state: "not_started" as const, review_state: "ready_to_submit" as const },
    { submission_state: "ready_to_submit" as const, review_state: "filling" as const },
  ]) {
    const merged = mergeCanonicalApplicationHistory([packet], [canonical({
      legacy_generated_resume_id: packet.id,
      ...overrides,
    })]);
    assert.equal(
      merged[0].spec._review?.status,
      "needs_attention",
      `${overrides.submission_state}/${overrides.review_state} must stay with the human`,
    );
  }
});

test("a canonical row with no linked packet can never be sent, even when it says ready", () => {
  // portal_supported is false on the packet-less branch, and reviewCanBeSent requires it not be
  // false, so there is nothing to send and the promotion above cannot reach it.
  const merged = mergeCanonicalApplicationHistory([], [canonical({
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  assert.equal(merged[0].spec._review?.portal_supported, false);
});

test("a READY envelope restores its linked packet so it can be reviewed and sent", () => {
  const packet = legacy();
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  const sendable = sendableLinkedPacketFromCanonicalEnvelope(merged[0]);
  // The restored packet carries the LEGACY id, which is what the review/audit/submit routes take.
  assert.equal(sendable?.id, packet.id);
  assert.equal(canonicalApplicationFromPacket(sendable), null, "the envelope marker must be gone");
});

test("an envelope that is not ready keeps the attended path", () => {
  /* THE ADVERSARY THAT CAN WIN. These are real production rows, not inventions: Mercari and Jump
     Trading carry review_state=ready with submission_state=not_started, and a tracker-only Free fill
     has no packet at all. Each one must return null, because each still has a genuine human step and
     routing it to the submission endpoints would send an application the ledger never called ready. */
  const packet = legacy();

  // not ready on the canonical row
  const notReady = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "not_started",
    review_state: "ready",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(notReady[0]), null);

  // ready, but no linked packet: a tracker-only row has nothing to send
  const noPacket = mergeCanonicalApplicationHistory([], [canonical({
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(noPacket[0]), null);

  // an ordinary legacy packet is not an envelope, so this returns null and the caller uses it directly
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(packet), null);
});

test("a READY envelope on an unsupported portal is still refused", () => {
  /* portal_supported is the SERVER's answer to whether Litos may press this family's Send. The client
     must never decide a portal is autonomous on its own, so a false here outranks a ready lifecycle. */
  const packet = legacy();
  packet.spec._review = { ...packet.spec._review!, portal_supported: false };
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(merged[0]), null);
});

/* This helper mints a NEW object every call, so it must never be a React dependency unmemoised.
 *
 * It ends in `{ ...restored, id: legacyId }`. On 2026-08-17 the applications dashboard computed
 * canonicalGeneratedPacket from it as a bare const and then listed that const in a useEffect
 * dependency array. The effect fetched the cover letter, its .then set state, the re-render minted
 * another object, and the effect refired: GET /applications/<id>/cover-letter about once a second,
 * 16,567 requests in 45 minutes from a single open tab, every one a 200. It drained the account's
 * shared rate limit and unrelated reads began answering 429.
 *
 * The fix was useMemo at the call site. This test states the property that makes that necessary, so
 * the next caller learns it here rather than from a production log. */
test("the linked-packet helper returns a fresh object each call, so callers must memoise", () => {
  const packet = legacy();
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
  })]);

  const first = linkedLegacyPacketFromCanonicalTrackerPacket(merged[0]);
  const second = linkedLegacyPacketFromCanonicalTrackerPacket(merged[0]);

  assert.equal(first?.id, packet.id);
  assert.equal(second?.id, packet.id);
  assert.deepEqual(first, second, "same inputs must still describe the same packet");
  assert.notEqual(first, second, "identity is NOT stable: a bare useEffect dependency would loop");
});

test("an application awaiting its security code reaches the screen that can enter it", () => {
  /* REGRESSION for a real stranded application. Jane Street, 2026-08-17: the row submitted,
     Greenhouse emailed an 8-character code to the packet alias, and the Tracker routed the row to
     the attended-handoff detail because reviewCanBeSent does not list awaiting_security_code. The one
     screen carrying the code entry was unreachable, so a SUBMITTED application could not be finished.

     This admission is strictly safer than READY: READY says a send may happen, this says one already
     did. Refusing it cannot prevent a send, only abandon one mid-flight. */
  const packet = legacy();
  packet.spec._review = { ...packet.spec._review!, status: "awaiting_security_code", portal_supported: true };
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "awaiting_security_code",
    review_state: "awaiting_security_code",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(merged[0])?.id, packet.id);
});

test("an unsupported portal awaiting a code is still refused", () => {
  // A portal Litos may not submit on has no code step to finish, so it keeps the attended handoff.
  const packet = legacy();
  packet.spec._review = { ...packet.spec._review!, status: "awaiting_security_code", portal_supported: false };
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "awaiting_security_code",
    review_state: "awaiting_security_code",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(merged[0]), null);
});

test("an explicit link beats a newer duplicate sharing the posting URL", () => {
  /* REGRESSION for a real mis-pairing. The owner account holds TWO Jane Street packets for one
     posting: cf2b1055 (created 08-16) and 496cff97 (created 08-14, the one that actually submitted
     and carried the employer's security code). Both normalize to the same portal URL, and `legacy`
     arrives newest-first, so findIndex bound the canonical row to the NEWER packet and the submitted
     packet's state was invisible in the Tracker. 41 rows on this account carry the DUPLICATE badge. */
  const portal = "https://boards.greenhouse.io/janestreet/jobs/777";
  const newerDuplicate = legacy({ id: "packet-newer" });
  newerDuplicate.spec._review = { ...newerDuplicate.spec._review!, portal_url: portal };
  const submitted = legacy({ id: "packet-submitted" });
  submitted.spec._review = { ...submitted.spec._review!, portal_url: portal };

  // Newest first, exactly as /resume/history returns them.
  const merged = mergeCanonicalApplicationHistory([newerDuplicate, submitted], [canonical({
    legacy_generated_resume_id: submitted.id,
    portal_url: portal,
  })]);

  const envelope = merged.find((p) => canonicalApplicationFromPacket(p));
  assert.ok(envelope, "the canonical row produced no envelope");
  assert.equal(
    linkedLegacyPacketFromCanonicalTrackerPacket(envelope)?.id,
    submitted.id,
    "the explicitly linked packet must win over a newer one sharing only the portal URL",
  );
});

test("among equally weak matches the newest still wins", () => {
  // No explicit link on either side, so nothing outranks anything: keep the prior behaviour rather
  // than reshuffling rows for no reason.
  const portal = "https://boards.greenhouse.io/acme/jobs/5";
  const newer = legacy({ id: "packet-newer" });
  newer.spec._review = { ...newer.spec._review!, portal_url: portal };
  const older = legacy({ id: "packet-older" });
  older.spec._review = { ...older.spec._review!, portal_url: portal };
  const merged = mergeCanonicalApplicationHistory([newer, older], [canonical({ portal_url: portal })]);
  const envelope = merged.find((p) => canonicalApplicationFromPacket(p));
  /* Asserted on the pairing marker, not on linkedLegacyPacketFromCanonicalTrackerPacket: that restore
     deliberately requires an explicit legacy_generated_resume_id, and this fixture has none - that is
     what makes it the WEAK case. The marker is what records which packet the merge chose. */
  assert.equal(
    (envelope as { canonical_legacy_packet_id?: string } | undefined)?.canonical_legacy_packet_id,
    newer.id,
  );
});
