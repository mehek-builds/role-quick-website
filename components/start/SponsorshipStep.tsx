"use client";

/* Each record is an applicant declaration scoped to one country. The backend reuses it only when
 * a question names that country or the posting carries one exact structured country. */

import { useState } from "react";
import { putOnboardingWorkEligibility, type ApplicationProfile } from "@/lib/api";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { PrimaryButton, StartShell } from "./ui";
import { CountryEligibilityEditor } from "@/components/app/CountryEligibilityEditor";
import {
  countryEligibilityProblem,
  eligibilitySeed,
  normalizedCountryEligibility,
  type CountryWorkEligibilityDraft,
} from "@/lib/work-eligibility";

export function SponsorshipStep({ onDone, profile }: { onDone: () => void; profile?: ApplicationProfile | null }) {
  const [records, setRecords] = useState<CountryWorkEligibilityDraft[]>(() => eligibilitySeed(profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const problem = countryEligibilityProblem(records);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await putOnboardingWorkEligibility(normalizedCountryEligibility(records));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  return (
    <StartShell
      step="sponsorship"
      title="Where can you work?"
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="mb-7">
        <p className="mb-4 text-[13px] leading-5 text-muted">
          Add each country separately. Being allowed to work in one country says nothing about
          another country, so Litos never copies an answer across borders.
        </p>
        <CountryEligibilityEditor rows={records} onChange={setRecords} />
      </div>

      <div className="mb-7 space-y-1.5 text-[13px] leading-5 text-muted">
        <p>For United States jobs, a sponsorship need turns on the confirmed-sponsor job filter.</p>
        <p>You can edit the country records later in Settings.</p>
        <p>
          Litos answers a form only when the question names a country or the job has one exact
          country on record. If that country is missing here, the question stays with you.
        </p>
      </div>

      <PrimaryButton onClick={() => void save()} disabled={busy || records.length === 0}>
        {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
      </PrimaryButton>
    </StartShell>
  );
}
