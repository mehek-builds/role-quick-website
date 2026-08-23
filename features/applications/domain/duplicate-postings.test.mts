import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import type { GeneratedResume } from "@/lib/api";
import {
  atsPostingKey,
  duplicateBadge,
  duplicatePostingMarks,
  duplicatePostingNote,
  postingKeyOf,
} from "./duplicate-postings.ts";

/* Fixtures are real rows from production, user a18f774b: the twelve Akuna packets that share
   job_id b3ee590f, the three Deepgram packets whose location drifts, the three Fluency packets
   with no job_id at all, and the two Palantir requisitions that must NOT merge. */

const AKUNA_DIRECT = "https://job-boards.greenhouse.io/akunacapital/jobs/8018893";
const AKUNA_EMBED = "https://job-boards.greenhouse.io/embed/job_app?for=akunacapital&token=8018893";

function packet(over: {
  id: string;
  company?: string;
  role?: string;
  job_id?: string | null;
  portal_url?: string;
  status?: string;
  created_at?: string;
}): GeneratedResume {
  return {
    id: over.id,
    job_context: {
      company: over.company ?? "Akuna",
      role: over.role ?? "Software Engineer Intern - Full Stack Web, Summer 2027",
      job_id: over.job_id === undefined ? "b3ee590f-16f3-429f-940a-5edfb1b1b6dd" : over.job_id,
    },
    spec: {
      _review: {
        jd_text: "",
        status: (over.status ?? "needs_attention") as never,
        edited_terms: [],
        questions: [],
        skipped_reasons: [],
        updated_at: over.created_at ?? "2026-08-06T08:48:16.764Z",
        portal_url: over.portal_url ?? AKUNA_DIRECT,
      },
    } as unknown as GeneratedResume["spec"],
    created_at: over.created_at ?? "2026-08-06T08:48:16.764Z",
  };
}

describe("which packets are the same posting", () => {
  test("the two Greenhouse URL shapes of one posting reduce to one key", () => {
    assert.equal(atsPostingKey(AKUNA_DIRECT), "greenhouse:akunacapital:8018893");
    assert.equal(atsPostingKey(AKUNA_EMBED), "greenhouse:akunacapital:8018893");
    assert.notEqual(AKUNA_DIRECT, AKUNA_EMBED);
  });

  test("Ashby and Lever are read too", () => {
    assert.equal(
      atsPostingKey("https://jobs.ashbyhq.com/deepgram/dc8693b5-72ce-4ca3-ab15-9c8434d35da1/application"),
      "ashby:deepgram:dc8693b5-72ce-4ca3-ab15-9c8434d35da1",
    );
    assert.equal(atsPostingKey("https://jobs.lever.co/matician/6a1b2c3d"), "lever:matician:6a1b2c3d");
  });

  test("a company careers page falls through to job_id", () => {
    const key = postingKeyOf(packet({ id: "a", portal_url: "https://www.jumptrading.com/careers/1/" }));
    assert.equal(key, "job:b3ee590f-16f3-429f-940a-5edfb1b1b6dd");
  });

  test("a packet with neither falls through to company and role", () => {
    // Fluency Engineering Intern: three packets, job_id null on every one.
    const key = postingKeyOf(packet({
      id: "a", company: "Fluency", role: "Engineering Intern", job_id: null,
      portal_url: "https://fluency.example.com/apply",
    }));
    assert.equal(key, "cr:fluency|engineering intern");
  });

  test("a packet with no identity at all is left out rather than pooled", () => {
    const nameless = packet({ id: "a", company: "", role: "", job_id: null, portal_url: "https://example.com/x" });
    assert.equal(postingKeyOf(nameless), null);
    assert.equal(duplicatePostingMarks([nameless, { ...nameless, id: "b" }]).size, 0);
  });
});

describe("the marks a Tracker row gets", () => {
  const twelve = Array.from({ length: 12 }, (_, index) => packet({
    id: `akuna-${index}`,
    portal_url: index % 2 === 0 ? AKUNA_DIRECT : AKUNA_EMBED,
    created_at: `2026-08-06T${String(8 + index).padStart(2, "0")}:00:00.000Z`,
  }));

  test("all twelve Akuna packets land in one group across both URL shapes", () => {
    const marks = duplicatePostingMarks(twelve);
    assert.equal(marks.size, 12);
    for (const mark of marks.values()) assert.equal(mark.total, 12);
  });

  test("the oldest is the original and carries no badge; the other eleven do", () => {
    const marks = duplicatePostingMarks(twelve);
    assert.equal(duplicateBadge(marks.get("akuna-0")), null);
    assert.deepEqual(duplicateBadge(marks.get("akuna-11")), { label: "Duplicate", kind: "duplicate" });
  });

  test("once one of them is sent, every other row says Already applied", () => {
    const sent = twelve.map((row, index) => (index === 3 ? { ...row, spec: { ...row.spec, _review: { ...row.spec._review!, status: "submitted" as const } } } : row));
    const marks = duplicatePostingMarks(sent);
    assert.equal(duplicateBadge(marks.get("akuna-3")), null, "the sent one is the record, not a duplicate");
    assert.deepEqual(duplicateBadge(marks.get("akuna-0")), { label: "Already applied", kind: "warn" });
    assert.deepEqual(duplicateBadge(marks.get("akuna-11")), { label: "Already applied", kind: "warn" });
  });

  test("a lone packet is never badged", () => {
    assert.equal(duplicatePostingMarks([packet({ id: "solo" })]).size, 0);
  });

  test("two genuinely different Palantir requisitions stay apart", () => {
    const intel = packet({
      id: "intel", company: "Palantir", role: "Forward Deployed Software Engineer, Internship - Intel",
      job_id: "ec7002b9-ffcc-4cfd-8146-87ad77720d6a", portal_url: "https://job-boards.greenhouse.io/palantir/jobs/7000001",
    });
    const commercial = packet({
      id: "commercial", company: "Palantir", role: "Forward Deployed Software Engineer, Internship - Commercial",
      job_id: "8fb1ef1e-8b43-45c9-bb19-4fa0469d8dc0", portal_url: "https://job-boards.greenhouse.io/palantir/jobs/7000002",
    });
    assert.equal(duplicatePostingMarks([intel, commercial]).size, 0);
  });

  test("the note counts repeats, not rows, and stays silent when there are none", () => {
    assert.equal(duplicatePostingNote(duplicatePostingMarks([packet({ id: "solo" })])), null);
    const note = duplicatePostingNote(duplicatePostingMarks(twelve));
    assert.match(note ?? "", /^11 of these repeat a posting already in your Tracker\./);
    assert.match(note ?? "", /employers cap re-applications/);
  });
});

describe("the Tracker renders the mark, and computes it over every packet", () => {
  const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");

  test("the badge is rendered in both the desktop row and the mobile strip", () => {
    const desktop = page.indexOf("statusLabel(false, packet.spec._review.status)");
    const mobile = page.indexOf('{packet.job_context.company || "Company"}');
    assert.ok(desktop > 0 && mobile > 0);
    assert.match(page.slice(desktop - 400, desktop + 400), /duplicateBadge\(duplicateMarks\.get\(packet\.id\)\)/);
    assert.match(page.slice(mobile, mobile + 800), /duplicateBadge\(duplicateMarks\.get\(packet\.id\)\)/);
  });

  test("marks are computed over reviewablePackets, never over the filtered view", () => {
    /* Over visiblePackets, "Needs you" hides the one Akuna application that was sent and the
       eleven that cannot be sent lose their badge, which is the exact misreading this is for. */
    assert.match(page, /duplicatePostingMarks\(reviewablePackets\)/);
    assert.doesNotMatch(page, /duplicatePostingMarks\(visiblePackets\)/);
  });

  test("nothing collapses the list", () => {
    // The list stays one row per packet. R-066 makes packets write-once with no delete, so the
    // Tracker is the only place they exist and is the wrong place to make them disappear.
    assert.match(page, /visiblePackets\.map\(\(packet\) =>/g);
    assert.doesNotMatch(page, /collapsedPackets|groupedPackets|dedupedPackets/);
  });
});
