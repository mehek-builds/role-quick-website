export type HomeApplicationSummary = {
  ready: number;
  needsAction: number;
};

export type HomePrimaryAction = {
  href: string;
  label: string;
};

/** The one application action Home should lead with. */
export function homePrimaryAction(summary: HomeApplicationSummary): HomePrimaryAction {
  if (summary.needsAction > 0) {
    return {
      href: "/dashboard/applications?state=action",
      label: summary.needsAction === 1
        ? "Continue 1 application"
        : `Continue ${summary.needsAction} applications`,
    };
  }
  if (summary.ready > 0) {
    return {
      href: "/dashboard/applications?state=ready",
      label: summary.ready === 1
        ? "Review 1 ready application"
        : `Review ${summary.ready} ready applications`,
    };
  }
  return {
    href: "/dashboard/applications?new=1&intent=fill",
    label: "Fill application",
  };
}
