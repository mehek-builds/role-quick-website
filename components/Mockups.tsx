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
          Hi Priya — saw you lead recruiting for the SWE team at Acme, and
          noticed we&apos;re both USC alums. I just wrapped a summer building
          a full-stack analytics tool and the team&apos;s roadmap looks like
          a great fit...
        </p>
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
