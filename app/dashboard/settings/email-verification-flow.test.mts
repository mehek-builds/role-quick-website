import assert from "node:assert/strict";
import test from "node:test";
import {
  hasActiveInbox,
  shouldEnableVerificationAfterCallback,
  verificationEnableDecision,
  verificationRouteAvailability,
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
});

test("a healthy Litos alias does not grant personal-inbox consent", () => {
  assert.equal(verificationEnableDecision(disconnected), "connect");
  assert.equal(verificationRouteAvailability({
    applicationEmail: { configured: true, tracking_active: true, domain: "applications@trylitos.com", aliases: [] },
    connections: disconnected,
    personalInboxConsent: false,
  }), "litos_inbox");
});

test("an unhealthy alias uses a connected inbox only with explicit consent", () => {
  const applicationEmail = {
    configured: true,
    tracking_active: false,
    tracking_blocked_reason: "inbound_disabled",
    domain: "applications@trylitos.com",
    aliases: [],
  };
  assert.equal(verificationRouteAvailability({
    applicationEmail,
    connections: connected,
    personalInboxConsent: false,
  }), "none");
  assert.equal(verificationRouteAvailability({
    applicationEmail,
    connections: connected,
    personalInboxConsent: true,
  }), "personal_inbox");
});

test("no route and a disconnected consent state stay distinguishable", () => {
  const applicationEmail = { configured: false, tracking_active: false, domain: null, aliases: [] };
  assert.equal(verificationRouteAvailability({
    applicationEmail,
    connections: disconnected,
    personalInboxConsent: false,
  }), "none");
  assert.equal(verificationRouteAvailability({
    applicationEmail,
    connections: disconnected,
    personalInboxConsent: true,
  }), "personal_inbox_disconnected");
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
