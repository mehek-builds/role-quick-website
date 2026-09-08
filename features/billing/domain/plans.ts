export type LitosPlusPlanId =
  | "litos_plus_week"
  | "litos_plus_month"
  | "litos_plus_quarter";

export type LitosPlusTerm = "week" | "month" | "quarter";

// Mirrors student-outreach-backend/src/lib/currency.ts. Kept as a literal union here too so a
// server response with a currency Litos doesn't yet support can never make it into a plan card.
export type SupportedCurrency = "USD" | "EUR" | "GBP" | "ZAR" | "CAD" | "INR";

export const DEFAULT_CURRENCY: SupportedCurrency = "USD";

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return value === "USD" || value === "EUR" || value === "GBP" || value === "ZAR" || value === "CAD" || value === "INR";
}

export type LitosPlusPlan = {
  id: LitosPlusPlanId;
  term: LitosPlusTerm;
  label: string;
  shortLabel: string;
  amountCents: number;
  total: string;
  daily: string;
  renewal: string;
  disclosure: string;
  // The one-line "who this is for" that sits directly under the plan name.
  audience: string;
  // The closing sentence at the foot of the card, after the applications line.
  closer: string;
  // The struck-through "was" price and the percentage beside it, both formatted for the
  // currency being shown. Non-null on exactly the discounted plan (Quarterly); null elsewhere,
  // which is what suppresses the badge. Mirrors billingCatalog.ts's list_amount_cents /
  // discount_percent -- that pair is the source of truth, this is the display copy for it.
  listTotal: string | null;
  discountLabel: string | null;
  mostPopular: boolean;
  // Generations (resume tailoring + application filling + cover letters, one shared pool) per
  // billing cycle -- one generation is one completed application. Mirrors the backend's
  // billingCatalog.ts generation_limit -- that is the enforced source of truth; this copy is
  // for display only.
  generationLimit: number;
  // Plain-language applications-per-week/month line shown on the plan card. Derived from
  // generationLimit; written out per plan rather than computed so the wording (a flat "a week"
  // vs. an averaged "a week") stays a deliberate choice, not an artifact of the math.
  applicationsLine: string;
};

export const DEFAULT_LITOS_PLUS_PLAN_ID: LitosPlusPlanId = "litos_plus_quarter";

type PlanBase = {
  id: LitosPlusPlanId;
  term: LitosPlusTerm;
  label: string;
  shortLabel: string;
  amountCentsUsd: number;
  listAmountCentsUsd: number | null;
  discountPercent: number | null;
  dailyEquivalentCentsUsd: number;
  days: number;
  renewal: string;
  audience: string;
  closer: string;
  mostPopular: boolean;
  generationLimit: number;
  applicationsLine: string;
};

// FX snapshot 2026-09-07, mirroring student-outreach-backend/src/lib/billingCatalog.ts exactly
// -- keep both tables in sync when rates are refreshed, since a mismatch would fail the server
// verification in catalog.ts (a mismatch there falls the whole page back to this USD table).
const CURRENCY_AMOUNTS_CENTS: Record<LitosPlusPlanId, Record<Exclude<SupportedCurrency, "USD">, number>> = {
  litos_plus_week: { EUR: 2_599, GBP: 2_299, CAD: 4_199, ZAR: 47_900, INR: 283_900 },
  litos_plus_month: { EUR: 5_199, GBP: 4_499, CAD: 8_299, ZAR: 95_900, INR: 566_900 },
  litos_plus_quarter: { EUR: 10_399, GBP: 8_899, CAD: 16_599, ZAR: 191_900, INR: 1_133_900 },
};

// The struck-through "was" price, converted on the same snapshot with the same rounding, so a
// localized visitor never sees their own currency crossed out against a USD figure. Only the
// discounted plan has an entry; the others have no "was" price to convert.
const CURRENCY_LIST_AMOUNTS_CENTS: Partial<Record<LitosPlusPlanId, Record<Exclude<SupportedCurrency, "USD">, number>>> = {
  litos_plus_quarter: { EUR: 30_999, GBP: 26_699, CAD: 49_899, ZAR: 574_900, INR: 3_401_900 },
};

const PLAN_BASE: readonly PlanBase[] = [
  {
    id: "litos_plus_week",
    term: "week",
    label: "Weekly",
    shortLabel: "1 week",
    amountCentsUsd: 2_999,
    listAmountCentsUsd: null,
    discountPercent: null,
    dailyEquivalentCentsUsd: 428,
    days: 7,
    renewal: "every week",
    audience: "For light job seekers testing the market.",
    closer: "Perfect if you're applying occasionally or exploring new roles.",
    mostPopular: false,
    generationLimit: 50,
    applicationsLine: "50 applications / week",
  },
  {
    id: "litos_plus_month",
    term: "month",
    label: "Monthly",
    shortLabel: "1 month",
    amountCentsUsd: 5_999,
    listAmountCentsUsd: null,
    discountPercent: null,
    dailyEquivalentCentsUsd: 200,
    days: 30,
    renewal: "every month",
    audience: "For active job seekers ready to move fast.",
    closer: "Ideal if you're applying weekly and want to stay top of mind with every opportunity.",
    mostPopular: false,
    generationLimit: 200,
    applicationsLine: "200 applications / month",
  },
  {
    id: "litos_plus_quarter",
    term: "quarter",
    label: "Quarterly",
    shortLabel: "3 months",
    amountCentsUsd: 11_999,
    listAmountCentsUsd: 35_999,
    discountPercent: 70,
    dailyEquivalentCentsUsd: 133,
    days: 90,
    renewal: "every 3 months",
    audience: "For go-getters ready to land their next role.",
    /* The em dash in the approved copy is a comma here: Litos writes no em dashes anywhere. */
    closer: "Go all in. Apply to more roles, faster, and let Litos handle the busywork.",
    mostPopular: true,
    generationLimit: 600,
    applicationsLine: "600 applications / 3 months",
  },
];

function amountCentsFor(base: PlanBase, currency: SupportedCurrency): number {
  return currency === "USD" ? base.amountCentsUsd : CURRENCY_AMOUNTS_CENTS[base.id][currency];
}

function money(cents: number, currency: SupportedCurrency): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// "$0", "€0", "R0" -- the bare due-today amount shown to a visitor before checkout, in whatever
// currency the rest of the page is showing. Its own helper because it drops the decimal places
// money() otherwise always renders, matching the original hardcoded "$0" exactly for USD.
export function zeroDue(currency: SupportedCurrency): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(0);
}

function listAmountCentsFor(base: PlanBase, currency: SupportedCurrency): number | null {
  if (base.listAmountCentsUsd === null) return null;
  if (currency === "USD") return base.listAmountCentsUsd;
  return CURRENCY_LIST_AMOUNTS_CENTS[base.id]?.[currency] ?? null;
}

export function litosPlusPlansForCurrency(currency: SupportedCurrency = DEFAULT_CURRENCY): LitosPlusPlan[] {
  return PLAN_BASE.map((base) => {
    const amountCents = amountCentsFor(base, currency);
    // Every USD daily rate above is the honest rounding of its own amount over its own days,
    // so USD takes the same division every other currency takes rather than a curated figure.
    // (It did carry one before 2026-09-08: the old quarter read "$0.99/day" where the division
    // gave "$1.00/day".) If a curated figure is ever wanted again, it belongs here explicitly.
    const dailyCents = currency === "USD" ? base.dailyEquivalentCentsUsd : Math.round(amountCents / base.days);
    const total = money(amountCents, currency);
    const listAmountCents = listAmountCentsFor(base, currency);
    return {
      id: base.id,
      term: base.term,
      label: base.label,
      shortLabel: base.shortLabel,
      amountCents,
      total,
      daily: `${money(dailyCents, currency)}/day`,
      renewal: base.renewal,
      disclosure: `${total} today. Renews ${base.renewal} until canceled.`,
      audience: base.audience,
      closer: base.closer,
      /* The badge and the struck-through price move together: a discount claim with no "was"
         price beside it is the shape a reader cannot check, so neither renders without the
         other -- which is also what happens if a currency is ever added to the amount table
         without being added to the list table. */
      listTotal: listAmountCents === null ? null : money(listAmountCents, currency),
      discountLabel: listAmountCents === null || base.discountPercent === null ? null : `${base.discountPercent}% off`,
      mostPopular: base.mostPopular,
      generationLimit: base.generationLimit,
      applicationsLine: base.applicationsLine,
    };
  });
}

export const LITOS_PLUS_PLANS: readonly LitosPlusPlan[] = litosPlusPlansForCurrency("USD");


/* FREE_FEATURES was here and is deliberately gone (2026-09-08). Both of its render sites, the
   plan-card column and the upgrade modal's comparison, were removed on Mehek's call that Free is
   not offered alongside a price, which left it an exported list with no caller: exactly the thing
   somebody re-renders because it is sitting there. FREE_LIMITS in lib/pricing.ts still describes
   what a free account may actually DO, which is enforcement, not an offer, and stays.

   FEATURE_COMPARISON below has had no render site since before this change and is read only by
   its own test. Left alone here rather than swept up with it. */
export const PLUS_FEATURES = [
  "Everything in Free",
  "Full applications built and filled for you: resume, cover letter, and answers, counted per job (50 a week, 200 a month, or 600 every 3 months)",
  "Resume feedback and saved versions",
  "Hover-started tailoring on job cards",
  "Networking and referral paths",
  "Recruiter outreach and follow-ups",
  "Advanced job insights and connected companies",
  "Opt-in sending without being asked each time",
] as const;

export type FeatureComparison = {
  feature: string;
  free: string;
  trial: string;
  plus: string;
  tone?: "fill" | "documents" | "outreach";
};

export const FEATURE_COMPARISON: readonly FeatureComparison[] = [
  { feature: "Fill applications on supported sites", free: "Unlimited", trial: "Unlimited", plus: "Unlimited", tone: "fill" },
  { feature: "Fill applications from the dashboard", free: "Unlimited", trial: "Unlimited", plus: "Unlimited", tone: "fill" },
  { feature: "Review and manually submit filled forms", free: "Included", trial: "Included", plus: "Included", tone: "fill" },
  { feature: "Job search, matching, and filters", free: "Included", trial: "Included", plus: "Included" },
  { feature: "Sponsor evidence and job details", free: "Included", trial: "Included", plus: "Included" },
  { feature: "Resume-to-JD match score and requirement view", free: "Included", trial: "Included", plus: "Included", tone: "documents" },
  { feature: "Application tracker, stages, history, and receipts", free: "Included", trial: "Included", plus: "Included" },
  { feature: "Main resume, experience bank, and reusable profile answers", free: "Included", trial: "Included", plus: "Included", tone: "documents" },
  { feature: "View, edit, copy, download, or delete existing generated work", free: "Included", trial: "Included", plus: "Included", tone: "documents" },
  { feature: "Email delivery and reply history", free: "Included", trial: "Included", plus: "Included", tone: "outreach" },
  { feature: "Account export, privacy controls, and deletion", free: "Included", trial: "Included", plus: "Included" },
  { feature: "New tailored resumes", free: "Not included", trial: "Part of the 20-job trial", plus: "Shared pool of jobs: 50/week, 200/month, or 600/quarter", tone: "documents" },
  { feature: "New cover letters", free: "Not included", trial: "Part of the 20-job trial", plus: "Shared pool of jobs: 50/week, 200/month, or 600/quarter", tone: "documents" },
  { feature: "New generated application answers", free: "Not included", trial: "Part of the 20-job trial", plus: "Shared pool of jobs: 50/week, 200/month, or 600/quarter", tone: "documents" },
  { feature: "Contact discovery", free: "Not included", trial: "Up to 2 per represented company, up to 5 companies", plus: "Included, no user-facing quota", tone: "outreach" },
  { feature: "Outreach draft generation", free: "Not included", trial: "Up to 2 per represented company, up to 5 companies", plus: "Included, no user-facing quota", tone: "outreach" },
  { feature: "Hover-started tailoring", free: "Not included", trial: "Not included, choose Tailor resume", plus: "Included on active paid plans", tone: "documents" },
  { feature: "Send an application without asking each time", free: "Not included", trial: "Included while trial is active", plus: "Included" },
  { feature: "Network-overlap and job-competition insights", free: "Not included", trial: "Included while trial is active", plus: "Included", tone: "outreach" },
  { feature: "Human-review stops for sensitive or unknown answers", free: "Always enforced", trial: "Always enforced", plus: "Always enforced", tone: "fill" },
] as const;

export function litosPlusPlan(planId: string | null | undefined): LitosPlusPlan {
  return LITOS_PLUS_PLANS.find((plan) => plan.id === planId)
    ?? LITOS_PLUS_PLANS.find((plan) => plan.id === DEFAULT_LITOS_PLUS_PLAN_ID)!;
}

export function isLitosPlusPlanId(value: unknown): value is LitosPlusPlanId {
  return typeof value === "string" && LITOS_PLUS_PLANS.some((plan) => plan.id === value);
}
