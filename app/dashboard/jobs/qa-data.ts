import type { JobsPage } from "@/lib/api";

/**
 * Fixture rows for `/dashboard/jobs?qa=1`, matching the pattern the Applications page already uses.
 *
 * This exists so the list can be reviewed and screenshotted without a database behind it, and so a
 * reviewer sees the states that are otherwise hard to produce on demand: a posting that scored, a
 * posting the scorer declined to score, one the student has already applied to, a company whose
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
    ranked_pool: 62,
    has_more: true,
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
        match_score: 94,
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
        match_score: 91,
      },
      {
        id: "qa-3",
        company_name: "Notion",
        title: "Product Manager, Growth",
        location: "New York, NY",
        department: "Product",
        employment_type: "Full-time",
        description: "",
        apply_url: "https://jobs.lever.co/notion/3",
        posting_url: "https://jobs.lever.co/notion/3",
        remote: false,
        posted_at: hoursAgo(20),
        first_seen_at: hoursAgo(20),
        ats_name: "lever",
        career_url: "https://notion.so/careers",
        match_score: 89,
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
        match_score: 76,
      },
      {
        // Careers URL is the job board itself, so there is no company domain to draw an icon from.
        // The row must fall back to the initial rather than paint Greenhouse's icon on it.
        id: "qa-5",
        company_name: "Sierra Labs",
        title: "Data Analyst, Operations",
        location: "Austin, TX",
        department: null,
        employment_type: "Full-time",
        description: "",
        apply_url: "https://boards.greenhouse.io/sierralabs/5",
        posting_url: "https://boards.greenhouse.io/sierralabs/5",
        remote: false,
        posted_at: hoursAgo(74),
        first_seen_at: hoursAgo(74),
        ats_name: "greenhouse",
        career_url: "https://boards.greenhouse.io/sierralabs",
        match_score: 61,
      },
      {
        // Unscorable: the posting listed too few real requirements. The row shows NO badge, which
        // is the whole point — a 0% here would be a claim about the resume, not about the posting.
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
        match_score: null,
      },
    ],
  };
}

/** The one the fixture student has already applied to, keyed the way the page keys a row. */
export const QA_APPLIED: Array<{ company: string; role: string }> = [
  { company: "Ramp", role: "Product Analyst" },
];
