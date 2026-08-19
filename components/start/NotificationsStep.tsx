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
import { disablePush, enablePush, hasPushSubscription, pushSupport } from "@/lib/push";
import { ErrorNote } from "@/components/app/ui";
import { LaterLink, PrimaryButton, StartShell } from "./ui";
import { track } from "@/lib/analytics";

type Choice = { strong_match: boolean; employer_reply: boolean; activity_digest: boolean };

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
  const [choice, setChoice] = useState<Choice>({ strong_match: false, employer_reply: false, activity_digest: false });
  const [deliverable, setDeliverable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The browser's own verdict, kept apart from the account preference because they are different
     facts and can disagree. A student can have the toggle on and have revoked permission in Chrome,
     in which case the honest thing to draw is a control that says so rather than one that claims to
     be on. Resolved on mount because Notification.permission is synchronous but the subscription
     lookup is not. */
  const [browser, setBrowser] = useState<{ supported: boolean; permission: NotificationPermission | null; subscribed: boolean }>(
    { supported: false, permission: null, subscribed: false },
  );

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
          activity_digest: preferences.activity_digest.enabled,
        });
        setDeliverable(preferences.deliverable && preferences.unsubscribe_configured);
      })
      .catch(() => {});
    const support = pushSupport();
    void hasPushSubscription().then((subscribed) => {
      if (!cancelled) {
        setBrowser({
          supported: support.supported,
          permission: support.supported ? support.permission : null,
          subscribed,
        });
      }
    });
    track("onboarding_step_view", { step: "notifications" });
    return () => { cancelled = true; };
  }, []);

  /* THE BROWSER PROMPT FIRES FROM THIS CLICK AND NOWHERE ELSE.
   *
   * Notification.requestPermission() is effectively a one-shot ask: a student who clicks Block can
   * never be asked again by any code we write. Firing it on page load would spend that one ask
   * before she has read what it is for, which is both worse consent and a permanently blocked
   * origin. So it is attached to the checkbox itself, and the checkbox only goes on if the browser
   * actually said yes. */
  async function toggleDigest(next: boolean) {
    setError(null);
    if (!next) {
      setChoice((current) => ({ ...current, activity_digest: false }));
      await disablePush();
      setBrowser((b) => ({ ...b, subscribed: false }));
      return;
    }
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      setChoice((current) => ({ ...current, activity_digest: true }));
      setBrowser((b) => ({ ...b, permission: "granted", subscribed: true }));
      return;
    }
    /* Every failure leaves the box OFF and says which one it was. A checkbox that ticks itself
       after the browser refused is a control claiming something that will never happen. */
    setChoice((current) => ({ ...current, activity_digest: false }));
    setBrowser((b) => ({ ...b, permission: result.reason === "denied" ? "denied" : b.permission }));
    setError(
      result.reason === "denied"
        ? "Your browser is blocking notifications for Litos. Turn them back on in your browser's site settings for trylitos.com, then try again."
        : result.reason === "dismissed"
          ? "The browser prompt was dismissed. Tick the box again to see it once more."
          : result.reason === "not_configured"
            ? "Litos cannot send browser notifications yet. Your other choices still save."
            : "This browser will not accept notifications. Safari needs the site added to your Dock first.",
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      /* Every key every time, because this screen IS the answer to all of them. Leaving an unticked
         box out would read on the server as "not mentioned" rather than as "no", and a student who
         deliberately unticked something would find it still on. */
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
        Litos tells you what changed and nothing else. No weekly roundups, no reminders to come
        back, and no notification that only says a number.
      </p>

      <div className="space-y-3">
        {browser.supported && (
          <Switch
            label="Show me a daily summary on this laptop"
            detail="A browser notification once a day: what Litos applied to for you, what came back needing you, and any employer replies. Only what changed since the last one, so a quiet day is silent."
            checked={choice.activity_digest && browser.subscribed}
            onChange={(next) => void toggleDigest(next)}
          />
        )}
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

      {browser.supported && choice.activity_digest && (
        /* THE LIMIT, ON THE SCREEN THAT ASKS. A push is delivered to a browser, not to an operating
           system, so a shut laptop gets nothing until it opens. Saying so here is the difference
           between a student who understands a quiet morning and one who concludes Litos is broken. */
        <p className="mt-5 text-[13px] leading-5 text-muted">
          These arrive while your browser is open, on this laptop. Close it and they wait until you
          are back. They do not follow you to your phone.
        </p>
      )}

      <p className="mt-5 text-[13px] leading-5 text-muted">
        Emails carry an unsubscribe link that works without signing in, and all of these live in
        Settings under Automation afterwards.
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
