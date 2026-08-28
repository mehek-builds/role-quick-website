// Extension included so the node test runner can load this module directly, the same convention
// application-review.ts uses. See allowImportingTsExtensions in tsconfig.json.
import { statusMatchesApplicationFilter } from "./application-filter.ts";

/**
 * ONE ARITHMETIC FOR THE WHOLE PIPELINE.
 *
 * WHY THIS EXISTS
 * ===============
 * On 2026-08-29 a single account, read inside one minute, reported its own pipeline six ways:
 *
 *   Home tiles          0 Ready · 88 Needs you · 12 Sent   (counted from the merged inventory)
 *   Momentum            "13 sent in total"                 (counted by /metrics/funnel)
 *   Ledger header       "Your applications 100"            (/applications?limit=100, merged)
 *   Board footer        "187 of 200 have not been sent yet" (/applications/board, its own cap)
 *   Board column        "Applied 13"                       (the student's stage axis)
 *   Autopilot           "0 applied today"                  (submitted_at since midnight)
 *
 * The sharpest form was on ONE screen: the list header said 100 and the sentence directly under it
 * said 200. Each number was independently defensible and the product still could not count. For a
 * student who has just trusted Litos to send applications on her behalf, a dashboard that disagrees
 * with itself about how many went out is not a rounding problem, it is the whole claim.
 *
 * THE FOUR CAUSES, none of which was a bug in any single number:
 *   1. TWO INVENTORIES. The ledger merged /applications?limit=100 with /resume/history; the board
 *      fetched /applications/board separately, which caps at 200. 100 and 200 were both honest
 *      counts of two different universes drawn six pixels apart. Both windows are 200 now, and the
 *      server enforces one ceiling for them (INVENTORY_LIMIT, volley-backend #768), so the board is
 *      a subset of the merged inventory rather than a fifth view onto it.
 *   2. TWO SENT COUNTS. Home counted `_review.status === "submitted"` over the merged inventory;
 *      Momentum printed the backend's own all-time `applications_submitted`. 12 and 13.
 *   3. STAGE READ AS STATUS. The board's Applied column is the STUDENT's axis (see Board.tsx) and
 *      can hold a card she moved there herself; its count was being read as a send count.
 *   4. NO SHARED DERIVATION. Home computed its three tiles inline, so nothing else could reuse them.
 *
 * WHAT THIS FIXES AND WHAT IT DELIBERATELY DOES NOT
 * =================================================
 * Every surface that makes a claim about how many applications exist, or how many have been sent,
 * now derives it here, from the merged canonical inventory the Tracker already holds. It does NOT
 * collapse stage into status: a card at stage "interview" is still at interview, and the board's
 * columns still draw the student's own arrangement. What it removes is the reading of a STAGE
 * COLUMN as an answer to "how many did Litos send", which is the question `sent` alone answers.
 *
 * THE FILTER PREDICATE IS THE COUNTER. `statusMatchesApplicationFilter` already decides which rows
 * each `?state=` view lands on, and the tiles are deep links into those views. Counting with the
 * same predicate is what makes "Needs you 88" and the 88 rows the tile links to the same 88
 * applications - the property application-filter.ts's own header comment claims and which nothing
 * enforced until the counts moved here.
 */

/** A packet as this module reads it: only the review, only the fields the predicates use. */
type CountablePacket = {
  spec: { _review?: { status?: string; portal_supported?: boolean; submitted_at?: string } };
};

export type PipelineCounts = {
  /**
   * Applications with a review, which is exactly what the Tracker's ledger header counts.
   *
   * NOT `ready + needsYou + sent`. A packet mid-run (preparing, filling, submitting) is in none of
   * those three, so summing the tiles would report a smaller inventory than the list shows, which
   * is the same class of error this module exists to end.
   */
  total: number;
  ready: number;
  needsYou: number;
  sent: number;
};

/**
 * The pipeline, counted once, from the merged canonical inventory.
 *
 * Legacy packets with no `_review` are excluded from every figure including `total`: they are saved
 * resumes, not applications, and the Tracker already counts them separately ("N saved resumes").
 */
export function pipelineCounts(packets: readonly CountablePacket[]): PipelineCounts {
  let total = 0;
  let ready = 0;
  let needsYou = 0;
  let sent = 0;
  for (const packet of packets) {
    const review = packet.spec._review;
    if (!review) continue;
    total += 1;
    if (statusMatchesApplicationFilter(review, "submitted")) sent += 1;
    /* Ready and Needs you are counted separately rather than as an else-branch of each other,
       because they are separate predicates with a genuine overlap rule of their own: a READY status
       on a portal Litos cannot submit through is Needs you, not Ready, and reviewCanBeSent and
       reviewNeedsAction already encode that between them. Deriving one from the other here would
       be a third opinion. */
    if (statusMatchesApplicationFilter(review, "ready")) ready += 1;
    if (statusMatchesApplicationFilter(review, "action")) needsYou += 1;
  }
  return { total, ready, needsYou, sent };
}

/**
 * What Litos sent since the student's local midnight.
 *
 * Counted from the `submitted_at` the SERVER stamped, never from "applications touched today":
 * a touch count climbs every time a resume is regenerated, which is the number every rival inflates.
 * Moved here from the Tracker so the day figure comes off the same inventory as the all-time one;
 * a packet that counts toward `sent` and a packet that counts toward today cannot now disagree
 * about what "sent" means.
 *
 * `now` is injected so this is testable without freezing the clock.
 */
export function sentSince(packets: readonly CountablePacket[], since: Date): number {
  const floor = since.getTime();
  return packets.filter((packet) => {
    const at = packet.spec._review?.submitted_at;
    if (!at) return false;
    const stamp = new Date(at).getTime();
    return Number.isNaN(stamp) ? false : stamp >= floor;
  }).length;
}

/** Local midnight for the day `now` falls in. The student's day, not UTC's. */
export function startOfLocalDay(now: Date): Date {
  const midnight = new Date(now.getTime());
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

/**
 * True when this packet is one the pipeline calls sent.
 *
 * Exported so a surface holding a single packet (rather than the whole inventory) asks the same
 * question the counts ask, instead of re-testing `status === "submitted"` locally for the fifth
 * time.
 */
export function packetIsSent(packet: CountablePacket): boolean {
  return statusMatchesApplicationFilter(packet.spec._review, "submitted");
}
