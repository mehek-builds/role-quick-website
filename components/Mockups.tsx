function TierBadge({ tier }: { tier: "Verified" | "Likely" | "LinkedIn" }) {
  const styles: Record<string, string> = {
    Verified: "bg-positive-soft text-positive",
    Likely: "bg-warn-soft text-warn",
    LinkedIn: "bg-brand-soft text-brand-ink",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] ${styles[tier]}`}
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
  { name: "Priya Nair", role: "SWE Recruiter · USC '22", tier: "Verified" as const, alum: true },
  { name: "Daniel Cho", role: "Eng Manager, Platform", tier: "Verified" as const, alum: false },
  { name: "Sam Alvarez", role: "Head of Talent", tier: "Likely" as const, alum: false },
  { name: "Rina Okafor", role: "Team Lead, Infra", tier: "LinkedIn" as const, alum: false },
];

export function ContactListMockup() {
  return (
    <Frame>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Hiring team · Northline
        </p>
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
          4 found
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {contacts.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-xs font-medium text-muted">
                {c.name.split(" ").map((n) => n[0]).join("")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                <p className="truncate text-xs text-muted">{c.role}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {c.alum && (
                <span className="rounded-full bg-coral-soft px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] text-coral-ink">
                  Alum
                </span>
              )}
              <TierBadge tier={c.tier} />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function DraftMockup() {
  return (
    <Frame>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          New message · Gmail
        </p>
        <span className="shrink-0 rounded-full bg-coral-soft px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] text-coral-ink">
          Draft · not sent
        </span>
      </div>
      <div className="mt-4 space-y-2.5 text-[12.5px]">
        <div className="flex gap-2 border-b border-border pb-2.5">
          <span className="text-faint">To</span>
          <span className="text-ink">Priya Nair &lt;priya.nair@northline.com&gt;</span>
        </div>
        <div className="flex gap-2 border-b border-border pb-2.5">
          <span className="text-faint">Subject</span>
          <span className="text-ink">Fellow Trojan, just applied to the SWE role</span>
        </div>
        <p className="pt-1 leading-6 text-muted">
          Hi Priya, fellow Trojan here. I just applied to the SWE role
          and wanted to reach out beyond the pile. Last year I built REST
          APIs at Acme serving 40K requests a day, and Northline&apos;s
          platform work looks like that at real scale. Open to a 15-minute
          chat?
          <br />
          <span className="text-ink">- John</span>
        </p>
      </div>
      <p className="mt-3 border-t border-border pt-3 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
        Waiting in your drafts
      </p>
    </Frame>
  );
}

const inboxTimes = [
  "11:58 AM", "11:57 AM", "11:56 AM", "11:55 AM", "11:54 AM",
  "11:53 AM", "11:52 AM", "11:51 AM", "11:50 AM", "11:49 AM",
  "11:48 AM", "11:47 AM", "11:46 AM", "11:45 AM", "11:44 AM",
  "11:43 AM", "11:42 AM", "11:41 AM", "11:40 AM", "11:39 AM",
];

/* Role mix, not an internship list. Every row here used to end in "Intern",
   which turned the confirmation wall into a claim about who Litos is for.
   Keep a few internships and keep the rest open-level. */
const inboxCompanies = [
  { sender: "LinkedIn", company: "Northline", role: "Software Engineer", pattern: "linkedin" },
  { sender: "Fintra Careers", company: "Fintra", role: "Product Analyst", pattern: "interest" },
  { sender: "Brightpath Health", company: "Brightpath", role: "Marketing Associate", pattern: "applying" },
  { sender: "Ashworth Robotics", company: "Ashworth Robotics", role: "Backend Engineer", pattern: "colon" },
  { sender: "Vela", company: "Vela", role: "Data Science Intern", pattern: "received" },
  { sender: "Coreway Talent", company: "Coreway", role: "UX Designer", pattern: "linkedin" },
  { sender: "Lumen Analytics", company: "Lumen Analytics", role: "Business Analyst", pattern: "applying" },
  { sender: "LinkedIn", company: "Parallax Systems", role: "Software Engineer", pattern: "linkedin" },
  { sender: "Solace Biotech", company: "Solace", role: "Research Intern", pattern: "interest" },
  { sender: "Meridian Capital", company: "Meridian Capital", role: "Investment Banking Analyst", pattern: "colon" },
  { sender: "Driftwood Media", company: "Driftwood", role: "Content Strategist", pattern: "received" },
  { sender: "Anchorpoint Labs", company: "Anchorpoint", role: "Growth Marketer", pattern: "applying" },
  { sender: "LinkedIn", company: "Cascade Robotics", role: "Mechanical Engineer Intern", pattern: "linkedin" },
  { sender: "Ionic Health", company: "Ionic Health", role: "Product Designer", pattern: "interest" },
  { sender: "Westbrook Talent", company: "Westbrook", role: "Operations Manager", pattern: "colon" },
  { sender: "Nimbus Cloud", company: "Nimbus", role: "Cloud Engineer", pattern: "received" },
  { sender: "Halcyon Finance", company: "Halcyon", role: "Finance Intern", pattern: "applying" },
  { sender: "LinkedIn", company: "Rowan Dynamics", role: "Systems Engineer", pattern: "linkedin" },
  { sender: "Tidal Works", company: "Tidal Works", role: "Frontend Engineer", pattern: "interest" },
  { sender: "Brookline Ventures", company: "Brookline", role: "Venture Associate", pattern: "colon" },
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
              <span
                title="Sent via Litos"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[8px] font-bold text-white"
              >
                R
              </span>
              <span
                className={`shrink-0 text-[12px] ${e.unread ? "font-bold text-[#202124]" : "text-[#5f6368]"}`}
              >
                {e.time}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-[#e8eaed] py-2.5 text-[11px] text-[#5f6368]">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[8px] font-bold text-white">
            R
          </span>
          every one of these sent through Litos
        </div>
      </div>
    </div>
  );
}

/* A real Greenhouse-shaped form: labels over inputs, dropdowns, the resume
   attached, screening answered, and the two things deliberately NOT filled
   (the essay, EEO beyond decline-to-default) shown honestly. Teal = the
   autofill pillar doing its job. */
function FormField({
  label,
  value,
  filled = true,
  select = false,
}: {
  label: string;
  value: string;
  filled?: boolean;
  select?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted">{label}</p>
      <div
        className={`mt-1 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${
          filled ? "border-border bg-white" : "border-dashed border-border bg-surface-alt/60"
        }`}
      >
        <span className={`truncate text-[11.5px] ${filled ? "text-ink" : "italic text-faint"}`}>
          {value}
        </span>
        {select && <span className="text-[9px] text-faint">▾</span>}
        {filled && !select && <span className="text-[10px] text-teal-ink">✓</span>}
      </div>
    </div>
  );
}

export function ApplicationFormMockup() {
  return (
    <Frame>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Application · Greenhouse
        </p>
        {/* 21, not 23: the two work-eligibility questions above are declined
            now, so the counter has to come down with them or the picture
            contradicts itself. */}
        <span className="shrink-0 rounded-full bg-teal-soft px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] text-teal-ink">
          21 of 25 filled
        </span>
      </div>
      <p className="mt-2 text-[13px] font-semibold text-ink">
        Software Engineer · Northline
      </p>

      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <FormField label="First name *" value="John" />
        <FormField label="Last name *" value="Doe" />
      </div>
      <div className="mt-2 space-y-2">
        <FormField label="Email *" value="john.doe@usc.edu" />
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Phone *" value="(213) 555-0148" />
          <FormField label="Location *" value="Los Angeles, CA" />
        </div>
        <div>
          <p className="text-[10px] font-medium text-muted">Resume / CV *</p>
          <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5">
            <span className="flex min-w-0 items-center gap-1.5 truncate rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-medium text-brand-ink">
              📎 John_Doe_Northline_Resume.pdf
            </span>
            <span className="text-[10px] text-teal-ink">✓</span>
          </div>
        </div>
        <FormField label="LinkedIn profile" value="linkedin.com/in/johndoe" />
        {/* NOT filled, and this is not a styling choice.
            Litos never answers work-eligibility questions. Every adapter routes
            them through WORK_ELIGIBILITY_QUESTION / workEligibilitySkipReason()
            in the extension's lib/adapters/generic.ts and skips them, because
            the profile holds one global flag while the question is scoped to
            the role's location, so deriving an answer shipped a false
            declaration on non-local roles (live QA 2026-07-16, Lever/Xsolla).
            The extension's own setup screen says the stored values are for the
            student's reference and are never used to answer a form, and the
            store listing promises "never answers questions about work
            authorization or visa sponsorship".
            This mockup showed both filled, with a green tick, which advertised
            the product doing the one thing it deliberately refuses to do, on a
            legally sensitive field. Leave these declined. */}
        <div className="grid grid-cols-2 gap-2">
          <FormField
            label="Authorized to work in the U.S.? *"
            value="Left for you, rules differ by country."
            filled={false}
          />
          <FormField
            label="Require sponsorship? *"
            value="Left for you, rules differ by country."
            filled={false}
          />
        </div>
        <FormField label="How did you hear about us?" value="LinkedIn" select />
        <FormField
          label="Why do you want to work at Northline?"
          value="Left blank, essays are yours."
          filled={false}
        />
        <FormField
          label="Voluntary self-identification"
          value="Left for you, this answer is personal."
          filled={false}
        />
      </div>

      <div className="mt-3.5 flex items-center justify-between rounded-lg border-2 border-dashed border-border px-3 py-2">
        <span className="text-[11.5px] font-medium text-muted">Submit application</span>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
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

/* Real 8.5x11 paper pages, not UI cards. The After page is what the engine
   actually renders: one column, hairline section rules, dates right-aligned,
   verb-first bullets with numbers, a plain skills line (ATS parsers read
   text, not chips). */
function Paper({
  label,
  chip,
  chipClass,
  note,
  children,
}: {
  label?: string;
  chip: string;
  chipClass: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-[400px]">
      {label && (
        <p className="px-1 pb-1.5 font-mono text-[13px] font-semibold uppercase tracking-[0.14em] text-ink">
          {label}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${chipClass}`}>
          {chip}
        </span>
        <span className="truncate font-mono text-[9px] text-faint">{note}</span>
      </div>
      <div className="flex aspect-[17/22] flex-col overflow-hidden rounded-[10px] border border-border bg-white px-7 py-8 shadow-[0_1px_2px_rgba(18,18,15,0.05),0_16px_40px_-20px_rgba(18,18,15,0.18)]">
        {children}
      </div>
    </div>
  );
}

function PdfRule() {
  return <div className="mt-0.5 h-px w-full bg-ink/20" />;
}

/* Compact variants of the pdf primitives, sized so a full real-density
   resume (4 roles, projects, leadership, skills) fits the one page. */
function CSec({ title }: { title: string }) {
  return (
    <div className="mt-2.5">
      <p className="text-[6.8px] font-semibold uppercase tracking-[0.12em] text-ink">
        {title}
      </p>
      <PdfRule />
    </div>
  );
}

function CRow({ left, right }: { left: React.ReactNode; right: string }) {
  return (
    <div className="mt-1.5 flex items-baseline justify-between gap-3">
      <p className="text-[7.2px] font-semibold text-ink">{left}</p>
      <p className="shrink-0 text-[6.8px] text-muted">{right}</p>
    </div>
  );
}

function CBul({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-0.5 pl-2 text-[7px] leading-[1.5] text-muted">
      <span className="mr-1">•</span>
      {children}
    </p>
  );
}

/* Correlation highlights: each requirement gets its own color, used on
   BOTH sides of the arrow, in the JD where it is asked for and in the
   resume where the evidence was placed. Same color = same requirement.
   Local to this demo; pillar meanings elsewhere are unchanged. */
const MATCH_STYLES: Record<string, string> = {
  python: "bg-brand-soft text-brand-ink",
  distributed: "bg-teal-soft text-teal-ink",
  own: "bg-coral-soft text-coral-ink",
};

function M({ k, children }: { k: keyof typeof MATCH_STYLES; children: React.ReactNode }) {
  return (
    <span className={`rounded px-0.5 font-medium ${MATCH_STYLES[k]}`}>{children}</span>
  );
}

const MATCH_LEGEND: { k: keyof typeof MATCH_STYLES; label: string }[] = [
  { k: "python", label: "Python" },
  { k: "distributed", label: "Distributed systems" },
  { k: "own", label: "Ownership" },
];

export function JobDescriptionMockup() {
  return (
    <div className="w-full sm:w-[340px]">
      <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
        <span className="shrink-0 rounded-full bg-surface-alt px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-muted">
          The posting
        </span>
        <span className="truncate font-mono text-[9px] text-faint">jobs.lever.co/northline</span>
      </div>
      <Frame>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Northline · Los Angeles
        </p>
        <p className="mt-1.5 text-sm font-semibold text-ink">Software Engineer</p>
        <p className="mt-3 text-[12px] leading-6 text-muted">
          We&apos;re looking for a Software Engineer to help build{" "}
          <M k="distributed">distributed systems</M> that power our platform.
          Strong <M k="python">Python</M> fundamentals required.
        </p>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          What you&apos;ll do
        </p>
        <ul className="mt-1.5 space-y-1 text-[12px] leading-5 text-muted">
          <li>· Design and ship backend services with the platform team</li>
          <li>
            · Build REST APIs in <M k="python">Python</M>{" "}
            alongside senior engineers
          </li>
          <li>
            · Deploy on AWS through our CI/CD{" "}
            pipeline
          </li>
          <li>
            · <M k="own">Own features end to end</M>, from spec to production
          </li>
          <li>· Write tested, reviewed, production-quality code</li>
        </ul>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          What we look for
        </p>
        <p className="mt-1.5 text-[12px] leading-5 text-muted">
          CS fundamentals, ownership, and evidence you ship real things.
        </p>
      </Frame>
    </div>
  );
}

export function TailoredResumeMockup() {
  return (
    <Paper
      chip="Tailored · 5/5 keywords placed"
      chipClass="bg-positive-soft text-positive"
      note="John_Doe_Northline_Resume.pdf · 1 page"
    >
      <div className="flex h-full flex-col font-sans">
        <p className="text-center text-[12.5px] font-semibold tracking-tight text-ink">
          John Doe
        </p>
        <p className="mt-0.5 text-center text-[6.8px] text-muted">
          john.doe@usc.edu · (213) 555-0148 · linkedin.com/in/johndoe · github.com/johndoe
        </p>

        <CSec title="Education" />
        <CRow left="University of Southern California" right="Los Angeles, CA" />
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[7px] text-muted">
            B.S. Computer Science · Dean&apos;s List, 3 semesters
          </p>
          <p className="shrink-0 text-[6.8px] text-muted">Expected May 2027 · GPA 3.8</p>
        </div>
        <p className="mt-0.5 text-[7px] leading-[1.5] text-muted">
          Coursework: Data Structures, <M k="distributed">Distributed Systems</M>,
          Databases, Operating Systems, Machine Learning
        </p>

        <CSec title="Experience" />
        <CRow left="Software Engineer, Acme Inc" right="Jun 2025 – Aug 2026" />
        <CBul>
          Built 4 REST APIs in <M k="python">Python</M> serving
          40K requests/day; cut p95 latency 30%
        </CBul>
        <CBul>
          Deployed on AWS through a CI/CD{" "}
          pipeline; cut release time 60%
        </CBul>
        <CBul>
          <M k="own">Owned a team metrics dashboard end to end, spec to production</M>;
          12 engineers use it weekly
        </CBul>

        <CRow left="Freelance Web Developer, Self-employed" right="2024 – 2026" />
        <CBul>Shipped 6 production sites; automated AWS deploys with zero downtime</CBul>
        <CBul>Maintained tested, reviewed code across 6 client stacks; zero shipped regressions</CBul>
        <CBul>Cut average page load 45% by profiling and rewriting render paths</CBul>

        <CRow left="Course Grader, CSCI 201 Software Development" right="Aug 2025 – May 2026" />
        <CBul>Graded 300+ assignments per semester with 48-hour turnaround for 80 students</CBul>

        <CSec title="Projects" />
        <CRow left="TrojanMarket, open-source campus marketplace" right="2025" />
        <CBul>
          Built with React, <M k="python">Python</M>, and SQL; grew to 800
          student users in one semester
        </CBul>
        <CBul>
          Shipped auth, listings search, and checkout on AWS;
          99.9% uptime
        </CBul>

        <CSec title="Leadership" />
        <CRow left="Projects Lead, USC Coding Club" right="2025 – Present" />
        <CBul>Run weekly build nights for 40 members; shipped 5 member projects to production</CBul>

        <CSec title="Skills" />
        <p className="mt-0.5 text-[7px] leading-[1.6] text-muted">
          <M k="python">Python</M>, REST APIs,{" "}
          AWS, CI/CD,{" "}
          <M k="distributed">distributed systems</M>, SQL, React, TypeScript,
          Git, Docker
        </p>

        <p className="mt-auto pt-1.5 text-center font-mono text-[6.5px] uppercase tracking-[0.1em] text-faint">
          Page 1 of 1
        </p>
      </div>
    </Paper>
  );
}

/* The mechanism, made visible: which bank entries were picked for this JD. */
export function BankStrip() {
  const entries = [
    { org: "Acme Inc", picked: true },
    { org: "Freelance", picked: true },
    { org: "TrojanMarket", picked: true },
    { org: "Robotics Club", picked: false },
    { org: "Teaching Assistant", picked: false },
    { org: "Coffee Shop Lead", picked: false },
  ];
  return (
    <div className="mx-auto mt-10 w-full max-w-[640px] rounded-[14px] border border-border bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
          Everything you have done
        </span>
        <span className="font-mono text-[10px] text-faint">3 of 6 picked for this job</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {entries.map((e) => (
          <span
            key={e.org}
            className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-medium ${
              e.picked
                ? "bg-brand-soft text-brand-ink"
                : "bg-surface-alt text-faint"
            }`}
          >
            {e.picked ? "✓ " : ""}
            {e.org}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ResumeMatchDemo() {
  return (
    <div>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-2">
        <JobDescriptionMockup />
        <ArrowDivider />
        <TailoredResumeMockup />
      </div>
      {/* Legend: one color per requirement, same color on both sides. */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
        {MATCH_LEGEND.map(({ k, label }) => (
          <span
            key={k}
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em] ${MATCH_STYLES[k]}`}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="mt-2.5 text-center font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        Same color, same requirement · asked in the posting, placed in the resume
      </p>
      <BankStrip />
    </div>
  );
}

export function ResumeMockup() {
  return (
    <Frame>
      <div className="mx-auto max-w-[280px] rounded-2xl border border-border bg-white p-5 font-mono">
        <p className="text-sm font-semibold text-ink">John Doe</p>
        <p className="text-[11px] text-faint">Software Engineer</p>
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

/* The receipt (DESIGN.md signature motif 1): one packet, speed as fact.
   The mono timestamp gutter is the machine voice; threads are provenance
   (blue = documents, teal = autofill, coral = outreach). */
const packetLog = [
  { t: "0s", e: "JOB FOUND", thread: "bg-border" },
  { t: "4s", e: "RESUME REWRITTEN", thread: "bg-brand" },
  { t: "7s", e: "FORM FILLED IN, 27 QUESTIONS", thread: "bg-teal" },
  { t: "9s", e: "EMAIL WRITTEN, TO A USC ALUM", thread: "bg-coral" },
];

export function PacketMockup() {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-[20px] border border-border bg-surface text-left">
      <div className="flex items-baseline justify-between border-b border-border px-6 py-4">
        <span className="text-sm font-medium text-ink">
          Software Engineer <span className="font-normal text-muted">· Notion</span>
        </span>
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Application
        </span>
      </div>
      <div className="grid gap-3 px-6 py-5">
        {packetLog.map((row, i) => (
          <div
            key={row.t}
            style={{ animationDelay: `${i * 0.7}s` }}
            className="rq-log-row grid grid-cols-[86px_1fr_auto] items-center gap-4 font-mono text-[12.5px]"
          >
            <span className="text-faint">{row.t}</span>
            <span className="tracking-[0.02em] text-ink">{row.e}</span>
            <span className={`h-0.5 w-5 rounded-full ${row.thread}`} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-6 py-3.5">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-teal-ink">
          Ready for your review
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-faint">9 SECONDS</span>
      </div>
    </div>
  );
}
