import { Wash } from "@/components/cinema/Wash";

/* The site footer. It lived inline in app/page.tsx until 2026-08-04, which
   meant it rendered on the homepage and nowhere else, and that single fact was
   the whole of ISSUE-026.

   The ticket was filed as "these two routes are in no nav at any width",
   closed as a false premise because the footer does link them, and then
   reopened because the closure had counted a link without counting the pages
   it renders on. Both readings were half right. The links exist; they were
   reachable from exactly one page. <Header /> renders on ten routes and
   carries none of them, so from /try, /browse-jobs, /terms or /contact the
   only path to either page was the wordmark back to the homepage and then a
   scroll to the bottom.

   Lifting the same markup into site-wide chrome is the smallest change that
   makes the placement argument beside each <li> true rather than aspirational:
   "footer, not header" only means something once the footer is everywhere the
   header is. Nothing was promoted into the header, and no link was added or
   removed here. This is the identical footer, rendered in more places.

   components/Header.tsx's own comment describes the same gap from the other
   side, as the reason the phone hamburger had to come back. That reasoning
   still holds on its own terms: the sheet is for the header's four
   destinations, not a second copy of this.

   `wash` is the homepage's cinematic backdrop and belongs only there. On white
   pages the radial gradient is white on white, so it is off by default rather
   than harmlessly painted. */

/* Both dates below come from this one value and nothing else. `new Date(x)` with
   an argument is the ONLY form of Date allowed in this file: this component
   renders inside a client bundle on /contact, so `Date.now()`, `new Date()` and
   the bare `Date()` call all read the VISITOR's browser clock and disagree with
   the server HTML that was prerendered months earlier.

   next.config.ts puts BUILD_TIME in `env`, which inlines it as a literal into
   both bundles, so this is a compile-time constant everywhere and there is no
   runtime fallback to drift.

   An earlier version of this comment said a missing BUILD_TIME would render
   "Invalid Date" and that this was fine because it is "loud and caught in
   review". Both halves were wrong and the correction is the point. Absent is
   not the dangerous case: next.config falls back to the build clock, so the
   value is always defined. The dangerous case was SET-BUT-UNPARSEABLE, which
   `??` passes straight through, and it was not caught in review at all. It built
   with exit 0, kept the whole suite green, and put "Built Invalid Date" and
   "(c) NaN Litos" on every page of a repo that auto-deploys on merge. The first
   observer would have been a visitor.

   So the loudness moved to where it belongs: next.config.ts now throws on an
   unparseable value and fails the build. "Loudly broken beats quietly false"
   still holds; it just has to break the build rather than the page.

   The `?? ""` is only there to satisfy the `string | undefined` type. It is dead
   after inlining, and if it ever stops being dead the config has lost its `env`
   key, which is what the first assertion in the test file exists to catch.
   Pinned by tests/build-date-provenance.test.mjs. */
const BUILT_AT = new Date(process.env.BUILD_TIME ?? "");
const BUILD_DATE = BUILT_AT.toLocaleString("en-US", {
  month: "long",
  year: "numeric",
});
/* Was `new Date().getFullYear()`, the same defect one severity lower: on
   /contact the copyright year was the visitor's year, not the build's. Same
   source as the month now, so the two can never disagree either. */
const BUILD_YEAR = BUILT_AT.getFullYear();

const LINK =
  "inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0";
const COLUMN =
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint";

export function SiteFooter({ wash = false }: { wash?: boolean }) {
  return (
    <footer className="relative">
      {wash ? <Wash /> : null}
      <div className="relative mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/litos-mark.svg" alt="" className="h-5 w-5" />
              <span className="text-base font-medium tracking-tight text-ink">
                Litos
              </span>
            </div>
          </div>
          <div>
            <p className={COLUMN}>Product</p>
            <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
              {/* Absolute, not bare "#product": on /try or /terms these have to
                  cross to the homepage before they can scroll to an id. */}
              <li><a href="/#product" className={LINK}>Product</a></li>
              {/* Pricing removed 2026-07-30 with the #pricing section. */}
              <li><a href="/#faq" className={LINK}>FAQ</a></li>
              {/* Footer, not header, and this is still the whole reachability
                  story for /litos-vs-simplify: it is the one link to it.

                  The header carries four links and one ask. Comparison pages
                  are read by someone already weighing Litos against Simplify,
                  which is late in the funnel and a small slice of arrivals;
                  promoting it would put a competitor's name above the fold on
                  the first screen a stranger sees, and spend a fifth header
                  slot to do it. The two costs point the same way.

                  Kept under Product rather than Company because a visitor
                  hunting for it is comparing the PRODUCT, and it sits next to
                  FAQ, which is where the same "answer my objection" impulse
                  lands. Promote it to the header if a channel ever earns it,
                  the same condition attached to /for-career-centres below.

                  What changed on 2026-08-04 is what this link is worth. It used
                  to be one link on one page: this footer was inline in
                  app/page.tsx, so from /try or /browse-jobs the only way here
                  was back through the wordmark. It is now site chrome, so the
                  page is one click from anywhere the footer renders. Pinned by
                  tests/route-integrity.test.mjs section 5, which asserts the
                  reachable set page by page rather than tree-wide. */}
              <li><a href="/litos-vs-simplify" className={LINK}>Litos vs Simplify</a></li>
              {/* Was the store link. The footer is site-wide chrome, so under
                  the one-place rule it carries the account instead; the store
                  is one scroll up on the homepage, in #packet. */}
              <li><a href="/login" className={LINK}>Get started</a></li>
            </ul>
          </div>
          <div>
            <p className={COLUMN}>Company</p>
            <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
              {/* Footer, not header. Five of ten competitors keep a B2B entry
                  in the main nav, but the header here carries one ask and the
                  say-once rule is what keeps it doing that. This is a
                  destination for someone who came looking, not a second pitch
                  aimed at students. Promote it if the channel earns it. */}
              {/* The site had no contact route at all. The only address was
                  inside /privacy, for data requests, which is not where
                  someone whose autofill just failed will look. */}
              <li><a href="/contact" className={LINK}>Contact</a></li>
              <li><a href="/for-career-centres" className={LINK}>For career centres</a></li>
              <li><a href="https://x.com/MehekBuilds" className={LINK}>X</a></li>
              <li><a href="https://github.com/mehek-builds" className={LINK}>GitHub</a></li>
            </ul>
          </div>
          <div>
            <p className={COLUMN}>Legal</p>
            <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
              <li><a href="/privacy" className={LINK}>Privacy</a></li>
              <li><a href="/terms" className={LINK}>Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-faint sm:flex-row">
          <span>&copy; {BUILD_YEAR} Litos</span>
          {/* Was a render-time clock read, so it always said "updated this
              month" whether or not anything had changed. Manufactured freshness
              is exactly what the Guardrails ban. Both spans now read the build
              constant declared at the top of this file, which is inlined
              identically into the server and browser bundles. */}
          <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
            Built {BUILD_DATE}
          </span>
        </div>
      </div>
    </footer>
  );
}
