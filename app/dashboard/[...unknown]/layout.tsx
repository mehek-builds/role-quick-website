import type { Metadata } from "next";

/**
 * The tab title for a /dashboard address that is not a page.
 *
 * Declared for the same reason every sibling declares one (see app/dashboard/jobs/layout.tsx for
 * the full finding): without it this route inherits the dashboard layout's default and a 404 sits
 * in the tab strip reading "Home", which is exactly the disorientation this route exists to remove.
 * The word matches what the page says, so the tab and the screen agree.
 */
export const metadata: Metadata = {
  title: "Page not found",
};

export default function DashboardUnknownLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
