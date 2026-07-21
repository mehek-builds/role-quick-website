import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { portalName, reviewablePackets } from "../lib/application-review.ts";

describe("dashboard application review compatibility", () => {
  test("legacy resumes without review metadata cannot become dead selectable cards", () => {
    const legacy = { id: "legacy", spec: {} };
    const current = { id: "current", spec: { _review: { jd_text: "Build software" } } };

    assert.deepEqual(reviewablePackets([legacy, current]), [current]);
  });

  test("recognizes the common portal families used by review packets", () => {
    assert.equal(portalName("https://job-boards.greenhouse.io/acme/jobs/123"), "Greenhouse");
    assert.equal(portalName("https://jobs.ashbyhq.com/acme/123"), "Ashby");
    assert.equal(portalName("https://acme.wd1.myworkdayjobs.com/job/123"), "Workday");
    assert.equal(portalName("https://careers.acme.com/jobs/123"), "Company portal");
  });
});
