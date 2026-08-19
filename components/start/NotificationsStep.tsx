"use client";

/* 08 NOTIFICATIONS: permission, asked between the gift and the price.
 *
 * TWO QUESTIONS, AND THE SHORTNESS IS THE DESIGN. Auto-apply, send-without-asking, the
 * security-check hand-back and the receipt-trail consent are all deliberately NOT here. They are
 * standing permissions with real consequences and each is asked at the moment its feature is first
 * used, once the student is properly inside the product. Putting them in setup would make this
 * screen a wall of checkboxes immediately before the price, which is both worse consent hygiene
 * and a worse rung on the ladder.
 *
 * WHY IT IS ASKED HERE AT ALL. Screen 03 established that the posting Litos found was four hours
 * old, and screen 06 sent a real application to a real employer. Both questions on this screen are
 * about those two facts continuing to happen. Asked cold on a settings page, "may we email you"
 * is a favour; asked here it is a continuation of something the student has just watched work.
 *
 * BOTH DEFAULT TO OFF AND NEITHER IS PRE-TICKED. A pre-ticked consent is not a consent, and this
 * screen can be skipped entirely: "Not now" is a real answer and both permissions live in settings
 * forever afterwards.
 *
 * WHAT THIS SCREEN PROMISES, and every word of it is enforced server-side rather than here:
 * one alert a day at most, only postings above the same score the board ranks by, never a digest,
 * and an unsubscribe link on every message that works without signing in.
 */

import { useEffect, useState } from "react";
import { getNotificationPreferences, setNotificationPreferences } from "@/lib/api";
import { ErrorNote } from "@/components/app/ui";
import { LaterLink, PrimaryButton, StartShell } from "./ui";
import { track } from "@/lib/analytics";

type Choice = { strong_match: boolean; employer_reply: boolean };

function Switch({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line px-4 py-4 hover:border-brand/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-brand"
      />
      <span>
        <span className="block text-[15px] leading-6 text-ink">{label}</span>
        <span className="mt-1 block text-[13px] leading-5 text-muted">{detail}</span>
      </span>
    </label>
  );
}

export function NotificationsStep({
  onDone,
  onLater,
}: {
  onDone: () => void;
  onLater: () => void;
}) {
  const [choice, setChoice] = useState<Choice>({ strong_match: false, employer_reply: false });
  const [deliverable, setDeliverable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* Hydrated rather than assumed, so a student who reaches this screen twice sees what they
       already chose instead of two boxes reset to off. A failed read leaves both off, which is the
       state the account is actually in until it says otherwise. */
    getNotificationPreferences()
      .then((preferences) => {
        if (cancelled) return;
        setChoice({
          strong_match: preferences.strong_match.enabled,
          employer_reply: preferences.employer_reply.enabled,
        });
        setDeliverable(preferences.deliverable && preferences.unsubscribe_configured);
      })
      .catch(() => {});
    track("onboarding_step_view", { step: "notifications" });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      /* Both keys every time, because this screen IS the answer to both questions. Leaving an
         unticked box out would read on the server as "not mentioned" rather than as "no", and a
         student who deliberately unticked something would find it still on. */
      await setNotificationPreferences(choice);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  return (
    <StartShell step="notifications" title="Want to know when the next one opens?">
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <p className="mb-6 text-[13px] leading-5 text-muted">
        Two things, and nothing else. Litos does not send digests, weekly roundups or reminders to
        come back.
      </p>

      <div className="space-y-3">
        <Switch
          label="Tell me when a strong match opens"
          detail="One posting, at most once a day, and only when it clears the same match score your board ranks by. Never a list of everything open."
          checked={choice.strong_match}
          onChange={(strong_match) => setChoice((current) => ({ ...current, strong_match }))}
        />
        <Switch
          label="Tell me when an employer replies"
          detail="Once per reply, when it reaches your tracker. Litos tells you mail arrived and where to read it, never what it said."
          checked={choice.employer_reply}
          onChange={(employer_reply) => setChoice((current) => ({ ...current, employer_reply }))}
        />
      </div>

      {!deliverable && (
        /* The server said it cannot actually mail this account: no verified address, or no signing
           secret for an unsubscribe link. Said plainly rather than hidden, because the alternative
           is a student switching something on and hearing nothing forever. */
        <p className="mt-5 text-[13px] leading-5 text-muted">
          Litos cannot send to this account yet. Your choice is saved and starts working once your
          email address is verified.
        </p>
      )}

      <p className="mt-5 text-[13px] leading-5 text-muted">
        Every message has an unsubscribe link that works without signing in, and both of these live
        in Settings under Automation afterwards.
      </p>

      <div className="mt-7">
        <PrimaryButton onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Continue"}
        </PrimaryButton>
      </div>

      <div className="mt-4">
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}
