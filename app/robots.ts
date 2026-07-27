import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

/* The repo had no robots file at all, so /qa/portal-submission, a set of fake
   Greenhouse/Lever/Ashby forms used for submission testing, was publicly
   crawlable on the marketing domain alongside the real product. The logged-in
   app is disallowed for the same reason: nothing there is a landing page. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/qa/", "/dashboard/", "/start", "/install"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
