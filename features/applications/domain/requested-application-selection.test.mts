import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { selectedPacketForRequest } from "./application-review.ts";

const packets = [{ id: "packet-a" }, { id: "packet-b" }];

describe("selectedPacketForRequest", () => {
  test("keeps an ordinary local selection when the URL requests no packet", () => {
    assert.equal(selectedPacketForRequest(packets, "packet-a", null, null, null)?.id, "packet-a");
  });

  test("keeps the exact actionable packet requested by the URL", () => {
    assert.equal(selectedPacketForRequest(packets, "packet-a", "packet-a", "apply", "packet-a")?.id, "packet-a");
  });

  test("fails closed while a query-only change from packet A to packet B is loading", () => {
    assert.equal(selectedPacketForRequest(packets, "packet-a", "packet-b", "apply", "packet-a"), null);
  });

  test("reveals packet B only after selection catches up to the requested id", () => {
    assert.equal(selectedPacketForRequest(packets, "packet-b", "packet-b", "apply", "packet-b")?.id, "packet-b");
  });

  test("allows ledger switching after the direct-link request has settled", () => {
    assert.equal(
      selectedPacketForRequest(packets, "packet-b", "packet-a", "apply", "packet-a")?.id,
      "packet-b",
    );
  });

  test("detail intent never exposes actionable controls", () => {
    assert.equal(selectedPacketForRequest(packets, "packet-a", "packet-a", "detail", "packet-a"), null);
  });

  test("an unknown intent fails closed instead of exposing actionable controls", () => {
    assert.equal(selectedPacketForRequest(packets, "packet-a", "packet-a", "send-now", "packet-a"), null);
  });
});
