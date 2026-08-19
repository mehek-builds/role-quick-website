"use client";

/* 05 WHAT THE JOB ASKS: one question at a time, in the employer's own words.
 *
 * The interaction is the approval-card pattern: a fixed-height viewport that slides between
 * questions, lettered options, a step badge with the position, and an auto-advance that makes
 * three questions three taps rather than a form.
 *
 * TWO DELIBERATE DEPARTURES FROM THAT PATTERN, both because this screen writes to a real
 * employer's application rather than to a local preference:
 *
 *   1. NO FREE-TEXT ESCAPE BESIDE A CLOSED LIST. The pattern offers "Other" as a typed answer
 *      under the last letter. Here that would hand back the exact bug the employer's option list
 *      fixes: a value their form does not contain cannot be submitted however it was typed, and
 *      the largest class of stuck packets is precisely that. Free text appears only where the
 *      question is genuinely open.
 *   2. NO AUTO-ADVANCE ON A SELF-DECLARATION. Those are statements the applicant makes about
 *      herself, and a 320ms advance turns one into a swipe. See lib/onboarding-questions.ts.
 *
 * The auto-approve countdown from the pattern's plan variant does not come here at all. A timer
 * that acts on its own is the countdown the Guardrails ban, and the screen after this one sends a
 * real application.
 */

import { useEffect, useRef, useState } from "react";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import type { PostingPrescriptQuestion } from "@/lib/api";
import {
  allRequiredAnswered,
  answerKey,
  answersToSave,
  askExplanation,
  kindOf,
  nextIndexAfter,
  optionLetter,
  remainingRequired,
  type AnswerMap,
} from "@/lib/onboarding-questions";
import { track } from "@/lib/analytics";
import { LaterLink, PrimaryButton, StartShell } from "./ui";

/** How long the answered question stays on screen before the slide. Long enough to see the choice
 *  register, short enough that three questions still feel like three taps. */
const ADVANCE_MS = 320;

export function QuestionsStep({
  company,
  questions,
  given,
  alreadyAnswered,
  onSaved,
  onLater,
}: {
  company: string;
  questions: PostingPrescriptQuestion[];
  /** Answers this student already gave on a previous visit to this screen, replayed onto it. */
  given?: { question: string; answer: string }[];
  /** How many Litos already answered. The honest counterweight that makes a three-question screen
   *  read as progress rather than as a form. */
  alreadyAnswered: number;
  onSaved: (answers: { question: string; answer: string }[]) => Promise<void> | void;
  onLater: () => void;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(() => ({
    ...Object.fromEntries(questions.filter((q) => q.answer).map((q) => [answerKey(q), q.answer])),
    /* Layered ON TOP of whatever the employer's form already carried, because a student who came
       back to change an answer is the more recent authority on it. Matched by question text, which
       is the only identity an answer has once it has left this screen. */
    ...Object.fromEntries(
      (given ?? [])
        .map((item) => {
          const question = questions.find((q) => q.question === item.question);
          return question ? [answerKey(question), item.answer] : null;
        })
        .filter((entry): entry is [string, string] => entry !== null),
    ),
  }));
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const current = questions[Math.min(index, questions.length - 1)];
  const complete = allRequiredAnswered(questions, answers);
  const left = remainingRequired(questions, answers);

  function choose(question: PostingPrescriptQuestion, value: string) {
    setAnswers((prev) => ({ ...prev, [answerKey(question)]: value }));
    const at = questions.indexOf(question);
    const next = nextIndexAfter(questions, at);
    if (next === null) return;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => setIndex(next), ADVANCE_MS);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSaved(answersToSave(questions, answers));
      track("onboarding_questions_saved", { asked: questions.length, already_answered: alreadyAnswered });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save those answers.");
      setBusy(false);
    }
  }

  if (questions.length === 0) {
    /* Not reachable from the build screen, which sends the student straight to review when nothing
       is outstanding. Handled anyway rather than rendering an empty card. */
    return (
      <StartShell step="questions" title={`${company} asks nothing Litos cannot answer.`}>
        <PrimaryButton onClick={() => void save()}>Review and send</PrimaryButton>
      </StartShell>
    );
  }

  const explanation = askExplanation(current);

  return (
    <StartShell
      step="questions"
      title={
        questions.length === 1
          ? `One question ${company} asks that I can't answer for you.`
          : `${questions.length} questions ${company} asks that I can't answer for you.`
      }
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <p className="mb-6 text-sm leading-6 text-muted">
        These are their words and their options, copied from the form. They go onto this
        application, and Litos keeps what it can reuse so the next one is shorter.
        {alreadyAnswered > 0 && ` It already answered ${alreadyAnswered} for you.`}
      </p>

      <section
        aria-live="polite"
        className="overflow-hidden rounded-inner border border-border bg-surface"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-alt px-4 py-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-muted">
            {current.required ? "Required" : "Optional"} · {company}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {Math.min(index, questions.length - 1) + 1} / {questions.length}
          </span>
        </header>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-[15px] leading-6 text-ink">{current.question}</p>

          {kindOf(current) === "closed" ? (
            <div role="radiogroup" aria-label={current.question} className="flex flex-wrap gap-2">
              {(current.options ?? []).map((option, i) => {
                const on = answers[answerKey(current)] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(current, option)}
                    className={`flex min-h-11 items-center gap-2 rounded-control border px-3.5 py-1.5 text-[13px] transition-colors ${
                      on
                        ? "border-brand bg-brand-soft text-brand-ink"
                        : "border-control-border bg-surface text-ink hover:border-brand"
                    }`}
                  >
                    <span className="font-mono text-[10.5px] text-muted">{optionLetter(i)}</span>
                    {option}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Open question: their form takes words, so this takes words. No letters, because
               there is no list of theirs to letter. */
            <label className="block">
              <span className="sr-only">{current.question}</span>
              <textarea
                value={answers[answerKey(current)] ?? ""}
                maxLength={current.max_length ?? undefined}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [answerKey(current)]: event.target.value }))
                }
                rows={3}
                className="min-h-[88px] w-full rounded-inner border border-control-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
                placeholder="In your own words"
              />
            </label>
          )}

          {explanation && (
            <p className="font-mono text-[11px] leading-5 text-muted">Asked because {explanation}.</p>
          )}
        </div>
      </section>

      {/* Step nav. Arrows rather than a progress bar: the badge above already says the position,
          and back has to stay available so a mis-tap on an auto-advancing question is never final. */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous question"
          disabled={index <= 0}
          onClick={() => setIndex((n) => Math.max(0, n - 1))}
          className="min-h-11 rounded-control border border-control-border px-3 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          aria-label="Next question"
          disabled={index >= questions.length - 1}
          onClick={() => setIndex((n) => Math.min(questions.length - 1, n + 1))}
          className="min-h-11 rounded-control border border-control-border px-3 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
        <span className="ml-1 text-[13px] text-muted">
          {left === 0 ? "All answered" : left === 1 ? "1 still needs you" : `${left} still need you`}
        </span>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <PrimaryButton onClick={() => void save()} disabled={busy || !complete}>
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Save and review"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}
