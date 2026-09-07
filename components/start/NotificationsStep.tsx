"use client";

/* 10 NOTIFICATIONS: permission, asked LAST - after the card is on file and verified, the final
 * screen before the dashboard.
 *
 * THIS SCREEN AND ITS POSITION WERE BOTH RECONSIDERED (Mehek, 2026-09-07). It used to be folded
 * into the trial screen, asked between the gift and the price on the theory that permission is
 * cheapest to give before any money is involved. It is a screen of its own again and now sits
 * after `plan`: "verified by our platform" is the stronger consent moment here, and its position
 * is now also the payment gate for the rest of setup. The backend will not accept a `plan`
 * acknowledgement without a real Stripe card on file (onboarding.ts, `hasVerifiedPaymentMethod`),
 * and `notifications` is the one step after it in APPLICATION_STEPS - so a student cannot reach
 * this screen, or the dashboard past it, without having actually paid.
 *
 * TWO QUESTIONS, AND THE SHORTNESS IS THE DESIGN. Auto-apply, send-without-asking, the
 * security-check hand-back and the receipt-trail consent are all deliberately NOT here. They are
 * standing permissions with real consequences and each is asked at the moment its feature is first
 * used, once the student is properly inside the product. Putting them in setup would make this
 * screen a wall of checkboxes immediately before the dashboard, which is both worse consent hygiene
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

import { useEffect, useRef, useState } from "react";
import { getBillingReceipt, getNotificationPreferences, setNotificationPreferences } from "@/lib/api";
import { disablePush, enablePush, hasPushSubscription, pushSupport } from "@/lib/push";
import { ErrorNote } from "@/components/app/ui";
import { LaterLink, PrimaryButton, StartShell } from "./ui";
import { track } from "@/lib/analytics";
import { firePurchaseEventOnce } from "@/lib/tiktok-client";

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

/* THE SWITCHES, SEPARATED FROM THE SCREEN so the component can be unit-exercised and so a settings
 * surface elsewhere in the product could reuse the same control without duplicating its logic.
 *
 * EACH CHANGE SAVES ITSELF rather than waiting for a screen-level Continue: a control the student
 * can leave without losing what they just ticked is the more honest shape for a permission, and it
 * keeps the button below about one thing. Every save still sends EVERY key: an unticked box left
 * out reads server-side as "not mentioned" rather than as "no". A student who touches nothing
 * writes nothing, and all-off is exactly the state their account is already in. */
export function NotificationChoices() {
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
      const off = { ...choice, activity_digest: false };
      setChoice(off);
      await disablePush();
      setBrowser((b) => ({ ...b, subscribed: false }));
      await persist(off);
      return;
    }
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      const next = { ...choice, activity_digest: true };
      setChoice(next);
      setBrowser((b) => ({ ...b, permission: "granted", subscribed: true }));
      await persist(next);
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

  /* Every key every time - see the component comment. A failed save unwinds the tick it could not
     keep, so the box never claims a state the server does not hold. */
  async function persist(next: Choice) {
    setError(null);
    try {
      await setNotificationPreferences(next);
    } catch (e) {
      setChoice(choice);
      setError(e instanceof Error ? e.message : "Could not save that.");
    }
  }

  function change(next: Choice) {
    setChoice(next);
    void persist(next);
  }

  return (
    <>
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <p className="mb-6 text-[13px] leading-5 text-muted">
        Litos tells you what changed and nothing else. No weekly roundups, no reminders to come
        back, and no notification that only says a number.
      </p>

      <div className="space-y-3">
        {browser.supported && (
          <Switch
            label="Show me a daily summary on this laptop"
            detail="Once a day, only when something changes."
            checked={choice.activity_digest && browser.subscribed}
            onChange={(next) => void toggleDigest(next)}
          />
        )}
        <Switch
          label="Tell me when a strong match opens"
          detail="One strong match, at most daily."
          checked={choice.strong_match}
          onChange={(strong_match) => change({ ...choice, strong_match })}
        />
        <Switch
          label="Tell me when an employer replies"
          detail="One alert per reply, no message shown."
          checked={choice.employer_reply}
          onChange={(employer_reply) => change({ ...choice, employer_reply })}
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
    </>
  );
}

export function NotificationsStep({
  onDone,
  onLater,
}: {
  onDone: () => void;
  onLater: () => void;
}) {
  const [busy, setBusy] = useState(false);
  /* THE ONLY PLACE ONBOARDING FIRES TIKTOK'S PURCHASE EVENT (Mehek, 2026-09-08).
     "Purchase" here means a card on file, not money collected: the trial takes
     nothing today, and the header comment above already establishes that a
     student cannot reach this screen without hasVerifiedPaymentMethod passing
     server-side. So mounting this screen IS the signal, and it is the single
     onboarding-flow trigger point on purpose -- app/billing/return/page.tsx's
     website branch deliberately skips firing for an onboarding-sourced
     checkout (returnRoute === "/start") so the event is not reported twice
     from two different screens for one purchase. litos-api's Stripe-webhook
     fallback (litos-backend's lib/tiktokEvents.ts) still fires independently
     of any of this, as the reliable backstop for a student who never reaches
     this screen at all; it builds the same event id from the same checkout
     reference, so TikTok's own dedup collapses the two if both land. */
  const purchaseSentRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void getBillingReceipt()
      .then((receipt) => {
        if (!cancelled) firePurchaseEventOnce(purchaseSentRef, receipt);
      })
      .catch(() => {
        /* No receipt yet is not an error worth surfacing here: litos-api's
           webhook fallback still reports the purchase either way. */
      });
    return () => { cancelled = true; };
  }, []);
  return (
    <StartShell step="notifications" title="Want to know when the next one opens?">
      <NotificationChoices />
      <div className="mt-7">
        <PrimaryButton onClick={() => { setBusy(true); onDone(); }} disabled={busy}>
          {busy ? "Saving..." : "Continue"}
        </PrimaryButton>
      </div>
      <div className="mt-4">
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}
