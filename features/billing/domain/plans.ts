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
  savings: number | null;
  mostPopular: boolean;
};

export const DEFAULT_LITOS_PLUS_PLAN_ID: LitosPlusPlanId = "litos_plus_quarter";

type PlanBase = {
  id: LitosPlusPlanId;
  term: LitosPlusTerm;
  label: string;
  shortLabel: string;
  amountCentsUsd: number;
  dailyEquivalentCentsUsd: number;
  days: number;
  renewal: string;
  savings: number | null;
  mostPopular: boolean;
};

// FX snapshot 2026-09-07, mirroring student-outreach-backend/src/lib/billingCatalog.ts exactly
// -- keep both tables in sync when rates are refreshed, since a mismatch would fail the server
// verification in catalog.ts (a mismatch there falls the whole page back to this USD table).
const CURRENCY_AMOUNTS_CENTS: Record<LitosPlusPlanId, Record<Exclude<SupportedCurrency, "USD">, number>> = {
  litos_plus_week: { EUR: 1_799, GBP: 1_499, CAD: 2_799, ZAR: 31_900, INR: 188_900 },
  litos_plus_month: { EUR: 3_499, GBP: 2_999, CAD: 5_599, ZAR: 63_900, INR: 377_900 },
  litos_plus_quarter: { EUR: 7_799, GBP: 6_699, CAD: 12_499, ZAR: 143_900, INR: 850_900 },
};

const PLAN_BASE: readonly PlanBase[] = [
  {
    id: "litos_plus_week",
    term: "week",
    label: "1 Week",
    shortLabel: "1 week",
    amountCentsUsd: 1_999,
    dailyEquivalentCentsUsd: 285,
    days: 7,
    renewal: "every week",
    savings: null,
    mostPopular: false,
  },
  {
    id: "litos_plus_month",
    term: "month",
    label: "1 Month",
    shortLabel: "1 month",
    amountCentsUsd: 3_999,
    dailyEquivalentCentsUsd: 133,
    days: 30,
    renewal: "every month",
    savings: 53,
    mostPopular: false,
  },
  {
    id: "litos_plus_quarter",
    term: "quarter",
    label: "3 Months",
    shortLabel: "3 months",
    amountCentsUsd: 8_999,
    dailyEquivalentCentsUsd: 99,
    days: 90,
    renewal: "every 3 months",
    savings: 65,
    mostPopular: true,
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

export function litosPlusPlansForCurrency(currency: SupportedCurrency = DEFAULT_CURRENCY): LitosPlusPlan[] {
  return PLAN_BASE.map((base) => {
    const amountCents = amountCentsFor(base, currency);
    // The USD daily rate is a curated marketing figure (quarter reads "$0.99/day", not the
    // "$1.00/day" true division rounds to) -- preserve it exactly rather than recompute it.
    // Every other currency has no such curated figure, so it is computed fresh.
    const dailyCents = currency === "USD" ? base.dailyEquivalentCentsUsd : Math.round(amountCents / base.days);
    const total = money(amountCents, currency);
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
      savings: base.savings,
      mostPopular: base.mostPopular,
    };
  });
}

export const LITOS_PLUS_PLANS: readonly LitosPlusPlan[] = litosPlusPlansForCurrency("USD");

export const FREE_FEATURES = [
  "Unlimited application filling on supported sites",
  "Unlimited dashboard application filling",
  "Personalized jobs and one match score",
  "One main resume and manual uploads",
  "Application tracking, review, and receipts",
  "Manual answers and final submission controls",
] as const;

export const PLUS_FEATURES = [
  "Everything in Free",
  "Unlimited tailored resumes",
  "Cover letters and application answers",
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
  { feature: "New tailored resumes", free: "Not included", trial: "5 successful generations", plus: "Included, no user-facing quota", tone: "documents" },
  { feature: "New cover letters", free: "Not included", trial: "5 successful generations", plus: "Included, no user-facing quota", tone: "documents" },
  { feature: "New generated application answers", free: "Not included", trial: "For 5 distinct applications", plus: "Included, no user-facing quota", tone: "documents" },
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
