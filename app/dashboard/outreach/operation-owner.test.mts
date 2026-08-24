import assert from "node:assert/strict";
import test from "node:test";
import { createOutreachOperationOwner } from "./operation-owner.ts";
import type { OutreachOperationSnapshot } from "./operation-owner.ts";

test("the durable owner publishes stable snapshots and acquires synchronously", () => {
  const owner = createOutreachOperationOwner();
  const idle = owner.getSnapshot();
  let notifications = 0;
  const unsubscribe = owner.subscribe(() => {
    notifications += 1;
  });

  assert.equal(owner.getSnapshot(), idle, "an unchanged store must reuse its snapshot object");
  const save = owner.acquire("edited-save");
  assert.ok(save);
  assert.equal(owner.getSnapshot().activeOperation, "edited-save");
  assert.notEqual(owner.getSnapshot(), idle);
  assert.equal(notifications, 1);

  const blocked = owner.acquire("manual-save");
  assert.equal(blocked, null, "a same-turn request must observe the synchronous lock");
  assert.equal(owner.getSnapshot().activeOperation, "edited-save");
  assert.equal(notifications, 1, "a blocked attempt must not publish or supersede the real owner");

  unsubscribe();
  save.settle();
  assert.deepEqual(owner.getSnapshot(), {
    activeOperation: null,
    draftsSettledRevision: 1,
  });
  assert.equal(notifications, 1, "a retired route subscriber must not receive settlement work");
});

test("a lease survives route unsubscribe and blocks the remounted page until settlement", () => {
  const owner = createOutreachOperationOwner();
  const initiatingRoute = owner.subscribe(() => {});
  const held = owner.acquire("manual-save");
  assert.ok(held);
  owner.applicationIds.set("acme\nacme.example\nengineer", "canonical-application");
  owner.draftOperationIds.set("manual:fixture", "operation-from-the-first-page");
  initiatingRoute();

  const remountedSnapshots: OutreachOperationSnapshot[] = [];
  const remountedRoute = owner.subscribe(() => {
    remountedSnapshots.push(owner.getSnapshot());
  });
  assert.equal(owner.getSnapshot().activeOperation, "manual-save");
  assert.equal(owner.acquire("manual-save"), null);
  assert.equal(
    owner.applicationIds.get("acme\nacme.example\nengineer"),
    "canonical-application",
    "canonical application ownership must survive a route remount",
  );
  assert.equal(
    owner.draftOperationIds.get("manual:fixture"),
    "operation-from-the-first-page",
    "idempotency state must be owned above the remounted route",
  );

  held.settle();
  assert.equal(remountedSnapshots.length, 1);
  assert.deepEqual(remountedSnapshots[0], {
    activeOperation: null,
    draftsSettledRevision: 1,
  });

  const newer = owner.acquire("manual-save");
  assert.ok(newer, "the remounted page may begin newer work only after settlement");
  newer.settle();
  assert.equal(owner.getSnapshot().draftsSettledRevision, 2);
  remountedRoute();
});

test("contact discovery releases the lane without forcing a saved-drafts refresh", () => {
  const owner = createOutreachOperationOwner();
  const contact = owner.acquire("contact-discovery");
  assert.ok(contact);
  contact.settle();
  contact.settle();

  assert.deepEqual(owner.getSnapshot(), {
    activeOperation: null,
    draftsSettledRevision: 0,
  });
});

test("every operation that can persist a draft advances the settled revision once", () => {
  const owner = createOutreachOperationOwner();
  for (const operation of ["draft-generation", "edited-save", "manual-save"] as const) {
    const lease = owner.acquire(operation);
    assert.ok(lease);
    lease.settle();
    lease.settle();
  }
  assert.equal(owner.getSnapshot().draftsSettledRevision, 3);
});
