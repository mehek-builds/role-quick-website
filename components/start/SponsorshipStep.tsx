"use client";

/* 01 VISA
 *
 * The one question in setup that permanently changes WHICH JOBS EXIST for this person.
 *
 * Everything else in /start is a preference: change your mind and the next screen reflects it. This
 * answer is written once and cannot be edited, so the screen has three jobs, and the third is the
 * one that is easy to skip. It has to ask in words a job seeker actually uses, it has to say what
 * the answer will DO, and it has to say - before the answer is given, not after - that it is
 * permanent. A consequence disclosed afterwards is not a disclosure.
 *
 * It also states the thing this answer is NOT for. Litos never types a work-authorization answer
 * into an employer's form (R-004: those questions are location-scoped, and replaying a global
 * answer once shipped a false legal declaration on a live application). This screen is about which
 * jobs get shown. The refusal list on the resume step makes the same promise; it is repeated here
 * because this is where somebody would reasonably assume the opposite.
 */

import { useState } from "react";
import { declareSponsorship, type SponsorshipAnswer } from "@/lib/api";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { PrimaryButton, StartShell } from "./ui";

/* Written for the plain-language bar: everyday words, short sentences, and the two "yes" answers
   phrased the way people describe their own situation rather than the way an immigration form
   does. "Sponsorship" appears in the explanation, not in the choices, because the choices have to
   be answerable by somebody who has never heard the word. */
const OPTIONS: { value: SponsorshipAnswer; label: string; hint: string }[] = [
  {
    value: "needs_now",
    label: "Need sponsorship now",
    hint: "A company must sponsor you before you start.",
  },
  {
    value: "needs_future",
    label: "Can work now, need sponsorship later",
    hint: "Common when a student visa lets you work for a limited time.",
  },
  {
    value: "not_authorized",
    label: "Not authorized yet",
    hint: "You cannot currently work in the job's country.",
  },
  {
    value: "no",
    label: "Already authorized",
    hint: "You can already work in the job's country.",
  },
];

/* NO "Finish later" ON THIS ONE SCREEN, and it is the only step in the flow without it.
 * Every other step defers a task. Deferring this one produces a specific harm: the account reads as
 * "never asked", which leaves the board whole, so the person this exists to protect spends their
 * first session on jobs that will not sponsor them. It is four radio buttons, and it is the gate to
 * everything after it. */
export function SponsorshipStep({ onDone }: { onDone: () => void }) {
  const [answer, setAnswer] = useState<SponsorshipAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!answer) return;
    setBusy(true);
    setError(null);
    try {
      await declareSponsorship(answer);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  return (
    <StartShell
      step="sponsorship"
      title="Do you need a work visa?"
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <fieldset className="mb-7 space-y-2.5">
        <legend className="sr-only">Do you need a company to sponsor a work visa?</legend>
        {OPTIONS.map((option) => {
          const on = answer === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-inner border px-4 py-3.5 transition-colors ${
                on ? "border-brand bg-brand-soft" : "border-border hover:border-faint"
              }`}
            >
              <input
                type="radio"
                name="sponsorship"
                value={option.value}
                checked={on}
                onChange={() => setAnswer(option.value)}
                className="mt-1 accent-brand"
              />
              <span className="min-w-0">
                <span className="block text-sm text-ink">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* Shown before the answer is given, not after it is saved. Same reason the countdown on the
          store listing is 15 seconds and not 9: a consequence a person learns about afterwards is
          not one they agreed to. */}
      <div className="mb-7 space-y-1 text-[13px] leading-5 text-muted">
        <p>If you need sponsorship, we only show jobs from likely sponsors.</p>
        <p>This answer is permanent. We never fill it in for you.</p>
      </div>

      <PrimaryButton onClick={() => void save()} disabled={busy || answer === null}>
        {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
      </PrimaryButton>
    </StartShell>
  );
}
