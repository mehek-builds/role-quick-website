import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("review shows the real packet and fails closed when evidence is missing", async () => {
  const [review, start, paper, questions] = await Promise.all([
    read("components/start/ReviewStep.tsx"),
    read("app/start/page.tsx"),
    read("components/start/ResumePaper.tsx"),
    read("components/start/QuestionsStep.tsx"),
  ]);

  assert.match(review, /import \{ ResumePaper, type ContactHeader \}/);
  assert.match(review, /resumeSpec: ResumeSpec \| null/);
  assert.match(review, /answers: readonly PostingPrescriptFilledAnswer\[\]/);
  assert.match(review, /answerEvidenceComplete: boolean/);
  assert.match(review, /<ResumePaper/);
  assert.match(review, /<dl className="space-y-4">/);
  assert.match(review, /disabled=\{busy \|\| !applicationId \|\| !resumeSpec \|\| !answerEvidenceComplete\}/);
  assert.match(review, /From your saved details/);
  assert.match(review, /You confirmed/);
  assert.match(review, /Change source resume/);
  assert.match(review, /Change answers/);
  assert.match(review, /await onBeforeSend\(\)[\s\S]{0,400}?questions: submissionQuestions/);
  assert.match(review, /const \[pendingAction, setPendingAction\] = useState<"send" \| "save" \| null>\(null\)/);
  assert.match(review, /pendingAction === "send" \? <PendingLabel onColor>Sending\.\.\.<\/PendingLabel> : "Send my application"/);
  assert.match(review, /pendingAction === "save" \? <PendingLabel>Saving\.\.\.<\/PendingLabel> : "Save it and send later"/);
  assert.doesNotMatch(review, /JSON\.stringify\(\{ questions: \[\] \}\)/);
  assert.doesNotMatch(review, /Your one page, written for this posting/);

  assert.match(start, /const reviewAnswers = reviewableOnboardingAnswers\(built\.filledAnswers, answersGiven, built\.ask\)/);
  assert.match(start, /answers=\{reviewAnswers\}/);
  assert.match(start, /submissionQuestions=\{reviewSubmissionQuestions\}/);
  assert.match(start, /onBeforeSend=\{persistReviewSnapshot\}/);
  assert.match(start, /editableOnboardingQuestions\(built\.filledAnswers, answersGiven, built\.ask\)/);
  assert.match(start, /reviewMode=\{editingReviewAnswers\}/);
  assert.match(start, /answerEvidenceComplete=\{built\.filledAnswers\.length === built\.alreadyAnswered\}/);
  assert.match(start, /if \(built\.outstandingQuestions > 0\)/);
  assert.match(start, /resumeContact=\{resumeContactHeader/);
  assert.match(start, /setBuilt\(null\);[\s\S]{0,200}?setRevisiting\(null\)/);
  assert.match(start, /const persistApplicationAnswers = async/);
  assert.match(start, /onboardingReviewAnswerPayload\(/);
  assert.match(start, /send: \(path, init\) => api<ReviewAnswerSaveResponse<unknown>>\(path, init\)/);
  assert.match(start, /if \(!result\.saved\) throw new Error\(result\.message\)/);
  const saveLater = start.match(/onSaveForLater=\{async \(\) => \{([\s\S]*?)await ack\("review"\)/)?.[1] ?? "";
  assert.match(start, /const reviewConfirmedQuestions = reviewAnswers\s*\.filter\(\(answer\) => answer\.source === "applicant_review"\)/);
  assert.match(start, /const persistReviewSnapshot = \(\) => persistApplicationAnswers\(\s*built,\s*answersGiven,\s*reviewConfirmedQuestions,/,
    "review persistence must retain blank tombstones and prior applicant provenance");
  assert.match(saveLater, /await persistReviewSnapshot\(\)/);
  assert.match(review, /async function saveForLater\(\)/);
  assert.match(review, /await onSaveForLater\(\)/);
  assert.match(paper, /export function resumeContactHeader/);
  assert.match(questions, /className="ph-no-capture min-w-0 overflow-hidden rounded-inner border border-border bg-surface"/);
});

test("onboarding motion is directional and respects reduced motion", async () => {
  const [questions, shell, css] = await Promise.all([
    read("components/start/QuestionsStep.tsx"),
    read("components/start/ui.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(questions, /"rq-question-forward" : "rq-question-back"/);
  assert.match(shell, /key=\{step\}[\s\S]{0,100}?rq-onboarding-step/);
  assert.match(css, /\.rq-onboarding-reveal[\s\S]{0,160}?var\(--motion-enter\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.rq-question-forward,[\s\S]*?animation: none;/);
});
