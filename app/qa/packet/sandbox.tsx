"use client";

import { useState } from "react";
import { PacketViewer } from "@/components/PacketViewer";
import { DEMO_LIST, DEMO_PACKET } from "@/lib/packet-demo-data";

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
 * The label says "Revisit" rather than "View" or "Open" because the thing it
 * opens is a record of something that already happened. */

function Row({
  item,
  onOpen,
}: {
  item: (typeof DEMO_LIST)[number];
  onOpen?: () => void;
}) {
  const submitted = item.status === "Submitted";
  return (
    <div className="relative rounded-card border border-border bg-surface px-5 pb-12 pt-5 transition-shadow hover:shadow-[0_1px_2px_rgba(18,18,15,0.04),0_12px_28px_-20px_rgba(18,18,15,0.25)]">
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
      </p>

      {/* The little something, bottom right. */}
      <button
        onClick={onOpen}
        disabled={!onOpen}
        title={onOpen ? "See the resume, the posting and every answer" : "Not wired in this sandbox"}
        className="group absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40"
      >
        Revisit
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </button>
    </div>
  );
}

export function PacketSandbox() {
  const [open, setOpen] = useState(false);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        Sandbox · not linked, not indexed
      </p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight text-ink">Applications</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Every application carries a Revisit control in its bottom right corner. It opens the packet
        that was sent: the resume on the left, the posting on the right, and every autofilled answer
        underneath.
      </p>

      <div className="mt-8 space-y-3">
        {DEMO_LIST.map((item) => (
          <Row
            key={item.id}
            item={item}
            onOpen={item.id === DEMO_PACKET.id ? () => setOpen(true) : undefined}
          />
        ))}
      </div>

      {open && <PacketViewer packet={DEMO_PACKET} onClose={() => setOpen(false)} />}
    </main>
  );
}
