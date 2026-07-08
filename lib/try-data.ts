/* Canned demo universe for /try (design doc 2026-07-08, premise 4: reuse the
   Alex Rivera canon, never invent a second demo world). All canned content is
   honest fiction per DESIGN.md; the canned posting is the canon Notion listing
   the receipt already uses.

   REAL-PATH POSTINGS: the design decided these should be 3 cached REAL,
   publicly posted listings (audit #27). The entries below are PLACEHOLDERS
   pending Mehek picking the live listings - swap `jd` text and labels before
   any deploy. They are structured so the swap is data-only. */

export const CANNED_POSTING = {
  url: "jobs.lever.co/notion/software-engineer-intern",
  company: "Notion",
  location: "San Francisco",
  title: "Software Engineer Intern",
};

/* The canon artifacts, matching the film props and PacketDemo rows. */
export const CANNED_RESUME = {
  filename: "Alex_Rivera_Notion_Resume.pdf",
  name: "Alex Rivera",
  line: "CS @ USC · Los Angeles, CA",
  atsCoverage: 92,
  skills: ["TypeScript", "React", "Postgres", "Real-time sync"],
  bullets: [
    "Rebuilt the club-portal editor on CRDTs; sync conflicts fell to zero across 1,200 users.",
    "Shipped a block-based notes feature in React + TypeScript, mirroring Notion's data model.",
    "Cut page-load p95 from 2.1s to 640ms by moving reads onto a Postgres materialized view.",
  ],
};

export const CANNED_FIELDS = [
  { label: "First name", value: "Alex" },
  { label: "Last name", value: "Rivera" },
  { label: "Email", value: "alex.rivera@usc.edu" },
  { label: "Phone", value: "(213) 555-0148" },
  { label: "Location", value: "Los Angeles, CA" },
  { label: "University", value: "University of Southern California" },
  { label: "Work authorization", value: "Yes" },
  { label: "LinkedIn", value: "linkedin.com/in/alexrivera" },
  { label: "How did you hear about us?", value: "Company careers page" },
  { label: "Voluntary self-identification", value: "Decline to self-identify" },
];

export const CANNED_FIELDS_TOTAL = 27;

export const CANNED_OUTREACH = {
  to: "Priya Nair · USC alum · Engineering",
  subject: "USC junior applying to the SWE intern role",
  body: "Hi Priya, I just applied to the software engineer intern role and saw you made the same USC-to-Notion jump. I've spent the last year building a CRDT-backed editor for our club portal, so Notion's sync problems are the ones I already think about for fun. Would you be open to a 15-minute chat about your first year on the team?",
  words: 120,
};

/* Real-path job postings moved to the daily feed: public/try-jobs.json,
   loaded via lib/try-jobs.ts (Mehek, 2026-07-08: cycle through ~10 recent
   big-tech intern roles that refresh daily). */

export type RealPacket = {
  tailored_bullets: string[];
  ats_coverage: number;
  filled_fields: { university: string; work_authorization: string; short_answer: string };
  outreach_opening: string;
};
