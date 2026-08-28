import assert from "node:assert/strict";
import test from "node:test";
import { websiteReleaseIdentity } from "./release-identity.ts";

const REVISION = "0123456789abcdef0123456789abcdef01234567";
const BUILD_TIME = "2026-08-26T01:02:03.000Z";

test("a complete release identity exposes the exact source revision and build", () => {
  assert.deepEqual(
    websiteReleaseIdentity({
      version: "0.2.0",
      revision: REVISION.toUpperCase(),
      buildTime: BUILD_TIME,
    }),
    {
      ok: true,
      service: "litos-website",
      version: "0.2.0",
      revision: REVISION,
      build_time: BUILD_TIME,
      identity_complete: true,
    },
  );
});

test("local builds are visibly incomplete and cannot pass an exact production canary", () => {
  const identity = websiteReleaseIdentity({
    version: "0.2.0",
    revision: "local",
    buildTime: BUILD_TIME,
  });
  assert.equal(identity.revision, "local");
  assert.equal(identity.identity_complete, false);
});

test("missing, abbreviated, and malformed revisions fail closed", () => {
  for (const revision of [undefined, "", "0123456", `${REVISION}00`, "g".repeat(40)]) {
    assert.throws(
      () => websiteReleaseIdentity({ version: "0.2.0", revision, buildTime: BUILD_TIME }),
      /revision is missing or invalid/,
    );
  }
});

test("missing or noncanonical build times fail closed", () => {
  for (const buildTime of [undefined, "", "latest", "2026-08-26", "2026-08-26T01:02:03Z"]) {
    assert.throws(
      () => websiteReleaseIdentity({ version: "0.2.0", revision: REVISION, buildTime }),
      /build time is missing or invalid|build time is not a canonical ISO instant/,
    );
  }
});
