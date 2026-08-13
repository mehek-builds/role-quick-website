import { useId } from "react";

import {
  availabilityCycleOptions,
  availabilityWindowStatus,
  type AvailabilityWindowInput,
} from "@/lib/availability-window";

type AvailabilityWindowTableProps = {
  value: AvailabilityWindowInput;
  onChange: (value: AvailabilityWindowInput) => void;
};

export function AvailabilityWindowTable({ value, onChange }: AvailabilityWindowTableProps) {
  const id = useId();
  const status = availabilityWindowStatus(value);

  function update(key: keyof AvailabilityWindowInput, nextValue: string) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <section className="overflow-hidden rounded-inner border border-border" aria-labelledby={`${id}-title`}>
      <div className="bg-surface-alt px-4 py-3">
        <h3 id={`${id}-title`} className="text-xs font-medium text-ink">Internship dates</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          Litos uses this window only when a posting names the cycle below, and only through the reuse date you choose.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] table-fixed border-collapse text-left">
          <caption className="sr-only">Internship availability date table</caption>
          <colgroup>
            <col className="w-[38%]" />
            <col />
          </colgroup>
          <tbody>
            <tr className="border-t border-border">
              <th scope="row" className="px-4 py-3 align-middle font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted">
                Cycle
              </th>
              <td className="px-4 py-3">
                <label htmlFor={`${id}-cycle`} className="sr-only">Internship cycle</label>
                <select
                  id={`${id}-cycle`}
                  value={value.cycle}
                  onChange={(event) => update("cycle", event.target.value)}
                  className="w-full rounded-full border border-control-border bg-surface px-3.5 py-2 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="">Prefer not to answer now</option>
                  {availabilityCycleOptions().map((cycle) => (
                    <option key={cycle} value={cycle}>{cycle}</option>
                  ))}
                </select>
              </td>
            </tr>
            <tr className="border-t border-border">
              <th scope="row" className="px-4 py-3 align-middle font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted">
                Earliest start
              </th>
              <td className="px-4 py-3">
                <label htmlFor={`${id}-start`} className="sr-only">Internship earliest start date</label>
                <input
                  id={`${id}-start`}
                  type="date"
                  value={value.start}
                  onChange={(event) => update("start", event.target.value)}
                  className="w-full rounded-full border border-control-border bg-surface px-3.5 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </td>
            </tr>
            <tr className="border-t border-border">
              <th scope="row" className="px-4 py-3 align-middle font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted">
                Available through
              </th>
              <td className="px-4 py-3">
                <label htmlFor={`${id}-end`} className="sr-only">Internship final available date</label>
                <input
                  id={`${id}-end`}
                  type="date"
                  value={value.end}
                  onChange={(event) => update("end", event.target.value)}
                  className="w-full rounded-full border border-control-border bg-surface px-3.5 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </td>
            </tr>
            <tr className="border-y border-border">
              <th scope="row" className="px-4 py-3 align-middle font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted">
                Reuse through
              </th>
              <td className="px-4 py-3">
                <label htmlFor={`${id}-valid-through`} className="sr-only">Use this internship answer through</label>
                <input
                  id={`${id}-valid-through`}
                  type="date"
                  value={value.validThrough}
                  onChange={(event) => update("validThrough", event.target.value)}
                  className="w-full rounded-full border border-control-border bg-surface px-3.5 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-2 px-4 py-3 text-xs leading-5 text-muted">
        {status === "incomplete" && (
          <p>Complete all four rows before Litos can answer an employer&apos;s dates question.</p>
        )}
        {status === "incoherent" && (
          <p>The end date must follow the start date, and the cycle year must match at least one date.</p>
        )}
        {status === "ready" && (
          <p>Litos can reuse these dates for {value.cycle} postings through {value.validThrough}.</p>
        )}
        <p>After the reuse date, Litos stops using this answer and asks again. Weekly hours remain a separate promise.</p>
      </div>
    </section>
  );
}
