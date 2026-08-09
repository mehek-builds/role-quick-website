import assert from "node:assert/strict";
import test from "node:test";
import {
  hasActiveInbox,
  shouldEnableVerificationAfterCallback,
  verificationEnableDecision,
} from "./email-verification-flow.ts";

const disconnected = {
  configured: true,
  connections: [
    { provider: "gmail" as const, connected: false, status: "NOT_CONNECTED" as const },
    { provider: "outlook" as const, connected: false, status: "NOT_CONNECTED" as const },
  ],
};

const connected = {
  ...disconnected,
  connections: [
    { provider: "gmail" as const, connected: true, status: "ACTIVE" as const },
    disconnected.connections[1],
  ],
};

test("enabling verification requires a connection when no inbox is active", () => {
  assert.equal(hasActiveInbox(disconnected), false);
  assert.equal(verificationEnableDecision(disconnected), "connect");
  assert.equal(verificationEnableDecision({ configured: false, connections: [] }), "unavailable");
  assert.equal(verificationEnableDecision(connected), "enable");
  assert.equal(verificationEnableDecision({ configured: false, connections: [] }, true), "enable");
});

test("the OAuth callback enables permission only for the requested active provider", () => {
  assert.equal(shouldEnableVerificationAfterCallback({
    callbackProvider: "gmail",
    callbackStatus: "success",
    intendedProvider: "gmail",
    connections: connected,
  }), true);
  assert.equal(shouldEnableVerificationAfterCallback({
    callbackProvider: "gmail",
    callbackStatus: "failed",
    intendedProvider: "gmail",
    connections: connected,
  }), false);
  assert.equal(shouldEnableVerificationAfterCallback({
    callbackProvider: "gmail",
    callbackStatus: "success",
    intendedProvider: "outlook",
    connections: connected,
  }), false);
  assert.equal(shouldEnableVerificationAfterCallback({
    callbackProvider: "gmail",
    callbackStatus: "success",
    intendedProvider: "gmail",
    connections: disconnected,
  }), false);
});
