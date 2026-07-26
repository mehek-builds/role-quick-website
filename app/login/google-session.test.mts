import test from "node:test";
import assert from "node:assert/strict";
import { completeGoogleSession } from "./google-session.ts";

test("a first-time Google account stores its session and starts onboarding", async () => {
  const sessions: Array<[string, string]> = [];
  let returningRouteCalls = 0;
  const route = await completeGoogleSession(
    { token: "new-token", email: "new@gmail.com", is_new_user: true },
    {
      setSession: (token, email) => sessions.push([token, email]),
      returningUserRoute: async () => {
        returningRouteCalls += 1;
        return "/dashboard";
      },
    },
  );

  assert.equal(route, "/start");
  assert.deepEqual(sessions, [["new-token", "new@gmail.com"]]);
  assert.equal(returningRouteCalls, 0);
});

test("a returning Google account uses its current onboarding destination", async () => {
  const sessions: Array<[string, string]> = [];
  const route = await completeGoogleSession(
    { token: "returning-token", email: "returning@gmail.com", is_new_user: false },
    {
      setSession: (token, email) => sessions.push([token, email]),
      returningUserRoute: async () => "/dashboard",
    },
  );

  assert.equal(route, "/dashboard");
  assert.deepEqual(sessions, [["returning-token", "returning@gmail.com"]]);
});

test("a malformed success response never stores a partial session", async () => {
  let stored = false;
  const dependencies = {
    setSession: () => { stored = true; },
    returningUserRoute: async () => "/dashboard",
  };

  assert.equal(await completeGoogleSession({ token: "token" }, dependencies), null);
  assert.equal(await completeGoogleSession({ email: "person@gmail.com" }, dependencies), null);
  assert.equal(await completeGoogleSession(null, dependencies), null);
  assert.equal(stored, false);
});
