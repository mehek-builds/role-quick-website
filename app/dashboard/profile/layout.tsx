import type { Metadata } from "next";

/**
 * The tab title for /dashboard/profile, declared rather than assigned.
 *
 * Same finding, same cure as app/dashboard/jobs/layout.tsx, which carries the full explanation:
 * the client layout above cannot export metadata, and the effect it uses instead is overwritten
 * on a hard load by the root layout's marketing title.
 *
 * This one is worth saying out loud, because the page is a redirect and the instinct is that a
 * redirect has no title. It has one. The route prerenders to a real 200 HTML shell and the hop to
 * /dashboard/settings#job-search happens once that shell is running, so the tab is titled for as
 * long as the hop takes, and today it is titled with the marketing line. "Account" is the word the
 * nav uses for where this route is sending the reader, so titling it that way means the tab does
 * not change under them when they arrive. No brand suffix: the root layout templates it.
 *
 * One thing this cannot clean up, and it is worth knowing before someone counts nodes and files a
 * bug: after the hop the document is left holding two <title> elements rather than one. That is
 * the redirect, not this file. Measured with this layout deleted, the leftover node is still there
 * and still says the marketing line, so the second title is what the route did already; declaring
 * a title here is what makes both of them read "Account: Litos" instead. Browsers take the first,
 * which is the right one either way, so the tab is correct in both cases and the duplicate is only
 * visible to a querySelectorAll. Removing it means removing the prerendered shell, which is a
 * routing change and not this one.
 */
export const metadata: Metadata = {
  title: "Account",
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
