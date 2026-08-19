import type { ParsedProfile, RoleType, Targeting } from "./api";

export type ResumeTargetingGuess = {
  roles: string[];
  roleType: RoleType;
  categories: string[];
  yearsExperience: number;
};

/* One list, two readers.
 *
 * `match` is read by inferResumeTargeting, which guesses from a resume. `id`/`label`/`roles` are
 * read by the /start roles screen, which now asks BEFORE a resume exists and therefore cannot
 * guess at all. Keeping both on one row is what stops the screen's title vocabulary drifting away
 * from the inference's: a family added for the resume reader shows up in the picker automatically.
 *
 * `category` is NOT unique - marketing and sales are two fields inside the `other` bucket - so the
 * picker keys on `id` and only ever writes `category` through focusPatch. The category vocabulary
 * is shared with Settings and the backend, and this screen is not the place to widen it. */
const ROLE_FAMILIES: { id: string; label: string; match: RegExp; roles: string[]; category: string }[] = [
  {
    id: "software",
    label: "Software & AI",
    match: /software|developer|frontend|front-end|backend|back-end|full.?stack|web|mobile|ios|android|react|typescript|javascript|java|python|c\+\+/i,
    roles: ["Software Engineer", "Full Stack Engineer", "Backend Engineer", "Frontend Engineer", "Product Engineer"],
    category: "software-engineering",
  },
  {
    id: "data",
    label: "Data & machine learning",
    match: /machine learning|\bml\b|data|analytics|artificial intelligence|\bai\b|pytorch|tensorflow|sql/i,
    roles: ["Machine Learning Engineer", "Data Scientist", "Data Engineer", "Data Analyst", "AI Engineer"],
    category: "data-ml",
  },
  {
    id: "product",
    label: "Product & program",
    match: /product manager|product management|product strategy|roadmap|product owner/i,
    roles: ["Product Manager", "Associate Product Manager", "Technical Product Manager", "Program Manager", "Business Analyst"],
    category: "product",
  },
  {
    id: "design",
    label: "Design",
    match: /design|figma|ux|ui|user experience|visual/i,
    roles: ["Product Designer", "UX Designer", "UI Designer", "UX Researcher", "Design Engineer"],
    category: "design",
  },
  {
    id: "quant",
    label: "Finance & trading",
    match: /quant|trading|portfolio|financial|finance|economics/i,
    roles: ["Quantitative Researcher", "Quantitative Trader", "Financial Analyst", "Trader", "Business Analyst"],
    category: "quant-trading",
  },
  {
    id: "hardware",
    label: "Hardware & robotics",
    match: /hardware|embedded|electrical|mechanical|robotics|firmware|cad/i,
    roles: ["Hardware Engineer", "Embedded Systems Engineer", "Robotics Engineer", "Systems Engineer", "Mechanical Engineer"],
    category: "hardware",
  },
  {
    id: "research",
    label: "Research",
    match: /research|laboratory|scientist|publication|thesis/i,
    roles: ["Research Assistant", "Research Scientist", "Research Engineer", "Lab Technician", "Program Analyst"],
    category: "research",
  },
  {
    id: "marketing",
    label: "Marketing & growth",
    match: /marketing|growth|content|brand|social media/i,
    roles: ["Marketing Associate", "Growth Marketing Associate", "Product Marketing Associate", "Content Strategist", "Marketing Analyst"],
    category: "other",
  },
  {
    id: "sales",
    label: "Sales & customer success",
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

/* The field-then-stage-then-titles picker, as pure data and two pure functions.
 *
 * The roles screen runs FIRST now, before any resume exists, so it has nothing to infer from and
 * must offer rather than guess. `FIELDS` is that offer, and it is derived from ROLE_FAMILIES so
 * there is exactly one title vocabulary in this file rather than two that drift.
 *
 * WHAT THE STAGE DOES AND DOES NOT DO. It does not change the title strings, and pretending it did
 * would be a lie the data model would then have to carry. `role_types` is its own saved field, and
 * cleanTitle above deliberately strips "intern"/"co-op" off a title, so "Software Engineer" is the
 * stored vocabulary at every stage and the stage is stored beside it. What the stage genuinely
 * changes is which postings match, which is the board's job and not this screen's.
 *
 * So the stage gates the titles rather than filtering them: both answers are required before the
 * title list is offered at all. That is the point of asking in this order - a student who has said
 * "Software & AI" and "Internship" is answering a much smaller question than one facing every
 * title in JOB_TITLES, and the two answers are what make the offer specific.
 */

export type OnboardingField = {
  /** Stable across renames; this is what the query string and analytics carry. */
  id: string;
  label: string;
  /** The EXISTING targeting category this field belongs to. Not unique across fields. */
  category: string;
  titles: string[];
};

export const FIELDS: OnboardingField[] = ROLE_FAMILIES.map((family) => ({
  id: family.id,
  label: family.label,
  category: family.category,
  titles: [...family.roles],
}));

/**
 * The titles to offer for the chosen fields, in field order, deduped case-insensitively.
 *
 * An unknown id contributes nothing rather than throwing: the ids ride in a query string from the
 * homepage calibration card, so a stale link must degrade to a smaller offer and never to a broken
 * screen. An empty selection returns an empty list, which is what makes the gate above truthful -
 * the screen has nothing to show until a field is chosen, rather than quietly showing everything.
 */
export function titlesForFields(fieldIds: readonly string[]): string[] {
  const chosen = new Set(fieldIds);
  const out: string[] = [];
  for (const field of FIELDS) {
    if (!chosen.has(field.id)) continue;
    for (const title of field.titles) {
      if (!out.some((item) => item.toLowerCase() === title.toLowerCase())) out.push(title);
    }
  }
  return out;
}

/**
 * The targeting categories the chosen fields imply.
 *
 * This exists because the roles screen has no category control and never did: categories used to
 * arrive from the resume inference, and the screen ran third, after an upload. Running first, for
 * a student with no resume, that source is gone - and `categories` is a REQUIRED part of the
 * targeting write, so without this a brand-new account reaches Continue permanently disabled with
 * no visible way to satisfy it. The field IS the category question, asked in words a student can
 * answer, so the answer comes from here.
 *
 * Deduped because two fields can share one category: picking Marketing and Sales is one `other`.
 */
export function categoriesForFields(fieldIds: readonly string[]): string[] {
  const chosen = new Set(fieldIds);
  return Array.from(new Set(FIELDS.filter((field) => chosen.has(field.id)).map((field) => field.category)));
}

/**
 * Which fields to pre-select for a student who already has targeting.
 *
 * Read from SAVED CATEGORIES, never from the resume, and that direction is the same no-data-loss
 * rule focusSeed states below: a returning student's stated categories outrank anything inferred.
 * A category holding two fields (marketing and sales both sit in `other`) pre-selects both, which
 * over-offers rather than under-offers - the student can deselect what they can see, and cannot
 * deselect a field the screen never drew.
 */
export function fieldsForCategories(categories: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(categories) || categories.length === 0) return [];
  const wanted = new Set(categories);
  return FIELDS.filter((field) => wanted.has(field.category)).map((field) => field.id);
}


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
export function focusSeed(saved: SavedFocus, guess: FocusGuess | null): FocusSelection {
  const savedTitles = stated(saved?.titles);
  const savedRoleTypes = stated(saved?.role_types);
  return {
    /* A NULL GUESS IS THE COMMON CASE NOW. The roles screen runs before the upload, so most
       students arrive with no resume to infer from, and the honest seed for them is nothing
       pre-selected at all: the field picker is what offers titles, and pre-ticking one Litos
       invented would be the guess-outranks-answer failure this module exists to prevent, just
       with no answer yet rather than an answer being overwritten. */
    titles: savedTitles ?? (guess?.roles[0] ? [guess.roles[0]] : []),
    roleTypes: savedRoleTypes ?? (guess ? [guess.roleType] : []),
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
