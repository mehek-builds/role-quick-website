"use client";

import { useState } from "react";
import { companyDomainForRow } from "@/features/jobs";

/**
 * The company's icon beside a job row, with its initial as the answer when there is no icon.
 *
 * The domain rule lives in the jobs feature (and is tested there): only the careers URL can carry
 * the employer's own domain, and a careers URL that points at the job board identifies no company,
 * so those rows fall back rather than painting the board's logo on the row.
 *
 * WHAT LEAVES THE PAGE
 * --------------------
 * The icon is fetched from Google's favicon service, so that service learns which company domains
 * a signed-in student is looking at. That is a real cost and it was accepted deliberately
 * (2026-07-28) in exchange for rows that are scannable by logo. Two things keep it as small as it
 * can be: `referrerPolicy="no-referrer"` so the dashboard URL itself never goes along with the
 * request, and no request at all for a row whose domain we could not establish.
 *
 * The fallback is not a failure state. It is the same size, shape and weight as a loaded icon, so
 * a list of mixed rows still reads as one column rather than as a column with holes in it.
 */

/** Named so the third-party dependency is greppable if the 2026-07-28 decision is revisited. */
const FAVICON_ENDPOINT = "https://www.google.com/s2/favicons";
/** 2x the 24px render, so the icon is sharp on a retina screen. */
const FAVICON_PX = 64;

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
  careerUrl,
  companyDomain,
  size = "md",
}: {
  company: string;
  careerUrl: string | null | undefined;
  /** The employer's domain as resolved by the backend. Preferred over the careers URL. */
  companyDomain?: string | null;
  size?: keyof typeof LOGO_SIZE;
}) {
  const scale = LOGO_SIZE[size];
  const domain = companyDomainForRow({ company_domain: companyDomain, career_url: careerUrl });
  // Reset by key at the call site is unnecessary: a row is keyed by job id and a job's company
  // does not change under it.
  const [broken, setBroken] = useState(false);
  const showIcon = domain !== null && !broken;

  return (
    <span
      aria-hidden="true"
      className={`flex ${scale.frame} shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface`}
    >
      {showIcon ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`${FAVICON_ENDPOINT}?domain=${encodeURIComponent(domain)}&sz=${FAVICON_PX}`}
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
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className={`${scale.image} object-contain`}
        />
      ) : (
        <span className={`font-mono ${scale.monogram} font-medium text-muted`}>
          {company.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
