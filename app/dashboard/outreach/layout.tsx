import type { Metadata } from "next";

/**
 * The tab title for /dashboard/outreach, declared rather than assigned.
 *
 * Same finding, same cure as app/dashboard/jobs/layout.tsx, which carries the full explanation:
 * the client layout above cannot export metadata, and the effect it used instead was overwritten
 * on a hard load by the root layout's marketing title.
 *
 * "Outreach" matches both the navigation label and the visible page heading. The root layout adds
 * the Litos suffix through its title template.
 */
export const metadata: Metadata = {
  title: "Outreach",
};

export default function OutreachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
