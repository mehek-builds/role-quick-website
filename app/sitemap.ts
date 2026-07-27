import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

/* Hand-listed, and it went stale the moment pages were added: four routes sat
   here while /terms, /contact, /for-career-centres and /litos-vs-simplify all
   existed and none were indexed. The comparison page exists FOR search, so
   leaving it out defeated the point of writing it.

   Still a hand list rather than a filesystem walk, because not every route
   belongs in a sitemap and a walk would quietly add the wrong ones: /start and
   /dashboard are behind auth, /install is a tracked redirect, /qa is a test
   harness. tests/route-integrity.test.mjs keeps the list honest in the other
   direction, by failing if a path here stops resolving.

   Priorities say what they mean. The homepage is the entry point; the
   comparison and the career-centres page are the two written to be found by
   search; the legal pages are reference material people arrive at on purpose. */
const ROUTES: { path: string; priority: number }[] = [
  { path: "", priority: 1 },
  { path: "/try", priority: 0.8 },
  { path: "/litos-vs-simplify", priority: 0.8 },
  { path: "/for-career-centres", priority: 0.7 },
  { path: "/login", priority: 0.6 },
  { path: "/contact", priority: 0.5 },
  { path: "/privacy", priority: 0.4 },
  { path: "/terms", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly" as const,
    priority,
  }));
}
