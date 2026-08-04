import type { Metadata } from "next";

/**
 * The tab title for /dashboard/outreach, declared rather than assigned.
 *
 * Same finding, same cure as app/dashboard/jobs/layout.tsx, which carries the full explanation:
 * the client layout above cannot export metadata, and the effect it used instead was overwritten
 * on a hard load by the root layout's marketing title.
 *
 * "Emails", the word in the NAV table. Outreach was the brand's word for sending an email to a
 * human, and the nav stopped using it; the tab should not go back to it. No brand suffix: the
 * root layout templates it.
 */
export const metadata: Metadata = {
  title: "Emails",
};

export default function OutreachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
