"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ImpactComponent,
  RecentExperienceReview,
  getRecentExperienceReview,
  putRecentExperienceReview,
} from "@/lib/api";
import { answersForPick, answersToSend, blankAnswers, type ImpactAnswers } from "@/lib/recent-experience";
import { track } from "@/lib/analytics";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { LaterLink, PrimaryButton, StartShell } from "./ui";

const COMPONENTS: { key: ImpactComponent; label: string; placeholder: string }[] = [
  { key: "action", label: "What did you do?", placeholder: "Example: Built, led, launched, redesigned" },
  { key: "noun", label: "What did you work on?", placeholder: "Example: an onboarding workflow or reporting dashboard" },
  { key: "metric_or_scope", label: "What was the scale?", placeholder: "Example: across multiple teams or used by the recruiting team" },
  { key: "outcome", label: "What changed because of it?", placeholder: "Example: reduced review time or enabled a faster launch" },
];

const QA_REVIEW: RecentExperienceReview = {
  status: "needs_input",
  selected_entry_id: "11111111-1111-4111-8111-111111111111",
  user_selected: false,
  impact_candidate: {
    draft: "Built a TypeScript application.",
    score: 2,
    components: {
      action: { present: true, evidence: "Built" },
      noun: { present: true, evidence: "a TypeScript application" },
      metric_or_scope: { present: false, evidence: null },
      outcome: { present: false, evidence: null },
    },
  },
  grounded_bullet_count: 1,
  missing_bullets: 2,
  completed: false,
  continue_with_found: false,
  candidates: [{
    entry_id: "11111111-1111-4111-8111-111111111111",
    type: "job",
    org: "Litos",
    title: "Software Engineering Intern",
    date_range: "May 2025 - August 2025",
    bullet_variants: ["Built a TypeScript application."],
  }],
};

type Answers = ImpactAnswers;

export function RecentExperienceStep({
  onDone,
  onLater,
  demo = false,
}: {
  onDone: () => void;
  onLater: () => void;
  demo?: boolean;
}) {
  const [review, setReview] = useState<RecentExperienceReview | null>(demo ? QA_REVIEW : null);
  const [selectedId, setSelectedId] = useState<string | null>(demo ? QA_REVIEW.selected_entry_id : null);
  const [answers, setAnswers] = useState<Answers[]>(blankAnswers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Whether the chooser stays on screen after a pick.
   *
   * The radio group used to render on `status === "choose_entry"` alone, and picking a radio PUTs
   * immediately, and the server answers that PUT with `needs_input`. So the single click that chose
   * an experience was also the click that deleted the control for choosing one, with no Continue,
   * no confirm and no back. A mis-click was final, and a reload did not bring the group back
   * because the stored status is no longer choose_entry. Keeping it open is the whole fix: choosing
   * again is just another PUT, which the server already supports. */
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (demo) return;
    getRecentExperienceReview()
      .then((value) => {
        setReview(value);
        setSelectedId(value.selected_entry_id);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load your experience."));
  }, [demo]);

  const selected = useMemo(
    () => review?.candidates.find((candidate) => candidate.entry_id === selectedId) ?? null,
    [review, selectedId],
  );
  const missing = review?.impact_candidate
    ? COMPONENTS.filter(({ key }) => !review.impact_candidate?.components[key].present)
    : COMPONENTS;
  const hasExistingBullet = (review?.grounded_bullet_count ?? 0) > 0;
  const visibleAnswerIndices = [
    ...(hasExistingBullet && missing.length > 0 ? [0] : []),
    ...Array.from(
      { length: review?.missing_bullets ?? 0 },
      (_, index) => index + (hasExistingBullet ? 1 : 0),
    ),
  ];
  const answerCount = Math.max(1, ...visibleAnswerIndices.map((index) => index + 1));

  function setAnswer(index: number, key: ImpactComponent, value: string) {
    setAnswers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  /* Picking a candidate still round-trips, because the answer fieldsets below are driven by the
     SERVER's reading of the chosen entry (which components are missing, how many bullets it is
     short) and the client cannot derive those. What changed is that the pick no longer ends the
     step: the chooser stays open, and choosing again simply re-PUTs.

     The `saved.completed -> onDone()` shortcut is gone with it. Advancing past a step is a
     deliberate act, and it was firing off a single radio click - so a mis-click on an entry the
     server considered already complete skipped the screen entirely, with no control left on it to
     go back with. "Save and continue" advances now, and it is one more click on the rare entry
     that needed none. */
  async function chooseCandidate(entryId: string) {
    /* Answers belong to the ENTRY they were typed about, so switching entry drops them and
       re-picking the same one does not. The rule and its argument live in lib/recent-experience.ts,
       where they are tested against behaviour instead of against this file's text. */
    setAnswers((current) => answersForPick(selectedId, entryId, current));
    setSelectedId(entryId);
    setChoosing(true);
    if (demo) return;
    setBusy(true);
    setError(null);
    try {
      setReview(await putRecentExperienceReview({
        selected_entry_id: entryId,
        answers: [],
        continue_with_found: false,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not select that experience.");
    } finally {
      setBusy(false);
    }
  }

  async function save(continueWithFound: boolean) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      let savedScore = review?.impact_candidate?.score ?? 0;
      if (!demo) {
        /* The answers go up either way. `continue_with_found` says "stop asking me for more", not
           "throw away what I already typed" - and it used to send an empty array, so a student who
           filled two fields and then pressed the link lost both without being told. The flag is the
           only thing that should differ between the two buttons. See answersToSend for what it
           trims and, more importantly, for what it must never trim. */
        const saved = await putRecentExperienceReview({
          selected_entry_id: selectedId,
          answers: answersToSend(answers, answerCount),
          continue_with_found: continueWithFound,
        });
        if (!saved.completed) {
          setReview(saved);
          setError("Add enough grounded detail for three bullets, or continue with what we found.");
          setBusy(false);
          return;
        }
        savedScore = saved.impact_candidate?.score ?? 0;
      }
      track(continueWithFound ? "recent_experience_enrichment_skipped" : "recent_experience_enrichment_added", {
        score: savedScore,
        answers: answers.flatMap((item) => Object.values(item)).filter((value) => value?.trim()).length,
      });
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save that experience.");
      setBusy(false);
    }
  }

  if (!review) {
    return (
      <StartShell step="impact" title="Finding your strongest recent work.">
        {error ? <ErrorNote message={error} /> : <div className="rq-shimmer h-32 rounded-inner" />}
      </StartShell>
    );
  }

  return (
    <StartShell step="impact" title="Make your most recent work count.">
      {error && <div className="mb-5"><ErrorNote message={error} /></div>}

      {(review.status === "choose_entry" || choosing) && (
        <fieldset className="mb-7">
          <legend className="text-sm leading-6 text-ink">
            We could not determine which experience is newest. Which one is most valuable for your next application?
          </legend>
          <div className="mt-3 overflow-hidden rounded-inner border border-border">
            {review.candidates.map((candidate) => (
              <label key={candidate.entry_id} className="flex cursor-pointer gap-3 border-t border-border px-4 py-3 first:border-t-0 hover:bg-surface-alt">
                <input
                  type="radio"
                  name="recent-experience"
                  value={candidate.entry_id}
                  checked={selectedId === candidate.entry_id}
                  onChange={() => void chooseCandidate(candidate.entry_id)}
                  disabled={busy}
                  className="mt-1 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{candidate.title || candidate.type} at {candidate.org}</span>
                  <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{candidate.date_range || "Date not found"}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {selected && (
        <div className="mb-7 rounded-inner border border-border bg-surface-alt px-4 py-3.5">
          <p className="text-sm text-ink">{selected.title || selected.type} at {selected.org}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{selected.date_range || "Date not found"}</p>
          {review.impact_candidate?.draft && <p className="mt-3 text-[13px] leading-6 text-muted">{review.impact_candidate.draft}</p>}
          {/* The way back after a reload. `choosing` is component state, so a student who picked in
              an earlier session lands here with the group closed and the stored status no longer
              choose_entry; without this there is no control on the screen that reopens it. Shown
              only when there is something else to pick. */}
          {!choosing && review.status !== "choose_entry" && review.candidates.length > 1 && (
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="mt-3 min-h-11 px-1 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Choose a different experience
            </button>
          )}
        </div>
      )}

      {selectedId && (
        <div className="space-y-6">
          {visibleAnswerIndices.map((index) => (
            <fieldset key={index} className="rounded-inner border border-border px-4 py-4">
              <legend className="px-1 text-sm text-ink">
                {hasExistingBullet && index === 0 ? "Strengthen this accomplishment" : `Add accomplishment ${hasExistingBullet ? index : index + 1}`}
              </legend>
              <p className="mb-4 text-[13px] leading-6 text-muted">
                Use only details you know. Leave anything blank if you are unsure.
              </p>
              <div className="space-y-4">
                {(hasExistingBullet && index === 0 ? missing : COMPONENTS).map(({ key, label, placeholder }) => (
                  <label key={key} className="block">
                    <span className="text-xs text-muted">{label}</span>
                    <input
                      value={answers[index]?.[key] ?? ""}
                      onChange={(event) => setAnswer(index, key, event.target.value)}
                      placeholder={placeholder}
                      maxLength={key === "action" ? 40 : key === "metric_or_scope" ? 120 : 180}
                      className="mt-1.5 min-h-[44px] w-full rounded-inner border border-control-border bg-white px-4 text-sm text-ink placeholder:text-faint focus:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <PrimaryButton onClick={() => void save(false)} disabled={busy || !selectedId}>
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Save and continue"}
        </PrimaryButton>
        <button
          type="button"
          disabled={busy || !selectedId}
          onClick={() => void save(true)}
          className="min-h-11 px-1 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-40"
        >
          Continue with what you found.
        </button>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}
