import type { Metadata } from "next";

/**
 * The tab title for /dashboard/resume, declared rather than assigned.
 *
 * Same finding, same cure as app/dashboard/jobs/layout.tsx, which carries the full explanation:
 * the client layout above cannot export metadata, and the effect it uses instead is overwritten
 * on a hard load by the root layout's marketing title.
 *
 * This route is not a nav destination, so there is no NAV label to match and the effect above
 * never titled it at all: it fell through to the bare product name. "Resume" is the page's own h1
 * and the word the Account page's link to it uses. No accents, and no brand suffix: the root
 * layout templates it.
 */
export const metadata: Metadata = {
  title: "Resume",
};

export default function ResumeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
