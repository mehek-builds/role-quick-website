import { notFound } from "next/navigation";

/**
 * Any /dashboard/... path that is not a real page.
 *
 * WHY A ROUTE AND NOT JUST app/dashboard/not-found.tsx. A segment's not-found.tsx only catches a
 * notFound() thrown from inside that segment. An address that matches no route at all never enters
 * the segment, so it falls all the way to the root app/not-found.tsx, which renders the marketing
 * <Header/> with a "Get started" button and a link out to the marketing home. Measured on
 * 2026-08-08: /dashboard/account (the real page is /dashboard/settings, which is what the sidebar
 * links to, and nothing in this codebase links to /dashboard/account) showed a signed-in student a
 * signup call to action. It reads as having been signed out.
 *
 * This page exists only to enter the segment and immediately give up, which puts the answer in
 * app/dashboard/not-found.tsx, inside the dashboard layout, with the sidebar and the tab bar
 * intact. The status code is still 404.
 *
 * It cannot shadow a real page. Next resolves static segments before dynamic ones and dynamic
 * before catch-alls, and every child of /dashboard is a static folder. A new one added later wins
 * over this by construction.
 */
export default function DashboardUnknownRoute() {
  notFound();
}
