"use client";

import { useState } from "react";

/* Interactive outreach demo: pick a contact, see their customized draft.
   Every draft is grounded in the same resume facts but angled to the
   persona. The LinkedIn-only contact shows the honest no-email state —
   we never guess an address (Guardrails, made visible). */

type Contact = {
  id: string;
  name: string;
  role: string;
  tier: "Verified" | "Likely" | "LinkedIn";
  alum?: boolean;
  email: string | null;
  subject?: string;
  body?: string;
};

const CONTACTS: Contact[] = [
  {
    id: "priya",
    name: "Priya Nair",
    role: "SWE Recruiter · USC '22",
    tier: "Verified",
    alum: true,
    email: "priya.nair@northline.com",
    subject: "USC senior, just applied to SWE intern",
    body: "Hi Priya, fellow Trojan here. I just applied to the SWE intern role and wanted to reach out beyond the pile. Last summer I built REST APIs at Acme serving 40K requests a day, and Northline's platform work looks like that at real scale. Open to a 15-minute chat?",
  },
  {
    id: "daniel",
    name: "Daniel Cho",
    role: "Eng Manager, Platform",
    tier: "Verified",
    email: "daniel.cho@northline.com",
    subject: "Quick question about the platform team",
    body: "Hi Daniel, I applied to the SWE intern role this morning. Last summer I built REST APIs handling 40K requests a day and learned the hard way what breaks at scale. What would an intern actually own on your team? One email, I promise.",
  },
  {
    id: "sam",
    name: "Sam Alvarez",
    role: "Head of Talent",
    tier: "Likely",
    email: "sam.alvarez@northline.com",
    subject: "SWE intern application, quick hello",
    body: "Hi Sam, I applied to the SWE intern opening today. One thing that didn't fit the form: I've shipped production work for six freelance clients while carrying a full course load. If the pipeline is deep this cycle, I'd love to know what stands out.",
  },
  {
    id: "rina",
    name: "Rina Okafor",
    role: "Team Lead, Infra",
    tier: "LinkedIn",
    email: null,
  },
];

const TIER_STYLES: Record<Contact["tier"], string> = {
  Verified: "bg-positive-soft text-positive",
  Likely: "bg-warn-soft text-warn",
  LinkedIn: "bg-brand-soft text-brand-ink",
};

export function OutreachDemo() {
  const [selectedId, setSelectedId] = useState("priya");
  const selected = CONTACTS.find((c) => c.id === selectedId)!;

  return (
    <div className="space-y-4">
      {/* Contact list */}
      <div className="rounded-[20px] border border-border bg-surface p-2 shadow-[0_1px_2px_rgba(18,18,15,0.04),0_12px_32px_-16px_rgba(18,18,15,0.12)]">
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              Hiring team · Northline
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
              4 found · pick one
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {CONTACTS.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-left transition-colors ${
                    active
                      ? "border-coral/50 bg-coral-soft/60"
                      : "border-border hover:bg-surface-alt"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-xs font-medium text-muted">
                      {c.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                      <span className="block truncate text-xs text-muted">{c.role}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {c.alum && (
                      <span className="rounded-full bg-coral-soft px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] text-coral-ink">
                        Alum
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] ${TIER_STYLES[c.tier]}`}
                    >
                      {c.tier}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* The draft, customized to the selected contact */}
      <div className="rounded-[20px] border border-border bg-surface p-2 shadow-[0_1px_2px_rgba(18,18,15,0.04),0_12px_32px_-16px_rgba(18,18,15,0.12)]">
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </div>
        <div key={selected.id} className="rq-fade rounded-2xl border border-border bg-white p-5">
          {selected.email ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                  New message · Gmail
                </p>
                <span className="shrink-0 rounded-full bg-coral-soft px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] text-coral-ink">
                  Draft · not sent
                </span>
              </div>
              <div className="mt-4 space-y-2.5 text-[12.5px]">
                <div className="flex gap-2 border-b border-border pb-2.5">
                  <span className="text-faint">To</span>
                  <span className="truncate text-ink">
                    {selected.name} &lt;{selected.email}&gt;
                  </span>
                </div>
                <div className="flex gap-2 border-b border-border pb-2.5">
                  <span className="text-faint">Subject</span>
                  <span className="text-ink">{selected.subject}</span>
                </div>
                <p className="pt-1 leading-6 text-muted">
                  {selected.body}
                  <br />
                  <span className="text-ink">— Alex</span>
                </p>
              </div>
              <p className="mt-3 border-t border-border pt-3 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                Waiting in your drafts
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                  No draft for {selected.name.split(" ")[0]}
                </p>
                <span className="shrink-0 rounded-full bg-surface-alt px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] text-muted">
                  No verified email
                </span>
              </div>
              <p className="mt-4 text-[13px] leading-6 text-muted">
                We couldn&apos;t verify an address for Rina, and we never guess
                one. A wrong guess bounces, and bounces hurt you. Her LinkedIn
                profile is one click away instead.
              </p>
              <span className="mt-4 inline-block rounded-full border border-border px-4 py-2 text-[12.5px] font-medium text-ink">
                Open LinkedIn profile ↗
              </span>
              <p className="mt-4 border-t border-border pt-3 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                Guessed addresses: zero
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
