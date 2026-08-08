// Extension included so the node test runner can load this module directly, the same convention
// daily-matches.ts uses for application-filter.ts. See allowImportingTsExtensions in tsconfig.json.
import { normalizeTerm } from "./requirement-terms.ts";

type ReviewPacket = {
  spec?: { _review?: unknown };
};

type AnsweredQuestion = {
  id: string;
  question: string;
  answer: string;
  required?: boolean;
};

export function reviewablePackets<T extends ReviewPacket>(packets: T[]): T[] {
  return packets.filter((packet) => Boolean(packet.spec?._review));
}

/**
 * Incorporate questions discovered by the live portal without erasing an answer the user already
 * edited in this dashboard session. The portal result is authoritative for labels, required flags,
 * and newly found controls; a non-empty local answer is authoritative for its text.
 */
export function mergeDiscoveredQuestions<T extends AnsweredQuestion>(local: readonly T[], discovered: readonly T[]): T[] {
  const dedupedDiscovered: T[] = [];
  const discoveredIndexByQuestion = new Map<string, number>();
  for (const question of discovered) {
    const key = questionKey(question.question);
    if (!key) {
      dedupedDiscovered.push(question);
      continue;
    }
    const existingIndex = discoveredIndexByQuestion.get(key);
    if (existingIndex === undefined) {
      discoveredIndexByQuestion.set(key, dedupedDiscovered.length);
      dedupedDiscovered.push(question);
      continue;
    }
    const existing = dedupedDiscovered[existingIndex];
    if ((question.required === true && existing.required !== true) || (!existing.answer.trim() && question.answer.trim())) {
      dedupedDiscovered[existingIndex] = {
        ...existing,
        ...(question.required === true ? { required: true } : {}),
        ...(!existing.answer.trim() && question.answer.trim() ? { answer: question.answer } : {}),
      };
    }
  }
  const localById = new Map(local.map((question) => [question.id, question]));
  const localByQuestion = new Map<string, T>();
  for (const question of local) {
    const key = questionKey(question.question);
    if (!key) continue;
    const existing = localByQuestion.get(key);
    if (!existing || (!existing.answer.trim() && question.answer.trim())) {
      localByQuestion.set(key, question);
    }
  }
  const discoveredIds = new Set(discovered.map((question) => question.id));
  const discoveredQuestions = new Set(discovered.map((question) => questionKey(question.question)).filter(Boolean));
  const merged = dedupedDiscovered.map((question) => {
    const localByIdMatch = localById.get(question.id);
    const localByQuestionMatch = localByQuestion.get(questionKey(question.question));
    let answeredLocal: T | undefined;
    if (localByIdMatch?.answer.trim()) {
      answeredLocal = localByIdMatch;
    } else if (localByQuestionMatch?.answer.trim()) {
      answeredLocal = localByQuestionMatch;
    }
    return answeredLocal ? { ...question, answer: answeredLocal.answer } : question;
  });
  return [
    ...merged,
    ...local.filter((question) => {
      const key = questionKey(question.question);
      return !discoveredIds.has(question.id) && (!key || !discoveredQuestions.has(key));
    }),
  ];
}

function questionKey(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim();
}

export function portalName(portalUrl: string): string {
  const hostname = new URL(portalUrl).hostname.toLowerCase();
  if (hostname.includes("greenhouse")) return "Greenhouse";
  if (hostname.includes("lever")) return "Lever";
  if (hostname.includes("ashby")) return "Ashby";
  if (hostname.includes("workday")) return "Workday";
  if (hostname.includes("linkedin")) return "LinkedIn";
  return "the company's application page";
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

/**
 * THERE IS ONE normalizeTerm AND IT LIVES IN requirement-terms.ts.
 *
 * This file used to carry a second one - lowercase, then DELETE every character outside
 * [a-z0-9+#./-] - sitting in the same directory as the one that lowercases, deletes dots and
 * apostrophes, and turns everything else into a SEPARATOR. The two agreed only on a bare
 * alphanumeric word. explicitTerms built the edited-term set with the local copy while segmentText
 * read the page with the shared one, so the set held "node.js", "ci/cd", "machine-learning" and
 * "productengineering" against lookup keys of "nodejs", "ci cd", "machine learning" and "product
 * engineering", and no dotted, slashed, hyphenated or multiword edit could ever be underlined. The
 * green tone had, in consequence, never rendered.
 *
 * A term key is a term key. Both callers below use the shared one, which is also the one the
 * backend's engine/jdMatch.ts is kept byte-identical with.
 */

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
  | "filling" | "needs_attention" | "ready_for_final_approval" | "awaiting_security_code" | "submitting" | "submission_claimed" | "submitted" | "failed";

/**
 * The chip beside the page title. "Submitting" used to cover the entire preparing/filling stretch,
 * contradicting the copy directly beneath it ("Nothing is submitted during this preparation step")
 * and telling the user their application was going out before the approval gate had been reached.
 * Only the genuine post-approval status may say Submitting.
 */
/**
 * Four words, and only four. Nine backend statuses used to surface as six labels, and the chip
 * palette added a dozen more kinds on top, so reading this product meant learning about twelve
 * status words. A student needs to know exactly one thing at a glance: is Litos working, is it
 * done, or does it want me? Everything else is detail that belongs in the screen body.
 *
 * Getting ready -> Ready -> Sent, with Needs you as the one branch off that line.
 */
export function statusLabel(onSubmittingScreen: boolean, status: ReviewStatus): string {
  if (status === "submitted") return "Sent";
  // "Needs you" and not "Sent", even though an application really has gone in: the employer will
  // not file it until she supplies the emailed code, so a label that reads as finished would park it
  // forever. She is the only person who can move it.
  if (status === "needs_attention" || status === "failed" || status === "ready_for_final_approval" || status === "awaiting_security_code") return "Needs you";
  if (onSubmittingScreen || ["submit_requested", "preparing", "filling", "submitting", "submission_claimed"].includes(status)) return "Getting ready";
  return "Ready";
}

export type ReviewScreen = "review" | "submitting" | "portal" | "submitted";

/**
 * Which screen a backend status means. One function, because three call sites disagreed.
 *
 * The status-to-screen decision was written out longhand in three places: on packet select, on
 * every poll, and (almost) at the end of a submit request. The third one was the bug. After
 * POST /submit-request resolved, the page installed the returned review with setSubmission and then
 * simply stopped - no screen change on the success path, even though that response is TERMINAL and
 * routinely carries status "failed". The screen stayed on "submitting", so a run that was already
 * dead kept rendering "Getting the company's page ready." and a climbing elapsed counter with no
 * error, no reason and no retry. Confirmed in prod on 2026-08-04.
 *
 * Note the qa branch beside it DID call moveToScreen. The real path was the one missing it, which
 * is exactly how a gap like this survives being looked at.
 *
 * `fallback` is the only genuine difference between the callers: selecting a packet with no live
 * status lands on "review", while a poll or a submit response mid-run stays on "submitting".
 */
export function screenForStatus(status: ReviewStatus | string | undefined, fallback: ReviewScreen): ReviewScreen {
  if (status === "submitted") return "submitted";
  if (status === "needs_attention" || status === "ready_for_final_approval" || status === "failed" || status === "awaiting_security_code") return "portal";
  if (status && ["submit_requested", "preparing", "filling", "submitting", "submission_claimed"].includes(status)) return "submitting";
  return fallback;
}

/**
 * True for a packet that is mid-run or waiting on the user, the states worth badging on the packet
 * switcher. Without a badge, a user who switches away from a running packet has no way to find it
 * again except by opening each one in turn.
 */
export function isLivePacketStatus(status: string | undefined): boolean {
  return (
    status !== undefined &&
    ["submit_requested", "preparing", "filling", "submitting", "submission_claimed", "needs_attention", "ready_for_final_approval", "awaiting_security_code", "failed"].includes(status)
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

/**
 * A ResumeSpec with every field defaulted, from a packet whose stored spec may predate a field.
 *
 * Moved here from the applications page so the packet viewer can share it. The viewer was reading
 * `spec.experience.map(...)` and `spec.skills.length` off the raw payload while the page beside it
 * had been defending exactly those fields since before this existed, so one legacy packet threw
 * during render and took the whole Applications tree down with it, poller included. Types are a
 * compile-time claim about JSON, not a runtime guarantee.
 */
export function stripMetadata(spec: {
  /* The targeting headline the renderer prints directly under the applicant's name. It was not
     carried through here, so every surface built on stripMetadata dropped the second line of the
     resume header. It is a heading, not a claim the applicant held the role. */
  target_role?: string;
  school?: string;
  degree?: string;
  grad_date?: string;
  gpa?: string;
  school_location?: string;
  coursework?: string;
  education_position?: "top" | "after_experience";
  experience?: { type?: "job" | "project" | "leadership"; org: string; title: string; location?: string; date_range: string; bullets: string[] }[];
  skills?: string[];
  skill_source?: Record<string, string>;
}) {
  return {
    target_role: spec.target_role,
    school: spec.school ?? "",
    degree: spec.degree ?? "",
    grad_date: spec.grad_date ?? "",
    gpa: spec.gpa,
    school_location: spec.school_location,
    coursework: spec.coursework ?? "",
    education_position: spec.education_position,
    experience: (spec.experience ?? []).map((entry) => ({ ...entry, bullets: entry.bullets ?? [] })),
    skills: spec.skills ?? [],
    skill_source: spec.skill_source,
  };
}
