import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { nextPreferredReadyPacket } from "../features/applications/domain/daily-matches.ts";

// Regression: ISSUE-019, /dashboard/applications spun on "Looking for your next match..." forever.
// Found by a live production audit on 2026-08-03.
//
// Nothing hung. There was no pending promise, no retry loop and no timeout to add. NextMatchCard
// gated a pulsing "Looking for your next match..." on `!match`, and null has two opposite causes:
// the answer has not arrived, or the answer arrived and it is "none". Both drew the same spinner,
// so a settled, correct, empty result was indistinguishable from a load that never finished. The
// student was told to keep waiting for something that had already finished and found nothing.
//
// It went from rare to common when Next best match started intersecting ready packets with the
// current job board. Before that, null meant "no ready packets at all", so the loading-shaped empty
// state was never noticed.

describe("the selection function returning null is an answer, not a pending state", () => {
  const readyPacket = {
    id: "packet-1",
    job_context: { company: "Acme Labs", role: "Product Engineer", job_id: "job-1" },
    spec: { _review: { status: "ready_to_submit", updated_at: "2026-08-01T00:00:00.000Z" } },
  };

  test("null when a ready packet's posting has rotated off the current board", () => {
    const stillListed = { id: "job-9", company_name: "Acme Labs", title: "Product Engineer" };
    assert.equal(nextPreferredReadyPacket([readyPacket], [stillListed]), null);
  });

  test("null when the board came back empty", () => {
    assert.equal(nextPreferredReadyPacket([readyPacket], []), null);
  });

  test("a packet whose posting is still listed is still returned", () => {
    const job = { id: "job-1", company_name: "Acme Labs", title: "Product Engineer" };
    assert.equal(nextPreferredReadyPacket([readyPacket], [job])?.id, "packet-1");
  });
});

describe("NextMatchCard tells the two causes of null apart", () => {
  const autopilot = readFileSync("components/app/Autopilot.tsx", "utf8");
  const applications = readFileSync("app/dashboard/applications/page.tsx", "utf8");

  test("the spinner is gated on a separate searching flag, not on the match alone", () => {
    assert.match(autopilot, /if \(!match && searching\) \{/);
    assert.match(autopilot, /searching: boolean;/);
  });

  test("a settled empty result gets a stated outcome instead of the spinner", () => {
    assert.match(autopilot, /No ready application matches your current preferences\./);
  });

  test("the empty state does not pulse, because nothing is still coming", () => {
    const emptyBranch = autopilot.slice(
      autopilot.indexOf("No ready application matches"),
      autopilot.indexOf("const paused ="),
    );
    assert.doesNotMatch(emptyBranch, /animate-pulse/);
  });

  test("the empty state names what the student can change", () => {
    assert.match(autopilot, /Widen your preferences in Account/);
  });

  test("searching is driven by the fetch that settles, so it cannot stay true forever", () => {
    // currentMatches settles to [] even when the request fails, which is the property `match ===
    // null` never had. Packets are already loaded by the time the card mounts.
    assert.match(applications, /searching=\{currentMatches === null\}/);
  });
});
