import assert from "node:assert/strict";
import test from "node:test";
import { createExclusiveMutationCoordinator, createLatestRequestCoordinator, restoreFocusAfterRetry } from "./latest-request.ts";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("a newer success wins when an older request fails late", async () => {
  const requests = createLatestRequestCoordinator<"profile">();
  const older = deferred<string>();
  const newer = deferred<string>();
  let value: string | null = "saved profile";
  let error: string | null = "earlier failure";
  let pending = false;

  const handlers = {
    onStart() {
      pending = true;
      error = null;
    },
    onSuccess(next: string) {
      value = next;
    },
    onError(reason: unknown) {
      error = reason instanceof Error ? reason.message : "failed";
    },
    onSettled() {
      pending = false;
    },
  };

  const olderRun = requests.run("profile", () => older.promise, handlers);
  const newerRun = requests.run("profile", () => newer.promise, handlers, { supersede: true });

  assert.equal(value, "saved profile");
  assert.equal(error, null);
  assert.equal(pending, true);

  newer.resolve("fresh profile");
  await newerRun;
  older.reject(new Error("stale failure"));
  await olderRun;

  assert.equal(value, "fresh profile");
  assert.equal(error, null);
  assert.equal(pending, false);
  assert.equal(requests.isPending("profile"), false);
});

test("a second normal retry is blocked while its resource is pending", async () => {
  const requests = createLatestRequestCoordinator<"documents">();
  const response = deferred<string>();
  let starts = 0;
  let calls = 0;
  const handlers = {
    onStart() {
      starts += 1;
    },
    onSuccess() {},
    onError() {},
    onSettled() {},
  };

  const first = requests.run("documents", () => {
    calls += 1;
    return response.promise;
  }, handlers);
  const duplicate = await requests.run("documents", async () => {
    calls += 1;
    return "duplicate";
  }, handlers);

  assert.equal(duplicate, "blocked");
  assert.equal(starts, 1);
  assert.equal(calls, 1);
  assert.equal(requests.isPending("documents"), true);

  response.resolve("complete");
  await first;
  assert.equal(requests.isPending("documents"), false);
});

test("retry focus waits for the recovered target to mount", () => {
  const scheduled: Array<() => void> = [];
  let requestedId: string | null = null;
  let focusOptions: FocusOptions | undefined;

  restoreFocusAfterRetry(
    "documents-panel",
    (callback) => {
      scheduled.push(callback);
    },
    (id) => {
      requestedId = id;
      return {
        focus(options) {
          focusOptions = options;
        },
      };
    },
  );

  assert.equal(requestedId, null);
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(requestedId, "documents-panel");
  assert.deepEqual(focusOptions, { preventScroll: true });
});

test("a pending bank save blocks a resume upload until the save settles", async () => {
  const mutations = createExclusiveMutationCoordinator<"save" | "upload">();
  const save = deferred<void>();
  let uploadCalls = 0;

  const saving = mutations.run("save", () => save.promise);
  assert.equal(mutations.activeMutation(), "save");

  const blockedUpload = await mutations.run("upload", async () => {
    uploadCalls += 1;
  });
  assert.equal(blockedUpload, "blocked");
  assert.equal(uploadCalls, 0);
  assert.equal(mutations.activeMutation(), "save");

  save.resolve();
  await saving;
  assert.equal(mutations.isActive(), false);

  const laterUpload = await mutations.run("upload", async () => {
    uploadCalls += 1;
  });
  assert.equal(laterUpload, "settled");
  assert.equal(uploadCalls, 1);
});
