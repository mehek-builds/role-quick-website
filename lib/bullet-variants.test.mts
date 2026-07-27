import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { restatesSameBullet, bulletOverlap } from "./bullet-variants.ts";

describe("restatesSameBullet", () => {
  test("two phrasings of one deploy bullet are the same bullet", () => {
    // The case that shipped a visible near-duplicate: accepting the Kubernetes variant printed it
    // directly under the identical sentence ending in AWS.
    const aws = "Containerized six services with Docker and deployed them on AWS, cutting release time by 35%";
    const k8s = "Containerized six services with Docker and deployed them on Kubernetes, cutting release time by 35%";
    assert.equal(restatesSameBullet(aws, k8s), true);
  });

  test("two genuinely different bullets are not merged", () => {
    const a = "Built a TypeScript and React dashboard backed by a PostgreSQL database";
    const b = "Provisioned infrastructure with Terraform across two environments";
    assert.equal(restatesSameBullet(a, b), false);
  });

  test("a short bullet does not swallow a long unrelated one", () => {
    assert.equal(restatesSameBullet("Wrote Python pipelines", "Led a team of four designers"), false);
  });

  test("empty input is not a match, and does not divide by zero", () => {
    assert.equal(bulletOverlap("", "anything at all here"), 0);
    assert.equal(restatesSameBullet("", ""), false);
  });

  test("the threshold matches the backend's entry_overlaps warning", () => {
    // Keeping both bullets would be flagged as a defect by resumeValidate at exactly this overlap,
    // so the swap should trigger at exactly this overlap.
    const a = "Shipped a Chrome extension that autofills applications on Greenhouse and Lever";
    const b = "Shipped a Chrome extension that autofills applications on Greenhouse, Lever and Ashby";
    assert.ok(bulletOverlap(a, b) >= 0.3);
    assert.equal(restatesSameBullet(a, b), true);
  });
});
