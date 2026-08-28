"use client";

import { useState } from "react";
import { Button } from "@/components/app/Button";
import { formatRelativeDate } from "@/components/app/ui";
import type {
  SubmissionOrphanResolutionRequest,
  SubmissionOrphanRisk,
} from "@/lib/api";
import { submissionOrphanResolutionControlsAvailable } from "@/features/applications";

type AttributionDraft = {
  company: string;
  role: string;
  portalUrl: string;
};

const EMPTY_ATTRIBUTION: AttributionDraft = { company: "", role: "", portalUrl: "" };

export function SubmissionOrphanRiskPanel({
  risks,
  busyAttemptId,
  error,
  onResolve,
}: {
  risks: SubmissionOrphanRisk[];
  busyAttemptId: string | null;
  error: string | null;
  onResolve: (attemptId: string, request: SubmissionOrphanResolutionRequest) => void;
}) {
  const [attributionByAttempt, setAttributionByAttempt] = useState<Record<string, AttributionDraft>>({});
  if (risks.length === 0 && !error) return null;

  const updateAttribution = (attemptId: string, patch: Partial<AttributionDraft>) => {
    setAttributionByAttempt((current) => ({
      ...current,
      [attemptId]: { ...(current[attemptId] ?? EMPTY_ATTRIBUTION), ...patch },
    }));
  };

  return (
    <section aria-labelledby="submission-risk-heading" className="rounded-card border border-warn/30 bg-warn/5 p-5">
      <h2 id="submission-risk-heading" className="text-sm font-medium text-ink">Check earlier submission records</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Litos has an earlier employer-boundary record that cannot yet be tied to one exact posting.
        The duplicate lock stays in place until your check is recorded.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 space-y-3">
        {risks.map((risk) => {
          const busy = busyAttemptId === risk.attempt_id;
          const company = risk.company.trim();
          const role = risk.role.trim();
          const draft = attributionByAttempt[risk.attempt_id] ?? EMPTY_ATTRIBUTION;
          const identityless = risk.scope === "user";
          const attributed = risk.reason === "attributed_confirmed";
          const blanketCleared = risk.reason === "blanket_not_sent";
          const resolutionControlsAvailable = submissionOrphanResolutionControlsAvailable(risk);
          const needsAttribution = identityless && resolutionControlsAvailable;
          const attributionComplete = Boolean(
            draft.company.trim() && draft.role.trim() && draft.portalUrl.trim(),
          );
          return (
            <article key={risk.attempt_id} className="rounded-inner border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-ink">
                    {role || "Unknown role"}{company ? ` at ${company}` : ""}
                  </h3>
                  <p className="mt-1 text-xs text-muted">Reported {formatRelativeDate(risk.observed_at)}</p>
                </div>
                {risk.blocks_sends && risk.scope === "user" && (
                  <span className="rounded-full bg-warn/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-warn">
                    Blocks all sends
                  </span>
                )}
                {attributed && (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-success">
                    Recorded submitted
                  </span>
                )}
              </div>

              {attributed && (
                <p className="mt-3 text-sm leading-6 text-muted">
                  Your confirmation is saved. Duplicate protection is now limited to this posting,
                  so unrelated applications are not blocked.
                </p>
              )}

              {needsAttribution && (
                <div className="mt-3">
                  <p className="text-sm leading-6 text-warn">
                    This record did not preserve an exact posting identifier. If you found the
                    application, enter the exact posting so Litos can narrow the duplicate lock safely.
                  </p>
                  {blanketCleared && (
                    <p className="mt-2 text-sm leading-6 text-muted">
                      You previously checked every employer portal and confirmation email from this
                      period and found nothing. This stays visible so a later confirmation can still
                      replace that answer.
                    </p>
                  )}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      aria-label="Confirmed application company"
                      className="rq-field rounded-inner px-3 py-2 text-sm outline-none"
                      placeholder="Company"
                      value={draft.company}
                      onChange={(event) => updateAttribution(risk.attempt_id, { company: event.target.value })}
                    />
                    <input
                      aria-label="Confirmed application role"
                      className="rq-field rounded-inner px-3 py-2 text-sm outline-none"
                      placeholder="Role"
                      value={draft.role}
                      onChange={(event) => updateAttribution(risk.attempt_id, { role: event.target.value })}
                    />
                    <input
                      aria-label="Confirmed employer portal URL"
                      className="rq-field rounded-inner px-3 py-2 text-sm outline-none sm:col-span-2"
                      inputMode="url"
                      placeholder="Employer application URL"
                      type="url"
                      value={draft.portalUrl}
                      onChange={(event) => updateAttribution(risk.attempt_id, { portalUrl: event.target.value })}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={busy || !attributionComplete}
                      onClick={() => onResolve(risk.attempt_id, {
                        found: true,
                        posting: {
                          company: draft.company.trim(),
                          role: draft.role.trim(),
                          portal_url: draft.portalUrl.trim(),
                        },
                      })}
                    >
                      {busy ? "Saving..." : "Record the submitted posting"}
                    </Button>
                    {!blanketCleared && risk.reason !== "confirmed_unattributed" && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onResolve(risk.attempt_id, {
                          found: false,
                          checked_all_possible_destinations: true,
                        })}
                      >
                        I checked every portal and email. Nothing was sent
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {!identityless && resolutionControlsAvailable && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => onResolve(risk.attempt_id, { found: true })}>
                    {busy ? "Saving..." : "I found the application"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onResolve(risk.attempt_id, {
                      found: false,
                      checked_exact_destination: true,
                    })}
                  >
                    I checked this exact employer portal and confirmation email. Nothing was sent
                  </Button>
                </div>
              )}

              {!risk.resolution_available && !attributed && (
                <p className="mt-3 text-sm text-danger">
                  This record contains conflicting evidence. Litos has kept the duplicate lock in place.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
