/* Demo data for the "revisit the application" packet viewer.
 *
 * This is the John Doe canon the rest of the site already uses (lib/try-data.ts,
 * PacketDemo, the film props): same applicant, same Notion posting, same
 * filename. A second demo world would mean a visitor who reads two sections
 * meets two different people, so nothing here invents a new one.
 *
 * The shapes are the CONTRACT the dashboard will fill from real data later, not
 * a shape convenient for a mock. Anything the real packet cannot produce is
 * absent here on purpose: no match score on the questions, no "sent" state on
 * the email, no per-field confidence. */

export type PacketFieldKind = "text" | "select" | "file" | "essay" | "declined";

export type PacketQuestion = {
  q: string;
  a: string;
  kind?: PacketFieldKind;
  /* Where the answer came from. The whole reason to reopen an application is to
     check what was said on your behalf, so an answer with no provenance is the
     one thing this view must not show. */
  source: string;
};

export type Packet = {
  id: string;
  role: string;
  company: string;
  location: string;
  /* The employer's own URL, so a reopened packet can always be checked against
     the posting it was built from. */
  postingUrl: string;
  appliedAt: string;
  status: "Submitted" | "Waiting on you" | "Draft";
  resume: {
    filename: string;
    name: string;
    contact: string;
    sections: {
      title: string;
      entries: { heading: string; meta: string; bullets: string[] }[];
    }[];
    skills: string[];
  };
  jd: {
    posted: string;
    blocks: { heading: string; body?: string; bullets?: string[] }[];
  };
  questions: { group: string; items: PacketQuestion[] }[];
  email: { to: string; subject: string; body: string; state: string };
};

export const DEMO_PACKET: Packet = {
  id: "notion-swe",
  role: "Software Engineer",
  company: "Notion",
  location: "San Francisco, CA",
  postingUrl: "jobs.lever.co/notion/software-engineer",
  appliedAt: "Jul 21, 2026 at 7:42 PM",
  status: "Submitted",

  resume: {
    filename: "John_Doe_Notion_Resume.pdf",
    name: "John Doe",
    contact: "Los Angeles, CA · john.doe@usc.edu · (213) 555-0148 · linkedin.com/in/johndoe",
    sections: [
      {
        title: "Experience",
        entries: [
          {
            heading: "Founding Engineer · Clubfolio",
            meta: "Los Angeles · 2025 to now",
            bullets: [
              "Rebuilt the club-portal editor on CRDTs; sync conflicts fell to zero across 1,200 users.",
              "Shipped a block-based notes feature in React and TypeScript, mirroring Notion's data model.",
              "Cut page-load p95 from 2.1s to 640ms by moving reads onto a Postgres materialized view.",
            ],
          },
          {
            heading: "Software Engineering Intern · Ramp",
            meta: "New York · Summer 2025",
            bullets: [
              "Wrote the reconciliation job that closed a 4-hour gap between card authorizations and the ledger.",
              "Added contract tests to the payments service, taking a weekly manual QA pass down to a CI step.",
            ],
          },
        ],
      },
      {
        title: "Education",
        entries: [
          {
            heading: "University of Southern California",
            meta: "B.S. Computer Science · May 2027",
            bullets: ["Teaching assistant, CSCI 201 Principles of Software Development."],
          },
        ],
      },
    ],
    skills: ["TypeScript", "React", "Node", "Postgres", "Real-time sync", "CRDTs"],
  },

  jd: {
    posted: "Posted Jul 14, 2026",
    blocks: [
      {
        heading: "About the role",
        body:
          "You will work on Notion's web client and the services behind it. Our editor is collaborative by default, which means most problems here end up being sync problems: how state converges, how conflicts resolve, and how fast the document feels while both are happening.",
      },
      {
        heading: "What you will do",
        bullets: [
          "Build features in the block editor, from the data model through to the rendered document.",
          "Improve real-time collaboration: presence, conflict resolution and offline edits.",
          "Own performance work on the critical path, measured on p95 rather than on averages.",
          "Work directly with design on interactions that need engineering input early.",
        ],
      },
      {
        heading: "What we are looking for",
        bullets: [
          "Strong TypeScript and React, with an understanding of how the framework actually renders.",
          "Experience with collaborative or distributed state, such as CRDTs or operational transforms.",
          "Comfort in a relational database: query plans, indexes, and when to denormalize.",
          "A record of shipping user-facing software, at any scale.",
        ],
      },
      {
        heading: "Logistics",
        body:
          "San Francisco, hybrid, three days on site. We sponsor work visas for this role. Base range $150,000 to $210,000 plus equity.",
      },
    ],
  },

  questions: [
    {
      group: "About you",
      items: [
        { q: "First name", a: "John", kind: "text", source: "Profile" },
        { q: "Last name", a: "Doe", kind: "text", source: "Profile" },
        { q: "Email", a: "john.doe@usc.edu", kind: "text", source: "Profile" },
        { q: "Phone", a: "(213) 555-0148", kind: "text", source: "Profile" },
        { q: "Location", a: "Los Angeles, CA", kind: "text", source: "Profile" },
        { q: "LinkedIn", a: "linkedin.com/in/johndoe", kind: "text", source: "Profile" },
      ],
    },
    {
      group: "Education and eligibility",
      items: [
        { q: "University", a: "University of Southern California", kind: "text", source: "Profile" },
        { q: "Degree", a: "B.S. Computer Science", kind: "text", source: "Profile" },
        { q: "Graduation year", a: "2027", kind: "select", source: "Profile" },
        {
          q: "Are you authorized to work in the United States?",
          a: "Yes",
          kind: "select",
          source: "Profile",
        },
        {
          q: "Will you now or in the future require sponsorship?",
          a: "Yes",
          kind: "select",
          source: "Profile",
        },
      ],
    },
    {
      group: "Written answers",
      items: [
        {
          q: "Why do you want to work at Notion?",
          a: "I spent the last year building a CRDT-backed editor for a club portal, so the problems in Notion's job posting are the ones I already think about outside of work: how state converges, and how the document still feels fast while it happens. I would rather keep solving them somewhere they are the product rather than a side quest.",
          kind: "essay",
          source: "Written from your resume and this posting",
        },
        {
          q: "How did you hear about us?",
          a: "Company careers page",
          kind: "select",
          source: "Profile",
        },
      ],
    },
    {
      group: "Attachments",
      items: [
        {
          q: "Resume / CV",
          a: "John_Doe_Notion_Resume.pdf",
          kind: "file",
          source: "Written for this posting",
        },
      ],
    },
    {
      group: "Left blank on purpose",
      items: [
        {
          q: "Voluntary self-identification: race, gender, veteran status, disability",
          a: "Decline to self-identify",
          kind: "declined",
          source: "Litos never answers demographic questions for you",
        },
      ],
    },
  ],

  email: {
    to: "Priya Nair · USC alum · Engineering",
    subject: "Fellow Trojan applying to the SWE role",
    body:
      "Hi Priya, I just applied to the software engineer role and saw you made the same USC-to-Notion jump. I've spent the last year building a CRDT-backed editor, so Notion's sync problems are the ones I already think about for fun. Would you be open to a 15-minute chat about your first year on the team?",
    state: "Draft left in your Gmail",
  },
};

/* The list the sandbox renders. Only the first one opens: the other two exist so
   the revisit affordance is seen repeating down a list rather than once on a
   single card, which is the thing being designed. */
export const DEMO_LIST = [
  {
    id: DEMO_PACKET.id,
    role: DEMO_PACKET.role,
    company: DEMO_PACKET.company,
    location: DEMO_PACKET.location,
    when: "2d ago",
    status: DEMO_PACKET.status,
    questionCount: DEMO_PACKET.questions.reduce((n, g) => n + g.items.length, 0),
  },
  {
    id: "linear-swe",
    role: "Product Engineer",
    company: "Linear",
    location: "Remote",
    when: "3d ago",
    status: "Submitted" as const,
    questionCount: 11,
  },
  {
    id: "figma-swe",
    role: "Software Engineer, Design Systems",
    company: "Figma",
    location: "New York, NY",
    when: "5d ago",
    status: "Waiting on you" as const,
    questionCount: 9,
  },
];
