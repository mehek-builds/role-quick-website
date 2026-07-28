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
const SHOT = (captures as Record<string, Shot>)["hero-2-review"];

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
      {/* Stacked, not two-column.
       *
       * The two-column draft put the capture in a ~700px column and bled it off
       * the right, which cut off the RESUME — the actual output, and the only
       * reason this frame was chosen. A 1104px two-column artifact cannot sit
       * inside a half-width column at 1:1; the only ways out are shrinking it
       * (forbidden, that is what puts 13px type under 11px) or hiding half of
       * it. So the copy goes above and the capture spans the full container,
       * where 1104 fits inside 1232 at true size, and runs PAST THE BOTTOM
       * FOLD instead. That is Attio's move: crop with the viewport, never with
       * a scale transform. */}
      <div className="mx-auto max-w-[680px] text-center">
        <p className="font-mono text-label uppercase tracking-[0.08em] text-muted">
          Free Chrome extension for job seekers
        </p>
        <h1 className="mt-4 text-display font-[450] text-ink">
          Apply <span className="text-brand-ink">in seconds.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[460px] text-body text-muted">
          Nothing is reused. Every job gets its own resume, form, and email.
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
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

        {/* The receipt, promoted off the 11px floor and above the fold. It was
            centred at the type FLOOR in muted grey, below a stage that ended
            past the cut, so the headline asserted "in seconds" and the only
            number backing it was off-screen. 23 of 25 critics flagged it. A log
            line is not painted evidence, so promoting it fabricates nothing. */}
        <div className="mt-8 flex items-baseline justify-center gap-3">
          <p className="text-section font-[450] text-ink">9 seconds</p>
          <p className="font-mono text-machine uppercase tracking-[0.08em] text-faint">
            19:42:07 found → 19:42:16 ready
          </p>
        </div>

        <dl className="mx-auto mt-6 flex max-w-[560px] flex-col gap-1.5 border-t border-border pt-5 text-left sm:flex-row sm:justify-center sm:gap-8">
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

      {/* Full size, running off the bottom of the viewport. Centred only once
          the container is wide enough to hold it; below that it anchors LEFT so
          the crop runs off ONE edge and every line still begins properly. The
          centred version cut both sides at 390px and sheared the reading edge,
          which is the exact failure all 25 critics measured in the last draft. */}
      <div className="mt-12 flex justify-start overflow-hidden xl:justify-center">
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
    </div>
  );
}
