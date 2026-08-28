import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  attendedHandoffCapabilitiesEqual,
  attendedHandoffCapabilityFromUnknown,
  attendedHandoffCapabilityMatchesUrl,
  canonicalAttendedCapabilityUrl,
} from "./attended-handoff-capability.ts";

const url = "https://employer.example/apply?job=123";
const capability = {
  version: "attended_handoff_v1" as const,
  kind: "self_submit" as const,
  capability_sha256: "a".repeat(64),
  url_sha256: createHash("sha256").update(url).digest("hex"),
};

test("an opaque capability is strict and equality includes both digests and kind", () => {
  assert.deepEqual(attendedHandoffCapabilityFromUnknown(capability), capability);
  assert.equal(attendedHandoffCapabilitiesEqual(capability, { ...capability }), true);
  assert.equal(attendedHandoffCapabilitiesEqual(capability, { ...capability, kind: "manual_handoff" }), false);
  assert.equal(attendedHandoffCapabilitiesEqual(capability, { ...capability, capability_sha256: "b".repeat(64) }), false);
  assert.equal(attendedHandoffCapabilityFromUnknown({ ...capability, url_sha256: "A".repeat(64) }), null);
});

test("the authorized URL must hash to the passive capability", async () => {
  assert.equal(await attendedHandoffCapabilityMatchesUrl(capability, "self_submit", url), true);
  assert.equal(await attendedHandoffCapabilityMatchesUrl(capability, "manual_handoff", url), false);
  assert.equal(await attendedHandoffCapabilityMatchesUrl(capability, "self_submit", "https://other.example/apply"), false);
});

test("capability URLs are canonical HTTPS URLs without credentials or fragments", () => {
  assert.equal(canonicalAttendedCapabilityUrl(url), url);
  assert.equal(canonicalAttendedCapabilityUrl("http://employer.example/apply"), null);
  assert.equal(canonicalAttendedCapabilityUrl("https://user:pass@employer.example/apply"), null);
  assert.equal(canonicalAttendedCapabilityUrl("https://employer.example/apply#submit"), null);
});
