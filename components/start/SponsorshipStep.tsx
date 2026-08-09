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
 * It also states WHERE ELSE this answer goes, and that paragraph was a lie until 2026-08-09.
 *
 * It said "We never fill it in for you." The backend had filled a work-authorization or sponsorship
 * answer on dozens of real applications by then, from these same two columns, and it had done it
 * inconsistently: "are you legally authorized to work in the united states?" was answered, "are you
 * legally authorized to work in the us?" was not, and "the country where this role is located" was
 * not, so the Deepgram packet could not be sent at all. A promise the product breaks is worse than
 * either coherent policy, because the person relying on it cannot predict what will happen.
 *
 * The rule the backend now follows, and the rule this copy states, is the same one:
 *
 *   - A SPONSORSHIP question is answered "yes" whenever she needs sponsorship. That discloses a
 *     limitation rather than claiming a permission, so it can only ever narrow what a company
 *     offers, never obtain something under false pretenses.
 *   - An AUTHORIZATION question is answered only when the question is about the United States,
 *     which is what these two columns are about. A question that names another country, or that
 *     points at a posting that is not in the US or does not say where it is, is left blank.
 *
 * R-004's actual defect is intact: no answer here is inferred from a job description, an address or
 * an enrolment. It comes from these columns or it does not come at all. The behaviour and this copy
 * are pinned to each other by tests/sponsorship.test.mjs here and
 * src/lib/workAuthorizationScope.test.ts in the backend; change one and change both.
 */

import { useState } from "react";
import { declareSponsorship, type SponsorshipAnswer } from "@/lib/api";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { PrimaryButton, StartShell } from "./ui";

/* Written for the plain-language bar: everyday words, short sentences, and the two "yes" answers
   phrased the way people describe their own situation rather than the way an immigration form
   does. "Sponsorship" appears in the explanation, not in the choices, because the choices have to
   be answerable by somebody who has never heard the word.

   THE TWO AUTHORIZATION HINTS NAME THE COUNTRY, and they did not until 2026-08-09. They said "the
   job's country", which reads as though one radio button could describe every country at once. It
   cannot: being allowed to work in the UK says nothing about the US, and this answer is stored as
   one boolean. Everything downstream of it is American anyway - the board filter it turns on is
   built from H-1B filings, which are US petitions - so naming the country is what the screen
   already meant. It also stops somebody authorized elsewhere from picking "Already authorized" and
   having that repeated onto a US employer's form. */
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
    hint: "You cannot currently work in the United States.",
  },
  {
    value: "no",
    label: "Already authorized",
    hint: "You can already work in the United States.",
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
      <div className="mb-7 space-y-1.5 text-[13px] leading-5 text-muted">
        <p>If you need sponsorship, we only show jobs from likely sponsors.</p>
        <p>This answer is permanent.</p>
        {/* Says what happens, in the order a person meets it on a form. The sponsorship half is
            unconditional because it is a disclosure; the authorization half carries its condition
            because that half is a claim, and this answer is about the United States. */}
        <p>
          We also put it on application forms. Do you need sponsorship? gets a yes whenever you do.
          Are you authorized to work? gets an answer only when the job is in the United States.
          Anything else is left blank for you.
        </p>
      </div>

      <PrimaryButton onClick={() => void save()} disabled={busy || answer === null}>
        {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
      </PrimaryButton>
    </StartShell>
  );
}
