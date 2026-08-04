/* What the jobs board is currently narrowed by, said in the student's own words.
 *
 * ISSUE-041. The empty state on /dashboard/jobs advised "Try a shorter search, or clear the
 * location" whenever ANY of the four filters was set. Three of those four are not a search and are
 * not a location. A student who left both boxes empty and picked the job type "Full-time" was told
 * to go and clear two boxes they had never typed in, while the one control actually excluding every
 * posting went unnamed. A recovery hint that points at the wrong control is worse than no hint: it
 * spends the student's next move on the thing that cannot help, and it quietly asserts that the
 * boxes they can see are empty are somehow full.
 *
 * So the sentence is built from the filters that are actually set. The names used here are the
 * names printed on the controls, so the sentence and the control the student then has to reach for
 * say the same word.
 *
 * This lives in the domain layer rather than in the page for the same reason job-rows.ts does: the
 * test runner is `node --experimental-strip-types`, which cannot parse JSX, so anything left in a
 * .tsx file cannot be tested at all.
 */

export type JobFilters = {
  query: string;
  location: string;
  remoteOnly: boolean;
  employmentType: string;
};

/* The one true reading of "is this list filtered". The page used to keep a separate `filtering`
 * boolean beside the sentence, which is the shape that lets the two drift: a filter added to one
 * and not the other means either a hint that names nothing or, worse, the unfiltered copy shown
 * over a filtered list, which tells a student there are simply no jobs when in fact they filtered
 * them away. There is now one list, and both the branch and the wording read from it. */
export function activeJobFilters({ query, location, remoteOnly, employmentType }: JobFilters): string[] {
  const active: string[] = [];
  if (query.trim()) active.push("your search");
  if (location.trim()) active.push("the location");
  /* Named with its value, not just "the job type". A select resting on "Full-time" reads as page
     furniture in a way that a box full of words the student typed does not, and it is the filter
     most likely to be the sole reason a board came back empty. */
  if (employmentType) active.push(`the ${employmentType} job type`);
  if (remoteOnly) active.push("Remote only");
  return active;
}

/** "a", "a and b", "a, b and c". Plain list, no serial comma, matching the prose elsewhere. */
function joinPlainly(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* True on an empty board however it got empty, so it is said in every branch. */
const ALWAYS_TRUE = "New jobs show up here as Litos finds them.";

/** The body of the empty state: what narrowed the list, then the fact that holds regardless. */
export function emptyJobsBody(filters: JobFilters): string {
  const active = activeJobFilters(filters);
  if (active.length === 0) return ALWAYS_TRUE;
  return `No jobs match ${joinPlainly(active)} right now. ${ALWAYS_TRUE}`;
}
