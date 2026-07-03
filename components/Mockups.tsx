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

const inboxEmails = [
  {
    sender: "LinkedIn",
    subject: "Your application to Software Engineer Intern at Northline was sent",
    snippet: "Northline, your profile was submitted to the hiring team.",
    time: "10:42 AM",
    unread: true,
    starred: false,
    tag: "Sent via Role Quick",
  },
  {
    sender: "Fintra Careers",
    subject: "Thank you for your interest in the Product Analyst role",
    snippet: "We confirm receipt of your application and appreciate the time you invested.",
    time: "10:41 AM",
    unread: true,
    starred: false,
  },
  {
    sender: "Brightpath Health",
    subject: "Thank you for applying to Brightpath!",
    snippet: "You did it! We've received your application for the Marketing Intern role.",
    time: "10:39 AM",
    unread: false,
    starred: true,
  },
  {
    sender: "Ashworth Robotics",
    subject: "Ashworth Robotics: thank you for your application",
    snippet: "Your application is being reviewed by our recruiting team.",
    time: "10:38 AM",
    unread: true,
    starred: false,
    tag: "Sent via Role Quick",
  },
  {
    sender: "Vela",
    subject: "We have received your application",
    snippet: "Thanks for your interest in the Data Science Intern role at Vela.",
    time: "10:35 AM",
    unread: false,
    starred: false,
  },
  {
    sender: "Coreway Talent",
    subject: "Your application to UX Design Intern at Coreway",
    snippet: "Applied, we'll follow up within two weeks.",
    time: "10:29 AM",
    unread: false,
    starred: false,
  },
];

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

      <div className="flex border-t border-[#e8eaed]">
        {/* Left rail */}
        <div className="hidden w-44 shrink-0 py-3 pl-2 pr-1 sm:block">
          <button className="flex items-center gap-3 rounded-2xl bg-[#c2e7ff] px-5 py-3.5 text-sm font-medium text-[#001d35] shadow-sm">
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
              <path d={ICONS.draft} />
            </svg>
            Compose
          </button>
          <div className="mt-2 space-y-0.5 text-sm text-[#202124]">
            <p className="flex items-center gap-3 rounded-r-2xl bg-[#fce8e6] px-4 py-1.5 font-medium text-[#c5221f]">
              <SidebarIcon d={ICONS.inbox} />
              Inbox
            </p>
            <p className="flex items-center gap-3 px-4 py-1.5 text-[#5f6368]">
              <SidebarIcon d={ICONS.star} />
              Starred
            </p>
            <p className="flex items-center gap-3 px-4 py-1.5 text-[#5f6368]">
              <SidebarIcon d={ICONS.clock} />
              Snoozed
            </p>
            <p className="flex items-center gap-3 px-4 py-1.5 text-[#5f6368]">
              <SidebarIcon d={ICONS.send} />
              Sent
            </p>
            <p className="flex items-center gap-3 px-4 py-1.5 text-[#5f6368]">
              <SidebarIcon d={ICONS.draft} />
              Drafts
            </p>
          </div>
        </div>

        {/* Message list */}
        <div className="min-w-0 flex-1 border-l border-[#e8eaed]">
          <div className="flex items-center gap-6 border-b border-[#e8eaed] px-4 pt-2 text-[13px] font-medium text-[#5f6368]">
            <span className="border-b-[3px] border-[#c5221f] pb-2.5 text-[#c5221f]">
              Primary
            </span>
            <span className="pb-2.5 text-[#5f6368]">Promotions</span>
            <span className="pb-2.5 text-[#5f6368]">Social</span>
          </div>
          <div className="flex items-center gap-4 border-b border-[#e8eaed] px-4 py-1.5 text-[#5f6368]">
            <span className="h-[18px] w-[18px] shrink-0 rounded-sm border-2 border-[#5f6368]/40" />
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current">
              <path d="M17.65 6.35A8 8 0 106 17.65 8 8 0 0017.65 6.35zM12 20a8 8 0 118-8h-2a6 6 0 10-1.76 4.24L18 18l-1.41 1.41-3.18-3.18A7.96 7.96 0 0112 20zm1-13h-2v6l4.28 2.54.72-1.21-3-1.78V7z" />
            </svg>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
            <span className="ml-auto hidden text-xs sm:inline">1-6 of 214</span>
          </div>
          {inboxEmails.map((e) => (
            <div
              key={e.subject}
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
