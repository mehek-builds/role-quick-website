function TierBadge({ tier }: { tier: "Verified" | "Likely" | "LinkedIn" }) {
  const styles: Record<string, string> = {
    Verified: "bg-positive/10 text-positive",
    Likely: "bg-warn/10 text-warn",
    LinkedIn: "bg-brand-soft text-brand-ink",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles[tier]}`}
    >
      {tier}
    </span>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-2 shadow-[0_1px_2px_rgba(18,18,15,0.04),0_12px_32px_-16px_rgba(18,18,15,0.12)]">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
      </div>
      <div className="rounded-2xl border border-border bg-white p-5">{children}</div>
    </div>
  );
}

const contacts = [
  { name: "Priya Nair", role: "SWE Recruiter · USC '22", tier: "Verified" as const },
  { name: "Daniel Cho", role: "Eng Manager", tier: "Verified" as const },
  { name: "Sam Alvarez", role: "Head of Talent", tier: "Likely" as const },
  { name: "Rina Okafor", role: "Team Lead", tier: "LinkedIn" as const },
];

export function ContactListMockup() {
  return (
    <Frame>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        Hiring team · Acme Inc
      </p>
      <div className="mt-4 space-y-3">
        {contacts.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-xs font-medium text-muted">
                {c.name.split(" ").map((n) => n[0]).join("")}
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <p className="text-xs text-muted">{c.role}</p>
              </div>
            </div>
            <TierBadge tier={c.tier} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function DraftMockup() {
  return (
    <Frame>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        Draft · Gmail
      </p>
      <div className="mt-4 space-y-3 text-sm">
        <div className="flex gap-2 border-b border-border pb-3">
          <span className="text-faint">To</span>
          <span className="text-ink">priya.nair@acme.com</span>
        </div>
        <div className="flex gap-2 border-b border-border pb-3">
          <span className="text-faint">Subject</span>
          <span className="text-ink">Fellow Trojan, 15-min chat?</span>
        </div>
        <p className="pt-1 leading-6 text-muted">
          Hi Priya, saw you lead recruiting for the SWE team at Acme, and
          noticed we&apos;re both USC alums. I just wrapped a summer building
          a full-stack analytics tool and the team&apos;s roadmap looks like
          a great fit...
        </p>
      </div>
    </Frame>
  );
}

const inboxTimes = [
  "11:58 AM", "11:57 AM", "11:56 AM", "11:55 AM", "11:54 AM",
  "11:53 AM", "11:52 AM", "11:51 AM", "11:50 AM", "11:49 AM",
  "11:48 AM", "11:47 AM", "11:46 AM", "11:45 AM", "11:44 AM",
  "11:43 AM", "11:42 AM", "11:41 AM", "11:40 AM", "11:39 AM",
];

const inboxCompanies = [
  { sender: "LinkedIn", company: "Northline", role: "Software Engineer Intern", pattern: "linkedin" },
  { sender: "Fintra Careers", company: "Fintra", role: "Product Analyst", pattern: "interest" },
  { sender: "Brightpath Health", company: "Brightpath", role: "Marketing Intern", pattern: "applying" },
  { sender: "Ashworth Robotics", company: "Ashworth Robotics", role: "Backend Engineer Intern", pattern: "colon" },
  { sender: "Vela", company: "Vela", role: "Data Science Intern", pattern: "received" },
  { sender: "Coreway Talent", company: "Coreway", role: "UX Design Intern", pattern: "linkedin" },
  { sender: "Lumen Analytics", company: "Lumen Analytics", role: "Business Analyst Intern", pattern: "applying" },
  { sender: "LinkedIn", company: "Parallax Systems", role: "Software Engineer Intern", pattern: "linkedin" },
  { sender: "Solace Biotech", company: "Solace", role: "Research Intern", pattern: "interest" },
  { sender: "Meridian Capital", company: "Meridian Capital", role: "Investment Banking Intern", pattern: "colon" },
  { sender: "Driftwood Media", company: "Driftwood", role: "Content Intern", pattern: "received" },
  { sender: "Anchorpoint Labs", company: "Anchorpoint", role: "Growth Intern", pattern: "applying" },
  { sender: "LinkedIn", company: "Cascade Robotics", role: "Mechanical Engineer Intern", pattern: "linkedin" },
  { sender: "Ionic Health", company: "Ionic Health", role: "Product Design Intern", pattern: "interest" },
  { sender: "Westbrook Talent", company: "Westbrook", role: "Operations Intern", pattern: "colon" },
  { sender: "Nimbus Cloud", company: "Nimbus", role: "Cloud Engineer Intern", pattern: "received" },
  { sender: "Halcyon Finance", company: "Halcyon", role: "Finance Intern", pattern: "applying" },
  { sender: "LinkedIn", company: "Rowan Dynamics", role: "Systems Engineer Intern", pattern: "linkedin" },
  { sender: "Tidal Works", company: "Tidal Works", role: "Frontend Engineer Intern", pattern: "interest" },
  { sender: "Brookline Ventures", company: "Brookline", role: "Venture Intern", pattern: "colon" },
];

function buildInboxEmail(entry: (typeof inboxCompanies)[number], time: string, i: number) {
  const { sender, company, role, pattern } = entry;
  const bySender: Record<string, { subject: string; snippet: string }> = {
    linkedin: {
      subject: `Your application to ${role} at ${company} was sent`,
      snippet: `${company}, your profile was submitted to the hiring team.`,
    },
    interest: {
      subject: `Thank you for your interest in the ${role} role`,
      snippet: `We confirm receipt of your application and appreciate the time you invested.`,
    },
    applying: {
      subject: `Thank you for applying to ${company}!`,
      snippet: `You did it! We've received your application for the ${role} role.`,
    },
    colon: {
      subject: `${company}: thank you for your application`,
      snippet: `Your application is being reviewed by our recruiting team.`,
    },
    received: {
      subject: `We have received your application`,
      snippet: `Thanks for your interest in the ${role} role at ${company}.`,
    },
  };
  const { subject, snippet } = bySender[pattern];
  return {
    sender,
    subject,
    snippet,
    time,
    unread: i < 8,
    starred: i === 2 || i === 11,
    tag: i % 4 === 0 ? "Sent via Role Quick" : undefined,
  };
}

const inboxEmails = inboxCompanies.map((c, i) => buildInboxEmail(c, inboxTimes[i], i));

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-[18px] w-[18px] shrink-0 ${filled ? "fill-warn text-warn" : "fill-none text-[#5f6368]/50"}`}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.4}
    >
      <path d="M10 1.5l2.6 5.4 5.9.7-4.3 4.1 1.1 5.9L10 14.8l-5.3 2.8 1.1-5.9L1.5 7.6l5.9-.7L10 1.5z" />
    </svg>
  );
}

function SidebarIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 fill-current">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  inbox: "M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM5 5h14v9h-4l-1.5 2h-3L9 14H5V5zm0 14v-3h3.17l1.5 2h4.66l1.5-2H19v3H5z",
  star: "M12 2l2.9 6.3 6.9.8-5.1 4.6 1.4 6.8L12 17l-6.1 3.5 1.4-6.8L2.2 9.1l6.9-.8L12 2z",
  clock: "M12 2a10 10 0 100 20 10 10 0 000-20zm1 10.4V6h-2v7.6l5.2 3.1 1-1.7-4.2-2.6z",
  send: "M2.5 3l19 9-19 9 4-9-4-9zm4.6 9l-2.6 5.9L18.4 12 4.5 6.1 7.1 12z",
  draft: "M14.06 4.94l3 3L7.5 17.5H4.5v-3l9.56-9.56zM17.7 3.29a1 1 0 011.41 0l1.6 1.6a1 1 0 010 1.42l-1.34 1.34-3-3 1.33-1.36z",
};

export function InboxMockup() {
  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-[20px] border border-border bg-white text-[#202124] shadow-[0_1px_2px_rgba(18,18,15,0.04),0_16px_40px_-16px_rgba(18,18,15,0.2)]">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-2.5">
        <svg viewBox="0 0 24 24" className="hidden h-5 w-5 shrink-0 fill-[#5f6368] sm:block">
          <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
        </svg>
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="h-6 w-8 shrink-0">
            <path fill="#EA4335" d="M2 6.5L12 13l3-2.2V6.5L12 11 3.6 5H2z" />
            <path fill="#34A853" d="M22 6.5v11a2 2 0 01-2 2h-1V9.3l3-2.8z" />
            <path fill="#4285F4" d="M2 6.5v11a2 2 0 002 2h1V9.3L2 6.5z" />
            <path fill="#FBBC05" d="M5 8.2V19h14V8.2l-7 5.1-7-5.1z" />
            <path fill="#C5221F" d="M5 5h14a2 2 0 012 2v.5l-9 6.5-9-6.5V7a2 2 0 012-2z" />
          </svg>
          <span className="hidden text-lg text-[#5f6368] sm:inline">Gmail</span>
        </div>
        <div className="flex max-w-lg flex-1 items-center gap-3 rounded-full bg-[#eaf1fb] px-4 py-2 text-sm text-[#5f6368]">
          <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth={1.7}>
            <circle cx="8.5" cy="8.5" r="6" />
            <path d="M17 17l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <span className="truncate">Search mail</span>
        </div>
        <div className="ml-auto hidden items-center gap-4 text-[#5f6368] sm:flex">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
            <path d="M11 17h2v-2h-2v2zm1-15a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm0-13a3 3 0 00-3 3h2a1 1 0 112 0c0 1-1.5 1.4-1.5 3h2c0-1 1.5-1.4 1.5-3a3 3 0 00-3-3z" />
          </svg>
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
            <path d="M19.4 13a7.7 7.7 0 000-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 00-1.7-1L15 3h-4l-.3 2.9a7.6 7.6 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.7 7.7 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 001.7 1l.3 2.9h4l.3-2.9a7.6 7.6 0 001.7-1l2.5 1 2-3.5-2.1-1.6zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
          </svg>
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
            <circle cx="5" cy="5" r="1.6" />
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="19" cy="5" r="1.6" />
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
            <circle cx="5" cy="19" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
            <circle cx="19" cy="19" r="1.6" />
          </svg>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-medium text-white">
            M
          </span>
        </div>
      </div>

      <div className="border-t border-[#e8eaed]">
        {/* Toolbar */}
        <div className="flex items-center gap-4 border-b border-[#e8eaed] px-4 py-2 text-[#5f6368]">
          <span className="h-[18px] w-[18px] shrink-0 rounded-sm border-2 border-[#5f6368]/40" />
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current">
            <path d="M17.65 6.35A8 8 0 106 17.65 8 8 0 0017.65 6.35zM12 20a8 8 0 118-8h-2a6 6 0 10-1.76 4.24L18 18l-1.41 1.41-3.18-3.18A7.96 7.96 0 0112 20zm1-13h-2v6l4.28 2.54.72-1.21-3-1.78V7z" />
          </svg>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
          <span className="ml-auto hidden text-xs sm:inline">1-20 of 214</span>
        </div>

        {/* Message list */}
        <div className="min-w-0">
          {inboxEmails.map((e) => (
            <div
              key={`${e.sender}-${e.time}`}
              className="flex items-center gap-3 border-b border-[#e8eaed] px-4 py-2.5 last:border-b-0 hover:z-10 hover:shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
            >
              <span className="h-[18px] w-[18px] shrink-0 rounded-sm border-2 border-[#5f6368]/40" />
              <StarIcon filled={e.starred} />
              <span
                className={`w-24 shrink-0 truncate text-[13px] sm:w-36 ${e.unread ? "font-bold text-[#202124]" : "text-[#202124]"}`}
              >
                {e.sender}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                <span className={e.unread ? "font-bold text-[#202124]" : "text-[#202124]"}>
                  {e.subject}
                </span>
                <span className="text-[#5f6368]"> - {e.snippet}</span>
              </span>
              {e.tag && (
                <span className="hidden shrink-0 rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive md:inline-block">
                  {e.tag}
                </span>
              )}
              <span
                className={`shrink-0 text-[12px] ${e.unread ? "font-bold text-[#202124]" : "text-[#5f6368]"}`}
              >
                {e.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ATS_PLATFORMS = ["Lever", "Greenhouse", "Ashby", "Workday", "LinkedIn"];

export function AtsChips() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {ATS_PLATFORMS.map((p) => (
        <span
          key={p}
          className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted"
        >
          {p}
        </span>
      ))}
    </div>
  );
}

export function ApplicationFormMockup() {
  const fields = [
    { label: "Full name", value: "Alex Rivera" },
    { label: "Email", value: "alex.rivera@usc.edu" },
    { label: "Phone", value: "(213) 555-0148" },
    { label: "Resume", value: "alex-rivera-acme-swe.pdf", isFile: true },
    { label: "LinkedIn", value: "linkedin.com/in/alexrivera" },
    { label: "Work authorized?", value: "Yes" },
  ];
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Application · Greenhouse
        </p>
        <span className="rounded-full bg-positive/10 px-2.5 py-0.5 text-[11px] font-medium text-positive">
          6 of 6 filled
        </span>
      </div>
      <div className="mt-4 space-y-2.5">
        {fields.map((f) => (
          <div
            key={f.label}
            className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5"
          >
            <span className="text-xs text-faint">{f.label}</span>
            {f.isFile ? (
              <span className="flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-ink">
                📎 {f.value}
              </span>
            ) : (
              <span className="text-sm text-ink">{f.value}</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl border-2 border-dashed border-border px-3.5 py-2.5">
        <span className="text-xs font-medium text-muted">Submit application</span>
        <span className="text-[11px] font-medium text-faint">
          Waiting on you
        </span>
      </div>
    </Frame>
  );
}

function ArrowDivider() {
  return (
    <div className="flex shrink-0 items-center justify-center py-2 sm:px-2 sm:py-0">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 rotate-90 fill-none stroke-faint sm:rotate-0"
        strokeWidth={1.8}
      >
        <path d="M4 12h15" strokeLinecap="round" />
        <path d="M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function MessyResumeMockup() {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-2 shadow-[0_1px_2px_rgba(18,18,15,0.04),0_12px_32px_-16px_rgba(18,18,15,0.12)]">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-[10px] font-medium text-danger">
          Before
        </span>
        <span className="text-[10px] text-faint">alex_resume_FINAL_v3.docx</span>
      </div>
      <div className="mx-auto max-w-[280px] rounded-2xl border border-border bg-white p-5 font-serif text-[11px] leading-5 text-muted">
        <p className="font-bold text-ink">ALEX RIVERA</p>
        <p className="text-[10px]">alex.r99@email.com | 213-555-0148 | LA</p>
        <p className="mt-3 underline">work experience</p>
        <p className="mt-1">
          Acme Inc - Software eng intern (summer) did backend stuff and
          helped with some apis and databases, also worked on a dashboard
          thing for the team.
        </p>
        <p className="mt-2">
          * Freelance - built websites for a few small clients using
          different tools, fixed bugs, deployed sites
        </p>
        <p className="mt-3 underline">skills</p>
        <p className="mt-1">python, some react, sql i guess, java (old), css</p>
        <p className="mt-3 underline">EDUCATION</p>
        <p className="mt-1">State University, computer science, graduating soon</p>
      </div>
    </div>
  );
}

export function CleanResumeMockup() {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-2 shadow-[0_1px_2px_rgba(18,18,15,0.04),0_12px_32px_-16px_rgba(18,18,15,0.12)]">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="rounded-full bg-positive/10 px-2.5 py-0.5 text-[10px] font-medium text-positive">
          After, Role Quick format
        </span>
      </div>
      <div className="mx-auto max-w-[280px] rounded-2xl border border-border bg-white p-5 font-mono">
        <p className="text-sm font-semibold text-ink">Alex Rivera</p>
        <p className="text-[11px] text-faint">alex.rivera@usc.edu · (213) 555-0148 · Los Angeles</p>
        <div className="mt-3 h-px w-full bg-border" />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
          Experience
        </p>
        <div className="mt-2 space-y-2 text-[10px] leading-4 text-muted">
          <p>Software Engineer Intern, Acme Inc</p>
          <p>Freelance Web Developer, Self-employed</p>
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
          Skills
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["Python", "React", "SQL", "AWS"].map((s) => (
            <span
              key={s}
              className="rounded-full bg-brand-soft px-2 py-0.5 text-[9px] font-medium text-brand-ink"
            >
              {s}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
          Education
        </p>
        <p className="mt-2 text-[10px] text-muted">
          B.S. Computer Science, State University
        </p>
      </div>
    </div>
  );
}

export function ResumeFormatDemo() {
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-stretch sm:justify-center">
      <MessyResumeMockup />
      <ArrowDivider />
      <CleanResumeMockup />
    </div>
  );
}

const jdKeywords = ["Python", "distributed systems", "REST APIs", "AWS", "CI/CD"];

function HighlightedJdText() {
  const text =
    "We're looking for a Software Engineer Intern to help build distributed systems that power our platform. You'll work on REST APIs, ship through our CI/CD pipeline, and deploy on AWS. Strong Python fundamentals required.";
  const pattern = new RegExp(`(${jdKeywords.join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <p className="leading-6 text-muted">
      {parts.map((part, i) =>
        jdKeywords.some((k) => k.toLowerCase() === part.toLowerCase()) ? (
          <span key={i} className="rounded bg-brand-soft px-1 font-medium text-brand-ink">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function JobDescriptionMockup() {
  return (
    <div className="sm:w-[320px]">
      <Frame>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Job description · Northline
        </p>
        <p className="mt-2 text-sm font-semibold text-ink">Software Engineer Intern</p>
        <div className="mt-3 text-[13px]">
          <HighlightedJdText />
        </div>
      </Frame>
    </div>
  );
}

export function TailoredResumeMockup() {
  return (
    <div className="sm:w-[320px]">
      <Frame>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Tailored for this role
        </p>
        <span className="w-fit rounded-full bg-positive/10 px-2.5 py-0.5 text-[11px] font-medium text-positive">
          5/5 keywords matched
        </span>
      </div>
      <div className="mx-auto mt-4 max-w-[280px] rounded-2xl border border-border bg-white p-5 font-mono">
        <p className="text-sm font-semibold text-ink">Alex Rivera</p>
        <p className="text-[11px] text-faint">Software Engineer, New Grad</p>
        <div className="mt-3 h-px w-full bg-border" />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
          Experience
        </p>
        <p className="mt-2 text-[10px] leading-4 text-muted">
          Built and shipped{" "}
          <span className="rounded bg-brand-soft px-1 font-medium text-brand-ink">
            REST APIs
          </span>{" "}
          for internal tools; deployed services on{" "}
          <span className="rounded bg-brand-soft px-1 font-medium text-brand-ink">
            AWS
          </span>{" "}
          through a{" "}
          <span className="rounded bg-brand-soft px-1 font-medium text-brand-ink">
            CI/CD
          </span>{" "}
          pipeline.
        </p>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
          Skills
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["Python", "Distributed systems", "AWS", "SQL"].map((s) => (
            <span
              key={s}
              className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[9px] font-medium text-brand-ink"
            >
              ✓ {s}
            </span>
          ))}
        </div>
      </div>
      </Frame>
    </div>
  );
}

export function ResumeMatchDemo() {
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:justify-center">
      <JobDescriptionMockup />
      <ArrowDivider />
      <TailoredResumeMockup />
    </div>
  );
}

export function ResumeMockup() {
  return (
    <Frame>
      <div className="mx-auto max-w-[280px] rounded-2xl border border-border bg-white p-5 font-mono">
        <p className="text-sm font-semibold text-ink">Alex Rivera</p>
        <p className="text-[11px] text-faint">Software Engineer, New Grad</p>
        <div className="mt-3 h-px w-full bg-border" />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
          Experience
        </p>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-11/12 rounded-full bg-surface-alt" />
          <div className="h-1.5 w-9/12 rounded-full bg-surface-alt" />
          <div className="h-1.5 w-10/12 rounded-full bg-surface-alt" />
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
          Skills
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["Python", "React", "SQL", "AWS"].map((s) => (
            <span
              key={s}
              className="rounded-full bg-brand-soft px-2 py-0.5 text-[9px] font-medium text-brand-ink"
            >
              {s}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
          Projects
        </p>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-10/12 rounded-full bg-surface-alt" />
          <div className="h-1.5 w-8/12 rounded-full bg-surface-alt" />
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-faint">
        Auto-tailored to this posting&apos;s keywords
      </p>
    </Frame>
  );
}
