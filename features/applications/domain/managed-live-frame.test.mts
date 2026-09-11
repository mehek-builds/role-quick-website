import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_MANAGED_LIVE_FRAME_VIEW,
  acceptManagedLiveFrame,
  clearManagedLiveFrame,
  managedLiveFrameIdentity,
  shouldAcceptManagedLiveFrame,
} from "./managed-live-frame.ts";

test("managed live frames require the exact filling packet and run", () => {
  const frameId = "aaaaaaaa-1111-4111-8111-111111111111";
  assert.equal(managedLiveFrameIdentity({ packetId: "packet", runId: "run", frameId, status: "filling", available: true }), `packet:run:${frameId}`);
  assert.equal(managedLiveFrameIdentity({ packetId: "packet", runId: "", frameId, status: "filling", available: true }), null);
  assert.equal(managedLiveFrameIdentity({ packetId: "packet", runId: "run", frameId: "", status: "filling", available: true }), null);
  assert.equal(managedLiveFrameIdentity({ packetId: "packet", runId: "run", frameId: "not-a-uuid", status: "filling", available: true }), null);
  assert.equal(managedLiveFrameIdentity({ packetId: "packet", runId: "run", frameId, status: "failed", available: true }), null);
  assert.equal(managedLiveFrameIdentity({ packetId: "packet", runId: "run", frameId, status: "filling", available: false }), null);
});

test("new sequences replace one object URL while duplicate and stale frames do not churn it", () => {
  const first = acceptManagedLiveFrame(EMPTY_MANAGED_LIVE_FRAME_VIEW, "packet:run", 4, "blob:first");
  assert.deepEqual(first, {
    view: { identity: "packet:run", sequence: 4, objectUrl: "blob:first" }, revoke: [],
  });
  assert.equal(shouldAcceptManagedLiveFrame(first.view, "packet:run", 4), false);
  assert.equal(shouldAcceptManagedLiveFrame(first.view, "packet:run", 3), false);
  assert.equal(shouldAcceptManagedLiveFrame(first.view, "packet:run", 5), true);
  assert.equal(shouldAcceptManagedLiveFrame(first.view, "packet:next-run", 1), true);
  const duplicate = acceptManagedLiveFrame(first.view, "packet:run", 4, "blob:duplicate");
  assert.equal(duplicate.view, first.view);
  assert.deepEqual(duplicate.revoke, ["blob:duplicate"]);
  const next = acceptManagedLiveFrame(first.view, "packet:run", 5, "blob:next");
  assert.deepEqual(next.revoke, ["blob:first"]);
  assert.equal(next.view.objectUrl, "blob:next");
});

test("packet or run replacement and terminal cleanup revoke the displayed frame", () => {
  const old = { identity: "packet-a:run-a", sequence: 8, objectUrl: "blob:old" };
  const replacement = acceptManagedLiveFrame(old, "packet-b:run-b", 1, "blob:new");
  assert.deepEqual(replacement.revoke, ["blob:old"]);
  assert.deepEqual(clearManagedLiveFrame(replacement.view), {
    view: EMPTY_MANAGED_LIVE_FRAME_VIEW, revoke: ["blob:new"],
  });
});

test("a later provider dispatch in the same application run accepts its reset sequence", () => {
  const old = { identity: "packet:run:frame-a", sequence: 9, objectUrl: "blob:old" };
  const closed = clearManagedLiveFrame(old);
  assert.deepEqual(closed.revoke, ["blob:old"]);
  assert.equal(shouldAcceptManagedLiveFrame(closed.view, "packet:run:frame-b", 1), true);
  const replacement = acceptManagedLiveFrame(closed.view, "packet:run:frame-b", 1, "blob:new");
  assert.equal(replacement.view.sequence, 1);
  assert.equal(replacement.view.identity, "packet:run:frame-b");
});
