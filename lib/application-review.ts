type ReviewPacket = {
  spec?: { _review?: unknown };
};

export function reviewablePackets<T extends ReviewPacket>(packets: T[]): T[] {
  return packets.filter((packet) => Boolean(packet.spec?._review));
}

export function portalName(portalUrl: string): string {
  const hostname = new URL(portalUrl).hostname.toLowerCase();
  if (hostname.includes("greenhouse")) return "Greenhouse";
  if (hostname.includes("lever")) return "Lever";
  if (hostname.includes("ashby")) return "Ashby";
  if (hostname.includes("workday")) return "Workday";
  if (hostname.includes("linkedin")) return "LinkedIn";
  return "Company portal";
}

// Filtering candidate highlight terms on length alone let every three-letter function word through,
// so a job description lit up "the", "and", "with", "business" and "system" as if they were matched
// skills, and the JD-coverage ring counted them. Mirrors the backend list in
// src/lib/applicationReview.ts, plus posting boilerplate that appears in every JD and says nothing
// about fit. Keep the two lists in step.
export const HIGHLIGHT_STOPWORDS: ReadonlySet<string> = new Set(
  `the and for with you your our their they them its from that this these those there here into onto
   are was were will would can could should may might must have has had been being both each other
   any all some more most much many few own same than then once upon while about above below over
   under again further out off why how what when where who whom which whose because until against
   among during before after between within without across per via etc such only just also very
   role team work works working job jobs position positions company companies employer employers
   candidate candidates applicant applicants applications apply applying opportunity opportunities
   experience experienced skills skill ability abilities strong excellent good great new use used
   using including include includes required require requires requirement requirements preferred
   prefer responsibilities responsibility qualifications qualification duties benefits salary
   business system systems program programs project projects support supporting develop developing
   development environment environments product products service services solution solutions
   year years month months day days time full part level levels`
    .split(/\s+/)
    .filter(Boolean),
);

/** Terms eligible for highlighting: normalized, long enough to be meaningful, and not boilerplate. */
export function normalizedTerms(source: string | readonly string[]): ReadonlySet<string> {
  const values = typeof source === "string" ? source.split(/\s+/) : source;
  return new Set(
    values
      .map((term) => term.toLowerCase().replace(/[^a-z0-9+#./-]/g, ""))
      .filter((term) => term.length > 2 && !HIGHLIGHT_STOPWORDS.has(term)),
  );
}

export type ReviewStatus =
  | "resume_ready" | "questions_ready" | "ready_to_submit" | "submit_requested" | "preparing"
  | "filling" | "needs_attention" | "ready_for_final_approval" | "submitting" | "submitted" | "failed";

/**
 * The chip beside the page title. "Submitting" used to cover the entire preparing/filling stretch,
 * contradicting the copy directly beneath it ("Nothing is submitted during this preparation step")
 * and telling the user their application was going out before the approval gate had been reached.
 * Only the genuine post-approval status may say Submitting.
 */
export function statusLabel(onSubmittingScreen: boolean, status: ReviewStatus): string {
  if (status === "submitted") return "Submitted";
  if (status === "submitting") return "Submitting";
  if (status === "needs_attention") return "Needs attention";
  if (status === "ready_for_final_approval") return "Approval required";
  if (status === "failed") return "Stopped safely";
  if (onSubmittingScreen || ["submit_requested", "preparing", "filling"].includes(status)) return "Preparing";
  return "Ready for review";
}

/** A resume has one Experience section holding many roles, not one heading per role. */
export function sectionHeading(type: string | undefined): string {
  return type === "project" ? "Projects" : type === "leadership" ? "Leadership" : "Experience";
}

/** True when this entry begins a new resume section and should print the heading. */
export function startsNewSection(types: readonly (string | undefined)[], index: number): boolean {
  return index === 0 || sectionHeading(types[index - 1]) !== sectionHeading(types[index]);
}
