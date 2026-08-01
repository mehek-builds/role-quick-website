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

/* Caps, mirrored from the backend's targetingBodySchema. An uncapped multi-select lets a student
 * tick everything and destroy their own matching: "interested in everything" and "hasn't chosen"
 * become the same answer. The UI enforces these so the limit is visible before it is hit, rather
 * than surfacing as a 400 after the fact. */
export const MAX_CATEGORIES = 3;
export const MAX_ROLE_TYPES = 2;

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

export const ROLE_TYPES: { slug: string; label: string }[] = [
  { slug: "internship", label: "Internship" },
  { slug: "co-op", label: "Co-op" },
  { slug: "new-grad", label: "New grad" },
  { slug: "full-time", label: "Full-time" },
];
