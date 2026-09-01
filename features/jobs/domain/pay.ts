/* HOW PAY AND JOB TYPE READ ON A CARD.
 *
 * The API sends four raw facts (min, max, currency, period) rather than a formatted string, so
 * this is the one place that decides how they read. Both surfaces import it: the public board at
 * /browse-jobs and the signed-in list at /dashboard/jobs. Two copies of a money formatter drifting
 * apart is how the same job ends up reading "$145K" on one page and "$145,700" on the other.
 *
 * NOTHING HERE INVENTS A NUMBER. Two thirds of the board publishes no pay at all, and every
 * function returns null for that rather than "Competitive" or "Not listed", the same rule the
 * board already follows when it says UPDATED instead of POSTED on a Greenhouse row. A reader
 * scanning tiles learns that a figure means the employer published one.
 */

export type PayFacts = {
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_interval?: string | null;
};

/* Per period, the suffix and how the figures are rounded.
 *
 * An annual salary is abbreviated (145700 -> "$146K") because a tile has one line for it and the
 * hundreds are noise at that scale. An hourly rate is NOT: "$35/hr" is already short, and rounding
 * it to a thousand would destroy it. Monthly follows hourly, since monthly figures are published
 * in the small currencies where the exact number is the information. */
const PERIODS: Record<string, { suffix: string; abbreviate: boolean }> = {
  year: { suffix: "/yr", abbreviate: true },
  month: { suffix: "/mo", abbreviate: false },
  hour: { suffix: "/hr", abbreviate: false },
};

/* Symbols for the currencies where one is unambiguous to the reader of an English-language board.
 *
 * Everything else prints its ISO code instead ("SEK 600,000/yr"), and that is deliberate rather
 * than lazy: 19 currencies appear on the live board, several of them share the "$" and "kr"
 * symbols, and "$600,000" on a Chilean posting would read as a US salary worth 60 times what it is.
 * A code nobody has to decode wrongly beats a symbol that misleads. */
const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  INR: "₹",
};

function abbreviate(value: number): string {
  /* Under 1,000 an annual figure is not a salary in any currency this abbreviates, so leave it
     alone rather than printing "$0K". */
  if (value < 1_000) return round(value);
  const thousands = value / 1_000;
  if (thousands < 1_000) {
    /* One decimal only below 100K, where the difference between 62.5K and 63K is money a reader
       cares about. Above that the decimal is noise on a tile. */
    const rounded = thousands < 100 ? Math.round(thousands * 10) / 10 : Math.round(thousands);
    return `${trimZero(rounded)}K`;
  }
  return `${trimZero(Math.round((value / 1_000_000) * 10) / 10)}M`;
}

function trimZero(value: number): string {
  return String(value).replace(/\.0$/, "");
}

function round(value: number): string {
  /* Hourly rates carry real cents ($22.50); whole figures must not gain a ".00". */
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * The pay line for a card, or null when the employer published none.
 *
 * Renders as one range ("$146K – $200K/yr") or, where the employer published a single figure, as
 * one number ("$35/hr"). The currency and the period are stated once at the end rather than on
 * both halves, which is how Handshake reads and how a range is read aloud.
 */
export function formatPay(job: PayFacts): string | null {
  const min = numberOrNull(job.salary_min);
  const max = numberOrNull(job.salary_max);
  const currency = job.salary_currency?.trim().toUpperCase();
  const period = job.salary_interval ? PERIODS[job.salary_interval] : undefined;
  /* All four or nothing. The columns are written together and cleared together, so a row missing
     one of them is a row this page has no honest way to render, most likely a period the poller
     declined to guess, which is exactly the case that must not reach a reader as a bare number. */
  if (min === null || max === null || !currency || !period) return null;

  const symbol = SYMBOLS[currency];
  const format = period.abbreviate ? abbreviate : round;
  const low = format(min);
  const high = format(max);
  const money = (value: string) => (symbol ? `${symbol}${value}` : value);
  /* An employer that published a single figure rather than a band gets one number, not
     "$35 – $35/hr". 1 in 8 postings with pay does this. */
  const amount = low === high ? money(low) : `${money(low)} – ${money(high)}`;
  const prefix = symbol ? "" : `${currency} `;
  return `${prefix}${amount}${period.suffix}`;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  /* The column is double precision, so the API sends a JSON number, but a driver or a cache that
     hands back the string "150000" must not silently render as nothing. */
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The job-type chip, or null when the posting did not say.
 *
 * NULL IS THE COMMON ANSWER AND THE CORRECT ONE. Greenhouse is 84% of the board and has no
 * employment-type field at all, so those postings show no chip unless their own title stated a
 * type. Filling that silence with "Full-time" would put a fact no employer stated on ~18,000
 * tiles, see employmentTypeFromTitle in the backend's lib/compensation.ts.
 *
 * 'Full-time' IS shown where a board genuinely stated it, because then it is the employer talking.
 */
/**
 * The employment types a visitor may FILTER by.
 *
 * Deliberately the same five words the backend's employment_type enum accepts, and deliberately not
 * derived from board facets: the column also carries pass-through values from employers whose
 * spelling the normalizer did not recognise, and offering one employer's wording as a board-wide
 * category would promise a complete set that does not exist.
 *
 * A posting with NO stated type matches none of these, which is correct rather than a gap. Around
 * 84% of the board states no type at all because Greenhouse has no such field, and the product's
 * standing rule is that an unstated type shows nothing rather than being defaulted to Full-time.
 * So "Full-time" here means "the employer said so", and the silence stays honest.
 *
 * Apprenticeship is its own entry rather than a kind of Internship: a trade apprenticeship is a
 * paid multi-year route into a skilled trade, open to people who are not students at all, so a
 * career-changer searching for one and a student searching for a summer placement want different
 * lists and were previously handed the same one.
 */
export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Internship",
  "Apprenticeship",
  "Contract",
] as const;

/* The chip renders a CATEGORY, never whatever string arrived in the column.
 *
 * The employment_type column is deliberately lossless: the backend normalizes the vocabulary it
 * recognises and PASSES THROUGH anything it does not, because a board that discards employer
 * statements it has not seen before is how the field goes stale without anyone noticing. That is
 * the right call for the data and the wrong thing to print. Measured against prod 2026-09-01, 875
 * distinct unrecognised values sat on 41,933 active postings, so tiles were rendering chips reading
 * `fulltime_permanent` (11,164 of them), `parttime_fixed_term`, "Homeoffice", "Mid-Senior Level",
 * "Investment Banking" and a literal "Other" - database columns, work arrangements, seniority bands
 * and department names, shown to a student as though they were the kind of job.
 *
 * So the two halves of the fix live on opposite sides. The backend learns the real vocabulary, which
 * is what makes the FILTER work - `employment_type` is matched by equality there, so a posting typed
 * `fulltime_permanent` was invisible to "Full-time" no matter what the tile said. This function is
 * the backstop that holds regardless: the set of things employers write is open and will keep
 * growing, and an unrecognised value must never reach a tile again.
 *
 * SHOWING NOTHING IS THE CORRECT ANSWER here, and it is the rule the board already follows. Around
 * 84% of postings state no type at all because Greenhouse has no such field, and those show no chip
 * rather than being defaulted to Full-time. A value this product cannot name as a category is in
 * exactly that position: the employer said something, and the board has nothing honest to call it.
 *
 * Volunteer is recognised without being filterable. It is a real, unambiguous category the backend
 * emits, so it reads correctly on a tile; it is not in EMPLOYMENT_TYPES because offering it as a
 * filter would promise a curated set of volunteer postings that does not exist.
 */
const LABELLED_TYPES: readonly string[] = [...EMPLOYMENT_TYPES, "Volunteer"];

export function jobTypeLabel(employmentType?: string | null): string | null {
  const value = employmentType?.trim();
  if (!value) return null;
  /* Matched case-insensitively and answered with THIS file's spelling, so a board or a backfill
     that sends "full-time" cannot put a second, differently-cased chip on the board. */
  return LABELLED_TYPES.find((type) => type.toLowerCase() === value.toLowerCase()) ?? null;
}
