export type LitosPlusPlanId =
  | "litos_plus_week"
  | "litos_plus_month"
  | "litos_plus_quarter";

export type LitosPlusTerm = "week" | "month" | "quarter";

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

export const LITOS_PLUS_PLANS: readonly LitosPlusPlan[] = [
  {
    id: "litos_plus_week",
    term: "week",
    label: "1 Week",
    shortLabel: "1 week",
    amountCents: 1_999,
    total: "$19.99",
    daily: "$2.85/day",
    renewal: "every week",
    disclosure: "$19.99 today. Renews every week until canceled.",
    savings: null,
    mostPopular: false,
  },
  {
    id: "litos_plus_month",
    term: "month",
    label: "1 Month",
    shortLabel: "1 month",
    amountCents: 3_999,
    total: "$39.99",
    daily: "$1.33/day",
    renewal: "every month",
    disclosure: "$39.99 today. Renews every month until canceled.",
    savings: 53,
    mostPopular: false,
  },
  {
    id: "litos_plus_quarter",
    term: "quarter",
    label: "3 Months",
    shortLabel: "3 months",
    amountCents: 8_999,
    total: "$89.99",
    daily: "$0.99/day",
    renewal: "every 3 months",
    disclosure: "$89.99 today. Renews every 3 months until canceled.",
    savings: 65,
    mostPopular: true,
  },
] as const;

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
  "Unlimited tailored one-page resumes",
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
