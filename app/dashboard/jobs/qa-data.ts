import type { JobsPage } from "@/lib/api";

/**
 * Fixture rows for `/dashboard/jobs?qa=1`, matching the pattern the Applications page already uses.
 *
 * This exists so the list can be reviewed and screenshotted without a database behind it, and so a
 * reviewer sees the states that are otherwise hard to produce on demand: a posting that fits the
 * saved preferences, one that fits none of them and so carries no badge and no reasons line, one
 * the student has already applied to, a company whose
 * careers URL is its own domain, and one whose careers URL is the job board (which must fall back
 * to the initial rather than paint the board's icon on the row).
 *
 * The numbers here are made up, and that is the ONLY reason this file is safe: it is reachable at
 * localhost with an explicit ?qa=1 and nowhere else. Nothing in it may ever be used as a default
 * for a real signed-in student.
 */

/** Fixed offsets from load, so "today" and "3 days ago" stay true whenever this is opened. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export function qaJobsPage(): JobsPage {
  return {
    ranked: true,
    ranked_pool: 100,
    has_more: true,
    /* On purpose: the fixture shows the state where the ranking stopped short of the board, so the
       disclosure line under the list is visible while reviewing. */
    pool_exhausted: true,
    jobs: [
      {
        id: "qa-1",
        company_name: "Ramp",
        title: "Product Analyst",
        location: "San Francisco, CA",
        department: "Business Operations",
        employment_type: "Full-time",
        description: "",
        apply_url: "https://boards.greenhouse.io/ramp/jobs/1",
        posting_url: "https://boards.greenhouse.io/ramp/jobs/1",
        remote: false,
        posted_at: hoursAgo(3),
        first_seen_at: hoursAgo(3),
        ats_name: "greenhouse",
        career_url: "https://ramp.com/careers",
        preference_score: 94,
        preference_reasons: ["Product Analyst", "product", "San Francisco, CA"],
        /* Pay states, which are otherwise hard to produce on demand and are the point of this
           fixture. This row is the ordinary one: an annual range the employer published. */
        salary_min: 145700,
        salary_max: 200300,
        salary_currency: "USD",
        salary_interval: "year",
      },
      {
        id: "qa-2",
        company_name: "Linear",
        title: "Frontend Engineer",
        location: null,
        department: "Engineering",
        employment_type: "Full-time",
        description: "",
        apply_url: "https://jobs.ashbyhq.com/linear/2",
        posting_url: "https://jobs.ashbyhq.com/linear/2",
        remote: true,
        posted_at: hoursAgo(6),
        first_seen_at: hoursAgo(6),
        ats_name: "ashby",
        career_url: "https://linear.app/careers",
        preference_score: 91,
        preference_reasons: ["Frontend Engineer", "software engineering", "remote preference"],
        // A currency that is not dollars, to check the symbol is not hardcoded.
        salary_min: 110000,
        salary_max: 185000,
        salary_currency: "EUR",
        salary_interval: "year",
      },
      {
        id: "qa-3",
        company_name: "Notion",
        title: "Product Management Intern (Fall 2026)",
        location: "New York, NY",
        department: "Product",
        employment_type: "Internship",
        description: "",
        apply_url: "https://jobs.lever.co/notion/3",
        posting_url: "https://jobs.lever.co/notion/3",
        remote: false,
        posted_at: hoursAgo(20),
        first_seen_at: hoursAgo(20),
        ats_name: "lever",
        career_url: "https://notion.so/careers",
        preference_score: 89,
        preference_reasons: ["product", "New York, NY", "internship"],
        // An hourly rate on an internship: it must keep its exact figures rather than round to "$0K".
        salary_min: 45,
        salary_max: 55,
        salary_currency: "USD",
        salary_interval: "hour",
      },
      {
        id: "qa-4",
        company_name: "Vercel",
        title: "Developer Experience Engineer",
        location: "Remote",
        department: "Engineering",
        employment_type: "Full-time",
        description: "",
        apply_url: "https://boards.greenhouse.io/vercel/4",
        posting_url: "https://boards.greenhouse.io/vercel/4",
        remote: true,
        posted_at: hoursAgo(52),
        first_seen_at: hoursAgo(52),
        ats_name: "greenhouse",
        career_url: "https://vercel.com/careers",
        preference_score: 76,
        preference_reasons: ["software engineering", "remote preference"],
        // One published figure rather than a band: it must print once, not "$180K - $180K".
        salary_min: 180000,
        salary_max: 180000,
        salary_currency: "USD",
        salary_interval: "year",
      },
      {
        // Careers URL is the job board itself, so there is no company domain to draw an icon from.
        // The row must fall back to the initial rather than paint Greenhouse's icon on it.
        id: "qa-5",
        company_name: "Sierra Labs",
        title: "Data Analyst, Operations",
        location: "Austin, TX",
        department: null,
        /* THE COMMON CASE, and the one worth looking at: a Greenhouse posting states neither pay
           nor job type, so this row shows neither. It must not gain a "Full-time" chip or a
           "Not listed" salary, see lib/pay.ts. */
        employment_type: null,
        description: "",
        apply_url: "https://boards.greenhouse.io/sierralabs/5",
        posting_url: "https://boards.greenhouse.io/sierralabs/5",
        remote: false,
        posted_at: hoursAgo(74),
        first_seen_at: hoursAgo(74),
        ats_name: "greenhouse",
        career_url: "https://boards.greenhouse.io/sierralabs",
        preference_score: 61,
        preference_reasons: ["data ml", "internship"],
      },
      {
        // Unscorable: the posting listed too few real requirements. The row shows NO badge, which
        // is the whole point: a 0% here would be a claim about the resume, not about the posting.
        id: "qa-6",
        company_name: "Cursor",
        title: "Founding Designer",
        location: "San Francisco, CA",
        department: "Design",
        employment_type: "Full-time",
        description: "",
        apply_url: "https://jobs.ashbyhq.com/cursor/6",
        posting_url: "https://jobs.ashbyhq.com/cursor/6",
        remote: false,
        posted_at: hoursAgo(96),
        first_seen_at: hoursAgo(96),
        ats_name: "ashby",
        career_url: "https://cursor.com/careers",
        /* No preferences matched, so no badge and no reasons line. The row must still read as a
           complete row rather than a broken one: this is the state a student with an empty or very
           narrow Account preference set sees on most of the board. */
        preference_score: 0,
        preference_reasons: [],
      },
    ],
  };
}

/** The one the fixture student has already applied to, shaped the way a real board card is so the
 *  QA render exercises the same `buildAppliedIndex` the live page does rather than a parallel path.
 *
 *  It carries `job_id`, matching the "qa-1" row above, because that is now the primary match. The
 *  `stage` is load-bearing too: the index only counts stages that mean an application was sent. */
export const QA_APPLIED: Array<{ id: string; job_id: string | null; company: string; role: string; stage: string }> = [
  { id: "qa-application-1", job_id: "qa-1", company: "Ramp", role: "Product Analyst", stage: "applied" },
];
