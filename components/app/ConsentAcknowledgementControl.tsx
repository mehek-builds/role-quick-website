"use client";

/* The two consent-acceptance permissions, drawn once and rendered by both surfaces that grant
 * them: the last screen of /start, and the Automation tab of Settings.
 *
 * ONE COMPONENT ON PURPOSE, following CaptchaConsentControl. The API stores a version string naming
 * the wording the applicant was shown, and it stores the same string whichever screen the box was
 * ticked on. Two implementations would be two sets of words recorded under one version the moment
 * either drifted, so the copy lives in lib/consent-acknowledgement.ts and the control lives here.
 *
 * The scope is printed in BOTH directions, and the second list is the one that makes the first
 * honest: some declarations are answered, from her own stored answers, and saying "Litos never
 * answers these for you" over a list that included them was false on the one screen that must not
 * contain a false statement about the product.
 */

import {
  ANSWERED_FROM_YOUR_OWN_ANSWERS_CLASSES,
  CONSENT_ACKNOWLEDGEMENT_BOUNDARY,
  CONSENT_ACKNOWLEDGEMENT_HEADING,
  CONSENT_ACKNOWLEDGEMENT_INTRO,
  CONSENT_ACKNOWLEDGEMENT_NEVER_HEADING,
  CONSENT_ACKNOWLEDGEMENT_OWN_ANSWERS_HEADING,
  CONSENT_ACKNOWLEDGEMENT_REVOCABLE,
  CONSENT_ACKNOWLEDGEMENT_WHEN_OFF,
  CONSENT_GRANTS,
  NEVER_ANSWERED_CLASSES,
  consentAcknowledgementGrantedOn,
  type ConsentGrantField,
} from "@/lib/consent-acknowledgement";

export function ConsentAcknowledgementControl({
  /* Distinct per surface. /start renders this inside a page Settings never shows, but the two files
     are one bundle and a duplicated id is a label pointing at the wrong box. */
  idPrefix,
  values,
  grantedAt,
  disabled = false,
  onChange,
}: {
  idPrefix: string;
  values: Partial<Record<ConsentGrantField, boolean>>;
  grantedAt?: Partial<Record<ConsentGrantField, string | null>>;
  disabled?: boolean;
  onChange: (field: ConsentGrantField, enabled: boolean) => void;
}) {
  const scopeId = `${idPrefix}-consent-ack-scope`;
  const boundaryId = `${idPrefix}-consent-ack-boundary`;
  const revocableId = `${idPrefix}-consent-ack-revocable`;
  const offId = `${idPrefix}-consent-ack-off`;

  return (
    <div className="rounded-inner border border-border p-4">
      <p className="text-sm font-medium text-ink">{CONSENT_ACKNOWLEDGEMENT_HEADING}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{CONSENT_ACKNOWLEDGEMENT_INTRO}</p>

      {CONSENT_GRANTS.map((grant) => {
        const id = `${idPrefix}-${grant.field}`;
        const bodyId = `${id}-body`;
        const value = values[grant.field] === true;
        /* Null whenever the verdict is false, even with a date on the row: that pairing is what a
           superseded consent version looks like, and printing the old date over an unticked box
           would claim a permission the server does not honour. */
        const granted = consentAcknowledgementGrantedOn(value, grantedAt?.[grant.field] ?? null);
        return (
          <div key={grant.field} className="mt-4 border-t border-border pt-4">
            <div className="flex items-start justify-between gap-5">
              <label htmlFor={id}>
                <span className="block text-sm font-medium text-ink">{grant.label}</span>
                <span id={bodyId} className="mt-1 block text-xs leading-5 text-muted">{grant.body}</span>
                {granted && (
                  /* Mono, per DESIGN.md: when the machine speaks, it speaks in mono. */
                  <span className="mt-1 block font-mono text-xs leading-5 text-muted">Granted {granted}.</span>
                )}
              </label>
              <input
                id={id}
                /* THE DISCLOSURE HAS TO REACH ASSISTIVE TECH, because here the disclosure IS the
                   consent. aria-label wins the accessible-name computation over everything inside
                   the <label>, so without aria-describedby a screen reader would announce the
                   one-line label and none of the scope, and the box could be ticked having heard
                   none of it. */
                aria-label={grant.label}
                aria-describedby={`${bodyId} ${scopeId} ${boundaryId} ${offId} ${revocableId}`}
                type="checkbox"
                checked={value}
                disabled={disabled}
                onChange={(event) => onChange(grant.field, event.target.checked)}
                className="mt-1 size-4 accent-brand disabled:opacity-40"
              />
            </div>
          </div>
        );
      })}

      <div id={scopeId} className="mt-4 border-t border-border pt-4">
        <p className="text-xs leading-5 text-ink">{CONSENT_ACKNOWLEDGEMENT_NEVER_HEADING}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted">
          {NEVER_ANSWERED_CLASSES.map((klass) => <li key={klass}>{klass}</li>)}
        </ul>
        <p className="mt-3 text-xs leading-5 text-ink">{CONSENT_ACKNOWLEDGEMENT_OWN_ANSWERS_HEADING}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted">
          {ANSWERED_FROM_YOUR_OWN_ANSWERS_CLASSES.map((klass) => <li key={klass}>{klass}</li>)}
        </ul>
      </div>

      <p id={boundaryId} className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted">{CONSENT_ACKNOWLEDGEMENT_BOUNDARY}</p>
      <p id={offId} className="mt-2 text-xs leading-5 text-muted">{CONSENT_ACKNOWLEDGEMENT_WHEN_OFF}</p>
      <p id={revocableId} className="mt-2 text-xs leading-5 text-muted">{CONSENT_ACKNOWLEDGEMENT_REVOCABLE}</p>
    </div>
  );
}
