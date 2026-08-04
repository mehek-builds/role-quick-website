/* The two categories the account page shows the bank in.
 *
 * "leadership" is one of three stored types and the only one that is NOT work: clubs, societies,
 * volunteering and student government. Everything else - jobs, internships, projects - is work
 * history an employer reads as employment. Splitting on "is it leadership" rather than listing the
 * work types means a fourth type added to the API later shows up under Work experience, which is
 * the safe default: a new type appearing in the wrong group is a cosmetic bug, whereas a leadership
 * role silently presented as a job is a false claim on an application.
 *
 * Returns the ORIGINAL index with every entry. The bank is one ordered array that is saved in a
 * single PUT, so an edit has to address the row where it actually lives; a group-local index would
 * write the wrong row the moment the two groups interleave. */
export function splitBankByCategory<T extends { type: string }>(
  entries: T[],
): { work: { entry: T; index: number }[]; leadership: { entry: T; index: number }[] } {
  const indexed = entries.map((entry, index) => ({ entry, index }));
  return {
    work: indexed.filter(({ entry }) => entry.type !== "leadership"),
    leadership: indexed.filter(({ entry }) => entry.type === "leadership"),
  };
}

/* `parsed_json.coursework` as the ONE LINE every surface displays it as.
 *
 * Shared rather than written per screen, which is the whole lesson of ISSUE-044. The field is stored
 * as a LIST and edited as one comma separated line, and when each reader spelled that conversion for
 * itself they disagreed: the resume screen read it with a `typeof === "string"` helper, got null for
 * every healthy profile, and showed a BLANK box under the words "This prints on your generated
 * resume" - which is what invited a student to retype her courses and overwrite the array with a
 * string. One exported function means the next screen to show this field cannot get it wrong.
 *
 * Tolerant of a stored string on purpose, permanently. The site and the API are separate repos that
 * deploy independently on merge, so no page here can assume the API beside it is the newer one. The
 * cost of tolerating is one branch; the cost of not tolerating was a silently empty resume line, and
 * on the join path below it would be a TypeError, since a string has no .join.
 *
 * TRIMS AND DEDUPES, because the API's courseworkFromParsed does. A version of this that only
 * joined displayed "  Math  , Math" on the dashboard while the generated PDF printed "Math" - the
 * screen and the document disagreeing about the same field, which is ISSUE-044 again in miniature
 * rather than a cosmetic difference. The parser writes parsed_json.coursework straight from the
 * model without normalising, so untrimmed and duplicate entries are reachable without anyone
 * hand-editing jsonb. Keep the two functions behaviourally identical; profile-editor.test.mts
 * pins the cases where they could drift apart. */
export function courseworkLine(value: unknown): string {
  const raw = typeof value === "string"
    ? value.split(",")
    : Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  const courses: string[] = [];
  for (const candidate of raw) {
    const course = candidate.trim();
    if (!course || courses.some((existing) => existing.toLowerCase() === course.toLowerCase())) continue;
    courses.push(course);
  }
  return courses.join(", ");
}

export function parseEditableList(value: string): string[] {
  return deduplicate(value.split(/[\n,]/));
}

export function parseEditableLines(value: string): string[] {
  return deduplicate(value.split("\n"));
}

export function hasCompleteTargetRoleSet(roles: string[], currentRoles: string[]): boolean {
  return roles.length === 5 || (roles.length === 0 && currentRoles.length === 0);
}

export function targetRolesChanged(roles: string[], currentRoles: string[]): boolean {
  return roles.length !== currentRoles.length
    || roles.some((role, index) => role !== currentRoles[index]);
}

function deduplicate(candidates: string[]): string[] {
  const items: string[] = [];
  for (const candidate of candidates) {
    const item = candidate.trim();
    if (!item || items.some((existing) => existing.toLowerCase() === item.toLowerCase())) continue;
    items.push(item);
  }
  return items;
}
