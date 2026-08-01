import assert from "node:assert/strict";
import test from "node:test";
import { rankOnboardingJobs, type OnboardingJob } from "./onboarding-jobs.ts";

const jobs: OnboardingJob[] = [
  { id: "pm", company: "A", title: "Product Manager", location: "Remote", ats: "greenhouse", applyUrl: "https://example.com/pm" },
  { id: "swe", company: "B", title: "Software Engineer", location: "Remote", ats: "greenhouse", applyUrl: "https://example.com/swe" },
  { id: "health", company: "C", title: "Clinical Research Coordinator", location: "Remote", ats: "greenhouse", applyUrl: "https://example.com/health" },
  { id: "intern", company: "D", title: "Software Engineering Intern", location: "Remote", ats: "greenhouse", applyUrl: "https://example.com/intern" },
  { id: "finance", company: "E", title: "Financial Analyst", location: "Remote", ats: "greenhouse", applyUrl: "https://example.com/finance" },
  { id: "new-grad", company: "F", title: "Software Engineer, New Grad", location: "Remote", ats: "greenhouse", applyUrl: "https://example.com/new-grad" },
];

test("puts both the selected role and selected type first", () => {
  assert.equal(rankOnboardingJobs(jobs, {
    titles: ["Software Engineer", "Full Stack Engineer", "Product Engineer"],
    role_types: ["internship"],
  })[0].id, "intern");
});

test("works for roles outside the local category catalog", () => {
  assert.equal(rankOnboardingJobs(jobs, {
    titles: ["Clinical Research Assistant"],
    role_types: ["full-time"],
  })[0].id, "health");
});

test("preserves feed order when no targeting evidence matches", () => {
  assert.deepEqual(
    rankOnboardingJobs(jobs, { titles: ["Museum Curator"], role_types: [] }).map((job) => job.id),
    ["pm", "swe", "health"],
  );
});

test("does not treat an explicit new-grad role as a full-time type match", () => {
  const ranked = rankOnboardingJobs([
    jobs.find((job) => job.id === "new-grad")!,
    jobs.find((job) => job.id === "swe")!,
  ], {
    titles: ["Software Engineer"],
    role_types: ["full-time"],
  });
  assert.equal(ranked[0].id, "swe");
});
