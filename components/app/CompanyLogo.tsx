"use client";

import { useState } from "react";
import { companyDomain } from "@/lib/job-rows";

/**
 * The company's icon beside a job row, with its initial as the answer when there is no icon.
 *
 * The domain rule lives in `lib/job-rows.ts` (and is tested there): only the careers URL can carry
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

export function CompanyLogo({
  company,
  careerUrl,
}: {
  company: string;
  careerUrl: string | null | undefined;
}) {
  const domain = companyDomain(careerUrl);
  // Reset by key at the call site is unnecessary: a row is keyed by job id and a job's company
  // does not change under it.
  const [broken, setBroken] = useState(false);
  const showIcon = domain !== null && !broken;

  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface"
    >
      {showIcon ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`${FAVICON_ENDPOINT}?domain=${encodeURIComponent(domain)}&sz=${FAVICON_PX}`}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-6 w-6 object-contain"
        />
      ) : (
        <span className="font-mono text-sm font-medium text-muted">
          {company.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
