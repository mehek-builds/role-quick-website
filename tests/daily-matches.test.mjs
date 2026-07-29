import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AUTO_SUBMIT_PREPARED_LIMIT,
  canGenerateFrom,
  countPreparedJobs,
  packetMatchesJob,
  rankJobs,
  resumeGenerationBody,
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
  /* 20, and only for students who turned automatic submission on. It was 30 for everyone, which
     spent people's monthly resume quota building packets for jobs they never opened. */
  test("builds ahead for 20 roles, and only under automatic submission", () => {
    assert.equal(AUTO_SUBMIT_PREPARED_LIMIT, 20);
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

describe("resumeGenerationBody", () => {
  const identity = { full_name: "Alex Rivera", email: "alex@example.com" };
  const applicationProfile = { phone: "+1 213 555 0100" };

  /* The prewarm loop is how most packets are created, and once a packet exists, opening the posting
     from the jobs list reuses it instead of generating again. So if the id is missing here it is
     missing almost everywhere, and the "Applied" badge falls back to company+role for nearly every
     application, which is the sibling bug this whole change exists to remove. */
  test("records the posting id, so the Applied badge can be exact", () => {
    const body = resumeGenerationBody(jobs[0], identity, applicationProfile, null);
    assert.equal(body.job_id, jobs[0].id);
  });

  test("still sends everything the generate route needs", () => {
    const body = resumeGenerationBody(jobs[0], identity, applicationProfile, null);
    assert.equal(body.company, jobs[0].company_name);
    assert.equal(body.role, jobs[0].title);
    assert.equal(body.jd_text, jobs[0].description);
    assert.equal(body.application.portal_url, jobs[0].apply_url);
    assert.equal(body.contact.full_name, "Alex Rivera");
  });
});

describe("canGenerateFrom", () => {
  const fromPosting = {
    company: "Acme Labs",
    role: "Product Engineer",
    portalUrl: "https://jobs.acme.test/1",
    jobDescription: "Build React and TypeScript product systems for our platform team.",
  };

  test("a normal posting can be generated from without asking", () => {
    assert.equal(canGenerateFrom(fromPosting), true);
  });

  /* "Apply now" generates immediately with nothing typed, so a posting that cannot be generated
     from has to be caught before the request. Otherwise the student who filled in nothing is told
     to "fill in all four boxes first". */
  test("a stub description is caught before the request is spent", () => {
    assert.equal(canGenerateFrom({ ...fromPosting, jobDescription: "See website." }), false);
  });

  test("a non-https link is caught", () => {
    assert.equal(canGenerateFrom({ ...fromPosting, portalUrl: "http://jobs.acme.test/1" }), false);
  });

  test("an unparseable link is caught rather than thrown", () => {
    assert.equal(canGenerateFrom({ ...fromPosting, portalUrl: "not a url" }), false);
  });

  test("missing company or role is caught", () => {
    assert.equal(canGenerateFrom({ ...fromPosting, company: "   " }), false);
    assert.equal(canGenerateFrom({ ...fromPosting, role: "" }), false);
  });
});
