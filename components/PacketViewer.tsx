"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Packet, PacketFieldKind } from "@/lib/packet-demo-data";

/* THE PACKET VIEWER: reopening an application you already sent.
 *
 * The problem it answers is the one every autofill product has and none of them
 * show: once the form is submitted, the applicant has no idea what was said on
 * their behalf. The dashboard could list "Applied to Notion" forever and still
 * leave the person unable to answer "what resume did they get, and what did I
 * supposedly write in the essay box".
 *
 * So this is a RECEIPT, not an editor. Everything is read-only, and every answer
 * carries where it came from. Two consequences that are deliberate:
 *
 *   - the resume is pinned on the left while the posting scrolls on the right,
 *     because the only useful way to read a tailored resume is against the
 *     posting it was tailored to, and
 *   - the questions sit BELOW the posting rather than behind a tab. A tab lets a
 *     person leave without ever seeing what was answered for them, which is the
 *     exact thing they came to check.
 *
 * The props are the contract the dashboard will fill from a real packet. Nothing
 * in here reaches for data the API does not already return.
 */

const KIND_LABEL: Record<PacketFieldKind, string> = {
  text: "Typed",
  select: "Chosen",
  file: "Attached",
  essay: "Written",
  declined: "Declined",
};

function KindChip({ kind }: { kind: PacketFieldKind }) {
  /* Declined is the only one that is not teal. The autofill pillar is teal
     across the site, and a question Litos refused to answer is not autofill: it
     is the guardrail, and it should not read as another filled box. */
  const tone =
    kind === "declined"
      ? "border-border bg-surface-alt text-faint"
      : "border-teal/30 bg-teal-soft/60 text-teal-ink";
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${tone}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function SectionHeading({ id, eyebrow, title, note }: { id: string; eyebrow: string; title: string; note?: string }) {
  return (
    <div id={id} className="scroll-mt-4">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{eyebrow}</p>
      <h3 className="mt-1.5 text-[15px] font-medium tracking-tight text-ink">{title}</h3>
      {note && <p className="mt-1 text-[12px] leading-5 text-muted">{note}</p>}
    </div>
  );
}

/* The resume as paper, not as data. White ground, serif-free, one page, which is
   the same shape the /start build screen and the dashboard preview render, so a
   person recognises the file they already saw rather than a summary of it.
   BLACK AND WHITE ONLY: hard rule across every surface that shows a resume. */
function ResumePaper({ resume }: { resume: Packet["resume"] }) {
  return (
    <div className="rounded-inner border border-border bg-white px-6 py-6 text-[10.5px] leading-[1.5] text-black shadow-[0_1px_2px_rgba(18,18,15,0.04)]">
      <p className="text-[15px] font-semibold tracking-tight">{resume.name}</p>
      <p className="mt-1 text-[9px] text-neutral-600">{resume.contact}</p>
      {resume.sections.map((section) => (
        <div key={section.title} className="mt-4">
          <p className="border-b border-neutral-300 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
            {section.title}
          </p>
          {section.entries.map((entry) => (
            <div key={entry.heading} className="mt-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[11px] font-semibold">{entry.heading}</p>
                <p className="shrink-0 text-[9px] text-neutral-600">{entry.meta}</p>
              </div>
              <ul className="mt-1 space-y-1">
                {entry.bullets.map((bullet) => (
                  <li key={bullet} className="grid grid-cols-[10px_1fr] gap-1">
                    <span aria-hidden="true">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      <div className="mt-4">
        <p className="border-b border-neutral-300 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
          Skills
        </p>
        <p className="mt-2">{resume.skills.join(" · ")}</p>
      </div>
    </div>
  );
}

export function PacketViewer({ packet, onClose }: { packet: Packet; onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("packet-jd");

  const questionCount = packet.questions.reduce((n, group) => n + group.items.length, 0);

  /* Escape closes, the page behind does not scroll, and focus goes to the close
     button on open and back to the trigger on unmount. A modal that traps a
     keyboard user is worse than no modal. */
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  /* The rail tracks the scroll rather than only driving it, so it reports where
     the reader is instead of where they last clicked. */
  const onScroll = useCallback(() => {
    const box = scroller.current;
    if (!box) return;
    const marks = ["packet-resume", "packet-jd", "packet-questions", "packet-email"];
    let current = marks[0];
    for (const id of marks) {
      const node = document.getElementById(id);
      if (node && node.getBoundingClientRect().top - box.getBoundingClientRect().top <= 24) current = id;
    }
    setActive(current);
  }, []);

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Resume is in the rail even though it is pinned beside the reader on
     desktop, because the mobile layout stacks all four and the resume is then
     just the section furthest from wherever you are. */
  const RAIL = [
    { id: "packet-resume", label: "Resume" },
    { id: "packet-jd", label: "Job description" },
    { id: "packet-questions", label: `Questions · ${questionCount}` },
    { id: "packet-email", label: "Email" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* The scrim is a button so a pointer user can dismiss by clicking out,
          and aria-hidden because the Escape handler above is the keyboard path. */}
      <button
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Application packet: ${packet.role} at ${packet.company}`}
        className="relative flex h-full max-h-[92svh] w-full max-w-6xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-[0_1px_2px_rgba(18,18,15,0.04),0_40px_80px_-32px_rgba(18,18,15,0.35)]"
      >
        {/* Header: what this packet is, and when it went out. */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
              {packet.company} · {packet.location}
            </p>
            <h2 className="mt-1 truncate text-lg font-medium tracking-tight text-ink">{packet.role}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
              <span className="rounded-full border border-teal/30 bg-teal-soft/60 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-teal-ink">
                {packet.status}
              </span>
              <span>{packet.appliedAt}</span>
              <span className="text-faint">·</span>
              <a
                href={`https://${packet.postingUrl}`}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-[10px] text-brand-ink underline-offset-2 hover:underline"
              >
                {packet.postingUrl}
              </a>
            </p>
          </div>
          <button
            ref={closeButton}
            onClick={onClose}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Close
          </button>
        </div>

        {/* The rail. Three marks, because there are three things in a packet and
            naming them up front is what tells a reader the questions are down
            there at all. */}
        {/* One row that scrolls sideways rather than a row that wraps: wrapped
            to two lines on a phone it was taking a fifth of the dialog to say
            what is below, which is height the packet itself needs. */}
        <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 sm:px-5">
          {RAIL.map((mark) => (
            <button
              key={mark.id}
              onClick={() => jump(mark.id)}
              aria-current={active === mark.id}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active === mark.id ? "bg-brand-soft text-brand-ink" : "text-faint hover:bg-surface-alt hover:text-muted"
              }`}
            >
              {mark.label}
            </button>
          ))}
        </div>

        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] sm:p-6">
            {/* LEFT: the resume, pinned. It is one page by contract, so it fits
                the pane without a second scrollbar. */}
            <div className="lg:sticky lg:top-0 lg:self-start">
              <SectionHeading
                id="packet-resume"
                eyebrow="01 · Resume"
                title="The resume they received"
                note={packet.resume.filename}
              />
              <div className="mt-3">
                <ResumePaper resume={packet.resume} />
              </div>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                Written for this posting · not reused
              </p>
            </div>

            {/* RIGHT: the posting, then the answers, then the email. */}
            <div className="space-y-8">
              <div>
                <SectionHeading
                  id="packet-jd"
                  eyebrow="02 · Job description"
                  title="The posting it was written against"
                  note={packet.jd.posted}
                />
                <div className="mt-3 space-y-4 rounded-inner border border-border bg-surface-alt/50 px-5 py-5">
                  {packet.jd.blocks.map((block) => (
                    <div key={block.heading}>
                      <p className="text-[12px] font-semibold text-ink">{block.heading}</p>
                      {block.body && <p className="mt-1.5 text-[12px] leading-6 text-muted">{block.body}</p>}
                      {block.bullets && (
                        <ul className="mt-1.5 space-y-1.5">
                          {block.bullets.map((bullet) => (
                            <li key={bullet} className="grid grid-cols-[12px_1fr] gap-1.5 text-[12px] leading-6 text-muted">
                              <span aria-hidden="true" className="text-faint">
                                •
                              </span>
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <SectionHeading
                  id="packet-questions"
                  eyebrow="03 · Autofill"
                  title={`Every question, and what was answered`}
                  note="Read-only. This is the record of what the employer received."
                />
                <div className="mt-3 space-y-5">
                  {packet.questions.map((group) => (
                    <div key={group.group}>
                      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                        {group.group}
                      </p>
                      <div className="mt-2 divide-y divide-border overflow-hidden rounded-inner border border-border">
                        {group.items.map((item) => (
                          <div key={item.q} className="bg-surface px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 text-[12px] font-medium leading-5 text-ink">{item.q}</p>
                              <KindChip kind={item.kind ?? "text"} />
                            </div>
                            <p
                              className={`mt-1.5 text-[12px] leading-6 ${
                                item.kind === "declined" ? "text-faint" : "text-muted"
                              }`}
                            >
                              {item.a}
                            </p>
                            <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                              {item.source}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <SectionHeading
                  id="packet-email"
                  eyebrow="04 · Outreach"
                  title="The email left in your Gmail"
                  note={packet.email.state}
                />
                <div className="mt-3 rounded-inner border border-coral/30 bg-coral-soft/40 px-5 py-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-coral-ink">
                    To · {packet.email.to}
                  </p>
                  <p className="mt-2 text-[12px] font-semibold text-ink">{packet.email.subject}</p>
                  <p className="mt-2 text-[12px] leading-6 text-muted">{packet.email.body}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
