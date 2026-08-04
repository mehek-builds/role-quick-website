import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/product";
import { DashboardShell } from "./dashboard-shell";

/**
 * The dashboard's chrome, and the tab title for /dashboard itself.
 *
 * This layout used to BE the chrome, which made it a client component, and a client component
 * cannot export metadata (finding 41). Every other dashboard route worked around that by declaring
 * a title in a small server layout beside its own page. /dashboard could not: its page is this
 * layout's direct child, so there is no segment in between to put a layout in, and it was the last
 * screen in the product still serving the marketing title on a hard load.
 *
 * So the split runs the other way here. The chrome moved to ./dashboard-shell.tsx, which keeps the
 * "use client" and every hook it needs, and this file went back to being a server component whose
 * only job is to declare a title and render the shell around whatever the router gives it. The
 * chrome renders exactly as before: a client component is still allowed to receive server-rendered
 * children, which is what `children` is.
 *
 * "Home" resolves to "Home: Litos" through the root layout's `%s: Litos` template, matching the
 * word the rail uses for this destination. It applies to /dashboard alone in practice, because
 * every sibling route declares its own title and the deepest declaration wins. A NEW dashboard
 * route added without its own layout would inherit "Home" rather than the marketing line, which is
 * the better of the two wrong answers and a visible enough one to notice.
 *
 * The document.title effect that used to live here is gone. It was only ever a workaround for this
 * file being a client component, it lost a race against the streamed metadata on every hard load,
 * and on a client-side nav it overwrote the titles the sibling layouts had correctly set. Titles
 * are declared now, once per route, and no effect writes one.
 */
export const metadata: Metadata = {
  title: {
    default: "Home",
    template: `%s: ${PRODUCT_NAME}`,
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
