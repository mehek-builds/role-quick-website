import assert from "node:assert/strict";
import test from "node:test";

/* A localStorage stub, because the point of this module is what survives a reload and what must not
   be trusted across an account change. */
const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
};

const { rememberStartSitting, readStartSitting, forgetStartSitting } = await import("./start-sitting.ts");

const SITTING = {
  ownerId: "20f75e86-3257-4cf5-9a92-1107de48e6c4",
  jobId: "02d90070-7bb4-4206-b8ff-bbccbdcab871",
  applicationId: "e10bc88b-c1cc-48a0-9087-a4a50eb1bf46",
  fieldsAnswered: 14,
  answersGiven: [{ question: "What is your cumulative GPA?", answer: "3.6 or above (out of 4.0)" }],
};

test("a sitting is handed back to the account that stored it", () => {
  store.clear();
  rememberStartSitting(SITTING);
  assert.deepEqual(readStartSitting(SITTING.ownerId), SITTING);
});

/* THE ONE THAT MATTERS. A 401 mid-sitting clears the token and the app re-guests, so a tab can change
   account underneath a stored pointer. Restoring it would put another account's application id on the
   screen that sends, which is exactly how "Application not found" reached the review screen. */
test("a sitting stored by another account is not restored", () => {
  store.clear();
  rememberStartSitting(SITTING);
  assert.equal(readStartSitting("4e1d2c3b-1111-4222-8333-444455556666"), null);
  assert.equal(readStartSitting(null), null);
  assert.equal(readStartSitting(undefined), null);
});

test("a malformed or partial record is refused rather than half-trusted", () => {
  for (const bad of [
    "{not json",
    JSON.stringify({ ownerId: SITTING.ownerId, jobId: SITTING.jobId }),
    JSON.stringify({ ...SITTING, applicationId: "" }),
    JSON.stringify({ ...SITTING, fieldsAnswered: "14" }),
    JSON.stringify({ ...SITTING, ownerId: "" }),
    JSON.stringify({ ...SITTING, answersGiven: "two" }),
    JSON.stringify({ ...SITTING, answersGiven: [{ question: "only half" }] }),
    JSON.stringify(null),
  ]) {
    store.clear();
    store.set("litos_start_sitting_v1", bad);
    assert.equal(readStartSitting(SITTING.ownerId), null, `accepted: ${bad}`);
  }
});

test("forgetting clears it", () => {
  store.clear();
  rememberStartSitting(SITTING);
  forgetStartSitting();
  assert.equal(readStartSitting(SITTING.ownerId), null);
});

test("a storage that throws never breaks the flow it is helping", () => {
  const saved = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    },
  };
  assert.doesNotThrow(() => rememberStartSitting(SITTING));
  assert.doesNotThrow(() => forgetStartSitting());
  assert.equal(readStartSitting(SITTING.ownerId), null);
  (globalThis as { window?: unknown }).window = saved;
});
