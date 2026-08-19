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
  { id: "contract", company: "G", title: "Contract UX Designer", location: "Remote", ats: "greenhouse", applyUrl: "https://example.com/contract" },
  { id: "fellow", company: "H", title: "AI Residency Fellow", location: "Remote", ats: "greenhouse", applyUrl: "https://example.com/fellow" },
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

/* The four stages added on 2026-08-19, and the default arm that used to swallow them.
 *
 * matchesType ended in `return !internship && !coOp && !newGrad`, which read as a sensible
 * stand-in for full-time right up until the stage list grew past four: every new stage would have
 * fallen into it, so a student who asked for contract work would have had every ordinary
 * full-time posting scored as a stage match, and the contract role scored the same as the rest. */

test("a stage the ranker does not recognise claims nothing rather than everything", () => {
  const ranked = rankOnboardingJobs([
    jobs.find((job) => job.id === "contract")!,
    jobs.find((job) => job.id === "pm")!,
  ], { titles: [], role_types: ["contract"] });
  assert.equal(ranked[0].id, "contract");
});

test("each added stage matches only its own postings", () => {
  const only = (roleType: "part-time" | "contract" | "apprenticeship" | "fellowship") =>
    rankOnboardingJobs(jobs, { titles: [], role_types: [roleType] })[0].id;
  assert.equal(only("contract"), "contract");
  assert.equal(only("fellowship"), "fellow");
});

test("a fellowship is still an ordinary full-time job to the ranker", () => {
  // Same reading the backend's matchingRoleType keeps: subtracting residencies and apprenticeships
  // from full-time would shrink a feed the student never asked to shrink.
  const ranked = rankOnboardingJobs([
    jobs.find((job) => job.id === "fellow")!,
    jobs.find((job) => job.id === "contract")!,
  ], { titles: [], role_types: ["full-time"] });
  assert.equal(ranked[0].id, "fellow");
});
