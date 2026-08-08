import assert from "node:assert/strict";
import test from "node:test";

/* The bridge reads window.chrome at call time, so the fake goes up before the module is imported
   only for tidiness - it is re-read on every call and can be swapped between tests. */
type Reply = (message: unknown) => unknown;

const calls: unknown[] = [];
let reply: Reply = () => ({});
let lastError: { message?: string } | undefined;

(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    sendMessage(_id: string, message: unknown, callback: (response: unknown) => void) {
      calls.push(message);
      const value = reply(message);
      queueMicrotask(() => callback(value));
    },
    get lastError() {
      return lastError;
    },
  },
};

const { armHandoffs, clearExtensionSession, ensureExtensionSession, sendToExtension } = await import(
  "./extension-bridge.ts"
);

function reset(next: Reply) {
  calls.length = 0;
  lastError = undefined;
  reply = next;
  clearExtensionSession();
  calls.length = 0;
}

/* The reported defect: the website is signed in, the extension is not, and nothing ever told it.
   The handover is the whole fix, so this is the test that would have failed before it existed. */
test("an extension that answers 'not signed in' is handed this session", async () => {
  reset((message) => {
    const typed = message as { type: string };
    if (typed.type === "LITOS_PING") return { ok: true, signedIn: false };
    if (typed.type === "LITOS_ADOPT_SESSION") return { ok: true, outcome: "adopted" };
    return {};
  });

  const state = await ensureExtensionSession({ token: "jwt-abc", guest: false });
  assert.deepEqual(state, { installed: true, signedIn: true, otherAccount: false });
  const adopt = calls.find((call) => (call as { type: string }).type === "LITOS_ADOPT_SESSION");
  assert.deepEqual(adopt, { type: "LITOS_ADOPT_SESSION", token: "jwt-abc" });
});

test("an extension that already has a session is not handed another one", async () => {
  reset(() => ({ ok: true, signedIn: true }));
  const state = await ensureExtensionSession({ token: "jwt-abc", guest: false });
  assert.equal(state.signedIn, true);
  assert.equal(
    calls.some((call) => (call as { type: string }).type === "LITOS_ADOPT_SESSION"),
    false,
  );
});

/* A guest has no account to hand over. Signing the extension in as one would leave it applying as
   somebody the applicant cannot see or sign out of. */
test("a guest session is never handed over", async () => {
  reset(() => ({ ok: true, signedIn: false }));
  const state = await ensureExtensionSession({ token: "guest-jwt", guest: true });
  assert.deepEqual(state, { installed: true, signedIn: false, otherAccount: false });
  assert.equal(
    calls.some((call) => (call as { type: string }).type === "LITOS_ADOPT_SESSION"),
    false,
  );
});

/* No extension must never read as "signed in", because the copy on the waiting-on-you card keys
   off exactly this and would go back to promising a fill that nothing is going to perform. */
test("an extension that is not installed reports absent, not signed in", async () => {
  reset(() => {
    lastError = { message: "Could not establish connection." };
    return undefined;
  });
  const state = await ensureExtensionSession({ token: "jwt-abc", guest: false });
  assert.deepEqual(state, { installed: false, signedIn: false, otherAccount: false });
});

test("an extension signed in to someone else is reported rather than overridden", async () => {
  reset((message) => {
    const typed = message as { type: string };
    if (typed.type === "LITOS_PING") return { ok: true, signedIn: false };
    return { ok: false, outcome: "different_account" };
  });
  const state = await ensureExtensionSession({ token: "jwt-abc", guest: false });
  assert.deepEqual(state, { installed: true, signedIn: false, otherAccount: true });
});

test("the handover happens once per page load however many callers ask", async () => {
  reset(() => ({ ok: true, signedIn: true }));
  await Promise.all([
    ensureExtensionSession({ token: "jwt-abc", guest: false }),
    ensureExtensionSession({ token: "jwt-abc", guest: false }),
    ensureExtensionSession({ token: "jwt-abc", guest: false }),
  ]);
  assert.equal(calls.length, 1);
});

test("signing out here tells the extension to sign out too", async () => {
  reset(() => ({ ok: true }));
  clearExtensionSession();
  await new Promise((resolve) => queueMicrotask(() => resolve(null)));
  assert.deepEqual(calls[0], { type: "LITOS_CLEAR_SESSION" });
});

test("only applications with a portal url are armed, and none means no message at all", async () => {
  reset(() => ({ ok: true }));
  await armHandoffs([{ id: "a", portalUrl: undefined }]);
  assert.equal(calls.length, 0);

  await armHandoffs([
    { id: "a", portalUrl: "https://jobs.lever.co/palantir/9e40/apply" },
    { id: "b", portalUrl: undefined },
  ]);
  assert.deepEqual(calls[0], {
    type: "LITOS_ARM_HANDOFF",
    applications: [{ url: "https://jobs.lever.co/palantir/9e40/apply", applicationId: "a" }],
  });
});

/* A service worker that never wakes must not hang the caller forever: every consumer of this
   module is deciding what to render. */
test("a silent extension resolves rather than hanging", async () => {
  const runtime = (globalThis as unknown as { chrome: { runtime: { sendMessage: unknown } } }).chrome.runtime;
  const original = runtime.sendMessage;
  runtime.sendMessage = () => {
    /* never calls back */
  };
  try {
    const started = Date.now();
    const result = await sendToExtension({ type: "LITOS_PING" });
    assert.equal(result, null);
    assert.ok(Date.now() - started < 10_000);
  } finally {
    runtime.sendMessage = original;
  }
});
