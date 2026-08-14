import type { ParsedProfile, RoleType, Targeting } from "./api";

export type ResumeTargetingGuess = {
  roles: string[];
  roleType: RoleType;
  categories: string[];
  yearsExperience: number;
};

const ROLE_FAMILIES: { match: RegExp; roles: string[]; category: string }[] = [
  {
    match: /software|developer|frontend|front-end|backend|back-end|full.?stack|web|mobile|ios|android|react|typescript|javascript|java|python|c\+\+/i,
    roles: ["Software Engineer", "Full Stack Engineer", "Backend Engineer", "Frontend Engineer", "Product Engineer"],
    category: "software-engineering",
  },
  {
    match: /machine learning|\bml\b|data|analytics|artificial intelligence|\bai\b|pytorch|tensorflow|sql/i,
    roles: ["Machine Learning Engineer", "Data Scientist", "Data Engineer", "Data Analyst", "AI Engineer"],
    category: "data-ml",
  },
  {
    match: /product manager|product management|product strategy|roadmap|product owner/i,
    roles: ["Product Manager", "Associate Product Manager", "Technical Product Manager", "Program Manager", "Business Analyst"],
    category: "product",
  },
  {
    match: /design|figma|ux|ui|user experience|visual/i,
    roles: ["Product Designer", "UX Designer", "UI Designer", "UX Researcher", "Design Engineer"],
    category: "design",
  },
  {
    match: /quant|trading|portfolio|financial|finance|economics/i,
    roles: ["Quantitative Researcher", "Quantitative Trader", "Financial Analyst", "Trader", "Business Analyst"],
    category: "quant-trading",
  },
  {
    match: /hardware|embedded|electrical|mechanical|robotics|firmware|cad/i,
    roles: ["Hardware Engineer", "Embedded Systems Engineer", "Robotics Engineer", "Systems Engineer", "Mechanical Engineer"],
    category: "hardware",
  },
  {
    match: /research|laboratory|scientist|publication|thesis/i,
    roles: ["Research Assistant", "Research Scientist", "Research Engineer", "Lab Technician", "Program Analyst"],
    category: "research",
  },
  {
    match: /marketing|growth|content|brand|social media/i,
    roles: ["Marketing Associate", "Growth Marketing Associate", "Product Marketing Associate", "Content Strategist", "Marketing Analyst"],
    category: "other",
  },
  {
    match: /sales|account executive|customer success|business development|partnerships/i,
    roles: ["Account Executive", "Business Development Representative", "Customer Success Manager", "Account Manager", "Sales Engineer"],
    category: "other",
  },
];

function cleanTitle(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*[-|,]\s*(intern(ship)?|co-?op)\b.*$/i, "")
    .trim();
}

function addUnique(target: string[], values: string[]) {
  for (const value of values) {
    const clean = cleanTitle(value);
    if (!clean || target.some((item) => item.toLowerCase() === clean.toLowerCase())) continue;
    target.push(clean);
  }
}

function yearFrom(value: string): number | null {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function experienceYears(profile: ParsedProfile, currentYear = new Date().getFullYear()): number {
  const intervals: Array<{ start: number; end: number }> = [];
  for (const experience of profile.experience ?? []) {
    const start = yearFrom(experience.start ?? "");
    if (!start) continue;
    const statedEnd = yearFrom(experience.end ?? "");
    const end = /present|current|now/i.test(experience.end ?? "") ? currentYear : statedEnd ?? start;
    const startMonth = start * 12;
    intervals.push({
      start: startMonth,
      end: Math.max(startMonth + 3, Math.max(start, end) * 12),
    });
  }

  // Resume roles frequently overlap, especially for students balancing an internship, a campus
  // job, research, and volunteering. Adding every row made four chronological years read as more
  // than eleven and incorrectly pushed new graduates into the full-time track. Merge the dated
  // intervals so elapsed experience can never exceed elapsed time.
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  let months = 0;
  let current: { start: number; end: number } | null = null;
  for (const interval of intervals) {
    if (!current) {
      current = { ...interval };
      continue;
    }
    if (interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end);
      continue;
    }
    months += current.end - current.start;
    current = { ...interval };
  }
  if (current) months += current.end - current.start;
  return Math.round((months / 12) * 10) / 10;
}

export function inferRoleType(
  profile: ParsedProfile,
  years = experienceYears(profile),
  currentYear = new Date().getFullYear(),
): RoleType {
  const experiences = profile.experience ?? [];
  const currentCoOp = experiences.some((item) => {
    if (!/co-?op/i.test(item.title)) return false;
    const end = item.end?.trim() ?? "";
    return !end || /present|current|now/i.test(end) || yearFrom(end) === currentYear;
  });
  if (currentCoOp) return "co-op";
  // A current student graduating within a year is looking for a new-grad role even when their
  // resume contains several concurrent campus or volunteer positions. Only sustained prior
  // professional tenure should override this, and the merged timeline below is the conservative
  // proxy available from a resume.
  if (profile.currently_enrolled && profile.grad_year >= currentYear && profile.grad_year <= currentYear + 1 && years < 5) {
    return "new-grad";
  }
  if (years >= 5) return "full-time";
  if (profile.grad_year >= currentYear && profile.grad_year <= currentYear + 1) return "new-grad";
  if (profile.currently_enrolled || profile.grad_year > currentYear + 1) return "internship";
  const titles = experiences.map((item) => item.title).join(" ");
  if (/intern(ship)?/i.test(titles) && years < 2) return "internship";
  if (years >= 2) return "full-time";
  return "full-time";
}

export function categoriesForRoles(roles: string[], fallback: string[] = ["other"]): string[] {
  const categories = Array.from(new Set(
    ROLE_FAMILIES
      .filter((family) => roles.some((role) =>
        family.match.test(role)
        || family.roles.some((knownRole) => knownRole.toLowerCase() === role.toLowerCase()),
      ))
      .map((family) => family.category),
  )).slice(0, 3);
  return categories.length > 0 ? categories : fallback.slice(0, 3);
}

export function inferResumeTargeting(profile: ParsedProfile, currentYear = new Date().getFullYear()): ResumeTargetingGuess {
  const roles: string[] = [];
  addUnique(roles, profile.target_roles ?? []);

  const evidence = [
    ...(profile.experience ?? []).map((item) => `${item.title} ${item.description}`),
    ...(profile.skills ?? []),
    ...(profile.projects ?? []).map((item) => `${item.name} ${item.description}`),
  ].join(" ");
  const targetEvidence = (profile.target_roles ?? []).join(" ");
  const matched = ROLE_FAMILIES
    .filter((family) => family.match.test(evidence) || family.match.test(targetEvidence))
    .sort((a, b) => Number(b.match.test(targetEvidence)) - Number(a.match.test(targetEvidence)));
  for (const family of matched) addUnique(roles, family.roles);
  addUnique(roles, (profile.experience ?? []).map((item) => item.title));

  const categories = Array.from(new Set(matched.map((family) => family.category))).slice(0, 3);
  const yearsExperience = experienceYears(profile, currentYear);
  return {
    roles: roles.slice(0, 5),
    roleType: inferRoleType(profile, yearsExperience, currentYear),
    categories: categories.length > 0 ? categories : ["other"],
    yearsExperience,
  };
}

/* ------------------------------------------------------------------------------------------- */

/* What the /start roles screen is allowed to do to targeting that already exists.
 *
 * This lives beside the inference rather than in its own module because it is the GUARD ON THAT
 * INFERENCE: everything above is a guess about a student, and the rule below is the one that keeps
 * a guess from outranking an answer they already gave.
 *
 * The screen used to seed itself purely from the resume inference and then PUT
 * {categories, titles, role_types} as a full replacement. For a brand-new account that is
 * harmless - there is nothing to replace. For an account that already stated its targeting it is
 * one click of silent data loss on the record that aims every recommendation and every
 * application: a student with quant-trading/software-engineering/product internships saved would
 * be shown "Investment Banking Analyst" and "New grad" pre-selected (inferred from
 * ParsedProfile.target_roles[0], the same untrustworthy value behind the dashboard header fix in
 * b2137ce) and Continue would commit that guess over their real answer.
 *
 * That reachable at all is a consequence of the step being DERIVED rather than stored
 * (routes/onboarding.ts): `hasFocusTargeting` requires a non-empty titles array, so any account
 * whose targeting predates the titles field derives 'focus' again on every visit to /start,
 * forever, no matter how much of the product it has already used.
 *
 * So the rule here is inference NEVER outranks a stated answer, in either direction:
 *   - seeding reads saved targeting first and falls back to the resume guess only per field, and
 *     only where the student has said nothing;
 *   - committing merges categories instead of recomputing them, because this screen has no
 *     category control at all. Categories are edited in Settings (components/app/TargetingCard),
 *     so a screen that cannot show a category cannot be the thing that removes one.
 *
 * Both functions are pure and live here rather than in the component so the no-data-loss property
 * can be pinned by a test without a browser.
 */

/** The three targeting fields this screen touches. The other four are none of its business. */
export type SavedFocus = (
  Pick<Targeting, "categories" | "titles" | "role_types">
  & Partial<Pick<Targeting, "locations" | "remote_only" | "primary_period" | "backup_period">>
) | null;

/** The resume inference, narrowed to what seeding actually reads. */
export type FocusGuess = { roles: string[]; roleType: RoleType };

export type FocusSelection = { titles: string[]; roleTypes: RoleType[]; categories?: string[] };

function stated<T>(value: T[] | null | undefined): T[] | null {
  return Array.isArray(value) && value.length > 0 ? value : null;
}

/**
 * What the screen should arrive pre-selected with.
 *
 * Per field, not all-or-nothing: an account can have saved role_types and no titles (that is
 * exactly the shape that derives 'focus' in the first place), and in that case the guess should
 * still offer a title while the stated type stands.
 *
 * The guess contributes ONE title, not all five. Selecting every suggestion on the student's
 * behalf would make Continue commit five inferred titles that they only ever declined to remove.
 */
export function focusSeed(saved: SavedFocus, guess: FocusGuess): FocusSelection {
  const savedTitles = stated(saved?.titles);
  const savedRoleTypes = stated(saved?.role_types);
  return {
    titles: savedTitles ?? (guess.roles[0] ? [guess.roles[0]] : []),
    roleTypes: savedRoleTypes ?? [guess.roleType],
  };
}

/**
 * The body to PUT. Partial by omission (see routes/targeting.ts): locations, remote_only and the
 * two periods are absent on purpose and keep their stored values.
 *
 * categories is a UNION of what was saved and what the chosen titles imply. Widening is the only
 * safe direction for a screen with no category control: the student can never see that
 * quant-trading is on, so they can never mean to turn it off, and a recompute would turn it off
 * for them. Narrowing stays where the control is, in Settings.
 *
 * The derived half falls back to nothing rather than to "other" when there are saved categories:
 * "other" is the fallback for a student who would otherwise have no category at all, and adding
 * it to a real list would widen a stated preference into the untargeted bucket.
 */
export function focusPatch(saved: SavedFocus, selection: FocusSelection): Pick<Targeting, "categories" | "titles" | "role_types"> {
  const savedCategories = saved?.categories ?? [];
  const derived = categoriesForRoles(selection.titles, savedCategories.length > 0 ? [] : ["other"]);
  return {
    categories: Array.from(new Set([...savedCategories, ...(selection.categories ?? []), ...derived])),
    titles: selection.titles,
    role_types: selection.roleTypes,
  };
}
