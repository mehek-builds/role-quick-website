import assert from "node:assert/strict";
import test from "node:test";
import { FIELDS, STAGE_BOARD_SUPPLY, THIN_STAGE_ROLES, categoriesForFields, categoriesForRoles, experienceYears, fieldsForCategories, fieldsForFocus, inferResumeTargeting, inferRoleType, noStageSupply, stageSupply, thinStages, titlesForFields, titlesForFocus } from "./onboarding-role-inference.ts";
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
  /* Systems Engineer is offered by BOTH "IT & technical support" (software-engineering) and
     "Hardware & robotics", and a title in two fields answers with both categories rather than
     picking one. Widening is the only safe direction here: focusPatch unions categories precisely
     because this screen cannot show a student every category it is about to write, and narrowing
     lives in Settings where the control is visible. 204 live roles under that one title, spanning
     both readings, is why it sits in two fields in the first place. */
  assert.deepEqual(categoriesForRoles(["Systems Engineer"]), ["software-engineering", "hardware"]);
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

/* The field-then-stage-then-titles picker. It runs before any resume exists, so every one of these
   is about what the screen can OFFER with nothing to infer from. */

test("every field carries a stable id, a label and at least one title", () => {
  assert.ok(FIELDS.length >= 8);
  assert.equal(new Set(FIELDS.map((field) => field.id)).size, FIELDS.length);
  for (const field of FIELDS) {
    assert.match(field.id, /^[a-z-]+$/);
    assert.ok(field.label.length > 0);
    assert.ok(field.titles.length > 0);
  }
});

test("many fields share the `other` category without sharing an id", () => {
  const other = FIELDS.filter((field) => field.category === "other").map((field) => field.id);
  // The count is not the assertion and must not become one - `other` is the bucket for every field
  // the closed eight-category list has no word for, so it grows whenever a field is added. What is
  // asserted is that sharing a category never costs a field its own identity, because `id` is what
  // the picker keys on and what the homepage calibration link carries.
  assert.ok(other.length > 1);
  for (const id of ["marketing", "sales"]) assert.ok(other.includes(id));
  assert.equal(new Set(other).size, other.length);
});

test("titles come back in field order, deduped case-insensitively", () => {
  const software = FIELDS.find((field) => field.id === "software")!.titles.map((offer) => offer.title);
  const titles = titlesForFields(["software", "product"]);
  assert.deepEqual(titles.slice(0, software.length), software);
  assert.ok(titles.includes("Product Manager"));
  assert.equal(new Set(titles.map((title) => title.toLowerCase())).size, titles.length);
});

test("a title in two fields is offered once", () => {
  // Business Analyst sits in both product and quant-trading.
  const titles = titlesForFields(["product", "quant"]);
  assert.equal(titles.filter((title) => title === "Business Analyst").length, 1);
});

test("no field chosen offers nothing, which is what makes the gate honest", () => {
  assert.deepEqual(titlesForFields([]), []);
});

test("an unknown field id degrades to a smaller offer, never a throw", () => {
  // The ids ride in a query string from the homepage calibration card, so a stale link must not
  // break the first screen of setup.
  assert.deepEqual(titlesForFields(["software", "nonsense"]), titlesForFields(["software"]));
  assert.deepEqual(titlesForFields(["nonsense"]), []);
});

test("saved categories pre-select every field that shares them", () => {
  // Deliberately over-offering, and that is the whole reason fieldsForFocus below exists: a
  // category is a lossy record of a field, so reading fields back out of one alone can only widen.
  assert.deepEqual(fieldsForCategories(["software-engineering"]), ["software", "infrastructure", "support"]);
  assert.ok(fieldsForCategories(["other"]).length > 5);
  assert.deepEqual(fieldsForCategories([]), []);
  assert.deepEqual(fieldsForCategories(null), []);
});

test("a returning student's fields are read from their titles, not from the crowded category", () => {
  // The failure this replaces: nine fields sit in `other`, so a saved ["other"] used to arrive with
  // nine chips lit up - nine answers the product put in their mouth, on the screen whose whole job
  // is to stop doing that.
  assert.deepEqual(
    fieldsForFocus({ categories: ["other"], titles: ["Recruiter"], role_types: ["full-time"] }),
    ["people"],
  );
  // Case-insensitive, because a title is stored as the student typed it.
  assert.deepEqual(
    fieldsForFocus({ categories: ["other"], titles: ["technical recruiter"], role_types: null }),
    ["people"],
  );
  // A title in two fields pre-selects both; that is a real ambiguity in the answer, not a guess.
  assert.deepEqual(
    fieldsForFocus({ categories: null, titles: ["Business Analyst"], role_types: null }),
    ["product", "quant", "consulting"],
  );
});

test("free-text titles fall back to the category read rather than to a blank screen", () => {
  // Nothing they saved is one of the offered titles, so titles cannot answer it and the coarse
  // read is the only one there is. Over-offering beats blank: they can deselect what they see.
  assert.deepEqual(
    fieldsForFocus({ categories: ["design"], titles: ["Biotech"], role_types: null }),
    ["design"],
  );
  assert.deepEqual(fieldsForFocus({ categories: null, titles: ["Biotech"], role_types: null }), []);
  assert.deepEqual(fieldsForFocus(null), []);
});

test("the chosen fields answer the category question the screen never asks", () => {
  // Categories used to arrive from the resume inference, and the screen now runs before any upload.
  assert.deepEqual(categoriesForFields(["software"]), ["software-engineering"]);
  assert.deepEqual(categoriesForFields(["software", "quant"]), ["software-engineering", "quant-trading"]);
  // Two fields, one category: picking both must not write `other` twice.
  assert.deepEqual(categoriesForFields(["marketing", "sales"]), ["other"]);
  assert.deepEqual(categoriesForFields([]), []);
  assert.deepEqual(categoriesForFields(["nonsense"]), []);
});

test("every field resolves to a category, so no selection can leave targeting unwritable", () => {
  // A field with no category would disable Continue with nothing on screen to fix it.
  for (const field of FIELDS) {
    assert.equal(categoriesForFields([field.id]).length, 1, `${field.id} resolves to no category`);
  }
});


/* ---------------------------------------------------------------- THE OFFER, AS SEVERAL PEOPLE

   Every case below is one real student walking one real pathway, and each is written against a
   number measured on the live board on 2026-08-19 rather than against a shape. That is deliberate:
   the ordering is only worth anything if it tracks what the board can actually give somebody, and
   a test that asserted "it is sorted" would pass just as happily on a sort of the wrong field.
   The measurements are re-checked by scripts/verify-onboarding-fields.mjs, which is what turns a
   drift in the board into a failing check rather than into a quietly wrong recommendation. */

test("every offered title carries the measurement that justifies offering it", () => {
  for (const field of FIELDS) {
    assert.ok(field.titles.length >= 5, `${field.id} offers only ${field.titles.length} titles`);
    for (const offer of field.titles) {
      assert.ok(offer.title.length > 0);
      // Five is the floor the verify script enforces against the live board. A title below it is
      // one bad week from being a suggestion that lands on an empty page.
      assert.ok(offer.live >= 5, `${field.id}/${offer.title} is offered on ${offer.live} live roles`);
      for (const [stage, count] of Object.entries(offer.stages ?? {})) {
        // A zero is recorded by ABSENCE. A stage present with a zero would be indistinguishable
        // from one nobody measured, and the ordering treats those two very differently.
        assert.ok((count ?? 0) > 0, `${field.id}/${offer.title} records ${stage} as ${count}`);
        assert.ok((count ?? 0) <= offer.live, `${offer.title} has more ${stage} roles than live roles`);
      }
    }
  }
});

test("pathway: a quant student hunting an internship meets the titles that have internships", () => {
  // Measured: Quantitative Researcher 12, Trader 11, Quantitative Trader 7, Business Analyst 2,
  // Risk Analyst 1, Financial Analyst 0. Financial Analyst is the second biggest title in the
  // field by raw volume (32 live), so a list ordered by volume would put it near the top of a
  // screen where it is the one title that cannot deliver.
  const offer = titlesForFocus(["quant"], ["internship"]);
  assert.deepEqual(offer.slice(0, 3), ["Quantitative Researcher", "Trader", "Quantitative Trader"]);
  assert.equal(offer.at(-1), "Financial Analyst");
  // Nothing was dropped to achieve that.
  assert.equal(offer.length, titlesForFields(["quant"]).length);
});

test("pathway: the same student hunting full-time gets the volume order back", () => {
  // full-time is the board's residual, so a title's full-time supply is very nearly its live
  // count and the ranking is simply "most work first". Trader (66) leads, not Quantitative
  // Researcher, and that flip between the two stages is the whole point of the feature.
  assert.deepEqual(titlesForFocus(["quant"], ["full-time"]).slice(0, 2), ["Trader", "Quantitative Researcher"]);
  assert.deepEqual(titlesForFocus(["quant"], []).slice(0, 2), ["Trader", "Quantitative Researcher"]);
});

test("pathway: a software student hunting an internship leads with the one title that has them", () => {
  // Software Engineer: 1723 live, 103 of them internships. It leads at every stage, which is a
  // fact about the board and not a failure to re-sort - the assertion below is what proves the
  // sort ran at all.
  const internship = titlesForFocus(["software"], ["internship"]);
  assert.equal(internship[0], "Software Engineer");
  assert.equal(internship[1], "Test Engineer", "Test Engineer has 3 internships; Backend Engineer has none");
  /* Frontend and Full Stack are the pair that proves the sort ran rather than the list happening
     to be in this order already: Full Stack has more live roles (29 to 24) and so leads with no
     stage chosen, and Frontend overtakes it at the internship stage because it has one and Full
     Stack has none. The same two titles, two orders, one measured reason. */
  const anyStage = titlesForFocus(["software"], []);
  assert.ok(anyStage.indexOf("Full Stack Engineer") < anyStage.indexOf("Frontend Engineer"));
  assert.ok(internship.indexOf("Frontend Engineer") < internship.indexOf("Full Stack Engineer"));
});

test("pathway: a marketing student hunting an internship is told, not shown an empty list", () => {
  // 577 internships on the board and not one of them in marketing. The list is NOT emptied: these
  // are the field's real roles, most live first, and the screen says what the stage costs.
  const offer = titlesForFocus(["marketing"], ["internship"]);
  assert.equal(offer.length, titlesForFields(["marketing"]).length);
  assert.equal(offer[0], "Marketing Manager", "falls back to live volume when no title has supply");
  assert.equal(noStageSupply(["marketing"], ["internship"]), true);
});

test("pathway: a researcher hunting an internship keeps a full offer and a true one", () => {
  // Research is thin on this board by nature - it is fed by ATSes that skew to tech - so the field
  // was expanded to the six titles that DO return work rather than left at the five it had, three
  // of which returned nothing at all. Research Engineer is the one with internships.
  const offer = titlesForFocus(["research"], ["internship"]);
  assert.ok(offer.length >= 5);
  assert.equal(offer[0], "Research Engineer");
  assert.equal(noStageSupply(["research"], ["internship"]), false, "research does carry internships");
  // And full-time puts the field's biggest title back on top.
  assert.equal(titlesForFocus(["research"], ["full-time"])[0], "Scientist");
});

test("pathway: a healthcare student hunting a contract role gets the contract titles first", () => {
  // Contract is where healthcare supply actually sits: Physician, Nurse, Nurse Practitioner and
  // Physician Assistant each carry 3, while Phlebotomist and Medical Assistant carry none.
  const offer = titlesForFocus(["healthcare"], ["contract"]);
  assert.deepEqual(offer.slice(0, 4), ["Physician", "Nurse", "Nurse Practitioner", "Physician Assistant"]);
  assert.equal(noStageSupply(["healthcare"], ["contract"]), false);
  // Internship is the opposite reading of the same field.
  assert.equal(titlesForFocus(["healthcare"], ["internship"])[0], "Phlebotomist");
});

test("pathway: a recruiter hunting contract work is ranked by contract supply, not headcount", () => {
  // Recruiter 31 contract, Technical Recruiter 16, Recruiting Coordinator 6, Sourcer 3. By live
  // volume Sourcer (22) and HR Business Partner (20) outrank Recruiting Coordinator (15).
  const offer = titlesForFocus(["people"], ["contract"]);
  assert.deepEqual(offer.slice(0, 3), ["Recruiter", "Technical Recruiter", "Recruiting Coordinator"]);
  assert.ok(offer.indexOf("Recruiting Coordinator") < offer.indexOf("HR Business Partner"));
});

test("pathway: two fields at once interleave by supply rather than by field", () => {
  // The old list handed out field-by-field, so the second field's best title sat below the first
  // field's worst. Software + design at the internship stage puts Designer (2 internships) above
  // every software title that has none.
  const offer = titlesForFocus(["software", "design"], ["internship"]);
  assert.equal(offer[0], "Software Engineer");
  assert.ok(offer.indexOf("Designer") < offer.indexOf("Backend Engineer"));
  // Deduped across fields, still. Systems Engineer sits in both support and hardware.
  const shared = titlesForFocus(["support", "hardware"], ["internship"]);
  assert.equal(shared.filter((title) => title === "Systems Engineer").length, 1);
});

test("a stage the board barely carries is named with its number", () => {
  assert.deepEqual(thinStages(["apprenticeship"]), [{ stage: "apprenticeship", live: 4 }]);
  assert.deepEqual(thinStages(["fellowship"]), [{ stage: "fellowship", live: 3 }]);
  assert.deepEqual(thinStages(["co-op"]), [{ stage: "co-op", live: 16 }]);
  // The four that carry real work say nothing.
  assert.deepEqual(thinStages(["internship", "new-grad", "contract", "full-time"]), []);
  assert.deepEqual(thinStages([]), []);
  for (const [stage, live] of Object.entries(STAGE_BOARD_SUPPLY)) {
    assert.equal(thinStages([stage]).length, live < THIN_STAGE_ROLES ? 1 : 0, stage);
  }
});

test("the shortage notice never fires on an answer that is not one", () => {
  // No field, no stage, or full-time. None of the three is a claim about supply, and a screen that
  // has not been told what somebody wants must not report a shortage.
  assert.equal(noStageSupply([], ["internship"]), false);
  assert.equal(noStageSupply(["marketing"], []), false);
  assert.equal(noStageSupply(["marketing"], ["full-time"]), false);
  assert.equal(noStageSupply(["nonsense"], ["internship"]), false);
});

test("stage supply reads the best stage, never the sum", () => {
  const offer = { title: "X", live: 100, stages: { internship: 60, "co-op": 2 } };
  // A student open to either gets 60, not 62: the stages are alternatives, and summing would let a
  // title win on a breadth it does not have by adding up ones and twos.
  assert.equal(stageSupply(offer, ["internship", "co-op"]), 60);
  assert.equal(stageSupply(offer, ["co-op"]), 2);
  assert.equal(stageSupply(offer, ["fellowship"]), 0);
  // full-time and "nothing chosen" both answer with the live count.
  assert.equal(stageSupply(offer, ["full-time"]), 100);
  assert.equal(stageSupply(offer, []), 100);
  assert.equal(stageSupply(offer, ["internship", "full-time"]), 100);
});

test("an unknown field or stage degrades to a smaller offer, never a throw", () => {
  assert.deepEqual(titlesForFocus(["software", "nonsense"], ["internship"]), titlesForFocus(["software"], ["internship"]));
  assert.deepEqual(titlesForFocus([], ["internship"]), []);
  // A stage nothing was measured for ranks everything at zero and falls back to live volume.
  assert.deepEqual(titlesForFocus(["quant"], ["made-up-stage"]), titlesForFocus(["quant"], []));
});
