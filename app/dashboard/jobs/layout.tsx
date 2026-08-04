import type { Metadata } from "next";

/**
 * The tab title for /dashboard/jobs, declared rather than assigned.
 *
 * app/dashboard/layout.tsx sets document.title from its NAV table in an effect, because a client
 * layout cannot export metadata (finding 41). That effect is correct on a client-side nav and
 * loses a race on a hard load: Next streams the resolved metadata as its own deferred RSC chunk,
 * which lands AFTER the first hydration commit, so the effect writes "Jobs: Litos" and the root
 * layout's marketing title is then written over the top of it. Nothing in the layout can win that
 * race, because the thing it is racing is the answer arriving.
 *
 * A route segment is allowed to declare its own metadata even when the layout above it is a client
 * component, so the streamed answer is simply made correct at the source. The title is then right
 * in the served HTML, right after hydration, and right on a client-side nav, with no effect
 * involved. The effect above stays: it still titles the segments that have no metadata of their
 * own, and on this route the two now agree word for word.
 *
 * "Jobs", not "Jobs: Litos". The root layout declares the template `%s: Litos` (app/layout.tsx),
 * so the product name is appended here rather than typed twice.
 */
export const metadata: Metadata = {
  title: "Jobs",
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
