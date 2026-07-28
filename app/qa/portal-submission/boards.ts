// The single list of boards the controlled harness renders, shared by both route files and by
// portal-form.tsx so they cannot disagree.
//
// It lives in its own module rather than in portal-form.tsx because that file is a "use client"
// module, and keeping the plain function out of a client module is the tidier boundary for something
// two server components call.
//
// Why it is shared at all: the ?board= query route was never updated when Workable, JazzHR and
// Paylocity shipped on 2026-07-28, so ?board=workable resolved to controlled_workable in the backend
// while that page rendered a GREENHOUSE form. A run against it would have exercised the wrong
// adapter's selectors and still looked like a pass.
export const CONTROLLED_BOARDS = [
  "greenhouse", "lever", "ashby", "smartrecruiters", "workable", "jazzhr", "paylocity",
  "rippling", "breezy", "bamboohr",
] as const;

export type BoardName = (typeof CONTROLLED_BOARDS)[number];

/** Resolve an untrusted board name off the URL, falling back to greenhouse. */
export function toBoard(raw: string | undefined): BoardName {
  return (CONTROLLED_BOARDS as readonly string[]).includes(raw ?? "") ? (raw as BoardName) : "greenhouse";
}
