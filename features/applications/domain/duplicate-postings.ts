import type { GeneratedResume } from "@/lib/api";
import { statusMatchesApplicationFilter } from "./application-filter.ts";

/* WHY THE TRACKER BADGES DUPLICATES INSTEAD OF COLLAPSING THEM.
 *
 * On production the owner's Tracker holds 85 packets over roughly 46 postings. Eighteen postings
 * have more than one packet and one Akuna role has TWELVE, all created inside four and a half
 * hours on 2026-08-06. As a flat list that reads as twelve opportunities, which is the misreading
 * this module exists to stop.
 *
 * COLLAPSING WAS THE WRONG FIX and it was the first instinct. Three reasons it loses:
 *
 *   1. It hides rows the student still needs. Twelve Akuna packets are twelve distinct artifacts:
 *      different resumes, different filled forms, different attention_reason text. The one holding
 *      the useful blocker is not reliably the one a collapse would elect to show.
 *   2. It fights the two controls already on this list. Under `?state=action` three of twelve
 *      match the filter and nine do not, so a collapsed group has no honest row to stand for it;
 *      under "Company A-Z" the representative changes for reasons unrelated to the grouping.
 *   3. R-066 makes packets write-once with no delete. A surface that hides them is the only place
 *      they can disappear from, and disappearing is exactly what makes an applicant re-create one.
 *
 * A badge costs one chip and removes the misreading without removing anything. The load-bearing
 * one is "Already applied": it says the row cannot be sent, which is the same thing the backend
 * says when it refuses (lib/duplicateApplication.ts, HTTP 409 DUPLICATE_APPLICATION).
 *
 * THIS IS ADVISORY. The enforcement point is the backend, on all five send paths. A badge that
 * disagrees with the server costs a moment of confusion; a missing server guard costs an
 * application that cannot be withdrawn.
 */

export type DuplicateMark = {
  /** How many packets in the Tracker are for this same posting, this one included. Always >= 1. */
  total: number;
  /** Another packet for this posting has already reached the employer. This one cannot be sent. */
  alreadyApplied: boolean;
  /**
   * The packet that stands for this posting, so it carries no badge.
   *
   * The one that was SENT when there is one, and the oldest otherwise. Not simply the oldest:
   * once an application has reached the employer it is the record of this posting regardless of
   * when it was created, and badging it as a repeat of an earlier draft would be backwards.
   */
  earliest: boolean;
};

/**
 * The strongest identity a packet can offer, and packets that agree on it are one posting.
 *
 * Same tier order as the backend: the employer's own posting id off portal_url first, then
 * job_context.job_id, then normalized company plus role. `job_id` cannot lead, because it is
 * absent on everything generated before 2026-07-28 and on anything from the extension, which is
 * precisely the population most likely to collide with a newer packet for the same role.
 *
 * ONE key per packet rather than the backend's pairwise tier walk, because a list needs groups and
 * groups need a transitive rule. The two agree wherever both packets have a readable portal URL,
 * which is 82 of the owner's 85. Where they disagree the badge is missing, never wrong: the
 * backend still refuses the send.
 */
export function postingKeyOf(packet: GeneratedResume): string | null {
  const atsKey = atsPostingKey(packet.spec._review?.portal_url);
  if (atsKey) return atsKey;
  const jobId = packet.job_context.job_id;
  if (typeof jobId === "string" && jobId.trim()) return `job:${jobId.trim().toLowerCase()}`;
  const company = normalize(packet.job_context.company);
  const role = normalize(packet.job_context.role);
  return company && role ? `cr:${company}|${role}` : null;
}

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * "<provider>:<tenant>:<postingId>" for a portal URL we can read.
 *
 * Greenhouse stores ONE posting under two URL shapes and both are in the owner's data:
 * job-boards.greenhouse.io/akunacapital/jobs/8018893 and
 * job-boards.greenhouse.io/embed/job_app?for=akunacapital&token=8018893. Six of the twelve Akuna
 * packets carry each. Raw URL equality would have found six duplicates instead of twelve.
 */
export function atsPostingKey(rawUrl: string | undefined): string | null {
  if (!rawUrl?.trim()) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io" || host === "job-boards.eu.greenhouse.io") {
    if (parts[0] === "embed" && parts[1] === "job_app") {
      const token = url.searchParams.get("token");
      const board = url.searchParams.get("for") ?? url.searchParams.get("b");
      if (token && board && /^\d+$/.test(token)) return `greenhouse:${board.toLowerCase()}:${token}`;
    }
    if (parts.length >= 3 && parts[1] === "jobs" && /^\d+$/.test(parts[2])) {
      return `greenhouse:${parts[0].toLowerCase()}:${parts[2]}`;
    }
    return null;
  }
  if (host === "jobs.ashbyhq.com" && parts.length >= 2 && /^[0-9a-fA-F-]{36}$/.test(parts[1])) {
    return `ashby:${parts[0].toLowerCase()}:${parts[1].toLowerCase()}`;
  }
  if ((host === "jobs.lever.co" || host === "jobs.eu.lever.co") && parts[0] && parts[1]) {
    return `lever:${parts[0].toLowerCase()}:${parts[1].toLowerCase()}`;
  }
  return null;
}

function packetOrder(packet: GeneratedResume): string {
  return packet.created_at ?? packet.spec._review?.updated_at ?? "";
}

/**
 * One mark per packet id, for every packet that shares a posting with another.
 *
 * Packets with no readable identity are left out entirely rather than pooled under a "no key"
 * bucket, which would badge unrelated rows as duplicates of each other.
 */
export function duplicatePostingMarks(packets: readonly GeneratedResume[]): Map<string, DuplicateMark> {
  const groups = new Map<string, GeneratedResume[]>();
  for (const packet of packets) {
    const key = postingKeyOf(packet);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(packet);
    else groups.set(key, [packet]);
  }
  const marks = new Map<string, DuplicateMark>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => packetOrder(a).localeCompare(packetOrder(b)));
    const sent = ordered.find((packet) => packet.spec._review?.status === "submitted");
    /* The row that STANDS for the posting carries no badge, so it is the one the "Needs you" queue
     * keeps when the badged repeats are dropped from it. The SENT packet stands when there is one:
     * it is the record of this posting. With nothing sent, prefer the oldest packet that still NEEDS
     * the applicant over an older quiet draft, so hiding the badged siblings can never hide the row
     * that actually holds the live blocker (the exact failure the "collapse" approach was rejected
     * for). Falls back to the oldest when none in the group needs action. */
    const needsAction = ordered.find((packet) => packet.spec._review != null
      && statusMatchesApplicationFilter(packet.spec._review, "action"));
    const stands = sent ?? needsAction ?? ordered[0];
    for (const packet of ordered) {
      marks.set(packet.id, {
        total: ordered.length,
        alreadyApplied: Boolean(sent) && packet.id !== stands.id,
        earliest: packet.id === stands.id,
      });
    }
  }
  return marks;
}

/**
 * The chip, or nothing.
 *
 * "Already applied" outranks "Duplicate" because it is the one that changes what the student can
 * do: the backend will refuse this send with a 409, so the row is a record rather than an option.
 * The oldest packet for a posting is the original and is left unbadged, so a group of twelve reads
 * as one application with eleven repeats rather than twelve equally suspect rows.
 */
export function duplicateBadge(mark: DuplicateMark | undefined): { label: string; kind: string } | null {
  if (!mark) return null;
  if (mark.alreadyApplied) return { label: "Already applied", kind: "warn" };
  if (mark.earliest) return null;
  return { label: "Duplicate", kind: "duplicate" };
}

/** The one-line count above the list, or null when there is nothing to say. */
export function duplicatePostingNote(marks: Map<string, DuplicateMark>): string | null {
  let repeats = 0;
  for (const mark of marks.values()) if (!mark.earliest) repeats += 1;
  if (repeats === 0) return null;
  return `${repeats} of these repeat a posting already in your Tracker. `
    + "Litos will not send the same posting twice, because employers cap re-applications.";
}
