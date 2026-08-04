import type { Metadata } from "next";

/**
 * The tab title for /dashboard/applications, declared rather than assigned.
 *
 * Same finding, same cure as app/dashboard/jobs/layout.tsx, which carries the full explanation:
 * app/dashboard/layout.tsx is a client component and so cannot export metadata, and the effect it
 * used instead lost a race on a hard load against the deferred RSC chunk carrying the resolved
 * metadata. Declaring the title on the segment makes the streamed answer correct at the source,
 * so it is right in the served HTML rather than written and then overwritten.
 *
 * "Tracker", the word in the NAV table, not the route noun. The route stays /applications because
 * links already sent out point at it; the label is the part a student reads. And "Tracker" alone,
 * not "Tracker: Litos": the root layout declares the template `%s: Litos` (app/layout.tsx).
 */
export const metadata: Metadata = {
  title: "Tracker",
};

export default function ApplicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
