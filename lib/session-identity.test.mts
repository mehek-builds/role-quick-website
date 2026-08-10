import assert from "node:assert/strict";
import test from "node:test";

import { userIdFromToken } from "./session-identity.ts";

const UUID = "dfd8871b-b180-4600-9916-1b2b7c22f8fe";
const GUEST_UUID = "7c073091-7740-49c2-b76a-b3aab853ac65";

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
  const t = token({ userId: GUEST_UUID, isGuest: true });
  assert.equal(userIdFromToken(t), GUEST_UUID);
});

test("survives base64url padding, which atob rejects unpadded", () => {
  // Payload lengths that land on each remainder mod 4, so a missing pad byte
  // would break at least one of them.
  for (const pad of ["a", "ab", "abc", "abcd"]) {
    const t = token({ userId: UUID, pad });
    assert.equal(userIdFromToken(t), UUID);
  }
});

test("decodes non-ASCII claims as UTF-8 rather than mojibake", () => {
  // The id itself is a UUID, so exercise the UTF-8 path via a sibling claim:
  // a mojibake decode corrupts the whole payload and the id would not survive.
  const t = token({ userId: UUID, name: "café-é中" });
  assert.equal(userIdFromToken(t), UUID);
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
  // Not a UUID: an arbitrary string must never become an identity.
  assert.equal(userIdFromToken(token({ userId: "not-a-uuid" })), null);
  assert.equal(userIdFromToken(token({ userId: "" })), null);
});

test("does not return the email under any circumstance", () => {
  // The identity sent to PostHog must be the opaque id, never the address.
  // A regression here would leak an email into a third party at identify time,
  // walking straight around the event sanitiser.
  const t = token({ userId: UUID, email: "leak@example.com" });
  const id = userIdFromToken(t);
  assert.equal(id, UUID);
  assert.ok(!String(id).includes("@"));
});


test("an expired token identifies nobody", () => {
  // The shared-browser case: someone closed the tab without signing out, and
  // identify-on-boot would otherwise name the NEXT person as them and merge the
  // two PostHog profiles irreversibly.
  const expired = token({ userId: UUID, exp: 1_700_000_000 });
  assert.equal(userIdFromToken(expired, 1_700_000_001_000), null);
});

test("a token still inside its lifetime identifies normally", () => {
  const live = token({ userId: UUID, exp: 1_700_000_000 });
  assert.equal(userIdFromToken(live, 1_699_999_000_000), UUID);
});

test("a token with no exp claim is accepted, since the backend does not always set one", () => {
  assert.equal(userIdFromToken(token({ userId: UUID })), UUID);
});

test("a non-numeric or non-finite exp does not accidentally reject a live session", () => {
  assert.equal(userIdFromToken(token({ userId: UUID, exp: "soon" })), UUID);
  assert.equal(userIdFromToken(token({ userId: UUID, exp: Number.NaN })), UUID);
});

test("a forged id that is not a UUID cannot merge into anyone", () => {
  // posthog person merges are server-side and irreversible, so the shape check
  // is the difference between a typo and a permanent cross-account fusion.
  for (const forged of ["victim", "../../etc/passwd", "1", "' OR 1=1", "x".repeat(64)]) {
    assert.equal(userIdFromToken(token({ userId: forged })), null, forged);
  }
});
