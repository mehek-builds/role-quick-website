"use client";

/* The employer-account permission, drawn once so that whoever asks for it shows the same words.
 *
 * ONE COMPONENT ON PURPOSE, for the reason CaptchaConsentControl states: the API stores a version
 * string naming the wording the applicant was shown, and it stores the same string whichever screen
 * the box was ticked on. Two implementations would be two sets of words recorded under one version
 * the moment either drifted, so the copy lives in lib/portal-account-consent.ts and the control
 * lives here. Today only Settings renders it; that is why the id is still prefixed per surface.
 *
 * WHAT THIS CONTROL SHOWS THAT THE OTHERS DO NOT, and it is the reason the layout differs from
 * CaptchaConsentControl rather than copying it exactly: the four things the permission carries are
 * printed as a list, above the boundary. On every other grant on this screen the act is one
 * sentence long. Here it has two sign-in shapes, a hard limit, and a boundary against sending, and
 * an applicant who ticks this box having read only the label has agreed to something she was not
 * told. The list is the disclosure, so it renders inside the consent block and is named by
 * aria-describedby along with everything else.
 */

import {
  PORTAL_ACCOUNT_CONSENT_BOUNDARY,
  PORTAL_ACCOUNT_CONSENT_CARRIES,
  PORTAL_ACCOUNT_CONSENT_CARRIES_HEADING,
  PORTAL_ACCOUNT_CONSENT_COPY,
  PORTAL_ACCOUNT_CONSENT_HEADING,
  PORTAL_ACCOUNT_CONSENT_INTRO,
  PORTAL_ACCOUNT_CONSENT_REVOCABLE,
  PORTAL_ACCOUNT_CONSENT_WHEN_OFF,
  portalAccountConsentGrantedOn,
} from "@/lib/portal-account-consent";

export function PortalAccountConsentControl({
  /* Distinct per surface, the same reason CaptchaConsentControl takes one: two screens in one
     bundle sharing an id is a label that points at the wrong box. */
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
  const id = `${idPrefix}-portal-account-consent`;
  /* THE DISCLOSURE HAS TO REACH ASSISTIVE TECH, because here the disclosure IS the consent. The
     aria-label wins the accessible-name computation over everything inside the <label>, so without
     these the box could be ticked having heard only "Open employer accounts for me" and none of
     what that permits. */
  const bodyId = `${id}-body`;
  const carriesId = `${id}-carries`;
  const offId = `${id}-off`;
  const boundaryId = `${id}-boundary`;
  const revocableId = `${id}-revocable`;
  /* Null whenever the verdict is false, even with a date on the row: that pairing is what a
     superseded consent version looks like, and it is the live state of every account that granted
     this before 2026-09-08. Printing the old date over an unticked box would claim a permission the
     server does not honour. */
  const granted = portalAccountConsentGrantedOn(value, grantedAt ?? null);

  return (
    <div className="rounded-inner border border-border p-4">
      <p className="text-sm font-medium text-ink">{PORTAL_ACCOUNT_CONSENT_HEADING}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{PORTAL_ACCOUNT_CONSENT_INTRO}</p>
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-start justify-between gap-5">
          <label htmlFor={id}>
            <span className="block text-sm font-medium text-ink">{PORTAL_ACCOUNT_CONSENT_COPY.label}</span>
            <span id={bodyId} className="mt-1 block text-xs leading-5 text-muted">{PORTAL_ACCOUNT_CONSENT_COPY.body}</span>
            <span id={offId} className="mt-1 block text-xs leading-5 text-muted">{PORTAL_ACCOUNT_CONSENT_WHEN_OFF}</span>
            {granted && (
              /* Mono, per DESIGN.md: "Every number, timestamp, filename, ATS name, status, and
                 label. When the machine speaks, it speaks in mono." */
              <span className="mt-1 block font-mono text-xs leading-5 text-muted">Granted {granted}.</span>
            )}
          </label>
          <input
            id={id}
            aria-label={PORTAL_ACCOUNT_CONSENT_COPY.label}
            aria-describedby={`${bodyId} ${offId} ${carriesId} ${boundaryId} ${revocableId}`}
            type="checkbox"
            checked={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-1 size-4 accent-brand disabled:opacity-40"
          />
        </div>
      </div>
      <div id={carriesId} className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted">{PORTAL_ACCOUNT_CONSENT_CARRIES_HEADING}</p>
        <ul className="mt-2 space-y-2">
          {PORTAL_ACCOUNT_CONSENT_CARRIES.map((line) => (
            <li key={line} className="flex gap-2 text-xs leading-5 text-muted">
              <span aria-hidden="true" className="select-none text-muted">&middot;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
      <p id={boundaryId} className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted">{PORTAL_ACCOUNT_CONSENT_BOUNDARY}</p>
      <p id={revocableId} className="mt-2 text-xs leading-5 text-muted">{PORTAL_ACCOUNT_CONSENT_REVOCABLE}</p>
    </div>
  );
}
