import test from "node:test";
import assert from "node:assert/strict";
import { updatePasswordSession } from "./password-session.ts";

const INPUT = {
  apiUrl: "https://api.example.test",
  token: "old-token",
  password: "a new private phrase",
};

test("password update adopts the replacement token", async () => {
  const result = await updatePasswordSession(INPUT, async () =>
    new Response(JSON.stringify({ token: "new-token", email: "person@example.com" }), { status: 200 })
  );
  assert.deepEqual(result, { kind: "success", token: "new-token", email: "person@example.com" });
});

test("definitive API rejection remains editable and retryable", async () => {
  const result = await updatePasswordSession(INPUT, async () =>
    new Response(JSON.stringify({ error: "Choose a less common password", code: "password_too_common" }), { status: 400 })
  );
  assert.deepEqual(result, {
    kind: "rejected",
    error: "Choose a less common password",
    code: "password_too_common",
  });
});

test("a concurrent session rotation requires account recovery", async () => {
  const result = await updatePasswordSession(INPUT, async () =>
    new Response(JSON.stringify({ error: "Session changed", code: "session_changed" }), { status: 409 })
  );
  assert.deepEqual(result, { kind: "recovery_required" });
});

test("an unauthenticated password update requires account recovery", async () => {
  const result = await updatePasswordSession(INPUT, async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  );
  assert.deepEqual(result, { kind: "recovery_required" });
});

test("an incorrect current password remains editable", async () => {
  const result = await updatePasswordSession(INPUT, async () =>
    new Response(JSON.stringify({
      error: "Current password is incorrect",
      code: "current_password_incorrect",
    }), { status: 401 })
  );
  assert.deepEqual(result, {
    kind: "rejected",
    error: "Current password is incorrect",
    code: "current_password_incorrect",
  });
});

test("an expired recent verification requires account recovery", async () => {
  const result = await updatePasswordSession(INPUT, async () =>
    new Response(JSON.stringify({
      error: "Verify again",
      code: "recent_verification_required",
    }), { status: 403 })
  );
  assert.deepEqual(result, { kind: "recovery_required" });
});

test("a server failure after session rotation requires account recovery", async () => {
  let calls = 0;
  const result = await updatePasswordSession(INPUT, async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ error: "Bad gateway" }), { status: 502 })
      : new Response(null, { status: 401 });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { kind: "recovery_required" });
});

test("a server failure remains retryable when the old session survives", async () => {
  let calls = 0;
  const result = await updatePasswordSession(INPUT, async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
      : new Response("{}", { status: 200 });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { kind: "rejected", error: "Service unavailable. Try again." });
});

test("lost mutation response detects a rotated session and requires recovery", async () => {
  let calls = 0;
  const result = await updatePasswordSession(INPUT, async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("connection lost");
    return new Response(null, { status: 401 });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { kind: "recovery_required" });
});

test("lost mutation response permits retry only when the old session still works", async () => {
  let calls = 0;
  const result = await updatePasswordSession(INPUT, async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("connection lost");
    return new Response("{}", { status: 200 });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, {
    kind: "rejected",
    error: "Network error. Check your connection and try again.",
  });
});
