/* The five beta quotes that already ship on the Chrome Web Store listing
   (store-assets-v2/src/shot-6-voices.html, carousel position 2).

   Provenance, and the reason none of this is dressed up: these are real
   statements from real users, relayed by Mehek, paraphrased with her on
   2026-07-16 so they read naturally, and the quoted people confirmed they
   were OK being used. They are completely anonymized, which is her standing
   call on this set. Each one reads as its own review rather than as a batch
   from one group. Do not add names, roles, schools, photos, or outcome
   numbers to this component without a new source for them. */
const LEAD = {
  head: "Ten applications in an hour.",
  tail: "Just tailoring my resume used to take me that long for one role.",
};

const QUOTES = [
  "I finally have time for actual informational interviews instead of typing the same answers into every single form.",
  "Honestly the whole thing is just fast, start to finish.",
  "Job hunting actually feels easy now.",
  "All the repetitive stuff is just gone.",
];

export function Voices() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid grid-cols-1 items-center gap-10 sm:grid-cols-[minmax(0,360px)_minmax(0,1fr)] sm:gap-14">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
            What testers said
          </p>
          <h2 className="mt-3 text-section font-[450] leading-[1.1] tracking-[-0.02em] text-ink">
            In their words.
          </h2>
          <p className="mt-3 text-base leading-7 text-muted">
            Real words from the people who tested it.
          </p>
        </div>

        <blockquote className="rq-glass px-7 py-8 sm:px-9 sm:py-9">
          <p className="font-mono text-section leading-none text-border" aria-hidden>
            &ldquo;
          </p>
          <p className="mt-3 text-section font-[550] leading-[1.35] tracking-[-0.015em] text-ink sm:text-section">
            {LEAD.head}{" "}
            <span className="text-brand-ink">{LEAD.tail}</span>
          </p>
          <footer className="mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Anonymous
          </footer>
        </blockquote>
      </div>

      {/* 2x2, not 3-up: with three columns the fourth quote left a bare cell
          in the corner, which read as a missing card rather than a choice. */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:grid-cols-2">
        {QUOTES.map((q) => (
          <blockquote
            key={q}
            className="rq-glass flex flex-col px-6 py-6"
          >
            <p className="flex-1 text-base leading-[1.55] text-ink">
              &ldquo;{q}&rdquo;
            </p>
            <footer className="mt-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              Anonymous
            </footer>
          </blockquote>
        ))}
      </div>
    </div>
  );
}
