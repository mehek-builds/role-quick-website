import type { CanonicalApplication, GeneratedResume } from "../../../lib/api.ts";

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

function canonicalStatus(application: CanonicalApplication): "submitted" | "failed" | "needs_attention" {
  if (application.submission_state === "submitted") return "submitted";
  if (
    application.submission_state === "failed"
    || application.review_state === "failed"
    || application.tracker_state === "failed"
  ) return "failed";
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
      status: canonicalStatus(application),
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
