import assert from "node:assert/strict";
import test from "node:test";
import type { ResumeSpec } from "../../../lib/api.ts";
import { resumeSpecText } from "./match-model.ts";

const completeSpec: ResumeSpec = {
  target_role: "Software Engineer",
  school: "University of Southern California",
  degree: "B.S. Computer Science",
  grad_date: "May 2027",
  coursework: "Algorithms, Distributed Systems",
  education_position: "top",
  experience: [
    {
      type: "job",
      org: "Litos",
      title: "Engineering Intern",
      date_range: "2026",
      bullets: ["Built the application review flow", "Measured packet quality"],
    },
    {
      type: "project",
      org: "Resume Lab",
      title: "Creator",
      date_range: "2025",
      bullets: ["Tested structured resumes"],
    },
  ],
  skills: ["TypeScript", "React"],
  skill_source: { TypeScript: "Litos", React: "Resume Lab" },
};

/* NO "Software Engineer" AT THE HEAD OF THIS LIST, and its absence is the assertion. `target_role`
 * is the POSTING's job title, and the resume header stopped printing it: the backend's
 * resumeSpecText dropped it for that reason and this copy had not followed, so the score took a free
 * hit on a string that came from the posting itself and the review screen showed 13 blue marks with
 * nothing in the resume pane to anchor them. See the note on resumeSpecText. */
test("resumeSpecText includes every rendered ResumeSpec field in display order", () => {
  assert.equal(
    resumeSpecText(completeSpec),
    [
      "University of Southern California",
      "B.S. Computer Science",
      "May 2027",
      "Algorithms, Distributed Systems",
      "Litos",
      "Engineering Intern",
      "2026",
      "Built the application review flow",
      "Measured packet quality",
      "Resume Lab",
      "Creator",
      "2025",
      "Tested structured resumes",
      "TypeScript",
      "React",
    ].join(" "),
  );
});

test("the posting's job title is not scored as if it were on the resume", () => {
  assert.ok(
    !resumeSpecText(completeSpec).includes("Software Engineer"),
    "target_role is the posting's title, so scoring it matches the posting by construction",
  );
});

test("resumeSpecText excludes ResumeSpec layout and provenance metadata", () => {
  assert.equal(
    resumeSpecText({
      ...completeSpec,
      education_position: "after_experience",
      experience: completeSpec.experience.map((entry) => ({
        ...entry,
        type: entry.type === "job" ? "leadership" : "job",
      })),
      skill_source: { TypeScript: "Coursework", React: "Coursework" },
    }),
    resumeSpecText(completeSpec),
  );
});
