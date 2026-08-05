import assert from "node:assert/strict";
import test from "node:test";

import { userIdFromToken } from "./session-identity.ts";

/** Build a token the way the backend does: base64url, no padding. */
function token(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${body}.signature`;
}

test("reads userId from a real backend payload shape", () => {
  const t = token({
    userId: "dfd8871b-b180-4600-9916-1b2b7c22f8fe",
    email: "someone@example.com",
    isGuest: false,
    authMethod: "password",
    sessionVersion: 0,
  });
  assert.equal(userIdFromToken(t), "dfd8871b-b180-4600-9916-1b2b7c22f8fe");
});

test("reads userId for a guest session, which carries no email", () => {
  const t = token({ userId: "7c073091-7740-49c2-b76a-b3aab853ac65", isGuest: true });
  assert.equal(userIdFromToken(t), "7c073091-7740-49c2-b76a-b3aab853ac65");
});

test("survives base64url padding, which atob rejects unpadded", () => {
  // Payload lengths that land on each remainder mod 4, so a missing pad byte
  // would break at least one of them.
  for (const pad of ["a", "ab", "abc", "abcd"]) {
    const t = token({ userId: `id-${pad}` });
    assert.equal(userIdFromToken(t), `id-${pad}`);
  }
});

test("decodes non-ASCII claims as UTF-8 rather than mojibake", () => {
  const t = token({ userId: "id-café-é中" });
  assert.equal(userIdFromToken(t), "id-café-é中");
});

test("returns null rather than throwing on anything unusable", () => {
  assert.equal(userIdFromToken(null), null);
  assert.equal(userIdFromToken(undefined), null);
  assert.equal(userIdFromToken(""), null);
  assert.equal(userIdFromToken("not-a-jwt"), null);
  assert.equal(userIdFromToken("only.two"), null);
  assert.equal(userIdFromToken("a.!!!not-base64!!!.c"), null);
  assert.equal(userIdFromToken(token({ email: "no-user-id@example.com" })), null);
  assert.equal(userIdFromToken(token({ userId: 12345 })), null);
  assert.equal(userIdFromToken(token({ userId: "" })), null);
});

test("does not return the email under any circumstance", () => {
  // The identity sent to PostHog must be the opaque id, never the address.
  // A regression here would leak an email into a third party at identify time,
  // walking straight around the event sanitiser.
  const t = token({ userId: "abc-123", email: "leak@example.com" });
  const id = userIdFromToken(t);
  assert.equal(id, "abc-123");
  assert.ok(!String(id).includes("@"));
});
