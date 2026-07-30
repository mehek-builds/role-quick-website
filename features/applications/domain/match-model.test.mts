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

test("resumeSpecText includes every rendered ResumeSpec field in display order", () => {
  assert.equal(
    resumeSpecText(completeSpec),
    [
      "Software Engineer",
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
