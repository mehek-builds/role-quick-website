import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalApplication, GeneratedResume } from "../../../lib/api.ts";
import {
  canonicalApplicationFromPacket,
  canonicalEnvelopeLegacyHydrationId,
  canonicalEnvelopeWithMissingLegacyHydration,
  linkedLegacyPacketFromCanonicalTrackerPacket,
  sendableLinkedPacketFromCanonicalEnvelope,
  unverifiedSubmissionLinkedPacketFromCanonicalEnvelope,
  withRestoredLinkedPackets,
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

test("an envelope with a linked packet reaches the managed screens even before READY", () => {
  /* Product decision by the owner, 2026-08-18: the dashboard is self-sufficient and the extension
     is separate software. Mercari and Belvedere are the measured shapes - review_state=ready with
     submission_state=not_started, a linked portal-supported packet behind each - and before this
     they routed to an attended detail whose only action demanded an extension build the store does
     not ship. The envelope's collapsed needs_attention status now restores the linked packet, so
     the managed answer/blocker and send screens carry the finish. */
  const packet = legacy();

  const notReady = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "not_started",
    review_state: "ready",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(notReady[0])?.id, packet.id);

  // ready, but no linked packet: a tracker-only row has nothing to send
  const noPacket = mergeCanonicalApplicationHistory([], [canonical({
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(noPacket[0]), null);

  // an ordinary legacy packet is not an envelope, so this returns null and the caller uses it directly
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(packet), null);

  // terminal states have nothing to finish, so they keep the canonical detail
  const submitted = mergeCanonicalApplicationHistory([legacy()], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "submitted",
    review_state: "submitted",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(submitted[0]), null);
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

/* DEEPGRAM 4bfd5827 AND NOTION a4b7295c, measured 2026-09-05: both canonical rows matched their
 * linked packet by job id rather than an explicit `legacy_generated_resume_id` link, and both
 * packets carried an unresolved `unverified_submission` on their review. `sendableLinkedPacketFrom
 * CanonicalEnvelope` correctly refuses a weak match like this - that refusal is what keeps a
 * duplicate posting from being offered Litos's own Send button - but CanonicalApplicationDetail
 * never fetches `/submission`, so the refusal also left the claim with no reachable resolution
 * anywhere in the dashboard. unverifiedSubmissionLinkedPacketFromCanonicalEnvelope is the narrower
 * admission: the same weak match, but only for a packet whose own claim needs looking at, and only
 * because that path can never reach a Send control either way. */
test("an unresolved unverified submission is reachable even on a weakly matched packet", () => {
  const packet = legacy({
    job_context: { company: "Deepgram", role: "Machine Learning Intern", job_id: "deepgram-req-9" },
  });
  packet.spec._review = {
    ...packet.spec._review!,
    status: "needs_attention",
    unverified_submission: {
      at: "2026-08-11T10:09:56.797Z",
      cause: "no_confirmation_state",
      portal_url: "https://job-boards.greenhouse.io/deepgram/example",
      submission_run_id: "65c86a0b-0000-4000-8000-000000000000",
      legacy_prose: true,
    },
  };
  const application = canonical({
    id: "canonical-deepgram",
    // No explicit link - this is exactly the measured shape. Matched below by shared job_id only.
    legacy_generated_resume_id: null,
    job_id: "deepgram-req-9",
    company: "Deepgram",
    role: "Machine Learning Intern",
  });
  const merged = mergeCanonicalApplicationHistory([packet], [application]);
  assert.equal(merged.length, 1, "the weak match must still attach the one packet");

  // The send-capable gate refuses it, exactly as it should - nothing about this test loosens that.
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(merged[0]), null);

  const restored = unverifiedSubmissionLinkedPacketFromCanonicalEnvelope(merged[0]);
  assert.equal(restored?.id, packet.id, "the restored packet must carry the LEGACY id, not the canonical one");
  assert.equal(canonicalApplicationFromPacket(restored), null, "the envelope marker must be gone, like the send-capable restore");
  assert.equal(restored?.spec._review?.unverified_submission?.legacy_prose, true);
});

/* CONFIRMED AGAINST THE PR HEAD, 2026-09-05: an EXPLICITLY linked packet (legacy_generated_resume_id
 * matches, not merely job id or portal URL) can reach `needs_attention` through
 * `reviewReachesManagedScreens` while its review still carries an unresolved `unverified_submission`.
 * Before this test's fix, `sendableLinkedPacketFromCanonicalEnvelope` had no idea that claim existed
 * and happily returned the packet as sendable - the card then showed a "Ready" chip and "Litos can
 * send this application for you... Continue to Litos's managed review and send screen" directly
 * above the "Waiting on you to look... Litos has a record of pressing Send" alert, two contradictory
 * claims about the same packet on the same card. The unresolved press must win: no sendable packet
 * until she resolves it, even though the strong link would otherwise clear every other gate. */
test("an explicitly linked packet with an unresolved unverified submission is never offered as sendable", () => {
  const packet = legacy();
  packet.spec._review = {
    ...packet.spec._review!,
    status: "needs_attention",
    unverified_submission: {
      at: "2026-08-11T10:09:56.797Z",
      cause: "no_confirmation_state",
      portal_url: "https://job-boards.greenhouse.io/haize/example",
      submission_run_id: "65c86a0b-0000-4000-8000-000000000000",
      legacy_prose: true,
    },
  };
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
  })]);
  assert.equal(merged.length, 1, "the explicit link must still attach the one packet");

  // The strong link would otherwise clear reviewReachesManagedScreens for needs_attention - the
  // unresolved press must suppress it anyway.
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(merged[0]), null);

  // The "Check and confirm" route stays open - that is the one true thing the card can still say.
  const restored = unverifiedSubmissionLinkedPacketFromCanonicalEnvelope(merged[0]);
  assert.equal(restored?.id, packet.id);
});

test("a resolved claim is not offered again, even on the same weak match", () => {
  const packet = legacy();
  packet.spec._review = {
    ...packet.spec._review!,
    status: "needs_attention",
    unverified_submission: {
      at: "2026-08-11T10:09:56.797Z",
      cause: "no_confirmation_state",
      resolution: "not_sent",
      resolved_at: "2026-08-20T00:00:00.000Z",
    },
  };
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({ job_id: null, legacy_generated_resume_id: null })]);
  // No shared identity at all here, so nothing attaches - confirms the negative case needs a real match.
  assert.equal(unverifiedSubmissionLinkedPacketFromCanonicalEnvelope(merged[0]), null);

  const matched = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
  })]);
  assert.equal(unverifiedSubmissionLinkedPacketFromCanonicalEnvelope(matched[0]), null, "a resolved claim has nothing left to check");
});

test("no linked packet, no unverified submission, no ordinary legacy packet: nothing to restore", () => {
  // Tracker-only row: canonicalTrackerPacket's placeholder never stamps canonical_legacy_packet_id.
  const noPacket = mergeCanonicalApplicationHistory([], [canonical()]);
  assert.equal(unverifiedSubmissionLinkedPacketFromCanonicalEnvelope(noPacket[0]), null);

  // A genuinely linked packet with nothing unresolved on it.
  const packet = legacy();
  const settled = mergeCanonicalApplicationHistory([packet], [canonical({ legacy_generated_resume_id: packet.id })]);
  assert.equal(unverifiedSubmissionLinkedPacketFromCanonicalEnvelope(settled[0]), null);

  // An ordinary legacy packet is not an envelope at all.
  assert.equal(unverifiedSubmissionLinkedPacketFromCanonicalEnvelope(packet), null);
});

/* CANONICAL DETAIL SHOWED THE EXTENSION-ONLY COPY FOR A PORTAL-SUPPORTED, READY-TO-SUBMIT PACKET.
 *
 * Measured on production 2026-08-20: a Databricks application had a linked legacy packet at
 * `ready_to_submit`, `portal_supported: true`, but the Tracker's own page load never attached that
 * packet during its merge - `/resume/history`'s bare call caps at fifty full specs, and on an
 * account queueing hundreds of applications the page it returned did not carry this row's packet at
 * all. `canonicalTrackerPacket` then built this row's `_review` from its packet-less placeholder,
 * which hardcodes `portal_supported: false`, so `sendableLinkedPacketFromCanonicalEnvelope` refused
 * it and the Tracker showed the same "install the extension" copy as a genuinely unsupported row -
 * with no way to reach the real send path at all.
 *
 * `canonicalEnvelopeLegacyHydrationId` is the fix's first half: it names the one packet worth
 * fetching by its EXACT id, the same fetch PR #383 already gave `ApplicationPacket` for packet
 * CONTENT, now used to decide the ROUTING before the Tracker ever commits to the attended detail. */
test("a canonical row naming a legacy packet the merge did not attach needs hydration", () => {
  const merged = mergeCanonicalApplicationHistory([], [canonical({
    legacy_generated_resume_id: "databricks-legacy-packet",
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  assert.equal(canonicalEnvelopeLegacyHydrationId(merged[0]), "databricks-legacy-packet");
});

test("a canonical row already correctly linked needs no hydration", () => {
  const packet = legacy();
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
  })]);
  assert.equal(canonicalEnvelopeLegacyHydrationId(merged[0]), null);
});

test("a canonical row with genuinely no linked packet needs no hydration", () => {
  // legacy_generated_resume_id is absent entirely: this is a real Free-fill row, not a gap in what
  // this page load happened to see, and there is nothing to fetch that would change the answer.
  const merged = mergeCanonicalApplicationHistory([], [canonical()]);
  assert.equal(canonicalEnvelopeLegacyHydrationId(merged[0]), null);
});

test("a weaker match that attached the wrong duplicate still asks for the packet the row actually names", () => {
  // canonicalMatchStrength's portal-URL match (strength 1) attaches SOME packet so the merge does
  // not fall back to the packet-less placeholder, but it is not the packet this canonical row's own
  // legacy_generated_resume_id names. Hydration must ask for the id the row names, not settle for
  // whatever the fuzzy match already attached.
  const duplicate = legacy({ id: "wrong-duplicate-packet" });
  const merged = mergeCanonicalApplicationHistory([duplicate], [canonical({
    legacy_generated_resume_id: "true-databricks-packet",
    portal_url: duplicate.spec._review?.portal_url,
  })]);
  assert.equal(linkedLegacyPacketFromCanonicalTrackerPacket(merged[0]), null, "the mismatched link must not be trusted as-is");
  assert.equal(canonicalEnvelopeLegacyHydrationId(merged[0]), "true-databricks-packet");
});

test("an ordinary legacy packet - not a canonical envelope at all - needs no hydration", () => {
  assert.equal(canonicalEnvelopeLegacyHydrationId(legacy()), null);
});

/* Finding 2, PR #386 review: a not-found hydration result was never persisted onto the packet, so
 * canonicalEnvelopeLegacyHydrationId kept naming the same doomed id forever. Any unrelated
 * setPackets call that rebuilt this row's object identity (canonicalTrackerPacket does, on every
 * merge) recomputed back to "needs hydration" and refetched an id that had already been proven
 * missing, which briefly re-flipped checkingSendPath to true mid-way through something else -
 * measured hiding the Fill button while an unrelated fill for the SAME row was already in flight. */
test("a hydration fetch that finds nothing settles the row, mirroring the found case", () => {
  const merged = mergeCanonicalApplicationHistory([], [canonical({
    legacy_generated_resume_id: "vanished-legacy-packet",
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  assert.equal(canonicalEnvelopeLegacyHydrationId(merged[0]), "vanished-legacy-packet");

  const settled = canonicalEnvelopeWithMissingLegacyHydration(merged[0], "vanished-legacy-packet");
  assert.equal(
    canonicalEnvelopeLegacyHydrationId(settled),
    null,
    "once a fetch has confirmed the named id does not exist, it must not be asked for again",
  );
});

test("a stale missing-hydration stamp does not mask a genuinely different id", () => {
  // If the canonical row's legacy_generated_resume_id ever changes (a re-link), a stamp recorded
  // against the OLD id must not suppress hydration of the NEW one.
  const merged = mergeCanonicalApplicationHistory([], [canonical({
    legacy_generated_resume_id: "second-legacy-packet",
    submission_state: "ready_to_submit",
    review_state: "ready_to_submit",
  })]);
  const staleStamp = canonicalEnvelopeWithMissingLegacyHydration(merged[0], "first-legacy-packet");
  assert.equal(canonicalEnvelopeLegacyHydrationId(staleStamp), "second-legacy-packet");
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

test("a restored linked packet is selectable by its legacy id", () => {
  /* Belvedere d1af1c97 -> packet 6fda0404, measured 2026-08-18: selectPacket restored the linked
     packet and selected the LEGACY id, and the lookup list only carried the envelope under the
     CANONICAL id, so the screen refused with "the saved list does not contain a packet with this
     id". Pre-canonical rows share one UUID between application and packet, which is why the gap
     never surfaced before a canonical row minted its own id. */
  const packet = legacy();
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "not_started",
    review_state: "ready",
  })]);
  const lookup = withRestoredLinkedPackets(merged);
  const found = lookup.find((entry) => entry.id === packet.id);
  assert.ok(found, "the legacy id must resolve in the lookup list");
  assert.equal(canonicalApplicationFromPacket(found), null, "the resolved entry is the restored packet, not the envelope");
  // the envelope itself stays present and untouched for every display consumer
  assert.ok(lookup.some((entry) => canonicalApplicationFromPacket(entry)));
  // a list with no envelopes is returned as-is
  assert.deepEqual(withRestoredLinkedPackets([packet]).map((entry) => entry.id), [packet.id]);
});

/* THE MAVEN ROW: a filled employer form that could not reach its send.
 *
 * Measured in prod 2026-09-02 on The Maven Group "Cyber Test Engineer". The packet was parked at
 * ready_for_final_approval with a preview screenshot, no blockers and no attention reason; the
 * canonical row it points at still read (submission_state not_started, review_state ready). The
 * flatten replaced the packet's status with needs_attention, so the detail screen drew "One thing
 * to finish" and no Send control, and 83 more applications sat behind the same demotion. */
function mavenPacket(): GeneratedResume {
  return legacy({
    id: "305dae5e-7d9b-41cf-a9a7-82dcc0a98f15",
    job_context: {
      company: "The Maven Group",
      role: "Cyber Test Engineer",
      job_id: "22222222-2222-4222-8222-222222222222",
    },
    spec: {
      _review: {
        jd_text: "",
        portal_url: "https://app.crelate.com/portal/mavengroup/apply",
        status: "ready_for_final_approval",
        preview_screenshot_url: "https://blob.test/preview.png",
        portal_supported: true,
        edited_terms: [],
        questions: [],
        skipped_reasons: [],
        updated_at: "2026-09-02T02:45:00.000Z",
      },
    } as unknown as GeneratedResume["spec"],
  });
}

function mavenCanonical(overrides: Partial<CanonicalApplication> = {}): CanonicalApplication {
  return canonical({
    id: "aa04b6ce-7e6c-4ca4-944c-0482031204cf",
    legacy_generated_resume_id: "305dae5e-7d9b-41cf-a9a7-82dcc0a98f15",
    company: "The Maven Group",
    role: "Cyber Test Engineer",
    portal_url: "https://app.crelate.com/portal/mavengroup/apply",
    tracker_state: "applying",
    review_state: "ready",
    submission_state: "not_started",
    ...overrides,
  });
}

test("a filled packet waiting on the applicant is not flattened to needs_attention", () => {
  const packet = mavenPacket();
  const merged = mergeCanonicalApplicationHistory([packet], [mavenCanonical()]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].spec._review?.status, "ready_for_final_approval");
  // The linked packet is still the one the managed screens route to.
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(merged[0])?.id, packet.id);
});

test("the canonical row's own prepared pair reads the same way", () => {
  // What the backend writes and heals once it projects the hold. Both fields must agree, exactly
  // as the legacy ready_to_submit pair does.
  const packet = mavenPacket();
  const merged = mergeCanonicalApplicationHistory([packet], [mavenCanonical({
    review_state: "ready_for_final_approval",
    submission_state: "ready_for_final_approval",
  })]);
  assert.equal(merged[0].spec._review?.status, "ready_for_final_approval");
});

test("the ledger still wins: a sent or failed row is never overridden by its packet", () => {
  // The refusal half. Without it this becomes a general "trust the packet" path, which is the
  // double-send hazard canonicalStatus exists to prevent.
  const packet = mavenPacket();
  for (const [overrides, expected] of [
    [{ submission_state: "submitted" as const }, "submitted"],
    [{ submission_state: "failed" as const }, "failed"],
    [{ review_state: "failed" as const }, "failed"],
  ] as const) {
    const merged = mergeCanonicalApplicationHistory([packet], [mavenCanonical(overrides)]);
    assert.equal(
      merged[0].spec._review?.status,
      expected,
      `a canonical ${expected} row must outrank its packet's prepared hold`,
    );
  }
});

test("a prepared packet reaches its send control without entering the Ready queue", async () => {
  const { reviewCanBeSent, statusMatchesApplicationFilter } = await import("./application-filter.ts");
  const merged = mergeCanonicalApplicationHistory([mavenPacket()], [mavenCanonical()]);
  const review = merged[0].spec._review!;
  // ready_for_final_approval is an ACTION status, so autopilot can never elect this row and the
  // Ready count cannot move. Importing these rather than restating them means the test breaks if
  // READY_STATUSES ever gains it.
  assert.equal(reviewCanBeSent(review), false);
  assert.equal(statusMatchesApplicationFilter(review, "ready"), false);
  assert.equal(statusMatchesApplicationFilter(review, "action"), true);
});

test("the guard is scoped to the prepared status, not to the presence of a packet", () => {
  // The three shapes from "readiness needs BOTH canonical fields" must still stay with the human
  // when the linked packet is not parked at ready_for_final_approval.
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
    assert.equal(merged[0].spec._review?.status, "needs_attention");
  }
});

test("an application with a live run reaches the screen that shows the live browser", () => {
  /* REGRESSION for a real orphaned run. DSI Innovations, 2026-09-02: Send pressed, run claimed,
     status 'submitting', Stratus streaming the company form into the live panel. A reload of the
     exact same deep link routed to the attended detail card, because MID_SUBMISSION_STATUSES named
     only the security-code pause. The one screen that shows what the browser changes to, including
     the confirmation reload, was reachable only from the tab that pressed Send; close it and no
     path on the page led back, while the card underneath invited a second fill against a held
     claim.

     Same argument as the code admission above, one step earlier: READY says a send may happen,
     these say one is happening. Refusing them cannot prevent a send, only blind one mid-flight. */
  for (const status of ["submit_requested", "preparing", "filling", "submitting", "submission_claimed"]) {
    const packet = legacy();
    packet.spec._review = { ...packet.spec._review!, status: status as never, portal_supported: true };
    const merged = mergeCanonicalApplicationHistory([packet], [canonical({
      legacy_generated_resume_id: packet.id,
      submission_state: "submitting",
      review_state: "submitting",
    })]);
    assert.equal(
      sendableLinkedPacketFromCanonicalEnvelope(merged[0])?.id,
      packet.id,
      `a '${status}' row must reach the managed screens`,
    );
  }
});

test("an unsupported portal mid-run still keeps the attended detail", () => {
  const packet = legacy();
  packet.spec._review = { ...packet.spec._review!, status: "submitting" as never, portal_supported: false };
  const merged = mergeCanonicalApplicationHistory([packet], [canonical({
    legacy_generated_resume_id: packet.id,
    submission_state: "submitting",
    review_state: "submitting",
  })]);
  assert.equal(sendableLinkedPacketFromCanonicalEnvelope(merged[0]), null);
});
