import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { BOARD_CRAWL_TRAPS } from "@/lib/board-crawl-traps";

/* The repo had no robots file at all, so /qa/portal-submission, a set of fake
   Greenhouse/Lever/Ashby forms used for submission testing, was publicly
   crawlable on the marketing domain alongside the real product. The logged-in
   app is disallowed for the same reason: nothing there is a landing page. */

/* THE BOARD'S FREE-TEXT FILTERS ARE A CRAWL TRAP, and it is an expensive one:
   every distinct query string is a distinct URL that goes through to Neon, whose
   free tier suspends the compute when the monthly transfer allowance runs out.
   The patterns, what they deliberately do NOT block, and the prefix-matching
   subtlety that made the first version of them wrong all live (with tests) in
   lib/board-crawl-traps.ts. */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/qa/", "/dashboard/", "/start", "/install", "/pricing", ...BOARD_CRAWL_TRAPS],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
