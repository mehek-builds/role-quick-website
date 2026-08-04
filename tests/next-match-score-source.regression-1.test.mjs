import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { nextMatchScoreRequest } from "../features/applications/domain/match-model.ts";

// Regression: ISSUE-038, one posting carrying two different match numbers on two screens.
//
// Found by a live production audit on 2026-08-04. psiquantum's "Intern, Quantum Architecture"
// rendered 33 on /dashboard Home and "42% match" on the /dashboard/applications NEXT BEST MATCH
// row, same account, same session, minutes apart. The JD side was identical both ways. The RESUME
// side was the whole difference: Home and Jobs score the BASE resume through
// use-job-match-scores.ts, and this row scored the TAILORED PACKET, which by construction covers
// more of the posting it was tailored to. The posting extracts 12 terms, so 4/12 = 33 and
// 5/12 = 42 reproduce both observed numbers exactly.
//
// Databricks agreed across both surfaces on the same day and that is NOT evidence of anything: it
// extracts 4 terms of total weight 3.7, so 1/3.7 = 27 either way, and the next reachable value is
// 2/3.7 = 54. It diverges the moment tailoring covers one more term.
//
// WHY THE REVIEW SCREEN'S CARVE-OUT DOES NOT COVER THIS ROW. use-job-match-scores.ts justifies
// packet-scoring for "the review screen ... the packet in front of you". This row shows a logo, a
// role, a company and a percentage. No document is displayed, so the justification does not reach
// it, and the only reading available to a student is the one every other job card teaches.
//
// Asserted on the HELPER'S BEHAVIOUR, not on a name appearing near the code. A regex for
// "getBaseResume" beside the effect is satisfied by a one-operator mutation that still sends the
// packet; every case below fails under one.

const packet = (overrides = {}) => ({
  id: "p1",
  job_context: { company: "PsiQuantum", role: "Intern, Quantum Architecture", job_id: "job-1", ...(overrides.job_context ?? {}) },
  spec: { _review: { jd_text: "FROZEN posting text captured when the resume was tailored." }, ...(overrides.spec ?? {}) },
});

const BASE = "base resume text";

describe("the next-best-match row is scored against the same document every other job card is", () => {
  test("the resume it sends is the base resume, never the packet", () => {
    // The defect, stated as a value: the packet's own text must not be what gets scored.
    const request = nextMatchScoreRequest(packet(), BASE);
    assert.equal(request.resumeText, BASE);
    assert.notEqual(request.resumeText, "FROZEN posting text captured when the resume was tailored.");
  });

  test("no number at all until the base resume has loaded", () => {
    // Scoring with a half-loaded resume would print a low number the student cannot explain, which
    // is the "never print a zero we did not measure" rule in a different costume.
    for (const absent of [null, undefined, "", "   "]) {
      assert.equal(nextMatchScoreRequest(packet(), absent), null, JSON.stringify(absent));
    }
  });

  test("a posting with an id is scored against the LIVE row, not the packet's frozen snapshot", () => {
    // The second, quieter divergence this closes: the packet's jd_text is frozen at tailoring time
    // while Home scores the live description, so the two disagree as soon as a posting is
    // re-scraped. Null jd_text is what makes the route read the job row.
    assert.equal(nextMatchScoreRequest(packet(), BASE).jdText, null);
  });

  test("a packet that points at no posting still scores, from its own snapshot", () => {
    // Extension and hand-typed packets have no monitored posting to read. Falling through to null
    // there would make the row unscorable for exactly the applications a student typed in by hand.
    const orphan = packet({ job_context: { company: "Acme", role: "Intern", job_id: null } });
    const request = nextMatchScoreRequest(orphan, BASE);
    assert.equal(request.jdText, "FROZEN posting text captured when the resume was tailored.");
    assert.equal(request.resumeText, BASE);
  });

  test("no live posting and no snapshot means no request", () => {
    for (const empty of [{ _review: { jd_text: "" } }, { _review: { jd_text: "   " } }, { _review: null }, {}]) {
      const nothing = { id: "p1", job_context: { company: "Acme", role: "Intern", job_id: null }, spec: empty };
      assert.equal(nextMatchScoreRequest(nothing, BASE), null, JSON.stringify(empty));
    }
  });

  test("the job id rides along, so the backend can exclude the posting's own offices", () => {
    // B3's invariant, kept as behaviour rather than as a regex over page source. A packet stores no
    // location; without the id the student is scored against the employer's cities.
    assert.deepEqual(nextMatchScoreRequest(packet(), BASE).jobContext, {
      company: "PsiQuantum",
      role: "Intern, Quantum Architecture",
      job_id: "job-1",
    });
  });

  test("no packet, no request", () => {
    for (const nothing of [null, undefined]) assert.equal(nextMatchScoreRequest(nothing, BASE), null);
  });
});

// THE SEAM. The helper being correct is worth nothing if the page does not call it, which is how a
// third hole on this audit survived a full suite. These assert the wiring.
describe("the Tracker page actually routes its row through that helper", () => {
  const source = readFileSync("app/dashboard/applications/page.tsx", "utf8");
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  test("the row's request is built by nextMatchScoreRequest and spent on fetchJdMatch", () => {
    assert.match(code, /nextMatchScoreRequest\(nextPacket, baseResumeText\)/);
    assert.match(code, /fetchJdMatch\(request\.jdText, request\.resumeText, request\.jobContext\)/);
  });

  test("the base resume comes from the same source the list surfaces read", () => {
    assert.match(code, /getBaseResume\(\)/);
    assert.match(code, /setBaseResumeText\(resumeSpecText\(stored\.spec\)\)/);
  });

  test("the row never scores the packet's own spec", () => {
    // The exact expression that shipped the defect, and the requirement-breakdown variant that
    // replaced it. Either one back on this page puts a second number on the same posting.
    assert.doesNotMatch(code, /resumeSpecText\(nextPacket\.spec\)/);
    assert.doesNotMatch(code, /fetchRequirements\(/);
  });

  test("an unscorable posting still prints nothing rather than a zero", () => {
    assert.match(code, /result\.scorable && result\.score !== null/);
    const autopilot = readFileSync("components/app/Autopilot.tsx", "utf8");
    assert.match(autopilot, /\{match\.match && \(/);
  });
});
