"use client";

import { useState } from "react";
import { ApplicationPacket } from "@/components/app/ApplicationPacket";
import type { ApplicationReview, GeneratedResume } from "@/lib/api";

/* Two fixtures, chosen for the states that are easy to get wrong rather than
   for the state that looks best in a screenshot:
     SENT      a completed submission, with filled_fields and a receipt
     UNSENT    needs_attention, with a REQUIRED question left blank */

const SPEC: GeneratedResume["spec"] = {
  target_role: "Software Engineer, Web",
  school: "University of Southern California",
  degree: "B.S. Computer Science",
  grad_date: "May 2027",
  coursework: "Distributed Systems, Databases, Compilers",
  skills: ["TypeScript", "React", "Node", "Postgres", "CRDTs"],
  experience: [
    {
      type: "job",
      org: "Clubfolio",
      title: "Founding Engineer",
      date_range: "2025 to now",
      bullets: [
        "Rebuilt the club-portal editor on CRDTs; sync conflicts fell to zero across 1,200 users.",
        "Cut page-load p95 from 2.1s to 640ms by moving reads onto a Postgres materialized view.",
      ],
    },
    {
      type: "project",
      org: "Open source",
      title: "yjs-postgres",
      date_range: "2026",
      bullets: ["A Postgres persistence adapter for Yjs documents, used by 40 repositories."],
    },
  ],
  /* THE BACKEND'S KEY NAMES, EXACTLY. This fixture previously carried `location` and `linkedin`
     and no name at all, which are not fields the backend ever writes: `_contact` is stored
     verbatim from the resume request body, whose schema is full_name, email, phone, linkedin_url,
     github_url, portfolio_url. Because the fixture was written to match the reader rather than the
     producer, the harness rendered a header that looked plausible while the real pane silently
     dropped the applicant's name and every URL. A sandbox whose data has a different shape from
     production cannot catch a shape bug, which is the one thing it exists to catch. */
  _contact: {
    full_name: "John Doe",
    email: "john.doe@usc.edu",
    phone: "(213) 555-0148",
    linkedin_url: "linkedin.com/in/johndoe",
    github_url: "github.com/johndoe",
  },
};

const JD_TEXT = `About the role

You will work on Notion's web client and the services behind it. Our editor is collaborative by default, which means most problems here end up being sync problems: how state converges, how conflicts resolve, and how fast the document feels while both are happening.

What we are looking for

Strong TypeScript and React. Experience with collaborative or distributed state, such as CRDTs or operational transforms. Comfort in a relational database: query plans, indexes, and when to denormalize.

Logistics

San Francisco, hybrid, three days on site. We sponsor work visas for this role.`;

const SENT_REVIEW: ApplicationReview = {
  jd_text: JD_TEXT,
  portal_url: "https://jobs.lever.co/notion/software-engineer",
  ats_name: "Lever",
  status: "submitted",
  edited_terms: ["CRDTs", "Postgres"],
  updated_at: "2026-07-21T19:43:00.000Z",
  submitted_at: "2026-07-21T19:43:00.000Z",
  questions: [
    {
      id: "q1",
      question: "Why do you want to work at Notion?",
      answer:
        "I spent the last year building a CRDT-backed editor, so the sync problems in this posting are the ones I already think about outside of work.",
      kind: "essay",
      required: true,
    },
    { id: "q2", question: "Are you authorized to work in the US?", answer: "Yes", kind: "required", required: true },
    { id: "q3", question: "How did you hear about us?", answer: "Company careers page", kind: "required", required: false },
  ],
  skipped_reasons: ["Voluntary self-identification: Litos never answers demographic questions for you."],
  filled_fields: ["First name", "Last name", "Email", "Phone", "Resume", "question:Why do you want to work at Notion?"],
  receipt: {
    confirmation_text: "Thanks for applying to Notion. We have received your application.",
    final_url: "https://jobs.lever.co/notion/software-engineer/thanks",
    screenshot_url:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220"><rect width="900" height="220" fill="#faf9f7"/><text x="40" y="110" font-family="system-ui" font-size="22" fill="#6b6a64">Confirmation screenshot (fixture)</text></svg>`,
      ),
    captured_at: "2026-07-21T19:43:12.000Z",
    reference_id: "LEV-88213",
  },
};

const UNSENT_REVIEW: ApplicationReview = {
  ...SENT_REVIEW,
  status: "needs_attention",
  submitted_at: undefined,
  attention_reason: "The portal asked for a login code sent to your email.",
  filled_fields: ["First name", "Last name", "Email", "Resume"],
  receipt: undefined,
  questions: [
    SENT_REVIEW.questions[0],
    SENT_REVIEW.questions[1],
    /* The case worth looking at: required, and blank. */
    { id: "q4", question: "Desired salary", answer: "", kind: "required", required: true },
    { id: "q5", question: "Portfolio", answer: "", kind: "required", required: false },
  ],
};

function packetWith(review: ApplicationReview, id: string): GeneratedResume {
  return {
    id,
    job_context: { company: "Notion", role: "Software Engineer" },
    spec: { ...SPEC, _review: review },
    download_url: "#",
    created_at: "2026-07-21T19:42:00.000Z",
  };
}

const SENT = packetWith(SENT_REVIEW, "fixture-sent");
const UNSENT = packetWith(UNSENT_REVIEW, "fixture-unsent");

export function DashboardPacketHarness() {
  const [open, setOpen] = useState<GeneratedResume | null>(null);
  const review = open?.spec._review;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        Harness · the dashboard component, fixture data
      </p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight text-ink">ApplicationPacket</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        The same component the dashboard board opens, rendered against a GeneratedResume and an
        ApplicationReview typed from lib/api.ts.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={() => setOpen(SENT)}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink hover:border-brand"
        >
          Sent, with receipt
        </button>
        <button
          onClick={() => setOpen(UNSENT)}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink hover:border-brand"
        >
          Needs you, required question blank
        </button>
      </div>

      {open && review && (
        <ApplicationPacket packet={open} review={review} onClose={() => setOpen(null)} />
      )}
    </main>
  );
}
