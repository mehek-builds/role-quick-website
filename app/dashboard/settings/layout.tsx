import type { Metadata } from "next";

/**
 * The tab title for /dashboard/settings, declared rather than assigned.
 *
 * Same finding, same cure as app/dashboard/jobs/layout.tsx, which carries the full explanation:
 * the client layout above cannot export metadata, and the effect it uses instead is overwritten
 * on a hard load by the root layout's marketing title.
 *
 * "Account", the word in the UTILITY table that renders this destination in the nav. No brand
 * suffix: the root layout templates it.
 */
export const metadata: Metadata = {
  title: "Account",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
