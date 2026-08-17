import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

// Regression: the standing auto-send cycled the same refused applications forever.
//
// Observed live on 2026-08-18 on a real account: the NextMatchCard countdown reached zero, POST
// /applications/:id/submit-request answered 409 with the packet-audit code, the page banner printed
// the server's raw token ("packet_stale"), and the refused packet stayed in the ranked pool. The
// ranking then rotated between the two ready packets (Jump Trading, then Akuna), each rotation made
// the other packet "new" again to the card's fired ref, and the queue burned the whole day against
// the same two deterministic 409s. "0 applied today" while visibly busy.
//
// A 409 from the send gate cannot be retried into success: a stale packet audit means the current
// packet no longer matches the one the student acknowledged, and only Review and fill (a fresh
// audit plus a fresh human acknowledgement) clears it. So the rules this file pins:
//
//   1. A deterministic refusal (4xx) removes that application from the automatic queue for the
//      session, so the countdown moves on to a packet that can actually send.
//   2. The banner never prints a server token. The stale case names the packet and the action that
//      clears it; everything else goes through userFacingError.

/** Comments are stripped before scanning, so the record of WHY may name the thing it bans. */
const code = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const page = code(readFileSync("app/dashboard/applications/page.tsx", "utf8"));

/* The autopilot send path only. Other handlers on this page print reason.message and their
   backends already answer in sentences; the rule this file pins is about the one path whose 409
   carried a token. */
const sendWithoutAskingStart = page.indexOf("const sendWithoutAsking");
const sendWithoutAskingEnd = page.indexOf("const reviewOpen");
assert.ok(sendWithoutAskingStart > 0 && sendWithoutAskingEnd > sendWithoutAskingStart);
const autopilotSend = page.slice(sendWithoutAskingStart, sendWithoutAskingEnd);

describe("a refused application leaves the automatic queue instead of cycling", () => {
  test("the next-packet pool excludes applications held after a refusal", () => {
    assert.match(
      page,
      /nextPreferredReadyPacket\(\s*reviewablePackets\.filter\(\(packet\) => !heldFromQueue\.has\(packet\.id\)\)/,
      "the ranked pool must skip held ids, or the countdown picks the refused packet straight back up",
    );
  });

  test("a deterministic 4xx holds the application; transient failures stay retryable", () => {
    assert.match(
      page,
      /reason instanceof ApiError && reason\.status >= 400 && reason\.status < 500/,
      "the hold must key on the client-error range: a 409 refusal is permanent, a 500 or a dropped connection is not",
    );
    assert.match(page, /if \(refusal\) holdFromQueue\(id\);/);
  });

  test("the local education-drift refusal is held too, for the same reason", () => {
    assert.match(page, /holdFromQueue\(id\);\s*\n\s*setError\(`We did not send this one on its own\. \$\{drift\}`\);/);
  });
});

describe("the autopilot banner speaks sentences, never server tokens", () => {
  test("the stale-audit refusal names the packet and the action that clears it", () => {
    assert.match(page, /code === "PACKET_AUDIT_STALE"/);
    assert.match(page, /Review and fill to approve the current version/);
  });

  test("every other send failure goes through userFacingError, not raw reason.message", () => {
    assert.match(
      page,
      /: userFacingError\(reason, "Could not send that application on its own\. It is still here for you\."\)/,
    );
    assert.doesNotMatch(
      autopilotSend,
      /setError\(reason instanceof Error \? reason\.message/,
      "printing reason.message raw is how a red banner came to read exactly packet_stale",
    );
  });
});
