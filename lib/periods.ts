/* Hiring periods, derived from the student's graduation year.
 *
 * The targeting screen asks "main focus" and "backup". Asking that as two open dropdowns of
 * every season since 2020 is a worse version of a question we can mostly answer: a 2028 grad
 * standing in July 2026 is hunting Summer 2027, and everyone knows it. So we compute the
 * plausible set, pre-select the obvious one, and let them correct it in one click.
 *
 * Slugs ("summer-2027") are the wire format and match the backend's PERIOD_RE. Labels are only
 * ever for display - never store a label, it will not validate.
 */

export type Season = "spring" | "summer" | "fall" | "winter";
export type Period = { slug: string; label: string; season: Season; year: number };

const SEASONS: { season: Season; label: string; startMonth: number }[] = [
  // startMonth is roughly when the term begins, used only for ordering and for deciding what
  // has already passed. Northern-hemisphere academic calendar, which is what every ATS assumes.
  { season: "spring", label: "Spring", startMonth: 0 },
  { season: "summer", label: "Summer", startMonth: 4 },
  { season: "fall", label: "Fall", startMonth: 8 },
];

export function periodSlug(season: Season, year: number): string {
  return `${season}-${year}`;
}

export function periodLabel(slug: string): string {
  const [season, year] = slug.split("-");
  const s = SEASONS.find((x) => x.season === season);
  return s ? `${s.label} ${year}` : slug;
}

/** Ordinal for sorting/comparison: year * 12 + month the term starts. */
function ordinal(season: Season, year: number): number {
  const s = SEASONS.find((x) => x.season === season);
  return year * 12 + (s?.startMonth ?? 0);
}

/**
 * Every period worth offering: from the next one that has not started, through the term the
 * student graduates in. Capped at 8 so the chip row stays one glance rather than a wall.
 *
 * `now` is injectable because a function whose output silently changes with the wall clock is
 * untestable, and this one decides what the student sees pre-selected.
 */
export function periodsFor(gradYear: number, now: Date = new Date()): Period[] {
  const nowOrd = now.getFullYear() * 12 + now.getMonth();
  // A grad_year of 0 means the parser could not find one (parse.ts defaults it to 0). Offering
  // "Spring 0" is worse than offering a sensible two-year window from today.
  const endYear = gradYear && gradYear > now.getFullYear() ? gradYear : now.getFullYear() + 2;

  const out: Period[] = [];
  for (let year = now.getFullYear(); year <= endYear; year++) {
    for (const s of SEASONS) {
      // Already started = not a thing you can still apply for.
      if (ordinal(s.season, year) <= nowOrd) continue;
      out.push({ slug: periodSlug(s.season, year), label: `${s.label} ${year}`, season: s.season, year });
    }
  }
  return out.sort((a, b) => ordinal(a.season, a.year) - ordinal(b.season, b.year)).slice(0, 8);
}

/**
 * The one they almost certainly mean.
 *
 * Summer is the internship term that matters - it is the one with real programs, real pay, and
 * real return offers - so the default is the next available summer before graduation. A student
 * needs the next recruiting cycle, not a junior-year cycle several years away. A 2028 grad in
 * July 2026 still gets Summer 2027, and a 2030 grad does too rather than silently jumping to 2028
 * because the visible list was capped.
 *
 * Falls back to the first available period when there is no summer left, e.g. a final-year
 * student hunting full-time.
 */
export function defaultPrimary(gradYear: number, now: Date = new Date()): string | null {
  const periods = periodsFor(gradYear, now);
  if (periods.length === 0) return null;
  const summersBeforeGrad = periods.filter((p) => p.season === "summer" && (!gradYear || p.year < gradYear));
  return (summersBeforeGrad[0] ?? periods[0]).slug;
}

/**
 * Where they'd go if the main one doesn't land: the term immediately before it. Earlier, not
 * later - a backup you apply to AFTER your main has already closed is not a backup.
 */
export function defaultBackup(gradYear: number, now: Date = new Date()): string | null {
  const periods = periodsFor(gradYear, now);
  const primary = defaultPrimary(gradYear, now);
  const i = periods.findIndex((p) => p.slug === primary);
  if (i > 0) return periods[i - 1].slug;
  return periods[i + 1]?.slug ?? null;
}

/* There used to be MAX_CATEGORIES = 3 and MAX_ROLE_TYPES = 2 here, mirroring the backend. Both are
 * gone (2026-08-02): a student may pick as many as they mean. Both lists are closed and short, so
 * "everything" is still only 8 and 4. */

/* Categories. A closed, short list on purpose: this steers which postings we surface, and a
 * free-text field here produces 40 spellings of "SWE" that match nothing. */
export const CATEGORIES: { slug: string; label: string }[] = [
  { slug: "software-engineering", label: "Software engineering" },
  { slug: "data-ml", label: "Data / ML" },
  { slug: "product", label: "Product" },
  { slug: "design", label: "Design" },
  { slug: "quant-trading", label: "Quant / trading" },
  { slug: "hardware", label: "Hardware" },
  { slug: "research", label: "Research" },
  { slug: "other", label: "Other" },
];

/* How many categories the header names before it counts the rest. Three of the longest labels
 * plus a count is about fifty characters, which still sits on one line under "Home" on a phone. */
const HEADLINE_CATEGORIES = 3;

/* The declared type is string[] | null, but nothing between the API and here enforces it. The
 * bootstrap hands bootstrap.targeting straight through (load-dashboard.ts), and the .catch beside
 * it only fires on a failed request, never on a malformed 200. This matters more than it looks:
 * the expression targetingHeadline replaced was total, it could not throw on any payload, and
 * there is no error.tsx or global-error.tsx anywhere under app/. A throw in here takes out the
 * whole dashboard rather than one line of it, so the header must degrade instead.
 *
 * Anything that is not a string inside an array counts as not saved. A bare string is refused
 * rather than wrapped: "product" arriving where an array belongs means the payload is wrong, and
 * spreading it a character at a time renders "Product, p, r +5 more" in the header, which is worse
 * than the empty wording because it looks deliberate. */
function savedStrings(value: string[] | null | undefined): string[] {
  return (Array.isArray(value) ? value : []).filter((entry): entry is string => typeof entry === "string");
}

/* One line naming what the student saved as their target, for the Home header.
 *
 * titles is the specific answer and wins whenever they gave one. When it is empty the only saved
 * targeting left is categories - and categories is what ranks the feed underneath the header - so
 * that is what the header names. Categories was the missing rung: with no titles the header used
 * to print profile.target_roles, which announced "Investment Banking Analyst" over a feed of
 * quant, software and product roles.
 *
 * target_roles is deliberately not a rung below categories, and not because it is machine-written:
 * it is editable, in the "Target roles" box on /dashboard/resume. It is excluded because of where
 * it can be edited and what it does. It is not an input to ranking anywhere in the app, and the
 * "Change what you want" link beside this label opens TargetingCard, which edits categories,
 * titles, types, locations and periods and cannot touch target_roles. Printing it here would put a
 * value in the header that the header's own link cannot change - the same defect, in a rarer
 * state. A student who has cleared both titles and categories has told us nothing on that screen,
 * and the empty wording plus the link says so and points at the fix. Their answer to "correct what
 * the PDF reader got wrong" is not their answer to "what do you want", so it is not borrowed here.
 *
 * Ordered by CATEGORIES rather than by the order the boxes happened to be ticked, so the line
 * reads in the same sequence as the "Kind of work" chips it links out to. Returns null when there
 * is nothing saved; the caller owns the empty wording. */
export function targetingHeadline(
  titles: string[] | null | undefined,
  categories: string[] | null | undefined,
): string | null {
  const title = savedStrings(titles).map((t) => t.trim()).find(Boolean);
  if (title) return title;

  const chosen = savedStrings(categories);
  const labels = CATEGORIES.filter((c) => chosen.includes(c.slug)).map((c) => c.label);
  // A slug the backend knows and this list does not still belongs in the count, and reading the
  // raw slug beats silently dropping a category the student can see ticked in settings.
  for (const slug of chosen) {
    if (slug.trim() && !CATEGORIES.some((c) => c.slug === slug)) labels.push(slug);
  }

  if (labels.length === 0) return null;
  if (labels.length <= HEADLINE_CATEGORIES) return labels.join(", ");
  const named = labels.slice(0, HEADLINE_CATEGORIES).join(", ");
  return `${named} +${labels.length - HEADLINE_CATEGORIES} more`;
}

export const ROLE_TYPES: { slug: string; label: string }[] = [
  { slug: "internship", label: "Internship" },
  { slug: "co-op", label: "Co-op" },
  { slug: "new-grad", label: "New grad" },
  { slug: "full-time", label: "Full-time" },
];
