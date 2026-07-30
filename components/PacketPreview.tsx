import { DEMO_PACKET } from "@/lib/packet-demo-data";

/* The packet, standing still, for a column beside a form.
 *
 * PacketViewer is a modal with a scroll container, a rail that tracks position
 * and a focus trap. None of that can go in the /login aside, which is
 * aria-hidden decoration: anything focusable inside an aria-hidden subtree is a
 * control a keyboard user can reach and a screen reader will not announce. So
 * this is the same surface rendered as a picture of itself, with NO buttons, NO
 * links and NO state. It carries no "use client" of its own; /login is a client
 * component, so this renders inside that tree, and having no hooks or handlers
 * is what keeps it from adding anything to the work that tree does.
 *
 * It is a mockup component, which is what the imagery law asks for (DESIGN.md:
 * real product UI only, the mockup components). It replaces the extension
 * capture rather than joining it, by the same law's one-visual-per-section rule.
 *
 * PORTRAIT, not the viewer's two columns. The aside is a 46% column, and the
 * resume-left/posting-right split needs width the column does not have. What
 * survives the narrowing is the part a person signing in needs to understand:
 * this is your resume, and these are the answers that went with it. The posting
 * is represented by the header line naming the company, not by a pane of prose
 * that would be unreadable at this width anyway.
 *
 * Clipped at the bottom with a fade rather than shrunk to fit. A packet is
 * longer than a column, and showing it running past the edge says so; scaling
 * it down until it fits would just make every line too small to read. */

const PACKET = DEMO_PACKET;

/* Six, which is more than fits. That is the point: the packet has to OVERRUN the
   height cap for the bottom fade to be telling the truth. At three questions the
   card came in under the cap on a normal laptop, nothing clipped, and the fade
   sat over a row that was fully present and merely washed it out. A fade must
   cover a cut or not exist. */
const SHOWN_QUESTIONS = PACKET.questions.flatMap((group) => group.items).slice(0, 6);

const RAIL = ["Resume", "Job description", `Questions · ${PACKET.questions.reduce((n, g) => n + g.items.length, 0)}`];

export function PacketPreview() {
  return (
    <div className="relative w-full max-h-[62svh] overflow-hidden rounded-card border border-border bg-surface">
      {/* The fade that makes the clip deliberate. Without it the packet ends on
          a hard horizontal cut that reads as a broken layout rather than as a
          document continuing past the edge. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface to-transparent"
      />
      {/* Header, the viewer's own. */}
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
          {PACKET.company} · {PACKET.location}
        </p>
        <p className="mt-1 truncate text-[15px] font-medium tracking-tight text-ink">{PACKET.role}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted">
          <span className="rounded-full border border-teal/30 bg-teal-soft/60 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-teal-ink">
            {PACKET.status}
          </span>
          <span>Sent {PACKET.sentAt}</span>
        </p>
      </div>

      {/* The rail, as marks rather than controls. */}
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {RAIL.map((label, index) => (
          <span
            key={label}
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${
              index === 0 ? "bg-brand-soft text-brand-ink" : "text-faint"
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="space-y-4 p-4">
        {/* The resume, black and white, as everywhere else. */}
        <div className="rounded-inner border border-border bg-white px-4 py-4 text-[9px] leading-[1.5] text-black">
          <p className="text-[12px] font-semibold tracking-tight">{PACKET.resume.name}</p>
          <p className="mt-0.5 text-[8px] text-neutral-600">{PACKET.resume.contact}</p>
          {PACKET.resume.sections.slice(0, 1).map((section) => (
            <div key={section.title} className="mt-3">
              <p className="border-b border-neutral-300 pb-1 font-mono text-[8px] font-semibold uppercase tracking-[0.1em]">
                {section.title}
              </p>
              {section.entries.map((entry) => (
                <div key={entry.heading} className="mt-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-[9.5px] font-semibold">{entry.heading}</p>
                    <p className="shrink-0 text-[8px] text-neutral-600">{entry.meta}</p>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {entry.bullets.map((bullet) => (
                      <li key={bullet} className="grid grid-cols-[8px_1fr] gap-1">
                        <span aria-hidden="true">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* The answers. The reason a person would reopen a packet at all. */}
        <div>
          <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
            Every question, and what was answered
          </p>
          <div className="mt-2 divide-y divide-border overflow-hidden rounded-inner border border-border">
            {SHOWN_QUESTIONS.map((item) => (
              <div key={item.q} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[10px] font-medium text-ink">{item.q}</p>
                  <span className="shrink-0 rounded-full border border-teal/30 bg-teal-soft/60 px-1.5 py-0.5 font-mono text-[8px] font-medium uppercase tracking-[0.08em] text-teal-ink">
                    Typed
                  </span>
                </div>
                <p className="mt-1 truncate text-[10px] text-muted">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
