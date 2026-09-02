import type { CanonicalApplication, GeneratedResume } from "../../../lib/api.ts";
import { reviewCanBeSent } from "./application-filter.ts";

/** A canonical Tracker row may carry a linked generated packet. These markers are local
 * presentation state, never sent back to either API. The public id and lifecycle always belong to
 * the canonical ledger, while the linked id lets an explicit packet action reach the legacy route.
 * `canonical_legacy_hydration_missing_id` is the same idea for the OTHER hydration outcome: a fetch
 * that came back with no packet at that id, recorded so it reads as settled rather than unresolved. */
export type CanonicalTrackerPacket = GeneratedResume & {
  canonical_application: CanonicalApplication;
  canonical_legacy_packet_id?: string;
  canonical_legacy_hydration_missing_id?: string;
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
/* Every status during which Litos itself is driving or about to drive the employer form. The
 * security-code pause was the first member; the five live-run statuses joined on 2026-09-02,
 * measured on DSI Innovations mid-send: with a run live (status 'submitting', claim held, Stratus
 * streaming the company form), a reload of the exact same deep link routed to the attended detail
 * card, because this list did not name the one state the student most needs the managed screens
 * for. The live view (the panel that shows what the browser changes to, including the confirmation
 * reload) was reachable only from the client session that pressed Send; close or reload that tab
 * and no path on the page led back to it, while the card underneath invited a second fill against
 * a held claim. screenForStatus already maps all five to the submitting screen; this list was the
 * only thing keeping a reload from reaching it. */
const MID_SUBMISSION_STATUSES = [
  'awaiting_security_code',
  'submit_requested',
  'preparing',
  'filling',
  'submitting',
  'submission_claimed',
];

/* THE DASHBOARD IS SELF-SUFFICIENT, and the extension is separate software.
 *
 * Product decision by the owner, 2026-08-18, reversing the narrower READY-only admission above it:
 * a canonical Tracker row that carries a linked, portal-supported packet finishes through the
 * dashboard's own managed screens - the answer/blocker screen for needs_attention, the review and
 * send screen for the ready states, the code entry for awaiting_security_code - and never requires
 * the extension. Before this, Belvedere (linked lever packet at needs_attention with nine answered
 * questions) and Mercari (linked workable packet at ready_to_submit) both routed to an
 * attended-handoff detail whose only action demanded an extension version the store does not ship,
 * so two sendable applications had no reachable finish at all.
 *
 * What still keeps the attended detail, and why:
 *   - a tracker-only row (no linked packet): there is nothing for the managed screens to drive;
 *   - `portal_supported === false`: the server's own answer to whether Litos may press this
 *     family's Send, which the client never overrides;
 *   - `submitted` and `failed`: terminal states with nothing to finish.
 */
const MANAGED_SCREEN_STATUSES = [
  'resume_ready',
  'questions_ready',
  'ready_to_submit',
  'ready_for_final_approval',
  'needs_attention',
  ...MID_SUBMISSION_STATUSES,
];

function reviewReachesManagedScreens(review: GeneratedResume['spec']['_review']): boolean {
  return MANAGED_SCREEN_STATUSES.includes(review?.status ?? '')
    && review?.portal_supported !== false;
}

export function sendableLinkedPacketFromCanonicalEnvelope(
  packet: GeneratedResume | null | undefined,
): GeneratedResume | null {
  if (!canonicalApplicationFromPacket(packet)) return null;
  if (!reviewCanBeSent(packet?.spec._review) && !reviewReachesManagedScreens(packet?.spec._review)) return null;
  return linkedLegacyPacketFromCanonicalTrackerPacket(packet);
}

/**
 * The legacy packet id worth fetching before this canonical row's send eligibility can be trusted,
 * or null when nothing would change by fetching.
 *
 * `canonicalTrackerPacket` builds a row's `_review` from whichever legacy packet THIS PAGE LOAD's
 * merge happened to find - by explicit `legacy_generated_resume_id` link, by shared job id, or by
 * shared portal URL (`canonicalMatchStrength`) - and falls back to a placeholder with
 * `portal_supported: false` hardcoded when nothing in the loaded page matched at all. That
 * placeholder is a statement about what THIS PAGE LOAD saw, not about the account: the bare
 * `/resume/history` call caps at fifty full specs and, on an account queueing hundreds of
 * applications, its returned page may not carry this row's linked packet at all. A row whose real
 * linked packet is genuinely `ready_to_submit` and `portal_supported: true` can merge with nothing
 * attached and default to reading as extension-only, which is exactly the gap PR #383 already
 * named and fixed for packet CONTENT (`isStubPacketSpec`, `ApplicationPacket`'s stub hydration).
 * This is the same fix for the ROUTING decision: the earlier one only ever hydrated the packet a
 * student had already opened to look at; this lets the page learn a row is sendable before it ever
 * shows the attended-handoff detail at all.
 *
 * Returns the id to hydrate exactly when hydrating it could change the outcome: the canonical row
 * names a linked packet by id, and the merge did not attach that SAME packet - either nothing
 * attached at all, or one of `canonicalMatchStrength`'s weaker match kinds attached a different
 * packet (a duplicate posting, most often) instead of the one this row actually names. Returns null
 * once a fetch has already attached the right one, so a caller that reruns this after applying a
 * hydration result stops on its own rather than re-fetching every render.
 *
 * Returns null the same way for the OTHER settled outcome: a fetch that already confirmed the named
 * id does not exist. Without that second check this only ever recognised the found case, so a
 * not-found result read as permanently unresolved and got re-fetched on every `packets` mutation
 * that changed this row's object identity - an unrelated `setPackets` elsewhere on the page (e.g.
 * pressing "Open and fill application" on the SAME row) rebuilds it via `canonicalTrackerPacket` and
 * so recomputes to the identical doomed id.
 */
export function canonicalEnvelopeLegacyHydrationId(
  packet: GeneratedResume | null | undefined,
): string | null {
  const canonical = canonicalApplicationFromPacket(packet);
  const legacyId = canonical?.legacy_generated_resume_id;
  if (!legacyId) return null;
  const candidate = packet as Partial<CanonicalTrackerPacket> | null | undefined;
  if (candidate?.canonical_legacy_packet_id === legacyId) return null;
  if (candidate?.canonical_legacy_hydration_missing_id === legacyId) return null;
  return legacyId;
}

/**
 * Record that `legacyId` was fetched and does not exist, so `canonicalEnvelopeLegacyHydrationId`
 * stops asking for it again.
 *
 * Mirrors how a SUCCESSFUL hydration is remembered: `canonicalTrackerPacket` stamps
 * `canonical_legacy_packet_id` onto the row once a real linked packet is attached, and
 * `canonicalEnvelopeLegacyHydrationId` treats that stamp as "already resolved". A not-found result
 * never goes through `canonicalTrackerPacket` - there is no packet to attach - so without a matching
 * stamp for THIS outcome the id kept reading as unresolved forever, and every unrelated `setPackets`
 * call that changed this row's object identity re-triggered the identical doomed fetch, briefly
 * flipping `checkingSendPath` back to true and hiding whatever button was already showing.
 */
export function canonicalEnvelopeWithMissingLegacyHydration(
  packet: GeneratedResume,
  legacyId: string,
): CanonicalTrackerPacket {
  return { ...packet, canonical_legacy_hydration_missing_id: legacyId } as CanonicalTrackerPacket;
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

/**
 * The loaded history plus a selectable restored copy of every envelope's linked packet.
 *
 * `selectPacket` restores a linked packet and selects its LEGACY id, but `selectedPacketForRequest`
 * fails closed by looking the id up in the loaded list, and the merge replaced the legacy row with
 * its canonical envelope, filed under the CANONICAL id. On every pre-canonical row the two ids are
 * the same UUID, which is why this never surfaced; a canonical row minted with its own id (Belvedere
 * `d1af1c97` -> packet `6fda0404`, measured 2026-08-18) selected an id no list entry carries, and
 * the screen refused with "the saved list does not contain a packet with this id".
 *
 * Appending the restored copies to the LOOKUP list keeps the fail-closed contract intact - the
 * deep-link guards in selectedPacketForRequest still run, and an id that matches nothing still
 * returns null - while an id the restore produced now resolves to exactly the packet the restore
 * built. Display lists are untouched: callers that render rows keep using the raw history.
 */
export function withRestoredLinkedPackets(packets: readonly GeneratedResume[]): GeneratedResume[] {
  const restored = packets
    .map((packet) => linkedLegacyPacketFromCanonicalTrackerPacket(packet))
    .filter((packet): packet is GeneratedResume => packet !== null);
  return restored.length === 0 ? [...packets] : [...packets, ...restored];
}

/**
 * How strongly a packet identifies as this canonical application. 0 means no match.
 *
 * WHY A STRENGTH AND NOT A BOOLEAN, which is what this was.
 *
 * The rules were always ordered strongest-first, but the CALLER took the first packet that returned
 * true in `created_at desc` order. So a weak portal-URL match on a NEWER packet beat an explicit
 * `legacy_generated_resume_id` link on an older one, and the canonical row bound to the wrong packet.
 *
 * That is not hypothetical. Measured on the owner account 2026-08-17: two Jane Street packets exist
 * for one posting (`cf2b1055` created 08-16, `496cff97` created 08-14), and 496cff97 is the one that
 * actually submitted and carried the employer's security code. Both normalize to the same portal URL,
 * so the newer one matched first and the Tracker showed its state while the submitted packet's state
 * was invisible. 41 rows on this account carry the DUPLICATE badge, so this is a general hazard
 * wherever a posting has been prepared twice.
 *
 * Returning a rank lets the caller claim every strong match before any weak one is considered, which
 * is what "strongest identity wins" has to mean when the candidates are ordered by date.
 */
function canonicalMatchStrength(packet: GeneratedResume, application: CanonicalApplication): number {
  // The row IS the packet, or names it outright. Nothing can outrank an explicit link.
  if (packet.id === application.id) return 3;
  if (application.legacy_generated_resume_id === packet.id) return 3;

  const applicationJobId = application.job_id?.trim();
  const packetJobId = packet.job_context.job_id?.trim();
  if (applicationJobId && packetJobId && applicationJobId === packetJobId) return 2;

  const applicationPortal = normalizedPortal(application.portal_url);
  const packetPortal = normalizedPortal(packet.spec._review?.portal_url);
  // A shared posting URL. True of every duplicate of the same job, which is exactly why it must not
  // outrank an explicit link.
  if (applicationPortal && packetPortal) return applicationPortal === packetPortal ? 1 : 0;

  // Company and role are a last resort only when neither side has a stronger identity. Using this
  // fallback while either row has a portal would collapse two real requisitions with the same title.
  if (applicationJobId || packetJobId || applicationPortal || packetPortal) return 0;
  return normalizedText(application.company) === normalizedText(packet.job_context.company)
    && normalizedText(application.role) === normalizedText(packet.job_context.role)
    ? 1
    : 0;
}

function legacyMatchesCanonical(packet: GeneratedResume, application: CanonicalApplication): boolean {
  return canonicalMatchStrength(packet, application) > 0;
}

function canonicalStatus(application: CanonicalApplication): "submitted" | "failed" | "ready_to_submit" | "ready_for_final_approval" | "needs_attention" {
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
  /* A FILLED EMPLOYER FORM WAITING ON THE APPLICANT IS INSIDE THE SEND WORKFLOW.
   *
   * The pair above is the LEGACY shape: only rows migrated by the one-time Litos Plus v2 backfill
   * ever wore it, because that script copied the packet's _review.status into both columns. Every
   * application created since is inserted at (not_started, ready) and, until the backend learned to
   * project the prepared hold, stayed there however far a managed prepare got. The backend now
   * writes and heals this pair instead, named after the applicant's next action.
   *
   * IT IS NOT THE READY QUEUE. ready_for_final_approval is an ACTION status, not a READY one
   * (application-filter.ts), so reviewCanBeSent and nextPreferredReadyPacket still refuse it and
   * autopilot still never elects it. The only thing this changes is that the detail screen draws
   * the Send control the applicant is being asked for, instead of a card telling her to fill a
   * form that is already filled. */
  if (
    application.submission_state === "ready_for_final_approval"
    && application.review_state === "ready_for_final_approval"
  ) {
    return "ready_for_final_approval";
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
      /* THE SAME EXCEPTION, ONE STEP EARLIER IN THE SAME RUN.
       *
       * A linked packet at `ready_for_final_approval` is not carrying an older status either. It
       * means the managed run has already read the employer form, filled it and taken the preview
       * screenshot, and is holding it for the applicant to press Send. The canonical row saying
       * not_started is the side that is behind, not the packet.
       *
       * Measured on The Maven Group "Cyber Test Engineer" 2026-09-02: canonical
       * submission_state=not_started / review_state=ready, packet _review.status
       * ready_for_final_approval with a preview_screenshot_url, no blockers and no attention
       * reason. The flatten replaced the second with needs_attention, SubmissionScreen drew "One
       * thing to finish" with only "Open packet review" and "Try again", the Send control at
       * review.status === "ready_for_final_approval" was never drawn, and following the card's own
       * instruction asked the server for a fresh fill it correctly refused. A closed loop, on 83
       * applications.
       *
       * SCOPED TO THE DEMOTION, exactly like the override above. It applies only when the canonical
       * lifecycle resolved to needs_attention, so a row the ledger has moved to submitted or failed
       * still wins and this can never become a general "trust the packet" path - which is the
       * defect canonicalStatus exists to prevent. */
      status: linkedReview.status === "awaiting_security_code"
        ? ("awaiting_security_code" as const)
        : linkedReview.status === "ready_for_final_approval" && canonicalStatus(application) === "needs_attention"
          ? ("ready_for_final_approval" as const)
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
      /* A canonical-only submitted row has no packet to carry submitted_at, and jobSubmittedOnDay
         keys on that field: without it, Home's Sent tile counted the row while the day queue kept
         offering the same job as "Continue application". The row's own updated_at is the closest
         stored moment to the submission transition, and being wrong by an edit is cheaper than a
         queue that invites a second application to a filed one. */
      ...(canonicalStatus(application) === "submitted" ? { submitted_at: updatedAt } : {}),
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
    /* The STRONGEST identity wins, not the first one encountered.
     *
     * findIndex took whichever unclaimed packet matched first, and `legacy` arrives newest-first, so
     * a shared posting URL on a newer duplicate beat an explicit legacy_generated_resume_id link on
     * an older packet. Measured: two Jane Street packets for one posting, and the canonical row bound
     * to the newer one while the packet that had actually submitted showed nothing.
     *
     * Ties keep the old behaviour - earliest index, so newest packet - because among equally weak
     * matches there is no better answer than the most recent, and changing that would move rows
     * nobody has a reason to move. */
    let legacyIndex = -1;
    let bestStrength = 0;
    legacy.forEach((packet, index) => {
      if (claimedLegacyIndexes.has(index)) return;
      const strength = canonicalMatchStrength(packet, application);
      if (strength > bestStrength) {
        bestStrength = strength;
        legacyIndex = index;
      }
    });
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
