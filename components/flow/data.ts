/**
 * The content the flow demo plays back.
 *
 * Everything here is fixture data for a miniature picture of the product, not
 * a claim the site is making: the counts are one imagined pipeline, and the
 * employer names are the kind of posting Litos surfaces rather than partners.
 *
 * The posting and the resume lines are paired deliberately. Each highlighted
 * phrase in the posting is the phrase the matching bullet is rewritten around,
 * so the cause and its effect are legible at a glance. The before-states stay
 * ordinary club work: tailoring reframes real experience in the posting's
 * language, it never invents any.
 */

export type Job = {
  key: string;
  company: string;
  title: string;
  location: string;
  match?: number;
  logo?: string;
  mark?: string;
  markDark?: boolean;
  wordmark?: boolean;
  ago: string;
};

const L = (n: string) => `/flow-logos/${n}.svg`;

export const FEATURED: Job = {
  key: "job-microsoft", company: "Microsoft", title: "Product Manager",
  location: "Redmond", match: 94, logo: L("microsoft"), ago: "Just now",
};

/** Bloomberg's identity is a wordmark in a proprietary face, so no open icon
 *  set carries a symbol for it. This is the black tile and B it uses for its
 *  own app icon, drawn in the DOM so it picks up Hanken Grotesk. */
export const BLOOMBERG: Job = {
  key: "job-bloomberg", company: "Bloomberg", title: "Data Analyst",
  location: "New York", match: 85, mark: "B", markDark: true, ago: "Just now",
};

export const QUEUE: Job[] = [
  { key: "job-google", company: "Google", title: "Software Engineer",
    location: "Mountain View", match: 91, logo: L("google"), ago: "Just now" },
  /** Coinbase's mark is a logotype rather than a glyph, so it needs the tile's
   *  full width instead of the padding a square symbol wants. */
  { key: "job-coinbase", company: "Coinbase", title: "Product Engineer",
    location: "Remote", match: 89, logo: L("coinbase"), wordmark: true, ago: "Just now" },
  { key: "job-tesla", company: "Tesla", title: "Program Manager",
    location: "Palo Alto", match: 87, logo: L("tesla"), ago: "Just now" },
  BLOOMBERG,
];

export const JOBS: Job[] = [FEATURED, ...QUEUE];

export const GITHUB: Job = {
  key: "seed-github", company: "GitHub", title: "Product Manager",
  location: "Remote", logo: L("github"), ago: "3h ago",
};
export const REDDIT: Job = {
  key: "seed-reddit", company: "Reddit", title: "Product Designer",
  location: "Remote", logo: L("reddit"), ago: "2d ago",
};

export type Board = { applied: Job[]; interview: Job[]; offer: Job[] };
export const SEED_BOARD: Board = {
  applied: [
    { key: "seed-asana", company: "Asana", title: "Project Manager",
      location: "Remote", logo: L("asana"), ago: "1h ago" },
    GITHUB,
  ],
  interview: [REDDIT],
  offer: [
    { key: "seed-datadog", company: "Datadog", title: "Full Stack Engineer",
      location: "Remote", logo: L("datadog"), ago: "5d ago" },
  ],
};

/** The column figures are pipeline totals, not the size of the visible
 *  preview, so each carries a base. Without it a board showing four cards sat
 *  next to a header claiming 129 applications sent today. */
export const COLUMNS = [
  { key: "applied" as const, label: "Applied", base: 2 },
  { key: "interview" as const, label: "Interview", base: 0 },
  { key: "offer" as const, label: "Offer", base: 0 },
];

/** One noun per destination, matching the shipped dashboard nav. */
export const NAV = [
  { name: "Home", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { name: "Jobs", d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
  { name: "Applications", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { name: "Emails", d: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
  { name: "Job search", d: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
];

export const STEPS = [
  { name: "idle", ms: 900 }, { name: "move", ms: 800 }, { name: "click", ms: 380 },
  // 1. the resume, rewritten against the posting, then approved
  { name: "jdScan", ms: 900 }, { name: "tailor1", ms: 1150 }, { name: "tailor2", ms: 1150 },
  { name: "approveMove", ms: 560 }, { name: "approveClick", ms: 340 },
  // 2. the employer's form, filled, then submitted
  { name: "formOpen", ms: 600 }, { name: "fill1", ms: 700 }, { name: "fill2", ms: 650 },
  { name: "fill3", ms: 800 }, { name: "submitMove", ms: 560 }, { name: "submitClick", ms: 340 },
  { name: "sent", ms: 850 },
  { name: "navMove", ms: 800 }, { name: "navClick", ms: 380 },
  { name: "swap", ms: 650 }, { name: "landFlash", ms: 850 },
  // The prompt is up from "swap"; these are the person reading it, weighing
  // both answers, and choosing. Auto-submit is never on until askClick.
  { name: "askYes", ms: 780 }, { name: "askNo", ms: 660 },
  { name: "askBack", ms: 540 }, { name: "askClick", ms: 400 },
  { name: "autoApply1", ms: 1250 }, { name: "autoFly1", ms: 750 },
  // a role turns up on its own, is announced, then lands in Applied
  { name: "detect2", ms: 1400 }, { name: "fly2", ms: 700 },
  { name: "promote1", ms: 1000 }, { name: "promote2", ms: 1050 },
  { name: "hold", ms: 700 }, { name: "fade", ms: 600 },
] as const;

export type StepName = (typeof STEPS)[number]["name"];
export const IDX: Record<string, number> =
  Object.fromEntries(STEPS.map((s, i) => [s.name, i]));
export const LOOP_MS = STEPS.reduce((a, s) => a + s.ms, 0);

/* The beats where the auto-submit question is on screen and being answered. */
export const ASK = ["askYes", "askNo", "askBack", "askClick"];

export const AUTO_APPLY = ["autoApply1"];
export const AUTO_FLY = ["autoFly1", "fly2"];

export const JD_LINES: { t: string; k?: number }[][] = [
  [{ t: "Own the roadmap for a" }],
  [{ t: "cloud platform surface." }],
  [{ t: "Write clear " }, { t: "product specs", k: 0 }, { t: "." }],
  [{ t: "Run " }, { t: "user research", k: 1 }, { t: " to find" }],
  [{ t: "what to build next." }],
];

export const BULLETS: { before: string; after: { t: string; hi?: boolean }[] | null }[] = [
  { before: "Wrote up feature ideas for the club app",
    after: [{ t: "Wrote " }, { t: "product specs", hi: true }, { t: " for 4 releases" }] },
  { before: "Asked members what they wanted changed",
    after: [{ t: "Ran " }, { t: "user research", hi: true }, { t: " with 60 members" }] },
  { before: "Kept the release checklist up to date", after: null },
];

export const FIELDS = [
  { label: "Full name", value: "John Doe" },
  { label: "Email", value: "john.doe@gmail.com" },
  { label: "Work authorization", value: "Authorized to work in the US", select: true },
  { label: "Require sponsorship?", value: "No", select: true },
  { label: "Earliest start date", value: "June 2026" },
  { label: "How did you hear about us?", value: "LinkedIn", select: true },
];

export const EMAIL = {
  to: "Priya Nair",
  meta: "USC alum · Microsoft",
  subject: "Question about the Product Manager role",
  body: [
    "Hi Priya, I saw you moved from USC into product and just applied",
    "to the Product Manager role. Would you have ten minutes to tell me",
    "what the first year actually looks like?",
  ],
};

/** Which screen each beat belongs to, and which orb spins while it works.
 *  PacketDemo pairs the same verbs with the same artifacts. */
export const STAGE: Record<string, "resume" | "form" | "email"> = {
  jdScan: "resume", tailor1: "resume", tailor2: "resume",
  approveMove: "resume", approveClick: "resume",
  formOpen: "form", fill1: "form", fill2: "form", fill3: "form",
  submitMove: "form", submitClick: "form",
  emailOpen: "email", emailWrite: "email",
  sendMove: "email", sendClick: "email", sent: "form",
  navMove: "form", navClick: "form",
};

export const ORB_STATE: Record<string, "searching" | "composing" | "solving" | "shaping"> = {
  jdScan: "searching", tailor1: "composing", tailor2: "composing",
  formOpen: "solving", fill1: "solving", fill2: "solving", fill3: "solving",
  emailOpen: "shaping", emailWrite: "shaping",
};

/* The label the stage's action carries, for the whole stage rather than only
   its two action beats: the button is present from the moment the stage opens
   so the person can see what it is building towards, greyed until it is real. */
export const STAGE_ACTION: Record<"resume" | "form" | "email", string> = {
  resume: "Fill the form", form: "Send it", email: "Save email",
};

/* The three beats where the cursor travels to that button. Named explicitly:
   testing st.endsWith("Move") also matched navMove, and only the accident of
   the button being unmounted by then kept the cursor off it. */
export const ACTION_MOVES = ["approveMove", "submitMove"];

export const ACTIONS = [
  { steps: ["approveMove", "approveClick"], label: "Fill the form" },
  { steps: ["submitMove", "submitClick"], label: "Send it" },
];
