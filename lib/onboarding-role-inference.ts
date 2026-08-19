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
 * `category` is NOT unique - nine of the nineteen fields sit inside the `other` bucket - so the
 * picker keys on `id` and only ever writes `category` through focusPatch. The category vocabulary
 * is shared with Settings and the backend, and this screen is not the place to widen it. That
 * many fields on one category is also why `fieldsForFocus` exists: reading a returning student's
 * fields back out of `other` alone would pre-select nine of them.
 *
 * EVERY TITLE IN `roles` WAS MEASURED AGAINST THE LIVE BOARD ON 2026-08-19, and none of them
 * returns fewer than five postings. That check is the point, and it is the same rule
 * lib/job-titles.ts states for the browse dropdown: a suggestion that lands on an empty page is
 * worse than no suggestion, because the reader concludes the board is broken rather than that we
 * offered a word we do not carry. Re-measure with scripts/verify-onboarding-fields.mjs.
 *
 * The measurement is also why several titles CHANGED rather than only being added. "Marketing
 * Associate", "Growth Marketing Associate", "Product Marketing Associate" and "Research Assistant"
 * each returned ZERO - the marketing field was offering three dead suggestions and a fourth that
 * returned one - and "Associate Product Manager", "Embedded Systems Engineer" and "UI Designer"
 * were down in the low single digits. They are replaced by the manager-and-engineer forms the
 * board actually carries. Nothing is lost for a student who had one saved: FocusForm's `offered`
 * is the union of this list and their own selection, so a saved title outlives its removal here.
 *
 * The nine fields added on 2026-08-19 are the ones a student could previously only reach by typing
 * in the box. Healthcare alone is 250+ live postings (Physician, Nurse, Nurse Practitioner,
 * Physician Assistant) that no field on this screen used to point at. */
const ROLE_FAMILIES: { id: string; label: string; match: RegExp; roles: string[]; category: string }[] = [
  {
    id: "software",
    label: "Software & AI",
    match: /software|developer|frontend|front-end|backend|back-end|full.?stack|web|mobile|ios|android|react|typescript|javascript|java|python|c\+\+/i,
    roles: ["Software Engineer", "Test Engineer", "Backend Engineer", "Full Stack Engineer", "Frontend Engineer", "Product Engineer"],
    category: "software-engineering",
  },
  {
    id: "data",
    label: "Data & machine learning",
    match: /machine learning|\bml\b|data|analytics|artificial intelligence|\bai\b|pytorch|tensorflow|sql/i,
    roles: ["Machine Learning Engineer", "Data Scientist", "Data Engineer", "AI Engineer", "Data Analyst", "Analytics Engineer"],
    category: "data-ml",
  },
  {
    id: "infrastructure",
    label: "Infrastructure & security",
    match: /devops|site reliability|\bsre\b|infrastructure|kubernetes|terraform|cloud|aws|azure|security|cybersecurity|networking/i,
    roles: ["Security Engineer", "Site Reliability Engineer", "Platform Engineer", "Infrastructure Engineer", "Network Engineer", "DevOps Engineer"],
    category: "software-engineering",
  },
  {
    id: "support",
    label: "IT & technical support",
    match: /solutions architect|solutions engineer|sales engineer|technical support|help desk|service desk|system administrator|sysadmin|quality assurance/i,
    roles: ["Solutions Architect", "Solutions Engineer", "Support Engineer", "Technical Support Engineer", "QA Engineer", "Systems Administrator"],
    category: "software-engineering",
  },
  {
    id: "product",
    label: "Product & program",
    match: /product manager|product management|product strategy|roadmap|product owner/i,
    roles: ["Product Manager", "Program Manager", "Technical Program Manager", "Business Analyst", "Technical Product Manager", "Product Owner"],
    category: "product",
  },
  {
    id: "design",
    label: "Design",
    match: /design|figma|ux|ui|user experience|visual/i,
    roles: ["Designer", "Product Designer", "Design Engineer", "UX Engineer", "Motion Designer", "Brand Designer"],
    category: "design",
  },
  {
    id: "quant",
    label: "Finance & trading",
    match: /quant|trading|portfolio|financial|finance|economics/i,
    roles: ["Trader", "Quantitative Researcher", "Financial Analyst", "Quantitative Trader", "Business Analyst", "Risk Analyst"],
    category: "quant-trading",
  },
  {
    id: "hardware",
    label: "Hardware & robotics",
    match: /hardware|embedded|electrical|mechanical|robotics|firmware|cad/i,
    roles: ["Systems Engineer", "Mechanical Engineer", "Electrical Engineer", "Hardware Engineer", "Firmware Engineer", "Robotics Engineer"],
    category: "hardware",
  },
  {
    id: "manufacturing",
    label: "Manufacturing & industrial",
    match: /manufacturing|industrial engineer|process engineer|production|assembly|supply chain|logistics|six sigma|lean/i,
    roles: ["Manufacturing Engineer", "Quality Engineer", "Field Engineer", "Process Engineer", "Validation Engineer", "Project Engineer"],
    category: "hardware",
  },
  {
    id: "research",
    label: "Research",
    match: /research|laboratory|scientist|publication|thesis/i,
    roles: ["Scientist", "Research Engineer", "Research Scientist", "Applied Scientist", "Research Analyst"],
    category: "research",
  },
  {
    id: "healthcare",
    label: "Healthcare & clinical",
    match: /clinical|patient|nursing|\bnurse\b|physician|medical|healthcare|pharmacy|therapist/i,
    roles: ["Physician", "Nurse", "Nurse Practitioner", "Physician Assistant", "Medical Assistant"],
    category: "other",
  },
  {
    id: "consulting",
    label: "Consulting & strategy",
    match: /consulting|consultant|strategy|advisory|due diligence|market entry/i,
    roles: ["Consultant", "Implementation Consultant", "Business Analyst", "Strategy Manager", "Business Systems Analyst", "Strategy Analyst"],
    category: "other",
  },
  {
    id: "operations",
    label: "Operations & project management",
    match: /operations|project manager|project management|scheduling|procurement|vendor management|chief of staff/i,
    roles: ["Operations Manager", "Project Manager", "Operations Analyst", "Executive Assistant", "Chief of Staff", "Business Operations Manager"],
    category: "other",
  },
  {
    id: "finance",
    label: "Finance & accounting",
    match: /accounting|accountant|bookkeeping|audit|payroll|tax|controller|treasury|\bfp&a\b/i,
    roles: ["Accountant", "Financial Analyst", "Finance Manager", "Senior Accountant", "Controller", "Auditor"],
    category: "other",
  },
  {
    id: "people",
    label: "People & recruiting",
    match: /recruit|talent acquisition|human resources|\bhr\b|people operations|sourcing candidates|onboarding employees/i,
    roles: ["Recruiter", "Technical Recruiter", "Sourcer", "HR Business Partner", "Recruiting Coordinator", "People Partner"],
    category: "other",
  },
  {
    id: "legal",
    label: "Legal & compliance",
    match: /legal|paralegal|counsel|attorney|compliance|regulatory|contracts|litigation|policy analysis/i,
    roles: ["Paralegal", "Legal Counsel", "Compliance Manager", "Corporate Counsel", "Compliance Officer", "Contract Manager"],
    category: "other",
  },
  {
    id: "writing",
    label: "Writing & communications",
    match: /technical writing|technical writer|copywriting|copywriter|editorial|\beditor\b|communications|public relations|journalism/i,
    roles: ["Editor", "Technical Writer", "Communications Manager", "Content Manager", "Video Editor", "Copywriter"],
    category: "other",
  },
  {
    id: "marketing",
    label: "Marketing & growth",
    match: /marketing|growth|content|brand|social media/i,
    roles: ["Marketing Manager", "Product Marketing Manager", "Growth Marketing Manager", "Content Manager", "Marketing Coordinator"],
    category: "other",
  },
  {
    id: "sales",
    label: "Sales & customer success",
    match: /sales|account executive|customer success|business development|partnerships/i,
    roles: ["Account Executive", "Sales Engineer", "Account Manager", "Sales Development Representative", "Customer Success Manager", "Business Development Representative"],
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

/**
 * Which fields to pre-select for a student who already has targeting, reading their TITLES first.
 *
 * fieldsForCategories above is the older, coarser answer and is still the fallback. It stopped
 * being good enough on its own when the field list grew to nineteen: nine of them sit in the
 * `other` category, so a returning student whose saved categories are ["other"] would arrive with
 * marketing, sales, operations, consulting, finance, people, legal, healthcare and writing all
 * lit up - nine answers the product put in their mouth, on the screen whose entire job is to stop
 * doing exactly that.
 *
 * Titles are the precise record and categories are the lossy one, so titles are read first. A
 * saved "Recruiter" says people; a saved "other" says one of nine things. Falls back to the
 * category read only when no saved title matches any field's offer, which is the case for a
 * student whose titles are all free text - there the coarse answer is the only one there is, and
 * over-offering beats a blank screen since they can deselect what they can see.
 *
 * Case-insensitive for the same reason `offered` is: titles are stored as the student typed or
 * tapped them, and "product manager" and "Product Manager" are the same answer.
 */
export function fieldsForFocus(saved: SavedFocus): string[] {
  const titles = new Set((saved?.titles ?? []).map((title) => title.trim().toLowerCase()).filter(Boolean));
  if (titles.size > 0) {
    const matched = FIELDS
      .filter((field) => field.titles.some((title) => titles.has(title.toLowerCase())))
      .map((field) => field.id);
    if (matched.length > 0) return matched;
  }
  return fieldsForCategories(saved?.categories);
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
