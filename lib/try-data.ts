/* Canned demo universe for /try (design doc 2026-07-08, premise 4: reuse the
   John Doe canon, never invent a second demo world). All canned content is
   honest fiction per DESIGN.md; the canned posting is the canon Notion listing
   the receipt already uses.

   REAL-PATH POSTINGS: the design decided these should be 3 cached REAL,
   publicly posted listings (audit #27). The entries below are PLACEHOLDERS
   pending Mehek picking the live listings - swap `jd` text and labels before
   any deploy. They are structured so the swap is data-only. */

export const CANNED_POSTING = {
  url: "jobs.lever.co/notion/software-engineer",
  company: "Notion",
  location: "San Francisco",
  title: "Software Engineer",
};

/* The canon artifacts, matching the film props and PacketDemo rows. */
export const CANNED_RESUME = {
  filename: "John_Doe_Notion_Resume.pdf",
  name: "John Doe",
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
  { label: "First name", value: "John", filled: true },
  { label: "Last name", value: "Doe", filled: true },
  { label: "Email", value: "john.doe@usc.edu", filled: true },
  { label: "Phone", value: "(213) 555-0148", filled: true },
  { label: "Location", value: "Los Angeles, CA", filled: true },
  { label: "University", value: "University of Southern California", filled: true },
  { label: "LinkedIn", value: "linkedin.com/in/johndoe", filled: true },
  { label: "How did you hear about us?", value: "Company careers page", filled: true },
  { label: "Work authorization", value: "You answer this for each application", filled: false },
  { label: "Voluntary self-identification", value: "You choose whether to answer", filled: false },
];

export const CANNED_FIELDS_TOTAL = 27;
export const CANNED_FIELDS_FILLED_TOTAL = 25;

export const CANNED_OUTREACH = {
  to: "Priya Nair · USC alum · Engineering",
  subject: "Fellow Trojan applying to the SWE role",
  body: "Hi Priya, I just applied to the software engineer role and saw you made the same USC-to-Notion jump. I've spent the last year building a CRDT-backed editor, so Notion's sync problems are the ones I already think about for fun. Would you be open to a 15-minute chat about your first year on the team?",
  /* TrySimulator prints this as "~N words" on the draft the visitor is looking
     at, so it has to be the count of the body above, not a typical-output
     figure. It said 120 against a 60-word body before this, and a visitor who
     counts is the person we are trying to earn trust from. */
  words: 55,
};

/* Real-path job postings moved to the daily feed: public/try-jobs.json,
   loaded via lib/try-jobs.ts (Mehek, 2026-07-08: cycle through ~10 recent
   recognizable roles that refresh daily). The feed used to be intern-only,
   which made the one demo a visitor can actually run read as a product for
   students; see the brief in try-jobs.json. */

export type RealPacket = {
  tailored_bullets: string[];
  ats_coverage: number;
  filled_fields: { university: string; work_authorization: string; short_answer: string };
  outreach_opening: string;
};
