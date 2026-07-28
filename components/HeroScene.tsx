import type { CSSProperties } from "react";
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
/* The phone gets the OUTPUT, not the input. The desktop band is 1104px wide;
   anchored left at 390px it showed only the job-description column, so the
   whole phone fold was a picture of the posting and the tailored resume, the
   86 ring and the refusal line were all off-screen. */
const SHOT_MOBILE = (captures as Record<string, Shot>)["hero-band-mobile"];

/* Fills on five, submits on three. The previous card said "Works on:
   Greenhouse, Lever, Ashby, Workday and LinkedIn", which collapsed those two
   verbs into one while sitting inches from a Fill-this-form button — an
   overclaim in the one slot reserved for candour. It was also hidden below lg,
   so the answer to the first question every visitor asks was display:none on
   the widths most job seekers arrive on. */
const COVERAGE = [
  // The verbs carry an object now. "FILLS / Greenhouse, Lever, Ashby..." was
  // two bare verbs against five proper nouns, which reads as a label and a
  // shrug unless you already know what Greenhouse is. The lists and the
  // five/three split are untouched — the split is the honest part.
  ["Fills forms on", "Greenhouse, Lever, Ashby, Workday, LinkedIn"],
  ["Submits on", "Greenhouse, Lever, Ashby"],
] as const;

export function HeroScene() {
  if (!SHOT) return null;

  return (
    <div>
      {/* Left-aligned, three blocks, one rhythm.
       *
       * The centred seven-block stack ran 450px and left the product at a third
       * of the fold; Attio reaches ~67% product with four elements in ~230px.
       * Copy is now a single 560px column at the gutter and the artifact starts
       * ~170px higher. */}
      {/* One copy block, then the artifact full width.
       *
       * The right-hand column is gone. Filling the widest axis was the wrong
       * goal: it created two reading terminals ~550px apart, restated the h1's
       * speed claim in heading type, and on the phone it stacked BETWEEN the
       * install button and the product, pushing the artifact 61% down an 844px
       * fold. Not one of the 24 reachable reference heroes puts a coverage
       * matrix above the fold. The coverage answer is not deleted — it moves to
       * a full-width rail under the artifact, still split, still verbatim. */}
      {/* One grid, one gutter. The copy used to sit in a 1280 container centred
          on the viewport while the artifact was a 1104 frame centred on the
          viewport — two centring systems that agree at no width, so at 1440 the
          h1 started at x=104 and the product at x=168. A 64px offset is the
          worst magnitude available: too large to miss, too small to read as
          intent. Every hero in the study that reads as designed ships exactly
          one gutter, so copy, artifact and rail now share this container and
          snap to the same two vertical lines.
          The gutter drops at 1152, not at sm: 1152 is the first width where the
          1104 container has stopped growing and is already inset 24px by its own
          centring, so px-0 there IS the gutter. Dropping it at sm instead would
          park the h1 at x=0, hard against the viewport, on every width from 640
          to 1104 — trading one misalignment for a worse one. */}
      <div className="mx-auto w-full max-w-[1104px] px-6 min-[1152px]:px-0">
        <div className="max-w-[600px]">
          {/* No eyebrow. It spent the first-read slot on a category the install
              button 300px below already states, and it was the one element that
              disagreed across breakpoints; 11 of 24 reference heroes ship none.
              The element it paid for is the artifact caption further down, which
              answers "what is this" at the moment the eye enters the product. */}
          {/* The fold gets ONE accent, spent once. It used to sit on "in
              seconds" — the largest blue object above the fold, competing with
              the install pill for the same meaning. Blue is action and
              documents (never speed), so it moves to "resume": the document
              pillar and the headline capability. "form" and "email" stay plain
              on purpose; three accents is no accent. */}
          <h1 className="text-display font-[450] text-ink">Apply in seconds.</h1>
          <p className="mt-5 max-w-[460px] text-body text-muted">
            Nothing is reused. Every job gets its own{" "}
            <span className="text-brand-ink">resume</span>, form, and email.
          </p>

          {/* mt-5, not mt-7: the h1 is 64px at every width now that the display
              token no longer resolves into the forbidden 20-64 band, which costs
              the 390-wide fold a second headline line. The 8px comes back here
              rather than from the mt-8 under the CTA — that gap is already only
              8px larger than the caption's gap to the artifact it captions, and
              taking it there would group the caption with the button above it
              instead of the picture below. A uniform 20px rhythm under a heavier
              headline reads as intent; an ambiguous caption reads as a bug. */}
          <div className="mt-5 flex flex-col items-start gap-2.5">
            {/* Hover LIFTS the pill instead of dimming it. The old state was the
                Tailwind default, hover:opacity-90, which faded the one blue
                object on the fold at the exact moment the cursor said "this
                one" — and left the button's computed box-shadow at none while
                the system carried three elevation tokens nobody spent. rest ->
                raised is a token-to-token move, so no new shadow recipe enters
                (DESIGN.md, exactly three). 150ms ease-out is the hover band the
                reference set actually uses; motion-safe keeps it off for
                reduced motion, and the 1px press is the only thing that moves. */}
            <InstallLink
              source="hero"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-body font-medium text-white shadow-rest hover:shadow-raised active:translate-y-px motion-safe:transition-[box-shadow,transform] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0,0,0.2,1)] sm:w-auto"
            >
              Add to Chrome, it&apos;s free
            </InstallLink>
            {/* One decision on the fold. The "Try it free, no account needed"
                link used to close this line, and it was a second call to action
                sitting ~11px under the only blue object above the fold — a grey
                underline competing with the install pill for the single choice
                the hero exists to force, while repeating the word "free" that
                the pill already says. It also fused two unrelated claims,
                platform support and a free trial, into one 13px line.
                The platform half stays: it is the honest limitation, and it is
                the half nobody argued to lose. /try, if the page still wants it,
                belongs below the artifact, outside this component.
                text-muted, not text-faint: faint on white measures ~2.5:1, under
                the 4.5:1 floor, and this 13px line sits under the primary CTA. */}
            <p className="text-small text-muted">Desktop Chrome and Edge.</p>
          </div>

          {/* The only place in the DOM that names the headline capability with a
              verb. "YOUR RESUME FOR THIS JOB" exists solely as 11px mono inside
              the bitmap, where no reader scanning the page and no screen reader
              can reach it. This captions the real screenshot, it does not
              re-create one, so the real-evidence rule is untouched.
              It reads at body weight, not 13px muted: it was the smallest
              non-label tier on the fold while the display slot spent itself on
              speed, so the one sentence naming the headline capability with a
              verb was also the quietest. text-body/text-ink is on the scale and
              stays clear of the forbidden 20-64 band.
              "job", not "posting": the capture's own label says YOUR RESUME FOR
              THIS JOB, and the page should not carry two words for one thing.
              The "< 30 seconds" bound rides here now that the below-fold
              restatement is gone. */}
          <p className="mt-8 text-body text-ink">
            The resume Litos wrote for this job, in under 30 seconds.
          </p>
        </div>
      </div>

      {/* Same 1104 container as the copy, so the artifact's left edge and the
          h1's left edge are one line. It still refuses to fit: the frame is
          1104px and stays 1104px, so on any viewport under that it runs off the
          right and is cut past the bottom, the way Linear and Attio read as
          real. What it no longer does is invent a second vertical edge. */}
      {/* Anchored left below sm — and now at every width under 1152, since the
          container no longer centres the frame. Centring a 544px frame inside a 390px screen
          cut ~77px off BOTH edges, so every line lost its left margin ("SUME
          FOR THIS JOB", "ental AI") — the visual signature of a layout bug, not
          of a workspace the viewport happens to cut. One edge, always. */}
      {/* The taller mobile crop has to be paid for, and on a 844px phone the
          budget comes from spacing, never from type: the scale forbids anything
          between 20px and 64px, so shrinking the h1 is not an option. 16px back
          above the artifact under sm, unchanged at every larger width. */}
      <div className="mx-auto mt-6 w-full max-w-[1104px] overflow-hidden pl-6 sm:mt-10 min-[1152px]:pl-0">
        {/* The bleed is now committed to, not approximated. The frame used to be
            a symmetric 20px-rounded, bordered, shadowed rectangle with 168px of
            white either side and its bottom edge landing at y=891 against a
            900px fold — a 9px margin that flips sign at 1436x900, 1440x800 and
            1512x945, so on half the common sizes the "cropped" frame simply
            ended above the fold as a card on a slide. Height is clamped to the
            fold and the crop lives on this wrapper: top corners rounded, side
            and top hairline only, bottom left open. 1password rounds only the
            top on a frame that runs past the fold, and Linear's frame is a
            hairline with no drop shadow at all — the depth comes from the cut,
            not from elevation. Dropping shadow-overlay also kills a real bug:
            both frames carried it, so mid-crossfade the two shadows composited
            and the edge visibly darkened and recovered. */}
        {/* max-h, not h: a fixed height also RESERVES it, so on anything taller
            than ~900 the frame outran the 516px capture and painted an empty
            bordered white box under it (149px at 1050, 179px at a maximised
            1080p window). A ceiling can only ever clip. -460 rather than -385
            so the clip at 900 tall is ~76px — big enough to read as a cut,
            where 21px read as a rounding error. */}
        {/* The base clamp is the same idea as the lg one, and it fixes the
            mirror-image bug on phones: the mobile capture was 460px tall
            against a 496px budget at 390x844, so the frame ENDED 36px above
            the fold with its bottom border deliberately missing — which reads
            as a broken border, not as a crop. Clamped to the fold, the cut is
            made by the fold itself. 349 is what the copy above it measures at
            390 wide. */}
        {/* The mobile width is read from the manifest instead of being typed:
            it was 544 because the old crop happened to be half of the 1104
            desktop band, and a re-cut at a different viewport would have left
            the frame scaling a 1:1 screenshot. Any width the capture comes
            back at now renders at 1:1 by construction. */}
        <div
          style={{ "--shot-mobile-w": `${SHOT_MOBILE?.w ?? 544}px` } as CSSProperties}
          className="relative w-[var(--shot-mobile-w)] shrink-0 overflow-hidden rounded-t-card border-x border-t border-border max-h-[calc(100svh-349px)] sm:w-[1104px] lg:max-h-[calc(100svh-460px)]"
        >
          <picture>
            {/* 639.98, not 640: `sm:` is min-width 640, so at exactly 640 the
                container was already 1104px wide while this source still
                matched, and the narrow capture got upscaled to fill it. */}
            <source media="(max-width: 639.98px)" srcSet={SHOT_MOBILE?.src ?? SHOT.src} />
            {/* The capture is the whole argument, and a bitmap says nothing to a
                screen reader or to a visitor whose image never loads. The alt is
                written out here rather than read from SHOT.alt so it cannot
                silently fall back to "" when the capture manifest is recut. The
                uncover overlay below stays aria-hidden, so this is the one and
                only thing in the frame that is announced. */}
            <img
              src={SHOT.src}
              alt="The job on the left, and the resume Litos wrote for this exact job on the right, with the same requirements highlighted on both."
              width={SHOT.w}
              height={SHOT.h}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="block h-auto w-full bg-surface"
            />
          </picture>

          {/* One pass, one capture. The settle used to cross-fade a second
              screenshot of the same screen hovered, which cost 83KB of the
              fold's image weight to change 1% of its pixels — and measured, the
              lit frame was the WEAKER picture: TypeScript gains a neutral grey
              outline and the other six highlights wash out, so the motion ended
              on less evidence than it started with and a reduced-motion visitor
              was handed that weaker frame directly.
              This uncovers the one real capture instead. A panel over the right
              half is WIPED away left to right (clip-path, see globals.css), so
              the eye reads the posting first and the resume built from it
              second — the causal order stated in motion rather than left to be
              inferred. A travelling edge has that direction; a fading rectangle
              did not. Covering and uncovering a screenshot invents nothing.
              bg-surface, not bg-white: the panel must be the same token as the
              page beneath it, or the moving edge would read as a colour.
              left-1/2 is not arbitrary: the capture's own vertical divider sits
              at 552 of its 1104px, so the edge lands on that seam and tears no
              word. Desktop only, because the mobile crop is the resume column
              alone and has no second half to uncover.
              pointer-events-none: the panel covers half the frame while it
              plays, so without it it would eat hit-tests aimed at the real
              screenshot underneath. */}
          <div
            aria-hidden
            className="rq-hero-uncover pointer-events-none absolute inset-y-0 left-1/2 right-0 hidden bg-surface sm:block"
          />
        </div>
      </div>

      {/* Coverage, one scroll lower, back in the copy's own gutter. Same
          container as the headline so the rail lines up with the left edge of
          the type rather than floating under the bleeding artifact. It lies
          down into a row on sm and up, so it costs two lines, not a column.
          The 13px speed line that used to sit here is gone. It restated the
          h1's only claim in the smallest type on the page, several hundred
          pixels lower — below the fold at 900 tall, where nobody deciding
          whether to install is still reading. Saying it twice does not make it
          twice as true; the "< 30 seconds" bound is carried above the fold by
          the artifact caption instead.
          In its place, one line naming the category: the five names below are
          proper nouns nothing else on the page defines, so a reader who has
          never seen "Ashby" has no way to know these are the sites job
          applications are filed on. The top margin moved to the container so
          the intro line, not the hairline, opens the rail. */}
      <div className="mx-auto mt-6 w-full max-w-[1104px] px-6 min-[1152px]:px-0">
        <p className="text-small text-muted">The job sites companies use to take applications:</p>
        <dl className="mt-3 flex flex-col gap-1.5 border-t border-border pt-4 sm:flex-row sm:gap-8">
          {COVERAGE.map(([verb, sites]) => (
            <div key={verb} className="flex gap-3 text-small">
              {/* Same contrast fix, and it matters most here: 11px is the floor
                  size, and the coverage rail is where we promise candour. */}
              {/* 150px, not 64: the labels now read "FILLS FORMS ON" and must
                  hold one line beside the site list. */}
              <dt className="w-[150px] shrink-0 font-mono text-label uppercase tracking-[0.08em] text-muted">
                {verb}
              </dt>
              <dd className="text-muted">{sites}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
