import type { CanonicalApplication, GeneratedResume } from "../../../lib/api.ts";
import { reviewCanBeSent } from "./application-filter.ts";

/** A canonical Tracker row may carry a linked generated packet. These markers are local
 * presentation state, never sent back to either API. The public id and lifecycle always belong to
 * the canonical ledger, while the linked id lets an explicit packet action reach the legacy route. */
export type CanonicalTrackerPacket = GeneratedResume & {
  canonical_application: CanonicalApplication;
  canonical_legacy_packet_id?: string;
};

export function canonicalApplicationFromPacket(
  packet: GeneratedResume | null | undefined,
): CanonicalApplication | null {
  const candidate = (packet as Partial<CanonicalTrackerPacket> | null | undefined)?.canonical_application;
  return candidate?.id === packet?.id ? candidate ?? null : null;
}

/** Restore the linked packet's route identity without discarding the canonical lifecycle copied
 * into its review. This is used only after the user explicitly opens or edits packet content. */
export function linkedLegacyPacketFromCanonicalTrackerPacket(
  packet: GeneratedResume | null | undefined,
): GeneratedResume | null {
  const candidate = packet as Partial<CanonicalTrackerPacket> | null | undefined;
  const canonical = canonicalApplicationFromPacket(packet);
  const legacyId = candidate?.canonical_legacy_packet_id;
  if (!canonical || !legacyId || canonical.legacy_generated_resume_id !== legacyId) return null;

  const restored = { ...packet } as Partial<CanonicalTrackerPacket>;
  delete restored.canonical_application;
  delete restored.canonical_legacy_packet_id;
  return { ...(restored as GeneratedResume), id: legacyId };
}

/**
 * The linked legacy packet a READY canonical envelope may be reviewed and sent through, or null.
 *
 * `selectPacket` refuses to hand a canonical envelope to the review, audit or submission endpoints,
 * and that refusal is correct for the ordinary envelope: its own detail owns the portal handoff. But
 * the same comment names the exception - "an explicit packet action first restores the linked
 * packet's legacy route id" - and this is that restore, narrowed to one shape.
 *
 * Three conditions, all required, and each one is doing work:
 *
 *  1. A LINKED PACKET must exist and its id must match the canonical row's own
 *     `legacy_generated_resume_id`. `linkedLegacyPacketFromCanonicalTrackerPacket` enforces that, so a
 *     tracker-only row - one with no packet, added by hand or by a Free fill - can never reach here.
 *  2. `reviewCanBeSent` must accept the review. That is the SAME predicate the Ready filter uses, so
 *     what this permits is exactly what the Tracker labels READY, and the two cannot drift into the
 *     UI promising a send it will not perform.
 *  3. `portal_supported` must not be false, which `reviewCanBeSent` already requires. That is the
 *     server's own answer to whether Litos may press this family's Send, so the client never decides
 *     a portal is autonomous on its own.
 *
 * What stays refused: every envelope that is not ready, every tracker-only row, and every row on a
 * portal the server did not mark supported. Those keep the attended handoff, which is the whole point
 * of the guard this narrows.
 *
 * AND ONE STATE PAST READY: `awaiting_security_code`.
 *
 * This was missed when the function was first written, and it stranded a real application. A packet
 * in that state is not merely eligible to be sent - LITOS HAS ALREADY PRESSED SUBMIT, and the
 * employer answered by emailing a code that must be entered on the same page before the application
 * is filed. Measured on Jane Street 2026-08-17: the row submitted, Greenhouse emailed an 8-character
 * code to the packet alias, and the Tracker then routed the row to the attended-handoff detail
 * because `reviewCanBeSent` does not list that status. The one screen carrying the code entry -
 * SubmissionScreen, which renders it on `review.status === 'awaiting_security_code'` - was
 * unreachable, so a submitted application could not be finished from the dashboard at all.
 *
 * It is a strictly safer admission than READY, not a looser one: READY says a send MAY happen, this
 * says one already did. Refusing it cannot prevent a send; it can only abandon one mid-flight.
 */
const MID_SUBMISSION_STATUSES = ['awaiting_security_code'];

function reviewIsMidSubmission(review: GeneratedResume['spec']['_review']): boolean {
  return MID_SUBMISSION_STATUSES.includes(review?.status ?? '')
    // The same server-owned answer the READY path defers to. A portal Litos may not submit on has no
    // code step to finish, so an unsupported row stays with the attended handoff either way.
    && review?.portal_supported !== false;
}

export function sendableLinkedPacketFromCanonicalEnvelope(
  packet: GeneratedResume | null | undefined,
): GeneratedResume | null {
  if (!canonicalApplicationFromPacket(packet)) return null;
  if (!reviewCanBeSent(packet?.spec._review) && !reviewIsMidSubmission(packet?.spec._review)) return null;
  return linkedLegacyPacketFromCanonicalTrackerPacket(packet);
}

function normalizedPortal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function legacyMatchesCanonical(packet: GeneratedResume, application: CanonicalApplication): boolean {
  if (packet.id === application.id) return true;
  if (application.legacy_generated_resume_id === packet.id) return true;

  const applicationJobId = application.job_id?.trim();
  const packetJobId = packet.job_context.job_id?.trim();
  if (applicationJobId && packetJobId && applicationJobId === packetJobId) return true;

  const applicationPortal = normalizedPortal(application.portal_url);
  const packetPortal = normalizedPortal(packet.spec._review?.portal_url);
  if (applicationPortal && packetPortal) return applicationPortal === packetPortal;

  // Company and role are a last resort only when neither side has a stronger identity. Using this
  // fallback while either row has a portal would collapse two real requisitions with the same title.
  if (applicationJobId || packetJobId || applicationPortal || packetPortal) return false;
  return normalizedText(application.company) === normalizedText(packet.job_context.company)
    && normalizedText(application.role) === normalizedText(packet.job_context.role);
}

function canonicalStatus(application: CanonicalApplication): "submitted" | "failed" | "ready_to_submit" | "needs_attention" {
  if (application.submission_state === "submitted") return "submitted";
  if (
    application.submission_state === "failed"
    || application.review_state === "failed"
    || application.tracker_state === "failed"
  ) return "failed";
  /* THE CANONICAL ROW'S OWN READY STATE IS NOT A STALE PACKET STATUS, and conflating the two hid
   * every sendable application on the owner account.
   *
   * The rule below is right, and its wording is precise: a record must not enter the Ready queue
   * "merely because a LINKED PACKET still carries an older status". That guards against trusting a
   * packet the canonical ledger has since moved past. It says nothing about the canonical row
   * declaring readiness itself, and until now this function could not express that difference,
   * because it only ever read submission_state for "submitted" and "failed".
   *
   * Measured on production 2026-08-17, and the two shapes are cleanly separable:
   *
   *   DRW / Databricks   submission_state=ready_to_submit  review_state=ready_to_submit  -> READY
   *   Mercari / Jump     submission_state=not_started      review_state=ready            -> needs you
   *
   * The first pair is inside the send workflow on the CANONICAL row's own evidence, agreeing with
   * its packet rather than contradicting it. Collapsing it to needs_attention made the Tracker say
   * "0 ready to send" over applications the backend would accept, with no way to reach a send
   * control - the dashboard reporting a human step that nothing was actually waiting on.
   *
   * Both fields must agree before this returns ready. review_state alone is not enough: Mercari and
   * Jump both carry review_state=ready while their submission_state says not_started, and those two
   * genuinely do have a next human step.
   *
   * A canonical row with NO linked packet cannot reach the queue through this either - that branch
   * in canonicalTrackerPacket sets portal_supported: false, and reviewCanBeSent requires it not be
   * false. So this only ever promotes a row that owns a real prepared packet. */
  if (application.submission_state === "ready_to_submit" && application.review_state === "ready_to_submit") {
    return "ready_to_submit";
  }
  // A canonical record outside the legacy send workflow always has a next human step: open the
  // employer form, review the fill, or press the final submit control. It must never enter the
  // Ready/autopilot packet queue merely because a linked packet still carries an older status.
  return "needs_attention";
}

export function canonicalTrackerPacket(
  application: CanonicalApplication,
  linkedPacket?: GeneratedResume,
): CanonicalTrackerPacket {
  const updatedAt = application.updated_at ?? application.created_at ?? linkedPacket?.spec._review?.updated_at ?? "";
  const linkedReview = linkedPacket?.spec._review;
  const review = linkedReview
    ? {
      ...linkedReview,
      portal_url: application.portal_url ?? undefined,
      /* THE PACKET WINS WHILE A SUBMISSION IS MID-FLIGHT, and only then.
       *
       * The canonical lifecycle is authoritative for where an application HAS GOT TO, and flattening
       * a linked packet's older status onto it is the whole point of canonicalStatus. But
       * `awaiting_security_code` is not an older status - it is NEWER than anything the canonical row
       * knows. The employer has already taken the submission and emailed a code, and the canonical
       * row still reads `ready_to_submit` because nothing has told it otherwise.
       *
       * Measured on Jane Street 2026-08-17: canonical `submission_state = ready_to_submit`, packet
       * `_review.status = awaiting_security_code`. The override replaced the second with the first,
       * and SubmissionScreen renders its code entry on `review.status === 'awaiting_security_code'`,
       * so the one control that could finish a SUBMITTED application was never drawn. The application
       * sat unfinishable while the code sat unused in the alias.
       *
       * Scoped to exactly this state. Every other status still defers to the canonical row, so this
       * cannot become a general "trust the packet" path - which is the defect canonicalStatus exists
       * to prevent. */
      status: linkedReview.status === "awaiting_security_code"
        ? ("awaiting_security_code" as const)
        : canonicalStatus(application),
      updated_at: updatedAt,
    }
    : {
      jd_text: "",
      portal_url: application.portal_url ?? undefined,
      status: canonicalStatus(application),
      edited_terms: [],
      questions: [],
      skipped_reasons: [],
      updated_at: updatedAt,
      portal_supported: false,
    };
  return {
    ...linkedPacket,
    id: application.id,
    job_context: {
      ...linkedPacket?.job_context,
      company: application.company,
      role: application.role,
      job_id: application.job_id ?? linkedPacket?.job_context.job_id ?? null,
    },
    spec: linkedPacket
      ? { ...linkedPacket.spec, _review: review }
      : { _review: review } as unknown as GeneratedResume["spec"],
    created_at: application.created_at ?? application.updated_at ?? linkedPacket?.created_at ?? null,
    canonical_application: application,
    ...(linkedPacket ? { canonical_legacy_packet_id: linkedPacket.id } : {}),
  };
}

/**
 * Merge the v2 canonical ledger with the legacy packet history.
 *
 * The canonical envelope and lifecycle stay authoritative where both APIs describe the same
 * application. The linked packet still supplies the complete resume, cover letter, documents, and
 * review evidence. Canonical-only records are adapted for list and board visibility.
 */
export function mergeCanonicalApplicationHistory(
  legacy: readonly GeneratedResume[],
  canonical: readonly CanonicalApplication[],
): GeneratedResume[] {
  const merged: Array<GeneratedResume | CanonicalTrackerPacket> = [...legacy];
  const seenCanonicalIds = new Set<string>();
  const claimedLegacyIndexes = new Set<number>();
  for (const application of canonical) {
    if (!application?.id || seenCanonicalIds.has(application.id)) continue;
    seenCanonicalIds.add(application.id);
    const legacyIndex = legacy.findIndex((packet, index) =>
      !claimedLegacyIndexes.has(index) && legacyMatchesCanonical(packet, application));
    if (legacyIndex >= 0) {
      claimedLegacyIndexes.add(legacyIndex);
      merged[legacyIndex] = canonicalTrackerPacket(application, legacy[legacyIndex]);
    } else {
      merged.push(canonicalTrackerPacket(application));
    }
  }
  return merged;
}

export function upsertCanonicalApplicationHistory(
  current: readonly GeneratedResume[],
  application: CanonicalApplication,
): GeneratedResume[] {
  const legacy = current.flatMap((packet) => {
    const linked = linkedLegacyPacketFromCanonicalTrackerPacket(packet);
    if (linked) return [linked];
    return canonicalApplicationFromPacket(packet) === null ? [packet] : [];
  });
  const canonical = current
    .map((packet) => canonicalApplicationFromPacket(packet))
    .filter((item): item is CanonicalApplication => item !== null && item.id !== application.id);
  return mergeCanonicalApplicationHistory(legacy, [...canonical, application]);
}
