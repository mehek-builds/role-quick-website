/* The lead beta quote, which also ships on the Chrome Web Store listing
   (store-assets-v2/src/shot-6-voices.html, carousel position 2).

   Provenance, and the reason none of this is dressed up: these are real
   statements from real users, relayed by Mehek, paraphrased with her on
   2026-07-16 so they read naturally, and the quoted people confirmed they
   were OK being used. They are completely anonymized, which is her standing
   call on this set. Each one reads as its own review rather than as a batch
   from one group. Do not add names, roles, schools, photos, or outcome
   numbers to this component without a new source for them. */
/* The 2x2 grid of four supporting quotes was REMOVED 2026-07-28 in the
   deletion pass. All four were anonymous and three of them ("just fast,
   start to finish", "actually feels easy now", "the repetitive stuff is
   just gone") made the same unfalsifiable speed claim in different words,
   so the grid added length without adding evidence. The lead quote is the
   only one carrying a number, which is the only part a skeptic can weigh.
   The four are preserved in the store listing (store-assets-v2
   src/shot-6-voices.html) if they are ever wanted back. */
const LEAD = {
  head: "Ten applications in an hour.",
  tail: "Just tailoring my resume used to take me that long for one role.",
};

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
    </div>
  );
}
