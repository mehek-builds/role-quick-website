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
  /** The tailored resume the right-hand pane renders. */
  resume: unknown;
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
  }) => Promise<unknown>;
  loadQuestions: (jobId: string) => Promise<{ total: number; outstanding: number }>;
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
  let resume: unknown;
  try {
    resume = await deps.generateResume({
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
  return { resume, outstandingQuestions: questions.outstanding, totalQuestions: questions.total };
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
