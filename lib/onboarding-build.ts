import type { PostingPrescriptFilledAnswer, PostingPrescriptQuestion } from "./api";
import type { ResumeSpec } from "@/lib/api";

/* 04 WATCH IT BUILD: the sequence, as a decision that can be tested without spending a generation.
 *
 * THE STAGES ARE THE REAL CALLS. There are three of them because three things actually happen, and
 * the deck's rule for this screen is not decorative: a stage list that runs the same length whether
 * the build took two seconds or forty is a fake progress bar wearing better clothes, and this is
 * the one screen where a student will believe anything they are shown. So no stage is invented to
 * pad the sequence, and none is marked done before its call resolves.
 *
 * Deliberately NOT five stages. An earlier draft split the middle one into "writing your bullets"
 * and "laying out one page" because they read well, but POST /resume/generate is a single blocking
 * call that does both behind one await. There is no event between them to drive a transition, so
 * showing two would be theatre.
 *
 * Every dependency is injected. Generating a tailored resume costs money and consumes one of the
 * trial's five, so the orchestration has to be provable without running it.
 */

export type BuildStageKey = "posting" | "resume" | "questions";

export type BuildStageStatus = "waiting" | "active" | "done" | "failed";

export type BuildStage = {
  key: BuildStageKey;
  /** What the student reads. Present tense while active, and the same words when done. */
  label: string;
  /** The shipped ThinkingOrb state for this stage. Five of the six map onto real work; the two
   *  used here are the ones whose animation matches what is happening. */
  orb: "working" | "composing" | "solving";
  status: BuildStageStatus;
};

export const BUILD_STAGES: readonly { key: BuildStageKey; label: string; orb: BuildStage["orb"] }[] = [
  { key: "posting", label: "Reading the posting", orb: "working" },
  { key: "resume", label: "Writing your one page for it", orb: "composing" },
  { key: "questions", label: "Answering the application", orb: "solving" },
];

export type BuildResult = {
  /** The canonical application POST /resume/generate created or linked. The review screen submits
   *  against this, and a null one means there is nothing to send. */
  applicationId: string | null;
  /** THE WHOLE GENERATED RESUME, not just its education lines.
   *
   *  It was narrowed to school/degree/grad_date for the review screen's drift guard, which is all
   *  that consumer needs. The build screen needs the rest: it renders the actual tailored lines
   *  beside the posting, marked term by term, because a screen whose job is to SHOW the tailoring
   *  cannot do it from three academic fields. Null when the response carried no spec, which the
   *  panes handle rather than assume away. */
  resumeSpec: ResumeSpec | null;
  /** The questions that need the applicant, passed straight through to screen 05 rather than
   *  re-fetched: the scan is the expensive half and it has already been paid for here. */
  ask: PostingPrescriptQuestion[];
  /** Exact values behind `alreadyAnswered`, required by the irreversible review screen. */
  filledAnswers: PostingPrescriptFilledAnswer[];
  /** How many Litos already answered. The counterweight that makes a short screen read as
   *  progress rather than as a form. */
  alreadyAnswered: number;
  /** How many of the employer's questions Litos could not answer from what it holds.
   *  This is the number on the button into screen 05, and it is real or the button does not
   *  claim it. */
  outstandingQuestions: number;
  /** Total questions the posting asks, so the screen can say "14 of 17" rather than a bare count. */
  totalQuestions: number;
};

export type BuildDeps = {
  /** The FULL posting. The board row carries a 600-character preview, and tailoring against a
   *  truncated description would grade the student on the posting's intro paragraph, which is
   *  where the requirements are not. */
  loadPosting: (jobId: string) => Promise<{ description: string; title: string; company: string }>;
  /** Identity for the resume header. Generation refuses without a name and a resume email. */
  loadIdentity: () => Promise<{ fullName: string | null; resumeEmail: string | null }>;
  generateResume: (input: {
    jobId: string;
    company: string;
    role: string;
    jdText: string;
    fullName: string;
    resumeEmail: string;
  }) => Promise<{ applicationId: string | null; resumeSpec: BuildResult["resumeSpec"] }>;
  loadQuestions: (jobId: string) => Promise<{
    total: number;
    alreadyAnswered: number;
    ask: PostingPrescriptQuestion[];
    filledAnswers: PostingPrescriptFilledAnswer[];
  }>;
};

/** Thrown when the account is missing something generation requires, so the screen can say which
 *  field to fix rather than surfacing a generic failure from deep inside the resume engine. */
export class BuildPreconditionError extends Error {
  readonly field: "full_name" | "resume_email";
  constructor(field: "full_name" | "resume_email", message: string) {
    super(message);
    this.name = "BuildPreconditionError";
    this.field = field;
  }
}

export function initialStages(): BuildStage[] {
  return BUILD_STAGES.map((stage, index) => ({ ...stage, status: index === 0 ? "active" : "waiting" }));
}

/** Advance the list: everything before `key` done, `key` itself set to `status`, rest waiting. */
export function stagesAt(key: BuildStageKey, status: BuildStageStatus): BuildStage[] {
  const at = BUILD_STAGES.findIndex((stage) => stage.key === key);
  return BUILD_STAGES.map((stage, index) => ({
    ...stage,
    status: index < at ? "done" : index === at ? status : "waiting",
  }));
}

/** Every stage done. Only reachable once the last call has resolved. */
export function stagesComplete(): BuildStage[] {
  return BUILD_STAGES.map((stage) => ({ ...stage, status: "done" as const }));
}

/**
 * Run the build, reporting each stage as it genuinely starts and finishes.
 *
 * `onStages` is called with a fresh list on every transition, so the caller renders state it was
 * handed rather than deriving it from a timer. A stage goes `active` before its await and `done`
 * only after that await resolves, which is what makes the list honest: the resume row stays active
 * for exactly as long as the generation takes.
 *
 * Failure marks the stage that failed and rethrows. The screen needs to know WHICH step broke,
 * because "we could not read the posting" and "we could not write your resume" are different
 * sentences with different recoveries, and a single generic error would flatten them.
 */
export async function runOnboardingBuild(
  deps: BuildDeps,
  jobId: string,
  onStages: (stages: BuildStage[]) => void,
): Promise<BuildResult> {
  const fail = (key: BuildStageKey) => onStages(stagesAt(key, "failed"));

  onStages(stagesAt("posting", "active"));
  let posting: Awaited<ReturnType<BuildDeps["loadPosting"]>>;
  let identity: Awaited<ReturnType<BuildDeps["loadIdentity"]>>;
  try {
    /* Both reads belong to the first stage: they are what "reading the posting" means here, and
       neither is slow enough to deserve a row of its own. Run together rather than in sequence
       because they do not depend on each other. */
    [posting, identity] = await Promise.all([deps.loadPosting(jobId), deps.loadIdentity()]);
  } catch (reason) {
    fail("posting");
    throw reason;
  }

  /* Checked HERE, before the expensive call, and named by field.
     Generation rejects a missing name or resume email from deep inside the resume engine, and that
     error reaches a student as a failed build rather than as the one-line fix it actually is. It
     also costs nothing to check first, whereas discovering it after a reservation has been taken
     spends a trial generation on a request that could never have succeeded. */
  if (!identity.fullName?.trim()) {
    fail("resume");
    throw new BuildPreconditionError("full_name", "Your resume did not give us a name to put on the page.");
  }
  if (!identity.resumeEmail?.trim()) {
    fail("resume");
    throw new BuildPreconditionError("resume_email", "Add the email address that should appear on your resume.");
  }

  onStages(stagesAt("resume", "active"));
  let generated: Awaited<ReturnType<BuildDeps["generateResume"]>>;
  try {
    generated = await deps.generateResume({
      jobId,
      company: posting.company,
      role: posting.title,
      jdText: posting.description,
      fullName: identity.fullName.trim(),
      resumeEmail: identity.resumeEmail.trim(),
    });
  } catch (reason) {
    fail("resume");
    throw reason;
  }

  onStages(stagesAt("questions", "active"));
  let questions: Awaited<ReturnType<BuildDeps["loadQuestions"]>>;
  try {
    questions = await deps.loadQuestions(jobId);
  } catch (reason) {
    fail("questions");
    throw reason;
  }

  onStages(stagesComplete());
  return {
    applicationId: generated.applicationId,
    resumeSpec: generated.resumeSpec,
    ask: questions.ask,
    filledAnswers: questions.filledAnswers,
    alreadyAnswered: questions.alreadyAnswered,
    /* Derived from the ask list rather than sent separately, so the count on the button and the
       list on the next screen can never disagree about how many questions there are. */
    outstandingQuestions: questions.ask.length,
    totalQuestions: questions.total,
  };
}

/**
 * One visible list for Review. Answers confirmed in this sitting replace an older value with the
 * same employer wording, and no sensitive value is written to browser storage.
 */
export function reviewableOnboardingAnswers(
  filled: readonly PostingPrescriptFilledAnswer[],
  confirmed: readonly { question: string; answer: string; confirmed?: boolean }[],
  asked: readonly PostingPrescriptQuestion[] = [],
): PostingPrescriptFilledAnswer[] {
  const rows = new Map<string, PostingPrescriptFilledAnswer>();
  for (const item of filled) {
    const key = item.question.trim().toLowerCase();
    if (key && item.answer.trim()) rows.set(key, item);
  }
  for (const item of confirmed) {
    const key = item.question.trim().toLowerCase();
    if (!key) continue;
    /* A blank in this overlay is an intentional review edit. Delete the older prefilled value
       instead of ignoring the blank and silently putting the sensitive answer back on screen. */
    if (!item.answer.trim()) {
      rows.delete(key);
      continue;
    }
    const existing = rows.get(key);
    const question = asked.find((candidate) => candidate.question.trim().toLowerCase() === key);
    rows.set(key, {
      ...existing,
      question: item.question,
      answer: item.answer,
      source: item.confirmed === false ? existing?.source ?? "saved_details" : "applicant_review",
      input_type: existing?.input_type ?? question?.input_type ?? "text",
      options: existing?.options !== undefined ? existing.options : question?.options ?? null,
      required: existing?.required ?? question?.required ?? true,
      max_length: existing?.max_length !== undefined ? existing.max_length : question?.max_length ?? null,
    });
  }
  return [...rows.values()];
}

/**
 * The values on Review as editable employer controls. Saved profile values remain application-only
 * overrides here: the student can correct this packet without silently rewriting account facts.
 */
export function editableOnboardingQuestions(
  filled: readonly PostingPrescriptFilledAnswer[],
  confirmed: readonly { question: string; answer: string; confirmed?: boolean }[],
  asked: readonly PostingPrescriptQuestion[],
): PostingPrescriptQuestion[] {
  const rows = new Map<string, PostingPrescriptQuestion>();
  for (const item of filled) {
    const key = item.question.trim().toLowerCase();
    if (!key) continue;
    rows.set(key, {
      question: item.question,
      input_type: item.input_type ?? "text",
      options: item.options ?? null,
      required: item.required ?? true,
      max_length: item.max_length ?? null,
      answer: item.answer,
      reusable: false,
      remembered: item.source === "applicant_review",
    });
  }
  for (const item of asked) {
    const key = item.question.trim().toLowerCase();
    if (!key) continue;
    const existing = rows.get(key);
    rows.set(key, {
      ...item,
      answer: item.answer || existing?.answer || "",
      remembered: item.remembered || existing?.remembered || false,
    });
  }
  for (const item of confirmed) {
    const key = item.question.trim().toLowerCase();
    if (!key) continue;
    const existing = rows.get(key);
    if (!existing) continue;
    rows.set(key, { ...existing, answer: item.answer });
  }
  return [...rows.values()];
}

export type OnboardingReviewAnswerPayload = {
  id: string;
  question: string;
  answer: string;
  kind: "required";
  required: boolean;
  portal_input_type?: string;
  confirmed?: true;
};

/**
 * The exact application-scoped answer snapshot shared by Save and Send.
 *
 * `kind` is always required because essay means Litos drafted the prose. An optional employer
 * control can still contain the applicant's own answer, so optional does not make it an essay.
 * Confirmations are per-question and opt-in. Prefilled profile values are included so the saved
 * packet remains exact, but they are never attributed to the applicant merely because they were
 * visible beside a value she changed.
 */
export function onboardingReviewAnswerPayload(
  filled: readonly PostingPrescriptFilledAnswer[],
  answered: readonly { question: string; answer: string }[],
  asked: readonly PostingPrescriptQuestion[],
  confirmedQuestions: readonly string[] = [],
): OnboardingReviewAnswerPayload[] {
  const confirmed = new Set(confirmedQuestions.map((question) => question.trim().toLowerCase()).filter(Boolean));
  return editableOnboardingQuestions(filled, answered, asked).map((item) => {
    const key = item.question.trim().toLowerCase();
    return {
      id: `prescript-${item.question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "question"}`,
      question: item.question,
      answer: item.answer.trim(),
      kind: "required" as const,
      required: item.required,
      ...(item.input_type ? { portal_input_type: item.input_type } : {}),
      ...(confirmed.has(key) && item.answer.trim() ? { confirmed: true as const } : {}),
    };
  });
}

/**
 * The label on the button out of this screen.
 *
 * It reports the real count and never rounds it into a promise. Zero outstanding is the one case
 * that skips screen 05 entirely, so the button says what will actually happen next rather than
 * sending the student to a screen with nothing on it.
 */
export function buildActionLabel(result: Pick<BuildResult, "outstandingQuestions">): string {
  const n = result.outstandingQuestions;
  if (n === 0) return "Review and send";
  return n === 1 ? "1 question needs you" : `${n} questions need you`;
}
