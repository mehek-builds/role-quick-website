/* The five beta quotes, which also ship on the Chrome Web Store listing
   (store-assets-v2/src/shot-6-voices.html, carousel position 2).

   Provenance, and the reason none of this is dressed up: these are real
   statements from real users, relayed by Mehek, paraphrased with her on
   2026-07-16 so they read naturally, and the quoted people confirmed they
   were OK being used. Fabricated or composite testimonials were explicitly
   ruled out at the time, and every line here traces to a real person. They
   are completely anonymized, which is her standing call on this set. Do not
   add names, roles, schools, photos, or outcome numbers to this component
   without a new source for them.

   RESTORED 2026-07-30, on Mehek's call: the four supporting quotes are back
   after being cut on 2026-07-28, so the site now carries the same five as the
   store listing. The cut was made on the argument that three of them ("just
   fast, start to finish", "actually feels easy now", "the repetitive stuff is
   just gone") make the same unfalsifiable speed claim in different words, so
   the grid added length without adding evidence. That argument is recorded
   here rather than acted on: Mehek asked for more quotes. The lead is still
   the only one carrying a number a reader can weigh, which is why it stays
   first and stays the largest thing in the section.

   The per-quote "ANONYMOUS" footer came off the same day, also on her call.
   It costs nothing: the eyebrow "What testers said" already says whose words
   these are, so the attribution is made once for the set instead of five
   times, and the store listing does the same with "FROM THE LITOS BETA
   GROUP". Dropping the label is NOT permission to attach names later. */

/* The lead. Kept apart from the rest because it is the only quote with a
   number in it, so it is the only one a reader can test. */
const LEAD = {
  head: "Ten applications in an hour.",
  tail: "Just tailoring my resume used to take me that long for one role.",
};

/* From the paraphrased set on the store listing. If these are ever reworded
   again, reword them there too, or two public surfaces start telling slightly
   different stories about the same four people.

   CORRECTED 2026-07-30: the first quote said "actual informational
   interviews". Mehek, who relayed these, says the tester actually said
   "coffee chats", so the paraphrase had drifted from the person's own words.
   Now it is what they said. The store listing shot still carries the old
   wording and needs the same fix; see the note in the vault at
   1-ventures/products/student-outreach/rolequick-store-listing-v2-2026-07-16.md.
   This is the direction to correct in generally: the tester's own plain word
   beat the professional-sounding one we had substituted for it. */
const SUPPORTING = [
  "I finally have time for actual coffee chats instead of typing the same answers into every single form.",
  "Honestly the whole thing is just fast, start to finish.",
  "All the repetitive stuff is just gone.",
  "Job hunting actually feels easy now.",
];

export function Voices() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid grid-cols-1 items-center gap-10 sm:grid-cols-[minmax(0,360px)_minmax(0,1fr)] sm:gap-14">
        {/* One heading, not three. This carried an eyebrow ("What testers
            said"), a headline ("In their words.") and a subhead ("Real words
            from the people who tested it.") over a single quote: the same
            sentence in three type sizes. The eyebrow survives because it is
            the one that says WHOSE words these are, which is the whole claim,
            and now that the per-quote labels are gone it is the only thing on
            the page that says it. */}
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
            What testers said
          </p>
          <h2 className="mt-3 text-section font-[450] leading-[1.1] tracking-[-0.02em] text-ink">
            In their words.
          </h2>
        </div>

        <blockquote className="rq-glass px-7 py-8 sm:px-9 sm:py-9">
          <p className="font-mono text-[26px] leading-none text-border" aria-hidden>
            &ldquo;
          </p>
          {/* 26px, down from the 32px text-section token, 2026-07-30. Still
              the largest thing in the section, no longer the size of a page
              title. */}
          <p className="mt-3 text-[26px] font-[550] leading-[1.3] tracking-[-0.015em] text-ink">
            {LEAD.head}{" "}
            <span className="text-brand-ink">{LEAD.tail}</span>
          </p>
        </blockquote>
      </div>

      {/* The other four at body scale, so the lead keeps the hierarchy. Two
          columns and not four: across four, the coffee-chats quote (the long
          one) wraps to five lines beside one-line neighbours. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2">
        {SUPPORTING.map((quote) => (
          <blockquote key={quote} className="rq-glass px-6 py-5">
            <p className="text-[15px] leading-7 text-muted">
              &ldquo;{quote}&rdquo;
            </p>
          </blockquote>
        ))}
      </div>
    </div>
  );
}
