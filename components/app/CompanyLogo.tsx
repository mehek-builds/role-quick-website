"use client";

import { useState } from "react";

/**
 * The company's icon beside a job row, with its initial as the answer when there is no icon.
 *
 * SERVED BY US, FROM OUR OWN BOARD'S LOGO SERVICE (app/api/company-logo). This component used to
 * point straight at Google's favicon endpoint, which lib/company-logos.ts had already rejected in
 * writing when the marketing board was built:
 *
 *   "The easy way to do this is a third-party logo API (Clearbit, Google's favicon service), but
 *    that puts a request to somebody else's server in every visitor's browser, on a page that lists
 *    24 employers at a time, which hands a third party a log of who is looking at which jobs. For a
 *    product whose whole pitch is that it does not do things behind your back, that is the wrong
 *    trade."
 *
 * The dashboard then shipped a second component that made exactly that trade, so the logged-in
 * surfaces - the ones that know who the student is and every employer she is applying to - were the
 * only place doing it. Measured on the Tracker 2026-08-29: the browser re-asked Google for every
 * unique employer roughly every 30 minutes of use, because the redirect that finds the icon carries
 * max-age=1800 even though the icon behind it is cached for a week.
 *
 * WHAT CHANGES BY USING OURS. The browser only ever talks to trylitos.com. The answer is resolved
 * about once a week across ALL visitors rather than per-student-per-half-hour (the route's own
 * s-maxage=604800 plus stale-while-revalidate). And the identity is better, not merely more
 * private: 170 marks in the committed set were checked by a human, and everything else is resolved
 * from the employer's OWN board page under a token we chose when we added the source - which is how
 * it reaches akunacapital.com and the Lever-hosted mark for mytos, neither of which a domain
 * guessed from a name could find.
 *
 * `miss=404` rather than the route's default monogram image: that SVG draws its own bordered
 * rounded square for the marketing tile, and nesting it inside this circle would look like a square
 * in a circle. This component has a designed circular monogram already, so it takes the 404 and
 * draws its own. The miss is cached exactly like a hit, so a company with no findable mark is not
 * re-probed on every render.
 */

/** Our own board's logo service. Same origin, so no third party is told who is looking at what. */
const LOGO_ENDPOINT = "/api/company-logo";

/* Two sizes, because the same identity has to work in a card and in a dense table row. The 48px
   circle is right beside a two-line job card and far too heavy in a 56px ledger row, where it would
   set the row height on its own. Both keep the circle, the border and the monogram fallback, so a
   row reads as the same object at either size. */
const LOGO_SIZE = {
  md: { frame: "h-12 w-12", image: "h-6 w-6", monogram: "text-sm", px: 24 },
  sm: { frame: "h-7 w-7", image: "h-4 w-4", monogram: "text-[10px]", px: 16 },
} as const;

export function CompanyLogo({
  company,
  boardUrl,
  size = "md",
}: {
  company: string;
  /**
   * A URL on the employer's ATS board, when the row has one: the careers URL on a job, the portal
   * URL on an application. The route reads the employer's own board page under the token in it,
   * which is identity by construction rather than a domain guessed from a name - and is what
   * recovers akunacapital.com and the Lever-hosted mark for mytos. Safe to pass anything: the route
   * refuses every host outside its ATS allowlist, so this cannot be turned into a fetch of our own
   * network. Null or absent simply means the company name has to carry the resolution alone.
   */
  boardUrl?: string | null;
  size?: keyof typeof LOGO_SIZE;
}) {
  const scale = LOGO_SIZE[size];
  const name = company.trim();
  // Reset by key at the call site is unnecessary: a row is keyed by job id and a job's company
  // does not change under it.
  const [broken, setBroken] = useState(false);
  const showIcon = name.length > 0 && !broken;
  const src = `${LOGO_ENDPOINT}?c=${encodeURIComponent(name)}`
    + (boardUrl ? `&board=${encodeURIComponent(boardUrl)}` : "")
    + "&miss=404";

  return (
    <span
      aria-hidden="true"
      className={`flex ${scale.frame} shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface`}
    >
      {showIcon ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          width={scale.px}
          height={scale.px}
          /* NOT lazy, and this is load-bearing. Measured on trylitos.com 2026-07-29: with
             loading="lazy" not one of the 41 logos on the first page ever loaded, every circle
             rendered empty, including rows sitting in the viewport. Because the image never
             errored, the monogram fallback never ran either, so the row showed NOTHING rather
             than a letter. Setting the same element to eager painted it immediately, and probing
             the URL from that page returned a 64px image: neither the icon nor the network was
             ever the problem.
             Lazy loading is for large images below the fold. These are ~1KB, sit at the left edge
             of every row, and ARE the row's identity. Deferring them bought nothing and cost the
             entire feature. tests/company-logo.test.mjs keeps it that way. */
          /* Kept although the request is now same-origin: it costs nothing, and it is the line that
             stops a dashboard URL - which carries an application id - riding along if this ever
             points somewhere else again. */
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className={`${scale.image} object-contain`}
        />
      ) : (
        <span className={`font-mono ${scale.monogram} font-medium text-muted`}>
          {name.charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
