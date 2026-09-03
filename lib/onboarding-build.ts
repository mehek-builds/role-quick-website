import type { PostingPrescriptQuestion } from "./api";
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

/* QUESTIONS BEFORE THE RESUME, and the order is load-bearing rather than cosmetic (2026-09-01).
   The questions stage is a live read of the employer's form. It reads first so its result can
   pre-answer questions before the one call that costs anything runs. It is a PREVIEW, not a gate:
   a flaky read that comes up empty does NOT fail the build - loadQuestions retries it and then
   proceeds with an empty ask, straight to Review and send, where the form is read fresh (updated
   2026-09-01 after the empty-read dead-end recurred across many jobs). What still refuses before
   generation are the real preconditions below (a name, a resume email), so a spend is never wasted
   on a request that could never have succeeded. */
export const BUILD_STAGES: readonly { key: BuildStageKey; label: string; orb: BuildStage["orb"] }[] = [
  { key: "posting", label: "Reading the posting", orb: "working" },
  { key: "questions", label: "Reading the employer's application", orb: "solving" },
  { key: "resume", label: "Writing your resume for it", orb: "composing" },
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
  /** How many Litos already answered. The counterweight that makes a short screen read as
   *  progress rather than as a form. */
  alreadyAnswered: number;
  /** How many of the employer's questions Litos could not answer from what it holds.
   *  This is the number on the button into screen 05, and it is real or the button does not
   *  claim it. */
  outstandingQuestions: number;
  /** Total questions the posting asks, so the screen can say "14 of 17" rather than a bare count. */
  totalQuestions: number;
  /** Employer fields whose exact options the scan could not read on this pass. Zero for a clean
   *  read. Not blocking: they are confirmed against the live form when the application is sent, and
   *  the questions screen names the count so the student is not surprised at send time. */
  deferredFields: number;
};

/* BUILD IT, OR REJOIN THE ONE ALREADY PAID FOR.
 *
 * THE BUG THIS CLOSES. /start holds its built packet in memory for the sitting (app/start/page.tsx:
 * "A reload mid-sequence therefore lands the student back on the step the LEDGER says they are on
 * with nothing carried over"). So every reload between the build screen and the send screen dropped
 * the packet, returned the student to the build step, and ran POST /resume/generate again for the
 * SAME posting - claiming a second of the account's TWO free onboarding builds. Two reloads
 * exhausted them and bricked the account outright: it could not finish setup (the build needs an
 * entitlement it no longer had) and could not reach /dashboard (the card gate holds the dashboard
 * shut until setup completes). Measured on production 2026-09-03 on a real account:
 * onboarding_builds_used 2, onboarding_completed_at NULL.
 *
 * Raising the limit from one to two on 2026-09-01 was the same symptom answered with a bigger
 * number. THE PACKET WAS NEVER LOST, ONLY THE REFERENCE TO IT, so the fix is to ask for it back.
 *
 * A DIFFERENT POSTING STILL COSTS A BUILD, and must: the read is keyed to the posting, so a student
 * who genuinely picks another job generates for it. What is refused is paying twice for one job.
 *
 * A FAILED READ BUILDS, and that is the deliberate direction to fail in. A backend that does not
 * serve the route yet, a network blip, a malformed answer - none of them may turn a build the
 * student can still afford into a dead end. The worst case is exactly the behaviour that shipped
 * before this existed, which is also what lets the two repos deploy in either order.
 *
 * A PACKETLESS APPLICATION BUILDS TOO. An application row can exist with no generated resume, and
 * a rejoin needs the spec and the packet id, not the row. Nothing to rejoin means build.
 *
 * Injected, like every other dependency in this file, for the reason stated at the top of it:
 * generating a tailored resume costs money, so the decision has to be provable without spending
 * one. This one especially - its whole subject is not spending.
 */
export type RejoinablePacket = { packet: { id: string; spec: ResumeSpec } | null } | null;

export type BuildOrRejoinDeps = {
  /** The account's already-built packet for this posting, or null when there is none. */
  readPacket: (jobId: string) => Promise<RejoinablePacket>;
  /** The real generation. Called only when there is genuinely nothing to rejoin. */
  generate: () => Promise<{ applicationId: string | null; resumeSpec: ResumeSpec | null }>;
};

export type BuildOrRejoinOutcome = {
  applicationId: string | null;
  resumeSpec: ResumeSpec | null;
  /** True when this cost nothing because the packet already existed. Reported, not inferred. */
  rejoined: boolean;
};

export async function buildOrRejoin(deps: BuildOrRejoinDeps, jobId: string): Promise<BuildOrRejoinOutcome> {
  const existing = await deps.readPacket(jobId).catch(() => null);
  if (existing?.packet) {
    /* THE PACKET ID, NOT THE CANONICAL APPLICATION ID. The send resolves its row through
       generated_resumes alone, so handing the canonical id onward answers "Application not found"
       on every send - measured live 2026-09-01. The read route puts both on the wire under names
       that say which is which; this takes the one the send can use. */
    return { applicationId: existing.packet.id, resumeSpec: existing.packet.spec, rejoined: true };
  }
  return { ...(await deps.generate()), rejoined: false };
}

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
    deferredFields: number;
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
 * handed rather than deriving it from a timer. A stage goes `active` when its call is genuinely
 * in flight and `done` only when that call has resolved, which is what makes the list honest: the
 * resume row stays active for exactly as long as the generation takes.
 *
 * THE SCAN AND THE GENERATION RUN TOGETHER, and that is the whole build-time budget. They used to
 * run in sequence, and the comment defending the order said "everything that can refuse runs
 * before the one call that spends" - which was true until 2026-09-01, when the scan stopped being
 * able to refuse: loadQuestions retries and then proceeds with an empty ask, a preview and never a
 * gate. From that day the ordering bought nothing and cost the whole scan's duration, which is a
 * live read of the employer's form and the slower half of some builds - measured on a guest walk:
 * 43s total, ~19s of it the scan sitting in front of a 23s generation. Concurrent, the build costs
 * max(scan, generation), and the 25-second budget is met by construction rather than by luck.
 *
 * What still runs BEFORE the spend is everything that can actually stop it: the posting read, the
 * identity read, and the two named preconditions. A missing name is known the moment identity
 * resolves, so it is checked there - not after a scan it never depended on.
 *
 * Failure marks the stage that failed and rethrows. The screen needs to know WHICH step broke,
 * because "we could not read the posting" and "we could not write your resume" are different
 * sentences with different recoveries, and a single generic error would flatten them. When both
 * in-flight calls fail, the generation's error wins: it is the one that spent something.
 */
export async function runOnboardingBuild(
  deps: BuildDeps,
  jobId: string,
  onStages: (stages: BuildStage[]) => void,
): Promise<BuildResult> {
  /* One mutable map, emitted as a fresh list on every change. With two calls in flight the linear
     stagesAt helper cannot describe the truth - "everything before X is done" stops being the
     shape of the work - so each row carries its own status and the emitters below change exactly
     one at a time. */
  const statuses: Record<BuildStageKey, BuildStageStatus> = { posting: "active", questions: "waiting", resume: "waiting" };
  const emit = () => onStages(BUILD_STAGES.map((stage) => ({ ...stage, status: statuses[stage.key] })));
  const set = (key: BuildStageKey, status: BuildStageStatus) => { statuses[key] = status; emit(); };
  emit();

  let posting: Awaited<ReturnType<BuildDeps["loadPosting"]>>;
  let identity: Awaited<ReturnType<BuildDeps["loadIdentity"]>>;
  try {
    /* Both reads belong to the first stage: they are what "reading the posting" means here, and
       neither is slow enough to deserve a row of its own. Run together rather than in sequence
       because they do not depend on each other. */
    [posting, identity] = await Promise.all([deps.loadPosting(jobId), deps.loadIdentity()]);
  } catch (reason) {
    set("posting", "failed");
    throw reason;
  }
  statuses.posting = "done";

  /* Checked BEFORE anything else launches, and named by field.
     Generation rejects a missing name or resume email from deep inside the resume engine, and that
     error reaches a student as a failed build rather than as the one-line fix it actually is. Both
     facts are known the moment identity resolves, so this is the earliest they can be checked and
     the last moment nothing has been spent. The resume row is the one marked, because the resume
     is what these fields are preconditions OF; the questions row stays waiting, which is truthful:
     the scan never started. */
  if (!identity.fullName?.trim()) {
    set("resume", "failed");
    throw new BuildPreconditionError("full_name", "Your resume did not give us a name to put on the page.");
  }
  if (!identity.resumeEmail?.trim()) {
    set("resume", "failed");
    throw new BuildPreconditionError("resume_email", "Add the email address that should appear on your resume.");
  }

  /* Both in flight from the same moment, each marking its own row as it settles. allSettled so a
     rejection on one side never leaves the other unobserved (an unhandled rejection), and so both
     outcomes are in hand before deciding whose error to surface. */
  statuses.questions = "active";
  statuses.resume = "active";
  emit();

  const questionsRun = deps.loadQuestions(jobId).then(
    (questions) => { set("questions", "done"); return questions; },
    (reason) => { set("questions", "failed"); throw reason; },
  );
  const generationRun = deps.generateResume({
    jobId,
    company: posting.company,
    role: posting.title,
    jdText: posting.description,
    fullName: identity.fullName.trim(),
    resumeEmail: identity.resumeEmail.trim(),
  }).then(
    (generated) => { set("resume", "done"); return generated; },
    (reason) => { set("resume", "failed"); throw reason; },
  );

  const [questionsSettled, generationSettled] = await Promise.allSettled([questionsRun, generationRun]);
  /* The generation's failure outranks the scan's: it is the call that spends, and its refusals
     (the quality hold, the entitlement denial) carry structured bodies the failure screen routes
     on. A scan rejection here is a backstop for a genuine unforeseen error only - the shipped
     loadQuestions catches its own failures and returns an empty ask, so this path asks nothing of
     it in the common case. */
  if (generationSettled.status === "rejected") throw generationSettled.reason;
  if (questionsSettled.status === "rejected") throw questionsSettled.reason;
  const questions = questionsSettled.value;
  const generated = generationSettled.value;

  return {
    applicationId: generated.applicationId,
    resumeSpec: generated.resumeSpec,
    ask: questions.ask,
    alreadyAnswered: questions.alreadyAnswered,
    /* Derived from the ask list rather than sent separately, so the count on the button and the
       list on the next screen can never disagree about how many questions there are. */
    outstandingQuestions: questions.ask.length,
    totalQuestions: questions.total,
    deferredFields: questions.deferredFields,
  };
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
