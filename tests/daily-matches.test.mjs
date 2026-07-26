import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DAILY_PREPARED_RESUME_LIMIT,
  countPreparedJobs,
  packetMatchesJob,
  rankJobs,
} from "../lib/daily-matches.ts";

const jobs = [
  {
    id: "1",
    company_name: "Acme Labs",
    title: "Product Engineer",
    location: "New York",
    department: "Engineering",
    employment_type: "Full-time",
    description: "Build React and TypeScript product systems.",
    apply_url: "https://jobs.acme.test/1",
    posting_url: "https://jobs.acme.test/1",
    remote: false,
    posted_at: "2026-07-26T09:00:00.000Z",
    first_seen_at: "2026-07-26T09:00:00.000Z",
    ats_name: "greenhouse",
  },
  {
    id: "2",
    company_name: "Other Co",
    title: "Operations Associate",
    location: "Chicago",
    department: "Operations",
    employment_type: "Full-time",
    description: "Coordinate office operations.",
    apply_url: "https://jobs.other.test/2",
    posting_url: "https://jobs.other.test/2",
    remote: false,
    posted_at: "2026-07-26T10:00:00.000Z",
    first_seen_at: "2026-07-26T10:00:00.000Z",
    ats_name: "lever",
  },
];

describe("daily match preparation", () => {
  test("targets 30 ready resumes", () => {
    assert.equal(DAILY_PREPARED_RESUME_LIMIT, 30);
  });

  test("ranks target-title and resume-skill evidence ahead of recency", () => {
    const ranked = rankJobs(
      jobs,
      { titles: ["Product Engineer"], categories: ["Software engineering"], role_types: null, primary_period: null, backup_period: null },
      { skills: ["React", "TypeScript"], target_roles: ["Product Engineer"] },
    );

    assert.equal(ranked[0].id, "1");
    assert.ok(ranked[0].match > ranked[1].match);
    assert.deepEqual(ranked[0].reasons.slice(0, 2), ["Product", "React"]);
  });

  test("recognizes an existing packet despite punctuation and case differences", () => {
    const packet = { job_context: { company: "ACME LABS", role: "Product-Engineer" } };
    assert.equal(packetMatchesJob(packet, jobs[0]), true);
    assert.equal(packetMatchesJob(packet, jobs[1]), false);
  });

  test("counts only jobs whose tailored packet is already available", () => {
    const ranked = rankJobs(jobs, null, null);
    const packets = [{ job_context: { company: "Acme Labs", role: "Product Engineer" } }];
    assert.equal(countPreparedJobs(ranked, packets), 1);
  });
});
