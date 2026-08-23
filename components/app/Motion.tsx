"use client";

import { startTransition, ViewTransition } from "react";

/**
 * Marks a deliberate visual state change.
 *
 * React only activates ViewTransition boundaries for updates made inside a transition. Keeping the
 * call in one named helper makes that requirement visible at every tab, composer, and dialog
 * trigger without coupling unrelated polling or autosave updates to animation.
 */
export function runDashboardTransition(update: () => void): void {
  startTransition(update);
}

/** A peer panel that replaces content in place rather than implying forward or backward travel. */
export function MotionPanel({
  name,
  children,
  className = "",
}: {
  name: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ViewTransition
      name={name}
      share="rq-dashboard-panel"
      enter="rq-dashboard-panel"
      exit="rq-dashboard-panel"
      default="none"
    >
      <div className={className}>{children}</div>
    </ViewTransition>
  );
}
