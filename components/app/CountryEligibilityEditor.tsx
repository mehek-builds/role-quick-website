"use client";

import { useId } from "react";
import { MAX_COUNTRY_ELIGIBILITY_RECORDS } from "@/lib/work-eligibility-limit";
import { blankCountryEligibility, COUNTRY_OPTIONS, type CountryWorkEligibilityDraft } from "@/lib/work-eligibility";

function BooleanChoice({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-xs text-muted">{label}</span>
      <select
        id={id}
        value={value === null ? "" : value ? "yes" : "no"}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "yes")}
        className="mt-1 min-h-11 w-full rounded-inner border border-border bg-white px-3 text-sm text-ink outline-none focus:border-brand"
      >
        <option value="">Choose an answer</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

export function CountryEligibilityEditor({
  rows,
  onChange,
}: {
  rows: CountryWorkEligibilityDraft[];
  onChange: (rows: CountryWorkEligibilityDraft[]) => void;
}) {
  const rootId = useId();
  const canAdd = rows.length < MAX_COUNTRY_ELIGIBILITY_RECORDS;

  function patch(index: number, next: Partial<CountryWorkEligibilityDraft>) {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row));
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const prefix = `${rootId}-${index}`;
        return (
          <fieldset key={`${index}-${row.country_code}`} className="rounded-inner border border-border p-4">
            <legend className="px-1 text-xs font-medium text-ink">Country {index + 1}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label htmlFor={`${prefix}-country`} className="block">
                <span className="text-xs text-muted">Country</span>
                <select
                  id={`${prefix}-country`}
                  value={row.country_code}
                  onChange={(event) => patch(index, { country_code: event.target.value })}
                  className="mt-1 min-h-11 w-full rounded-inner border border-border bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="">Choose a country</option>
                  {COUNTRY_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </label>
              <BooleanChoice
                id={`${prefix}-authorized`}
                label="Authorized to work now?"
                value={row.authorized_now}
                onChange={(authorized_now) => patch(index, { authorized_now })}
              />
              <BooleanChoice
                id={`${prefix}-sponsor-now`}
                label="Need sponsorship before starting?"
                value={row.needs_sponsorship_now}
                onChange={(needs_sponsorship_now) => patch(index, { needs_sponsorship_now })}
              />
              <BooleanChoice
                id={`${prefix}-sponsor-future`}
                label="Need sponsorship later?"
                value={row.needs_sponsorship_future}
                onChange={(needs_sponsorship_future) => patch(index, { needs_sponsorship_future })}
              />
              <label htmlFor={`${prefix}-type`} className="block">
                <span className="text-xs text-muted">Authorization type (optional)</span>
                <input
                  id={`${prefix}-type`}
                  value={row.authorization_type ?? ""}
                  onChange={(event) => patch(index, { authorization_type: event.target.value || null })}
                  placeholder="CPT, permanent resident, work permit"
                  maxLength={120}
                  className="mt-1 min-h-11 w-full rounded-inner border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
                />
              </label>
              <label htmlFor={`${prefix}-expiry`} className="block">
                <span className="text-xs text-muted">Authorization expires (optional)</span>
                <input
                  id={`${prefix}-expiry`}
                  type="date"
                  value={row.authorization_expiry ?? ""}
                  onChange={(event) => patch(index, { authorization_expiry: event.target.value || null })}
                  className="mt-1 min-h-11 w-full rounded-inner border border-border bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
              className="mt-3 text-xs text-muted underline underline-offset-4 hover:text-ink"
            >
              Remove country
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        onClick={() => {
          if (canAdd) onChange([...rows, blankCountryEligibility()]);
        }}
        disabled={!canAdd}
        className="min-h-11 rounded-inner border border-border bg-white px-4 text-sm text-ink hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add another country
      </button>
      {!canAdd && (
        <p className="text-xs leading-5 text-muted" role="status">
          You can save up to {MAX_COUNTRY_ELIGIBILITY_RECORDS} countries.
        </p>
      )}
    </div>
  );
}
