/* The fifty job titles the board offers, and the word for "not one of these".
 *
 * These are ROLE FAMILIES, not postings. The suggestions used to be the board's
 * most common raw titles, which meant a field labelled "Job title" opened on
 * "Senior Product Manager - Network Path", a real posting, and not a thing
 * anybody types. Mehek, 2026-07-29: fifty common titles, nothing more, and free
 * text still works.
 *
 * EVERY ONE OF THESE RETURNS RESULTS. Each was run against the live board on
 * 2026-07-29 and the count is recorded beside it. That check is the point: a
 * suggestion that lands on an empty page is worse than no suggestion, because
 * the reader concludes the board is broken rather than that we offered them a
 * word we do not carry. scripts/verify-board-suggestions.mjs re-runs it.
 *
 * NOT INCLUDED, and worth knowing: "Investment banker" was one of the three
 * examples asked for, and it returns ZERO. So do "Investment Banking",
 * "Investment Banking Analyst", "Portfolio Manager", "Equity Research",
 * "Financial Advisor" and "Actuary". The board is fed by Greenhouse, Lever and
 * Ashby boards that skew heavily to tech, and no investment bank is among the
 * sources. The fix is a source in the backend's jobSources.ts, not a dropdown
 * entry that leads nowhere, so finance is represented here by the titles that
 * do return work: Trader, Financial Analyst, Quantitative Researcher,
 * Quantitative Trader, Accountant, Business Analyst.
 *
 * Stored in the order they were measured, most of the board first, so the
 * counts beside them stay readable as a record of what was checked. The board
 * DISPLAYS them alphabetically (Mehek, 2026-07-29), see `alphabetical`.
 */
export const JOB_TITLES: string[] = [
  "Software Engineer", // 991
  "Account Executive", // 373
  "Product Manager", // 234
  "Solutions Architect", // 159
  "Program Manager", // 150
  "Engineering Manager", // 123
  "Physician", // 123
  "Account Manager", // 108
  "Machine Learning Engineer", // 107
  "Marketing Manager", // 92
  "Nurse", // 84
  "Systems Engineer", // 74
  "Security Engineer", // 72
  "Data Scientist", // 63
  "Operations Manager", // 55
  "Technical Program Manager", // 54
  "Sales Engineer", // 53
  "Solutions Engineer", // 52
  "Product Designer", // 49
  "Support Engineer", // 49
  "Data Engineer", // 48
  "Sales Development Representative", // 48
  "Customer Success Manager", // 44
  "Consultant", // 42
  "Backend Engineer", // 40
  "Site Reliability Engineer", // 40
  "Project Manager", // 37
  "Product Marketing Manager", // 33
  "Recruiter", // 33
  "Sales Manager", // 28
  "Infrastructure Engineer", // 25
  "Accountant", // 22
  "Trader", // 22
  "Full Stack Engineer", // 21
  "Executive Assistant", // 19
  "Hardware Engineer", // 19
  "Network Engineer", // 18
  "Partnerships Manager", // 18
  "Business Analyst", // 17
  "Platform Engineer", // 16
  "Research Scientist", // 16
  "Quantitative Researcher", // 15
  "Data Analyst", // 14
  "Android Engineer", // 12
  "Financial Analyst", // 12
  "Technical Recruiter", // 12
  "Strategy Manager", // 10
  "QA Engineer", // 9
  "Quantitative Trader", // 9
  "iOS Engineer", // 9
];

/* The last entry in every one of the three dropdowns.
 *
 * The fields already take free text, so this is a signpost rather than a
 * mechanism: it tells a reader whose role is not listed that the box is theirs
 * to type in, which a bare list of fifty does not. Choosing it must therefore
 * mean "no filter": searching for the literal word "Other" would return the
 * handful of postings with "other" in the title, which is the opposite of what
 * anyone picking it wants. See `clean` in app/browse-jobs/page.tsx. */
export const OTHER = "Other";

/* A–Z, case-insensitively, so a board that carries "onemedical", "iHerb" and
   "tebra" alongside "Stripe" does not scatter the lower-case names to the end.
   Sorting is a DISPLAY decision only: which fifty appear is still decided by how
   much of the board they account for, which is what makes them the right fifty
   to offer. */
export function alphabetical(options: string[]): string[] {
  return [...options].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/* Other goes last, never sorted in among the O's: it is not one of the options,
   it is the sentence that tells you the box is yours to type in. */
export function withOther(options: string[]): string[] {
  return [...alphabetical(options), OTHER];
}

/** True when a submitted field value should be treated as no filter at all. */
export function isOther(value: string | undefined | null): boolean {
  return (value ?? "").trim().toLowerCase() === OTHER.toLowerCase();
}
