/* Curated early-talent role feed for the calibration card.

   Honesty rules (Guardrails): every entry is a real program linked at its
   stable careers hub, never a fragile req ID. Hard deadlines appear only
   where verified (Litos tracker, Jul 2026); seasonal programs are labeled
   as cycles, not faked as "posted today". Statuses are mono machine voice. */

export type Hunt = "intern" | "newgrad" | "fulltime" | "asap";
export type Field =
  | "swe"
  | "data"
  | "product"
  | "design"
  | "marketing"
  | "finance";
export type Region = "us" | "uk" | "mena" | "anywhere";

export const HUNTS: { id: Hunt; label: string; short: string }[] = [
  { id: "intern", label: "Internship · Summer 2027", short: "Summer 2027 internships" },
  { id: "newgrad", label: "New grad · Class of 2027", short: "New-grad roles" },
  { id: "fulltime", label: "Full-time · experienced", short: "Full-time roles" },
  { id: "asap", label: "Anything open now", short: "Roles open right now" },
];

export const FIELDS: { id: Field; label: string }[] = [
  { id: "swe", label: "Software" },
  { id: "data", label: "Data & analytics" },
  { id: "product", label: "Product" },
  { id: "design", label: "Design" },
  { id: "marketing", label: "Marketing" },
  { id: "finance", label: "Finance & consulting" },
];

export const REGIONS: { id: Region; label: string; short: string }[] = [
  { id: "us", label: "United States", short: "US" },
  { id: "uk", label: "United Kingdom", short: "UK" },
  { id: "mena", label: "Middle East", short: "Middle East" },
  { id: "anywhere", label: "Anywhere / remote", short: "anywhere" },
];

export type Role = {
  company: string;
  role: string;
  hunts: Hunt[];
  fields: Field[];
  regions: Exclude<Region, "anywhere">[] | "global";
  /* mono status, uppercase, honest */
  status: string;
  /* verified hard deadline (sorts first) */
  deadline?: boolean;
  verified?: string;
  href: string;
};

export const ROLES: Role[] = [
  {
    company: "J.P. Morgan",
    role: "Software Engineer Program, Dubai",
    hunts: ["newgrad", "asap"],
    fields: ["swe"],
    regions: ["mena"],
    status: "CLOSES JUL 31",
    deadline: true,
    verified: "JUL 2026",
    href: "https://careers.jpmorgan.com/global/en/students",
  },
  {
    company: "Bain & Company",
    role: "Associate Consultant Intern",
    hunts: ["intern"],
    fields: ["finance"],
    regions: ["us", "mena"],
    status: "CLOSES AUG 31",
    deadline: true,
    verified: "JUL 2026",
    href: "https://www.bain.com/careers/",
  },
  {
    company: "TikTok",
    role: "Software Engineer Intern, Summer 2027",
    hunts: ["intern"],
    fields: ["swe"],
    regions: ["us"],
    status: "2027 CYCLE OPENS AUG-SEP",
    href: "https://careers.tiktok.com/campus",
  },
  {
    company: "Google",
    role: "SWE Intern & STEP, 2027",
    hunts: ["intern"],
    fields: ["swe"],
    regions: ["us", "uk"],
    status: "2027 CYCLE OPENS AUG-SEP",
    href: "https://buildyourfuture.withgoogle.com/internships",
  },
  {
    company: "Google",
    role: "Associate Product Manager, 2027",
    hunts: ["intern", "newgrad"],
    fields: ["product"],
    regions: ["us"],
    status: "2027 CYCLE OPENS AUG-SEP",
    href: "https://buildyourfuture.withgoogle.com/",
  },
  {
    company: "Google",
    role: "SWE New Grad, 2027 start",
    hunts: ["newgrad"],
    fields: ["swe"],
    regions: ["us", "uk"],
    status: "2027 CYCLE OPENS AUG-SEP",
    href: "https://buildyourfuture.withgoogle.com/",
  },
  {
    company: "Meta",
    role: "Software Engineer Intern, 2027",
    hunts: ["intern"],
    fields: ["swe"],
    regions: ["us"],
    status: "2027 CYCLE OPENS AUG-SEP",
    href: "https://www.metacareers.com/students",
  },
  {
    company: "Microsoft",
    role: "Explore & SWE Intern, 2027",
    hunts: ["intern"],
    fields: ["swe", "product"],
    regions: ["us", "uk"],
    status: "2027 CYCLE OPENS AUG-SEP",
    href: "https://careers.microsoft.com/v2/global/en/students",
  },
  {
    company: "Goldman Sachs",
    role: "Summer Analyst, 2027",
    hunts: ["intern"],
    fields: ["finance"],
    regions: ["us", "uk"],
    status: "2027 CYCLE OPENS AUG",
    href: "https://www.goldmansachs.com/careers/students",
  },
  {
    company: "Goldman Sachs",
    role: "New Analyst",
    hunts: ["newgrad"],
    fields: ["finance"],
    regions: ["us", "uk"],
    status: "2027 CYCLE OPENS AUG",
    href: "https://www.goldmansachs.com/careers/students",
  },
  {
    company: "McKinsey",
    role: "Summer Business Analyst, 2027",
    hunts: ["intern"],
    fields: ["finance"],
    regions: ["us", "uk"],
    status: "2027 CYCLE OPENS AUG-SEP",
    href: "https://www.mckinsey.com/careers/students",
  },
  {
    company: "Netflix",
    role: "Data Science Intern, 2027",
    hunts: ["intern"],
    fields: ["data"],
    regions: ["us"],
    status: "2027 CYCLE OPENS FALL",
    href: "https://jobs.netflix.com/teams/internships",
  },
  {
    company: "Revolut",
    role: "Data Analyst",
    hunts: ["newgrad", "asap", "fulltime"],
    fields: ["data", "finance"],
    regions: ["uk"],
    status: "ROLLING",
    href: "https://www.revolut.com/careers/",
  },
  {
    company: "Careem",
    role: "Data & Engineering roles",
    hunts: ["intern", "asap", "fulltime"],
    fields: ["data", "swe"],
    regions: ["mena"],
    status: "ROLLING",
    href: "https://careers.careem.com/",
  },
  {
    company: "Emirates NBD",
    role: "Analytics Graduate Programme",
    hunts: ["newgrad"],
    fields: ["data", "finance"],
    regions: ["mena"],
    status: "CYCLE OPENS FALL",
    href: "https://www.emiratesnbd.com/en/careers",
  },
  {
    company: "Figma",
    role: "Product Design Intern, 2027",
    hunts: ["intern"],
    fields: ["design"],
    regions: ["us"],
    status: "2027 CYCLE OPENS FALL",
    href: "https://www.figma.com/careers/",
  },
  {
    company: "Monzo",
    role: "Product Designer",
    hunts: ["newgrad", "asap", "fulltime"],
    fields: ["design", "product"],
    regions: ["uk"],
    status: "ROLLING",
    href: "https://monzo.com/careers",
  },
  {
    company: "Spotify",
    role: "Design & Marketing Intern, 2027",
    hunts: ["intern"],
    fields: ["design", "marketing"],
    regions: ["us", "uk"],
    status: "2027 CYCLE OPENS FALL",
    href: "https://www.lifeatspotify.com/students",
  },
  {
    company: "Unilever",
    role: "Future Leaders Programme, Marketing",
    hunts: ["newgrad", "intern"],
    fields: ["marketing"],
    regions: ["uk", "mena"],
    status: "CYCLE OPENS SEP",
    href: "https://careers.unilever.com/uflp",
  },
  {
    company: "P&G",
    role: "Brand Management Internship",
    hunts: ["intern", "asap"],
    fields: ["marketing"],
    regions: ["us"],
    status: "ROLLING",
    href: "https://www.pgcareers.com/",
  },
  {
    company: "L'Oréal",
    role: "Marketing, all levels",
    hunts: ["newgrad", "asap", "fulltime"],
    fields: ["marketing"],
    regions: ["us", "uk", "mena"],
    status: "ROLLING",
    href: "https://careers.loreal.com/",
  },
  {
    company: "Deloitte UK",
    role: "Graduate Programme",
    hunts: ["newgrad"],
    fields: ["finance"],
    regions: ["uk"],
    status: "CYCLE OPENS SEP",
    href: "https://ukcareers.deloitte.co.uk/graduates",
  },
  {
    company: "Stripe",
    role: "Software Engineer",
    hunts: ["fulltime", "asap"],
    fields: ["swe", "data"],
    regions: ["us"],
    status: "ROLLING",
    href: "https://stripe.com/jobs",
  },
  {
    company: "Notion",
    role: "Product & Engineering roles",
    hunts: ["fulltime", "asap"],
    fields: ["product", "swe"],
    regions: ["us"],
    status: "ROLLING",
    href: "https://www.notion.com/careers",
  },
  {
    company: "Figma",
    role: "Product Designer",
    hunts: ["fulltime", "asap"],
    fields: ["design"],
    regions: ["us"],
    status: "ROLLING",
    href: "https://www.figma.com/careers/",
  },
  {
    company: "Goldman Sachs",
    role: "Experienced professionals",
    hunts: ["fulltime"],
    fields: ["finance"],
    regions: ["us", "uk"],
    status: "ROLLING",
    href: "https://www.goldmansachs.com/careers",
  },
  {
    company: "Y Combinator startups",
    role: "Founding engineer & early roles",
    hunts: ["asap", "newgrad", "fulltime"],
    fields: ["swe", "product", "data"],
    regions: "global",
    status: "ROLLING",
    href: "https://www.workatastartup.com/",
  },

  /* BEGIN TRACKER SYNC - generated by scripts/sync-roles-feed.mjs; run it
     whenever the internship tracker updates. Do not edit by hand. */
  {
    company: "D.E. Shaw Group",
    role: "Investor Relations Intern (London) - Summer 2027",
    hunts: ["intern", "asap"],
    fields: ["finance"],
    regions: ["uk"],
    status: "CLOSES DEC 31",
    deadline: true,
    verified: "JUN 2026",
    href: "https://www.deshaw.com/careers/investor-relations-intern-london-summer-2027-5917",
  },
  {
    company: "Perella Weinberg Partners",
    role: "2027 Advisory Summer Analyst Programme - London/Munich (opens Sep-Oct 2026)",
    hunts: ["fulltime", "asap"],
    fields: ["data"],
    regions: ["uk"],
    status: "CLOSES OCT 1",
    deadline: true,
    href: "https://pwpartners.com/careers/intern-graduate-recruitment/",
  },
  {
    company: "Ares Management",
    role: "UK Summer Intern Programme 2027 (applying now for Summer 2027)",
    hunts: ["intern", "asap"],
    fields: ["finance"],
    regions: ["uk"],
    status: "CLOSES AUG 31",
    deadline: true,
    verified: "JUN 2026",
    href: "https://www.ares.com/us/careers/early-careers",
  },
  {
    company: "Equinor",
    role: "Graduate Programme 2027 - Finance and Trading",
    hunts: ["fulltime", "asap"],
    fields: ["finance"],
    regions: ["uk"],
    status: "CLOSES AUG 27",
    deadline: true,
    verified: "JUN 2026",
    href: "https://www.equinor.com/careers/graduates",
  },
  {
    company: "McKinsey & Company",
    role: "Business Analyst Intern - London",
    hunts: ["intern", "asap"],
    fields: ["data"],
    regions: ["uk"],
    status: "CLOSES AUG 11",
    deadline: true,
    verified: "JUN 2026",
    href: "https://www.mckinsey.com/careers/search-jobs?query=business+analyst+intern&interestCategory=Serve+Clients&cities=London",
  },
  {
    company: "iHerb",
    role: "Software Development Intern",
    hunts: ["intern", "asap"],
    fields: ["swe"],
    regions: ["us"],
    status: "ROLLING",
    verified: "JUN 2026",
    href: "https://job-boards.greenhouse.io/iherb/jobs/7776154003",
  },
  {
    company: "Qube Research & Technologies (QRT)",
    role: "2026 Internship - Quantitative Research/Trading (Dubai office option)",
    hunts: ["intern", "asap"],
    fields: ["finance"],
    regions: ["mena"],
    status: "ROLLING",
    verified: "JUN 2026",
    href: "https://job-boards.greenhouse.io/quberesearchandtechnologies/jobs/8052341002",
  },
  {
    company: "Citi",
    role: "Investment Banking Full-Time Analyst (First Year), Dubai 2026",
    hunts: ["fulltime", "asap"],
    fields: ["data"],
    regions: ["mena"],
    status: "ROLLING",
    verified: "JUN 2026",
    href: "https://citi.wd5.myworkdayjobs.com/2/job/Dubai-United-Arab-Emirates/Banking--Investment-Banking--Full-Time-Analyst--Dubai--UAE-2026_25906148-2",
  },
  {
    company: "Cobblestone Energy",
    role: "Graduate Software Engineer",
    hunts: ["fulltime", "asap"],
    fields: ["swe"],
    regions: ["mena"],
    status: "ROLLING",
    verified: "JUN 2026",
    href: "https://cobblestoneenergy.com/careers/job/?gh_jid=7582808003",
  },
  {
    company: "Cobblestone Energy",
    role: "Junior Market Analyst",
    hunts: ["fulltime", "asap"],
    fields: ["data"],
    regions: ["mena"],
    status: "ROLLING",
    verified: "JUN 2026",
    href: "https://cobblestoneenergy.com/careers/job/?gh_jid=7545994003",
  },
  /* END TRACKER SYNC */
];

export function regionsLabel(r: Role): string {
  if (r.regions === "global") return "REMOTE OK";
  return r.regions.map((x) => (x === "us" ? "US" : x === "uk" ? "UK" : "MENA")).join(" + ");
}

/* Top matches for a profile. Craft first: a same-field role outranks a
   same-level-and-region role from another field. Then hunt, then region;
   verified deadlines float; always returns at least one role. */
export function matchRoles(hunt: Hunt, field: Field, region: Region): Role[] {
  const scored = ROLES.map((r) => {
    let s = 0;
    if (r.fields.includes(field)) s += 7;
    if (r.hunts.includes(hunt)) s += 3;
    const regionOk =
      region === "anywhere" || r.regions === "global" || r.regions.includes(region);
    s += regionOk ? 2 : -3;
    if (r.deadline) s += 1;
    return { r, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, 3).map((x) => x.r);
}

/* Map a calibration profile onto the /start Focus step's targeting vocab
   (lib/periods.ts slugs). Nearest-chip mapping, always user-editable;
   returns null for unknown values (stale storage). */
export function focusSeed(
  hunt: string,
  field: string,
): { categories: string[]; roleTypes: string[] } | null {
  const cats: Record<Field, string> = {
    swe: "software-engineering",
    data: "data-ml",
    product: "product",
    design: "design",
    marketing: "other",
    finance: "quant-trading",
  };
  const types: Record<Hunt, string[]> = {
    intern: ["internship"],
    newgrad: ["new-grad"],
    fulltime: ["full-time"],
    asap: ["internship", "full-time"],
  };
  if (!(field in cats) || !(hunt in types)) return null;
  return {
    categories: [cats[field as Field]],
    roleTypes: types[hunt as Hunt],
  };
}
