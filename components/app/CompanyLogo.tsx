"use client";

import { useState } from "react";

/**
 * The company's icon beside a job row, with its initial as the answer when there is no icon.
 *
 * WHERE THE DOMAIN COMES FROM, AND WHY IT IS NOT THE APPLY LINK
 * ------------------------------------------------------------
 * A posting's apply_url and posting_url both point at the job board, so deriving a company from
 * either paints the same Greenhouse icon on every row in the list. The only field that can carry
 * the company's own domain is the careers URL its source was registered with — and operators
 * sometimes register the board URL there too, which is why ATS hosts are rejected below rather
 * than trusted. A wrong logo is worse than no logo: it tells the student this row is a different
 * company than it is.
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

/** Job boards, not companies. A careers URL on one of these tells us nothing about the employer. */
const ATS_HOSTS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "workable.com",
  "jazzhr.com",
  "applytojob.com",
  "paylocity.com",
  "bamboohr.com",
  "smartrecruiters.com",
  "icims.com",
  "taleo.net",
];

/** The company's registrable domain, or null when the URL does not identify a company. */
export function companyDomain(careerUrl: string | null | undefined): string | null {
  if (!careerUrl) return null;
  let host: string;
  try {
    host = new URL(careerUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host.includes(".")) return null;
  if (ATS_HOSTS.some((ats) => host === ats || host.endsWith(`.${ats}`))) return null;
  return host;
}

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
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
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
