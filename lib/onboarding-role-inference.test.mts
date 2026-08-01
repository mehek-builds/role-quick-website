import assert from "node:assert/strict";
import test from "node:test";
import { categoriesForRoles, experienceYears, inferResumeTargeting, inferRoleType } from "./onboarding-role-inference.ts";
import type { ParsedProfile } from "./api.ts";

function profile(overrides: Partial<ParsedProfile>): ParsedProfile {
  return {
    full_name: "A Candidate",
    experience: [],
    skills: [],
    projects: [],
    school: "",
    grad_year: 0,
    target_roles: [],
    ...overrides,
  };
}

test("keeps the parser's strongest suggestion first and always returns five choices", () => {
  const result = inferResumeTargeting(profile({
    target_roles: ["Machine Learning Engineer", "Data Scientist"],
    skills: ["Python", "PyTorch", "SQL"],
  }), 2026);

  assert.equal(result.roles.length, 5);
  assert.equal(result.roles[0], "Machine Learning Engineer");
  assert.ok(result.roles.includes("Data Engineer"));
  assert.ok(result.categories.includes("data-ml"));
});

test("keeps five model-suggested careers for a role family outside the local catalog", () => {
  const result = inferResumeTargeting(profile({
    target_roles: ["Registered Nurse", "Staff Nurse", "Clinical Nurse", "Charge Nurse", "Nurse Educator"],
    experience: [{ company: "Hospital", title: "Staff Nurse", start: "2024", end: "Present", description: "Patient care" }],
  }), 2026);

  assert.deepEqual(result.roles, ["Registered Nurse", "Staff Nurse", "Clinical Nurse", "Charge Nurse", "Nurse Educator"]);
  assert.deepEqual(result.categories, ["other"]);
});

test("guesses internship for a currently enrolled candidate", () => {
  const result = inferResumeTargeting(profile({
    currently_enrolled: true,
    grad_year: 2028,
    target_roles: ["Software Engineer Intern"],
    experience: [{ company: "Acme", title: "Software Engineering Intern", start: "May 2025", end: "August 2025", description: "Built a React app" }],
  }), 2026);

  assert.equal(result.roleType, "internship");
  assert.equal(result.roles[0], "Software Engineer Intern");
});

test("guesses full-time for an experienced graduate", () => {
  const result = inferResumeTargeting(profile({
    grad_year: 2021,
    experience: [{ company: "Acme", title: "Product Manager", start: "2021", end: "Present", description: "Owned the roadmap" }],
  }), 2026);

  assert.equal(result.roleType, "full-time");
  assert.ok(result.yearsExperience >= 5);
  assert.equal(result.roles[0], "Product Manager");
});

test("recomputes matching categories when the candidate changes the selected role", () => {
  assert.deepEqual(categoriesForRoles(["Product Designer"]), ["design"]);
  assert.deepEqual(categoriesForRoles(["Product Engineer"]), ["software-engineering"]);
  assert.deepEqual(categoriesForRoles(["Program Manager"]), ["product"]);
  assert.deepEqual(categoriesForRoles(["Systems Engineer"]), ["hardware"]);
  assert.deepEqual(categoriesForRoles(["A role outside the catalog"]), ["other"]);
});

test("infers co-op, new-grad, prior-intern, and no-evidence role types", () => {
  assert.equal(inferRoleType(profile({
    experience: [{ company: "Acme", title: "Software Co-op", start: "2025", end: "2026", description: "" }],
  }), 1, 2026), "co-op");
  assert.equal(inferRoleType(profile({ grad_year: 2027 }), 0, 2026), "new-grad");
  assert.equal(inferRoleType(profile({
    grad_year: 2024,
    experience: [{ company: "Acme", title: "Design Intern", start: "2024", end: "2024", description: "" }],
  }), 0.3, 2026), "internship");
  assert.equal(inferRoleType(profile({}), 0, 2026), "full-time");
});

test("keeps an experienced professional full-time while they study part-time", () => {
  assert.equal(inferRoleType(profile({ currently_enrolled: true, grad_year: 2028 }), 10, 2026), "full-time");
  assert.equal(inferRoleType(profile({
    experience: [{ company: "Acme", title: "Engineering Co-op", start: "2016", end: "2016", description: "" }],
  }), 10, 2026), "full-time");
});

test("keeps a student with two years of campus experience in the internship track", () => {
  assert.equal(inferRoleType(profile({ currently_enrolled: true, grad_year: 2028 }), 2, 2026), "internship");
});

test("guesses new-grad for a currently enrolled candidate graduating within a year", () => {
  assert.equal(inferRoleType(profile({ currently_enrolled: true, grad_year: 2027 }), 0, 2026), "new-grad");
});

test("cleans internship suffixes and deduplicates role titles case-insensitively", () => {
  const result = inferResumeTargeting(profile({
    target_roles: ["Software Engineer", "software engineer", "Frontend Engineer - Internship"],
    skills: ["React", "TypeScript"],
  }), 2026);

  assert.equal(result.roles[0], "Software Engineer");
  assert.equal(result.roles[1], "Frontend Engineer");
  assert.equal(result.roles.filter((role) => role.toLowerCase() === "software engineer").length, 1);
  assert.equal(result.roles.length, 5);
});

test("ignores invalid dates and uses a minimum quarter-year for a dated role", () => {
  assert.equal(experienceYears(profile({
    experience: [
      { company: "Acme", title: "Engineer", start: "Unknown", end: "Present", description: "" },
      { company: "Beta", title: "Engineer", start: "2026", end: "2026", description: "" },
    ],
  }), 2026), 0.3);
});

test("does not add concurrent student roles together as fake seniority", () => {
  const student = profile({
    currently_enrolled: true,
    grad_year: 2027,
    experience: [
      { company: "Clinic", title: "Medical Scribe", start: "2022", end: "Present", description: "" },
      { company: "Lab", title: "Research Assistant", start: "2023", end: "Present", description: "" },
      { company: "Food Bank", title: "Volunteer", start: "2022", end: "Present", description: "" },
    ],
  });

  assert.equal(experienceYears(student, 2026), 4);
  assert.equal(inferRoleType(student, experienceYears(student, 2026), 2026), "new-grad");
});

test("still adds genuinely sequential experience intervals", () => {
  assert.equal(experienceYears(profile({
    experience: [
      { company: "One", title: "Analyst", start: "2018", end: "2020", description: "" },
      { company: "Two", title: "Manager", start: "2021", end: "2024", description: "" },
    ],
  }), 2026), 5);
});

test("caps inferred categories at three and preserves fallback categories", () => {
  assert.deepEqual(
    categoriesForRoles(["Software Data Product Design Quant Research Engineer"]),
    ["software-engineering", "data-ml", "design"],
  );
  assert.deepEqual(categoriesForRoles(["Astronaut"], ["research", "other", "design", "product"]), ["research", "other", "design"]);
});
