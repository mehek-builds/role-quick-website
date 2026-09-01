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

/**
 * A fixture timestamp anchored to the LOCAL DAY, not to the moment of load.
 *
 * The offsets here used to be counted back from `Date.now()`, on the stated reasoning that "today"
 * and "3 days ago" would then stay true whenever the fixture was opened. They do not. Two readers
 * bucket by CALENDAR DAY, not by elapsed hours - countNewToday counts postings first seen since
 * LOCAL MIDNIGHT, and formatRelativeDate floors elapsed time into whole days - so a job stamped
 * three hours ago is "new today" at 14:00 and was yesterday at 00:07.
 *
 * That made the Jobs baseline valid only for part of the day. It cost a CI failure at 00:07 on
 * 2026-08-29 whose diff was a missing "3 new today" badge shifting the whole page, on a branch that
 * had touched nothing but where company logos are fetched from; a whitespace-only control run off
 * main reproduced it exactly, which is the only reason it was not written off as the change's fault.
 *
 * `day` is how many calendar days back the row should read as, and it lands at a fixed hour on that
 * day, so both readers give the same answer at any hour. Clamped to just before now, because at
 * 00:07 "09:00 today" is in the future and a job the board has not seen yet is not a fixture, it is
 * a bug.
 */
function daysAgo(day: number): string {
  const at = new Date();
  at.setHours(9, 0, 0, 0);
  at.setDate(at.getDate() - day);
  return new Date(Math.min(at.getTime(), Date.now() - 60_000)).toISOString();
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
        posted_at: daysAgo(0),
        first_seen_at: daysAgo(0),
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
        posted_at: daysAgo(0),
        first_seen_at: daysAgo(0),
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
        posted_at: daysAgo(0),
        first_seen_at: daysAgo(0),
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
        /* ASSISTED TIER, and the only reason it sits high enough to be above the fold: Litos fills
           this posting but cannot send it, because the employer gates the send behind a human check
           Litos does not complete. submit_mode='assisted' draws the "Litos fills, you send" badge,
           which no other fixture row exercises and the live board can only show once the backend is
           surfacing assisted jobs to an onboarding-completed account. */
        id: "qa-7",
        company_name: "Utility",
        title: "Platform Engineer",
        location: "London, United Kingdom",
        department: "Engineering",
        employment_type: "Full-time",
        description: "",
        apply_url: "https://ats.rippling.com/utility/jobs/7/apply",
        posting_url: "https://ats.rippling.com/utility/jobs/7",
        remote: false,
        posted_at: daysAgo(1),
        first_seen_at: daysAgo(1),
        ats_name: "rippling",
        submit_mode: "assisted",
        career_url: "https://utility.example/careers",
        preference_score: 84,
        preference_reasons: ["Platform Engineer", "software engineering"],
        salary_min: 95000,
        salary_max: 130000,
        salary_currency: "GBP",
        salary_interval: "year",
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
        posted_at: daysAgo(2),
        first_seen_at: daysAgo(2),
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
        posted_at: daysAgo(3),
        first_seen_at: daysAgo(3),
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
        posted_at: daysAgo(4),
        first_seen_at: daysAgo(4),
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
