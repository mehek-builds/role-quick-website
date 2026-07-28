import captures from "@/lib/captures.json";
import { InstallLink } from "@/components/InstallLink";

/* The fold: the tailored resume beside the posting it was built from, at full
   size, bleeding off the right edge.
 *
 * Two drafts died to get here and both died the same way.
 *
 * Draft 1 cross-faded four screenshots behind a four-box step rail. Draft 2
 * built a drawn Chrome window with a greeked posting and docked the real
 * extension popup under a toolbar icon. Twenty-five critics, each trained on a
 * different product hero, scored draft 2 a mean 3.0 out of 10, and they
 * converged on a charge neither draft had answered: the hero was photographing
 * the wrong moment. `hero-1-job` shows "2 drafts ready", "Current job", "Fill
 * this form", "Review" — five affordances and zero output, under a subhead
 * promising a resume, a form and an email. No amount of relighting or animating
 * turns a picture of a launcher menu into evidence, because there is no outcome
 * inside it to reveal.
 *
 * This frame has the outcome. It also has the thing no competitor can
 * screenshot: an explicit refusal. "This posting asks for 1 thing your resume
 * does not mention" with a single Node.js chip. Every rival ships an AI that
 * says it nailed it; Litos is the only one that photographs what it could not
 * do, and candour is the currency this brand already chose.
 *
 * Mehek's ruling 2026-07-28 on the colour in this frame: the black-and-white
 * resume rule governs the resume DOCUMENT. The blue/orange/green match
 * highlights are dashboard chrome laid over it, and they are the evidence of
 * tailoring, so they stay.
 *
 * What was deleted, and why deleting was the fix
 * ----------------------------------------------
 * The drawn window, the eleven greeked bars, the empty address bar and the
 * two-sentence honesty note are all gone. Every one of them existed to stage a
 * screenshot that is no longer here. The greek in particular was actively
 * harmful: eleven identical 8px bars at 7% opacity is the universal idiom for
 * CONTENT HAS NOT LOADED, sitting under a headline that says "Apply in
 * seconds." And the note disclaimed furniture that is no longer drawn — the
 * labelling rule only ever covered re-creations of Litos's OWN interface, so
 * that footnote was self-inflicted.
 *
 * Deleting the room took the product from roughly 10% of the fold to most of
 * it, which was the single most-repeated charge across all 25 critics.
 *
 * Why it is not scaled to fit
 * ---------------------------
 * The capture is 1104 CSS px wide and it is rendered at 1104 CSS px. The column
 * is narrower than that on purpose, so the frame runs off the right edge rather
 * than shrinking. Every hero in the study that reads as real refuses to fit:
 * Linear runs its frame off the right, Attio past the bottom fold, Grammarly
 * and Simplify crop to one widget. Shrinking a window to fit is what puts 13px
 * type under 11px and turns a screenshot into decoration.
 *
 * Server-rendered, no hydration gate, no entrance animation. The previous draft
 * held the whole stage at opacity 0 behind a 260ms timer, so the LCP element
 * was invisible without JS. */

type Shot = { w: number; h: number; src: string; alt?: string };
/* hero-band, not hero-2-review: the same review surface cut to 516px instead
   of 620px. The taller frame only cleared about 300px of a 900px fold, so a
   third of the hero was product and two thirds was copy — the most-repeated
   charge across 25 critics. The band drops the whitespace under the columns and
   keeps every element that carries a claim: the 86 match ring, the three-swatch
   legend, the posting with its requirements lit, the "1 thing your resume does
   not mention" refusal with its Node.js chip, and both tailored bullets with
   their highlights. Nothing that argues anything was cut. */
const SHOT = (captures as Record<string, Shot>)["hero-band"];

/* Fills on five, submits on three. The previous card said "Works on:
   Greenhouse, Lever, Ashby, Workday and LinkedIn", which collapsed those two
   verbs into one while sitting inches from a Fill-this-form button — an
   overclaim in the one slot reserved for candour. It was also hidden below lg,
   so the answer to the first question every visitor asks was display:none on
   the widths most job seekers arrive on. */
const COVERAGE = [
  ["Fills", "Greenhouse, Lever, Ashby, Workday, LinkedIn"],
  ["Submits", "Greenhouse, Lever, Ashby"],
] as const;

export function HeroScene() {
  if (!SHOT) return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6">
      {/* Copy, then the artifact, then the detail.
       *
       * The claim and the coverage rows used to sit BETWEEN the CTA and the
       * picture, which pushed the product to y=603 of a 900px fold — a third of
       * the hero was product and two thirds was copy, the single most-repeated
       * charge across 25 critics. The claim is now a callout ON the frame,
       * which is Cal AI's move (the payoff number belongs outside the UI, in
       * type larger than anything inside it), and the coverage detail moves
       * below the artifact where it answers a question the visitor has already
       * started asking. */}
      <div className="mx-auto max-w-[680px] text-center">
        <p className="font-mono text-label uppercase tracking-[0.08em] text-muted">
          Free Chrome extension for job seekers
        </p>
        <h1 className="mt-3 text-display font-[450] text-ink">
          Apply <span className="text-brand-ink">in seconds.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[460px] text-body text-muted">
          Nothing is reused. Every job gets its own resume, form, and email.
        </p>

        <div className="mt-6 flex flex-col items-center gap-2.5">
          <InstallLink
            source="hero"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-body font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
          >
            Add to Chrome, it&apos;s free
          </InstallLink>
          <p className="text-small text-faint">
            Desktop Chrome and Edge.{" "}
            <a
              href="/try"
              data-inline-link
              className="underline decoration-border underline-offset-2 hover:text-ink"
            >
              Try it free, no account needed
            </a>
            .
          </p>
        </div>
      </div>

      <div className="relative mt-9">
        {/* Runs off the bottom of the viewport. Anchored left below xl so the
            crop cuts ONE edge and every line still begins properly. */}
        <div className="flex justify-start overflow-hidden xl:justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SHOT.src}
            alt={SHOT.alt ?? ""}
            width={SHOT.w}
            height={SHOT.h}
            style={{ width: SHOT.w }}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="block max-w-none rounded-card border border-border bg-surface shadow-overlay"
          />
        </div>

        {/* The claim, as a callout breaking the frame's top edge, centred over
            the empty middle of the header row so it occludes nothing. Set
            larger than any type inside the screenshot, because a number that
            matters does not belong buried in the UI. "<" is a real glyph rather
            than the word "under": the machine voice is where this brand puts
            its numbers, and a ceiling is the honest shape of the promise. */}
        <div className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded-card border border-border bg-surface px-5 py-3 text-center shadow-overlay sm:block">
          <p className="text-section font-[450] leading-none text-ink">
            <span className="font-mono text-muted">&lt;</span>&thinsp;30 seconds
          </p>
          <p className="mt-1.5 font-mono text-label uppercase tracking-[0.08em] text-faint">
            Job found → ready to send
          </p>
        </div>
      </div>

      <dl className="mx-auto mt-8 flex max-w-[720px] flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:justify-center sm:gap-10">
        {COVERAGE.map(([verb, sites]) => (
          <div key={verb} className="flex gap-2.5 text-small">
            <dt className="shrink-0 font-mono text-label uppercase tracking-[0.08em] text-faint">
              {verb}
            </dt>
            <dd className="text-muted">{sites}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
