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
// so a job description lit up "the", "and", "with" as if they were matched skills.
//
// Scope is deliberately narrow: FUNCTION WORDS and pure hiring-process boilerplate only. An earlier
// draft also listed domain nouns (business, system, product, service, solution, support, develop,
// environment, project, program, experience, time, level) and that was worse than the bug. Those
// are the primary skill vocabulary of entire role families: "product" is the central term of any PM
// posting, "systems" is the skill in distributed and embedded work, "services" is what Amazon Web
// Services and microservices tokenize to, "solutions" is half the title of a Solutions Engineer,
// and on the quant posting this was tested against, suppressing "time" half-erased "time series".
// Suppressing a term the resume genuinely matches makes a strong candidate read as a weak one, and
// that error is far more costly than a stray highlight on "the".
//
// SCOPE, stated precisely because the first draft of this comment overclaimed. This list governs
// only which words get a <mark> in the two panes. It does NOT feed the JD-coverage ring: that
// number is `spec._quality.atsCoverage`, computed server-side by the backend's own separate
// stopword list (volley-backend, src/engine/resumeValidate.ts) and untouched from here. The two can
// therefore disagree, showing a high coverage number beside a sparsely highlighted pane. Making
// them agree means either sharing the list across both repos or deriving the displayed ring from
// these same client-side term sets; until one of those happens, treat the ring and the highlights
// as independent signals.
export const HIGHLIGHT_STOPWORDS: ReadonlySet<string> = new Set(
  `the and for with you your our their they them its from that this these those there here into onto
   are was were will would can could should may might must have has had been being both each other
   any all some more most much many few own same than then once upon while about above below over
   under again further out off why how what when where who whom which whose because until against
   among during before after between within without across per via etc such only just also very
   job jobs position positions employer employers candidate candidates applicant applicants
   apply applying applications opportunity opportunities qualifications qualification
   responsibilities responsibility duties required require requires requirement requirements
   preferred prefer including include includes strong excellent good great`
    .split(/\s+/)
    .filter(Boolean),
);

// Short, high-signal tokens. A blanket length gate dropped exactly the terms that decide fit on a
// software or quant posting: Go, C, R, ML, AI can never be matched, so the pane under-reports fit
// in the cases where fit matters most.
const SHORT_SIGNAL_TERMS: ReadonlySet<string> = new Set(
  "go c r c# c++ ml ai ui ux qa db os js ts sql aws gcp api cli css llm etl bi nlp cv rl".split(" "),
);

function normalizeTerm(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9+#./-]/g, "");
}

/**
 * Candidate terms from free prose (a job description, or the resume corpus it is matched against).
 * Stopword-filtered, because prose is mostly function words and posting boilerplate.
 */
export function normalizedTerms(source: string | readonly string[]): ReadonlySet<string> {
  const values = typeof source === "string" ? source.split(/\s+/) : source;
  return new Set(
    values
      .map(normalizeTerm)
      .filter((term) => term.length > 0 && !HIGHLIGHT_STOPWORDS.has(term) && (term.length > 2 || SHORT_SIGNAL_TERMS.has(term))),
  );
}

/**
 * Terms the BACKEND has already asserted are the tailoring diff (`review.edited_terms`).
 *
 * Deliberately not stopword-filtered. These are not candidate tokens needing noise removal; they
 * are a statement of fact about what tailoring changed. Running them through the prose filter meant
 * that if tailoring rewrote a bullet to add "product", "systems" or "development", the underline
 * vanished and the resume pane showed no edit at all, so the user concluded nothing had been
 * tailored and approved a resume whose changes they were never shown. That is the precise failure
 * this review surface exists to prevent.
 */
export function explicitTerms(source: readonly string[]): ReadonlySet<string> {
  return new Set(source.map(normalizeTerm).filter((term) => term.length > 0));
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

/**
 * True for a packet that is mid-run or waiting on the user, the states worth badging on the packet
 * switcher. Without a badge, a user who switches away from a running packet has no way to find it
 * again except by opening each one in turn.
 */
export function isLivePacketStatus(status: string | undefined): boolean {
  return (
    status !== undefined &&
    ["submit_requested", "preparing", "filling", "submitting", "needs_attention", "ready_for_final_approval", "failed"].includes(status)
  );
}

/** A resume has one Experience section holding many roles, not one heading per role. */
export function sectionHeading(type: string | undefined): string {
  return type === "project" ? "Projects" : type === "leadership" ? "Leadership" : "Experience";
}

/** True when this entry begins a new resume section and should print the heading. */
export function startsNewSection(types: readonly (string | undefined)[], index: number): boolean {
  return index === 0 || sectionHeading(types[index - 1]) !== sectionHeading(types[index]);
}
