"use client";

import { useState } from "react";
import { PacketViewer } from "@/components/PacketViewer";
import { DEMO_LIST, DEMO_PACKET, DEMO_PACKET_UNSENT, type Packet } from "@/lib/packet-demo-data";

/* The applications list, carrying the new affordance.
 *
 * THE AFFORDANCE IS ALWAYS VISIBLE, not hover-only. Hover-only would hide the
 * feature from every phone, and the row this sits on is one a person scans down
 * looking for a specific application; something that appears only under the
 * cursor cannot be scanned for. It strengthens on hover and focus rather than
 * appearing.
 *
 * It is a SEPARATE button, not the row itself. In the dashboard the row already
 * opens the review screen, so the packet needs its own target; a button inside a
 * button is also invalid HTML, which is the trap when this gets ported.
 *
 * NO VISIBLE LABEL (Mehek, this round). It was a "Revisit" pill and it competed
 * with the role for the card's attention while saying something the reader can
 * infer from the mark. What is left is a 20px corner-expand glyph pushed into
 * the corner: the same drawing every full-screen and open-in-place control uses,
 * so it is read rather than learned.
 *
 * The words did not disappear, they moved off the canvas: aria-label carries the
 * full sentence for a screen reader, and title surfaces it on hover for everyone
 * else. A tiny icon with no accessible name would be a button that only sighted
 * pointer users can find. */

function Row({
  item,
  onOpen,
}: {
  item: (typeof DEMO_LIST)[number];
  onOpen?: () => void;
}) {
  const submitted = item.status === "Sent";
  return (
    /* pb was 12 to clear a pill that is no longer there. The card gets its
       height back, and the glyph now sits inside the ordinary padding rather
       than in a reserved strip. */
    <div className="relative rounded-card border border-border bg-surface px-5 pb-5 pt-5 transition-shadow hover:shadow-[0_1px_2px_rgba(18,18,15,0.04),0_12px_28px_-20px_rgba(18,18,15,0.25)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{item.role}</p>
          <p className="mt-1 truncate text-xs text-muted">
            {item.company} · {item.location}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${
            submitted
              ? "border-teal/30 bg-teal-soft/60 text-teal-ink"
              : "border-warn/30 bg-warn-soft text-warn"
          }`}
        >
          {item.status}
        </span>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
        {item.when} · {item.questionCount} questions filled
        {!submitted && " · nothing sent yet"}
      </p>

      {/* The little something, bottom right. */}
      <button
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={`See the application sent to ${item.company}: the resume, the posting and every answer`}
        title={onOpen ? "See the application again" : "Not wired in this sandbox"}
        /* 24px is the MARK, not the target. The pseudo-element pushes the hit
           area out to 40px on every side, so the control can be as small as it
           looks without being a thumb-sized miss on a phone. */
        className="after:absolute after:-inset-2 after:content-[''] absolute bottom-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-[7px] text-faint transition-colors hover:bg-brand-soft hover:text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-40"
      >
        {/* Corner-expand: two brackets pushing apart. Drawn on a 12px grid with a
            1.4 stroke so it stays a mark at this size instead of turning into a
            grey smudge, which is what a 16px icon scaled down does. */}
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
          <path
            d="M7 1.5h3.5V5M5 10.5H1.5V7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function PacketSandbox() {
  const [open, setOpen] = useState<Packet | null>(null);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        Sandbox · not linked, not indexed
      </p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight text-ink">Applications</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Every application carries a small mark in its bottom right corner. It opens the packet: the
        resume on the left, the posting on the right, and every autofilled answer underneath. The
        Figma row is the same viewer for an application that has not been sent yet, so the two can
        be compared.
      </p>

      <div className="mt-8 space-y-3">
        {DEMO_LIST.map((item) => {
          const packet =
            item.id === DEMO_PACKET.id ? DEMO_PACKET
            : item.id === DEMO_PACKET_UNSENT.id ? DEMO_PACKET_UNSENT
            : null;
          return (
            <Row key={item.id} item={item} onOpen={packet ? () => setOpen(packet) : undefined} />
          );
        })}
      </div>

      {open && <PacketViewer packet={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
