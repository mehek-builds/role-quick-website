import { ViewTransition } from "react";

/**
 * The dashboard content handoff.
 *
 * The shell stays mounted, so the rail and mobile navigation remain the fixed point that tells a
 * person where they are. Only the route body leaves and settles. A template remounts whenever the
 * child route changes, which gives React an old and new boundary to snapshot without retaining a
 * second live form, dialog, or status region in the DOM.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ViewTransition enter="rq-dashboard-page" exit="rq-dashboard-page" default="none">
      <div className="rq-dashboard-page">{children}</div>
    </ViewTransition>
  );
}
