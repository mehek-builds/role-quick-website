import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AUTO_SUBMIT_PREPARED_LIMIT,
  canGenerateFrom,
  countPreparedJobs,
  jobSubmittedOnDay,
  nextPreferredReadyPacket,
  packetMatchesJob,
  rankJobs,
  resumeGenerationBody,
} from "../features/applications/domain/daily-matches.ts";

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
    match_score: 91,
    preference_score: 96,
    preference_reasons: ["Product Engineer", "software engineering", "New York"],
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
    match_score: 86,
    preference_score: 40,
    preference_reasons: ["full time"],
  },
];

describe("daily match preparation", () => {
  /* 20, and only for students who turned automatic submission on. It was 30 for everyone, which
     spent people's monthly resume quota building packets for jobs they never opened. */
  test("builds ahead for 20 roles, and only under automatic submission", () => {
    assert.equal(AUTO_SUBMIT_PREPARED_LIMIT, 20);
  });

  test("preserves the backend order and preference evidence", () => {
    const ranked = rankJobs(jobs);

    assert.equal(ranked[0].id, "1");
    assert.ok(ranked[0].match > ranked[1].match);
    assert.deepEqual(ranked[0].reasons, ["Product Engineer", "software engineering", "New York"]);
  });

  test("recognizes an existing packet despite punctuation and case differences", () => {
    const packet = { job_context: { company: "ACME LABS", role: "Product-Engineer" } };
    assert.equal(packetMatchesJob(packet, jobs[0]), true);
    assert.equal(packetMatchesJob(packet, jobs[1]), false);
  });

  /* THE BUG THIS CLOSES. Two reqs, same employer, same title, different city. A packet built for
     one used to answer for the other, so opening the second from the jobs list showed a resume
     tailored to the first and skipped building one for the posting actually opened. */
  test("a packet that knows its posting does not answer for a sibling", () => {
    const sibling = { ...jobs[0], id: "sibling", location: "New York" };
    const packet = { job_context: { company: "Acme Labs", role: "Product Engineer", job_id: jobs[0].id } };
    assert.equal(packetMatchesJob(packet, jobs[0]), true, "the posting it was built for");
    assert.equal(packetMatchesJob(packet, sibling), false, "same company and title, different req");
  });

  test("a packet with no posting id still matches on company and role", () => {
    // Everything generated before the id was recorded, and anything from the extension.
    const packet = { job_context: { company: "Acme Labs", role: "Product Engineer" } };
    assert.equal(packetMatchesJob(packet, jobs[0]), true);
    assert.equal(packetMatchesJob(packet, { ...jobs[0], id: "sibling" }), true, "still lossy, unfixably");
  });

  test("a null posting id is treated as absent, not as a value to match", () => {
    const packet = { job_context: { company: "Acme Labs", role: "Product Engineer", job_id: null } };
    assert.equal(packetMatchesJob(packet, jobs[0]), true);
  });

  test("an id-bearing packet for a different job does not match on company and role either", () => {
    const packet = { job_context: { company: "Acme Labs", role: "Product Engineer", job_id: "some-other-job" } };
    assert.equal(packetMatchesJob(packet, jobs[0]), false);
  });

  test("counts only jobs whose tailored packet is already available", () => {
    const ranked = rankJobs(jobs, null, null);
    const packets = [{ job_context: { company: "Acme Labs", role: "Product Engineer" } }];
    assert.equal(countPreparedJobs(ranked, packets), 1);
  });

  test("the next application follows current preference order, not packet recency", () => {
    const oldPreferred = {
      id: "preferred-packet",
      created_at: "2026-07-01T00:00:00.000Z",
      job_context: { company: "Acme Labs", role: "Product Engineer", job_id: "1" },
      spec: { _review: { status: "ready_to_submit", updated_at: "2026-07-01T00:00:00.000Z" } },
    };
    const newOutsideCriteria = {
      id: "stale-packet",
      created_at: "2026-08-01T00:00:00.000Z",
      job_context: { company: "Other Co", role: "Operations Associate", job_id: "2" },
      spec: { _review: { status: "ready_to_submit", updated_at: "2026-08-01T00:00:00.000Z" } },
    };

    assert.equal(nextPreferredReadyPacket([newOutsideCriteria, oldPreferred], [jobs[0]])?.id, "preferred-packet");
    assert.equal(nextPreferredReadyPacket([newOutsideCriteria], [jobs[0]]), null);
  });

  test("a non-ready packet is never selected even when its job matches", () => {
    const packet = {
      id: "submitted-packet",
      created_at: "2026-08-01T00:00:00.000Z",
      job_context: { company: "Acme Labs", role: "Product Engineer", job_id: "1" },
      spec: { _review: { status: "submitted", updated_at: "2026-08-01T00:00:00.000Z" } },
    };

    assert.equal(nextPreferredReadyPacket([packet], [jobs[0]]), null);
  });

  test("finishes a daily match only after that exact posting was submitted today", () => {
    const today = "2026-07-30";
    const submitted = {
      job_context: { company: "Acme Labs", role: "Product Engineer", job_id: jobs[0].id },
      spec: { _review: { status: "submitted", submitted_at: `${today}T08:00:00.000Z` } },
    };
    const ready = {
      ...submitted,
      spec: { _review: { status: "ready_to_submit", submitted_at: null } },
    };
    const yesterday = {
      ...submitted,
      spec: { _review: { status: "submitted", submitted_at: "2026-07-29T23:59:59.000Z" } },
    };

    assert.equal(jobSubmittedOnDay(jobs[0], [submitted], today), true);
    assert.equal(jobSubmittedOnDay(jobs[0], [ready], today), false);
    assert.equal(jobSubmittedOnDay(jobs[0], [yesterday], today), false);
    assert.equal(jobSubmittedOnDay(jobs[1], [submitted], today), false);
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
