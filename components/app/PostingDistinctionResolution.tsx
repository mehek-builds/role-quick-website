"use client";

import { useState } from "react";
import { Button } from "@/components/app/Button";
import {
  ApiError,
  resolvePostingDistinction,
  type PostingDistinctionRisk,
} from "@/lib/api";
import { postingDistinctionResolutionOutcome } from "@/features/applications";

function postingLabel(company: string, role: string): string {
  const cleanCompany = company.trim();
  const cleanRole = role.trim();
  if (cleanCompany && cleanRole) return `${cleanRole} at ${cleanCompany}`;
  return cleanRole || cleanCompany || "Posting";
}

export function PostingDistinctionResolution({
  risk,
  onCleared,
  onRiskChanged,
}: {
  risk: PostingDistinctionRisk;
  onCleared: (resolvedRisk: PostingDistinctionRisk) => void;
  onRiskChanged: (previousRisk: PostingDistinctionRisk, nextRisk: PostingDistinctionRisk) => void;
}) {
  const [currentRisk, setCurrentRisk] = useState(risk);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveDistinction = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    const requestedRisk = currentRisk;
    try {
      const relationId = window.crypto.randomUUID();
      const result = await resolvePostingDistinction({
        relation_id: relationId,
        prior_attempt_id: requestedRisk.prior_attempt_id,
        candidate_application_id: requestedRisk.candidate_application_id,
        candidate_packet_id: requestedRisk.candidate_packet_id,
        candidate_identity_version: requestedRisk.candidate_identity_version,
        candidate_identity_digest: requestedRisk.candidate_identity_digest,
        confirmed_distinct_postings: true,
      });
      const outcome = postingDistinctionResolutionOutcome(requestedRisk, relationId, result);
      if (outcome.kind === "clear") {
        setConfirmed(false);
        onCleared(requestedRisk);
      } else if (outcome.kind === "next_risk") {
        setCurrentRisk(outcome.risk);
        setConfirmed(false);
        onRiskChanged(requestedRisk, outcome.risk);
        setError("This pair is recorded, but another earlier posting still needs the same exact check.");
      } else if (outcome.kind === "blocked") {
        setConfirmed(false);
        setError(outcome.message);
      } else {
        setConfirmed(false);
        setError("Litos could not verify the saved comparison against the current application. Nothing was sent. Reload before trying again.");
      }
    } catch (reason) {
      setConfirmed(false);
      setError(reason instanceof ApiError
        ? reason.message
        : "Litos could not save this posting comparison. Nothing was sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="posting-distinction-heading" className="mt-3 rounded-inner border border-warn/30 bg-warn/5 px-4 py-4">
      <h3 id="posting-distinction-heading" className="text-sm font-medium text-ink">Compare the exact two posting pages</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        Litos cannot prove from stored identifiers whether these are the same job. Open both pages and save a difference only if they are genuinely different postings.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="rounded-inner border border-border bg-surface p-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">Earlier employer-boundary record</p>
          <p className="mt-1 text-sm text-ink">{postingLabel(currentRisk.prior_company, currentRisk.prior_role)}</p>
          <a
            className="mt-2 block break-all text-xs text-link underline underline-offset-2"
            href={currentRisk.prior_portal_url}
            target="_blank"
            rel="noreferrer"
          >
            {currentRisk.prior_portal_url}
          </a>
        </article>
        <article className="rounded-inner border border-border bg-surface p-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">Application you are sending</p>
          <p className="mt-1 text-sm text-ink">{postingLabel(currentRisk.candidate_company, currentRisk.candidate_role)}</p>
          <a
            className="mt-2 block break-all text-xs text-link underline underline-offset-2"
            href={currentRisk.candidate_portal_url}
            target="_blank"
            rel="noreferrer"
          >
            {currentRisk.candidate_portal_url}
          </a>
        </article>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-ink">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-action)]"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>I opened both exact posting pages and confirmed they are different jobs.</span>
      </label>
      <div className="mt-3">
        <Button type="button" disabled={!confirmed || busy} onClick={() => void saveDistinction()}>
          {busy ? "Saving comparison..." : "Save these as different postings"}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">
        Saving this comparison does not retry or submit the application. You will review and press Send application again separately.
      </p>
      {error && <p role="alert" className="mt-3 text-sm leading-6 text-danger">{error}</p>}
    </section>
  );
}
