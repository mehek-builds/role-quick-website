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

const { armHandoffs, clearExtensionSession, createCheckoutThroughExtension, ensureCurrentExtensionSession, ensureExtensionSession, extensionVersionAtLeast, minimumAttendedHandoffExtensionVersion, retryPremiumActionThroughExtension, sendToExtension, startFreeFillThroughExtension, verifyExtensionCheckoutReturn } = await import(
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
    if (typed.type === "LITOS_PING") return { ok: true, signedIn: false, version: "0.5.10" };
    if (typed.type === "LITOS_ADOPT_SESSION") return { ok: true, outcome: "adopted" };
    return {};
  });

  const state = await ensureExtensionSession({ token: "jwt-abc", guest: false });
  assert.deepEqual(state, { installed: true, signedIn: true, otherAccount: false, version: "0.5.10", updateRequired: false });
  const adopt = calls.find((call) => (call as { type: string }).type === "LITOS_ADOPT_SESSION");
  assert.deepEqual(adopt, { type: "LITOS_ADOPT_SESSION", token: "jwt-abc" });
});

test("an extension that already has a session still verifies the current website account", async () => {
  reset((message) => (message as { type: string }).type === "LITOS_PING"
    ? { ok: true, signedIn: true, version: "0.5.10" }
    : { ok: true, outcome: "already_signed_in" });
  const state = await ensureExtensionSession({ token: "jwt-abc", guest: false });
  assert.equal(state.signedIn, true);
  assert.deepEqual(calls, [
    { type: "LITOS_PING" },
    { type: "LITOS_ADOPT_SESSION", token: "jwt-abc" },
  ]);
});

/* A guest has no account to hand over. Signing the extension in as one would leave it applying as
   somebody the applicant cannot see or sign out of. */
test("a guest session is never handed over", async () => {
  reset(() => ({ ok: true, signedIn: false, version: "0.5.10" }));
  const state = await ensureExtensionSession({ token: "guest-jwt", guest: true });
  assert.deepEqual(state, { installed: true, signedIn: false, otherAccount: false, version: "0.5.10", updateRequired: false });
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
  assert.deepEqual(state, { installed: false, signedIn: false, otherAccount: false, version: null, updateRequired: false });
});

test("an extension signed in to someone else is reported rather than overridden", async () => {
  reset((message) => {
    const typed = message as { type: string };
    if (typed.type === "LITOS_PING") return { ok: true, signedIn: true, version: "0.5.10" };
    return { ok: false, outcome: "different_account" };
  });
  const state = await ensureExtensionSession({ token: "jwt-abc", guest: false });
  assert.deepEqual(state, { installed: true, signedIn: false, otherAccount: true, version: "0.5.10", updateRequired: false });
});

test("the handover happens once per page load however many callers ask", async () => {
  reset((message) => (message as { type: string }).type === "LITOS_PING"
    ? { ok: true, signedIn: true, version: "0.5.10" }
    : { ok: true, outcome: "already_signed_in" });
  await Promise.all([
    ensureExtensionSession({ token: "jwt-abc", guest: false }),
    ensureExtensionSession({ token: "jwt-abc", guest: false }),
    ensureExtensionSession({ token: "jwt-abc", guest: false }),
  ]);
  assert.equal(calls.length, 2);
});

test("the attended path performs a fresh identity check", async () => {
  let accountChecks = 0;
  reset((message) => {
    const type = (message as { type: string }).type;
    if (type === "LITOS_PING") return { ok: true, signedIn: true, version: "0.5.10" };
    if (type === "LITOS_ADOPT_SESSION") accountChecks += 1;
    return { ok: true, outcome: "already_signed_in" };
  });
  await ensureExtensionSession({ token: "jwt-abc", guest: false });
  await ensureCurrentExtensionSession({ token: "jwt-abc", guest: false });
  assert.equal(accountChecks, 2);
});

test("extension versions compare numerically and reject missing or malformed reports", () => {
  assert.equal(extensionVersionAtLeast("0.5.10", "0.5.10"), true);
  assert.equal(extensionVersionAtLeast("0.5.11", "0.5.10"), true);
  assert.equal(extensionVersionAtLeast("0.6.0", "0.5.10"), true);
  assert.equal(extensionVersionAtLeast("0.5.9", "0.5.10"), false);
  assert.equal(extensionVersionAtLeast("0.5.10-beta", "0.5.10"), false);
  assert.equal(extensionVersionAtLeast(undefined, "0.5.10"), false);
});

test("the published 0.5.9 client is installed but held for an update", async () => {
  reset(() => ({ ok: true, signedIn: true, version: "0.5.9" }));
  const state = await ensureCurrentExtensionSession({ token: "jwt-abc", guest: false });
  assert.deepEqual(state, {
    installed: true,
    signedIn: false,
    otherAccount: false,
    version: "0.5.9",
    updateRequired: true,
  });
  assert.equal(calls.some((call) => (call as { type: string }).type === "LITOS_ADOPT_SESSION"), false);
});

test("Jobvite, iCIMS, and BambooHR require 0.5.11 while SmartRecruiters retains 0.5.10", async () => {
  assert.equal(minimumAttendedHandoffExtensionVersion("smartrecruiters"), "0.5.10");
  assert.equal(minimumAttendedHandoffExtensionVersion("jobvite"), "0.5.11");
  assert.equal(minimumAttendedHandoffExtensionVersion("icims"), "0.5.11");
  assert.equal(minimumAttendedHandoffExtensionVersion("bamboohr"), "0.5.11");
  assert.equal(minimumAttendedHandoffExtensionVersion("oraclecloud"), "0.5.12");
  reset(() => ({ ok: true, signedIn: true, version: "0.5.10" }));
  const state = await ensureCurrentExtensionSession(
    { token: "jwt-abc", guest: false },
    minimumAttendedHandoffExtensionVersion("jobvite"),
  );
  assert.equal(state.updateRequired, true);
  assert.equal(calls.some((call) => (call as { type: string }).type === "LITOS_ADOPT_SESSION"), false);
});

test("signing out here tells the extension to sign out too", async () => {
  reset(() => ({ ok: true }));
  clearExtensionSession();
  await new Promise((resolve) => queueMicrotask(() => resolve(null)));
  assert.deepEqual(calls[0], { type: "LITOS_CLEAR_SESSION" });
});

test("extension checkout carries the selected paid term and trigger to the extension account", async () => {
  reset(() => ({ ok: true, checkout_url: "https://checkout.stripe.com/c/pay/cs_test_litos" }));
  const checkoutUrl = await createCheckoutThroughExtension({
    planId: "litos_plus_quarter",
    placement: "public_pricing",
    trigger: "tailor_resume_limit",
    actionNonce: "action-123",
  });
  assert.equal(checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_litos");
  assert.deepEqual(calls[0], {
    type: "LITOS_CREATE_CHECKOUT",
    plan_id: "litos_plus_quarter",
    surface: "extension",
    placement: "public_pricing",
    trigger: "tailor_resume_limit",
    action_nonce: "action-123",
  });
});

test("extension checkout explains missing sessions and rejects non-Stripe destinations", async () => {
  reset(() => ({ ok: false, code: "missing_token", error: "Unauthorized" }));
  await assert.rejects(
    createCheckoutThroughExtension({ planId: "litos_plus_week", placement: "public_pricing", trigger: "pricing_plan" }),
    /extension is signed out/i,
  );

  reset(() => ({ ok: true, checkout_url: "https://evil.example/c/pay/cs_test_litos" }));
  await assert.rejects(
    createCheckoutThroughExtension({ planId: "litos_plus_week", placement: "public_pricing", trigger: "pricing_plan" }),
    /invalid Stripe checkout link/i,
  );
});

test("billing return asks the extension to refresh its own entitlements and preserve the action", async () => {
  reset(() => ({ ok: true, active: true, access_class: "plus_paid", revision: 8, account_id: "account-extension", action_ready: true }));
  const result = await verifyExtensionCheckoutReturn({ status: "active", context: "tailor_resume", actionNonce: "action-123" });
  assert.deepEqual(calls[0], {
    type: "LITOS_CHECKOUT_RETURN",
    status: "active",
    context: "tailor_resume",
    action_nonce: "action-123",
  });
  assert.deepEqual(result, { ok: true, active: true, access_class: "plus_paid", revision: 8, account_id: "account-extension", action_ready: true });
});

test("extension premium actions retry only through an explicit bridge call", async () => {
  reset(() => ({ ok: true, opened: true }));
  await retryPremiumActionThroughExtension("action-123");
  assert.deepEqual(calls[0], {
    type: "LITOS_RETRY_PREMIUM_ACTION",
    action_nonce: "action-123",
  });

  reset(() => ({ ok: false, code: "action_expired", error: "Expired" }));
  await assert.rejects(retryPremiumActionThroughExtension("action-123"), /no longer available/i);
});

test("canonical Free filling uses its own extension mode and sends no client API URL", async () => {
  reset(() => ({ ok: true, armed: true }));
  await startFreeFillThroughExtension({
    applicationId: "canonical-application",
    portalUrl: "https://jobs.lever.co/litos/role",
  });
  assert.deepEqual(calls[0], {
    type: "LITOS_START_FREE_FILL",
    application_id: "canonical-application",
    portal_url: "https://jobs.lever.co/litos/role",
  });
  assert.equal("fill_data_url" in (calls[0] as Record<string, unknown>), false);
});

test("canonical Free filling fails closed when the extension does not arm it", async () => {
  reset(() => ({ ok: false, armed: false, error: "Fill data did not match." }));
  await assert.rejects(
    startFreeFillThroughExtension({
      applicationId: "canonical-application",
      portalUrl: "https://jobs.lever.co/litos/role",
    }),
    /Fill data did not match/,
  );

  reset(() => ({ ok: true, armed: true }));
  await assert.rejects(
    startFreeFillThroughExtension({ applicationId: "canonical-application", portalUrl: "http://jobs.example/role" }),
    /URL is invalid/,
  );
  assert.equal(calls.length, 0);
});

test("only applications with a portal url are armed, and an acknowledgement is required", async () => {
  reset(() => ({ ok: true, armed: 1 }));
  assert.equal(await armHandoffs([{ id: "a", portalUrl: undefined }]), false);
  assert.equal(calls.length, 0);

  assert.equal(await armHandoffs([
    { id: "a", portalUrl: "https://jobs.lever.co/palantir/9e40/apply" },
    { id: "b", portalUrl: undefined },
  ]), true);
  assert.deepEqual(calls[0], {
    type: "LITOS_ARM_HANDOFF",
    applications: [{ url: "https://jobs.lever.co/palantir/9e40/apply", applicationId: "a" }],
  });
});

test("arming fails closed when the extension does not acknowledge the binding", async () => {
  reset(() => ({ ok: false, armed: 0 }));
  assert.equal(await armHandoffs([{ id: "a", portalUrl: "https://jobs.lever.co/palantir/9e40/apply" }]), false);
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
