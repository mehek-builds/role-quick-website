"use client";

/* The human-check permission, drawn once and rendered by both surfaces that grant it: the last
 * screen of /start, and the Automation tab of Settings.
 *
 * ONE COMPONENT ON PURPOSE. The API stores a version string naming the wording the applicant was
 * shown, and it stores the same string whichever screen the box was ticked on. Two implementations
 * of this control would be two sets of words recorded under one version the moment either drifted,
 * so the copy lives in lib/captcha-consent.ts and the control lives here.
 *
 * The off state is printed, not implied. Turning this down does not silence Litos: the stall line
 * that explains the check is written before the permission is ever read. Saying so is what keeps
 * "off" from reading as the silent dead end the stall line was added to fix.
 */

import {
  CAPTCHA_CONSENT_BOUNDARY,
  CAPTCHA_CONSENT_COPY,
  CAPTCHA_CONSENT_HEADING,
  CAPTCHA_CONSENT_INTRO,
  CAPTCHA_CONSENT_REVOCABLE,
  CAPTCHA_CONSENT_WHEN_OFF,
  captchaConsentGrantedOn,
} from "@/lib/captcha-consent";

export function CaptchaConsentControl({
  /* Distinct per surface. /start renders this inside a page that Settings never shows, but the two
     files are one bundle and a duplicated id is a label that points at the wrong box. */
  idPrefix,
  value,
  grantedAt,
  disabled = false,
  onChange,
}: {
  idPrefix: string;
  value: boolean;
  grantedAt?: string | null;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const id = `${idPrefix}-captcha-consent`;
  /* THE DISCLOSURE HAS TO REACH ASSISTIVE TECH, because here the disclosure IS the consent. The
     aria-label below wins the accessible-name computation over everything inside the <label>, so
     without this a screen reader would announce the one-line label and none of what the permission
     actually means, and the box could be ticked having heard none of it. */
  const bodyId = `${id}-body`;
  const offId = `${id}-off`;
  const boundaryId = `${id}-boundary`;
  const revocableId = `${id}-revocable`;
  /* Null whenever the verdict is false, even with a date on the row: that pairing is what a
     superseded consent version looks like, and it is the live state of every account stamped with
     the stale version. Printing the old date over an unticked box would claim a permission the
     server does not honour. */
  const granted = captchaConsentGrantedOn(value, grantedAt ?? null);

  return (
    <div className="rounded-inner border border-border p-4">
      <p className="text-sm font-medium text-ink">{CAPTCHA_CONSENT_HEADING}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{CAPTCHA_CONSENT_INTRO}</p>
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-start justify-between gap-5">
          <label htmlFor={id}>
            <span className="block text-sm font-medium text-ink">{CAPTCHA_CONSENT_COPY.label}</span>
            <span id={bodyId} className="mt-1 block text-xs leading-5 text-muted">{CAPTCHA_CONSENT_COPY.body}</span>
            <span id={offId} className="mt-1 block text-xs leading-5 text-muted">{CAPTCHA_CONSENT_WHEN_OFF}</span>
            {granted && (
              /* Mono, per DESIGN.md: "Every number, timestamp, filename, ATS name, status, and
                 label. When the machine speaks, it speaks in mono." */
              <span className="mt-1 block font-mono text-xs leading-5 text-muted">Granted {granted}.</span>
            )}
          </label>
          <input
            id={id}
            aria-label={CAPTCHA_CONSENT_COPY.label}
            aria-describedby={`${bodyId} ${offId} ${boundaryId} ${revocableId}`}
            type="checkbox"
            checked={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-1 size-4 accent-brand disabled:opacity-40"
          />
        </div>
      </div>
      <p id={boundaryId} className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted">{CAPTCHA_CONSENT_BOUNDARY}</p>
      <p id={revocableId} className="mt-2 text-xs leading-5 text-muted">{CAPTCHA_CONSENT_REVOCABLE}</p>
    </div>
  );
}
