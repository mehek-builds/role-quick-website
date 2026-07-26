"use client";

import { useState } from "react";
import { STORE_URL } from "@/lib/config";

/* Grammarly-pattern billing toggle: defaults to yearly, yearly shows the
   monthly-equivalent price with the full billed amount and the real saving
   stated plainly ($599.88 monthly-for-a-year vs $399). Savings math is
   honest or it doesn't ship (Guardrails). */

const MONTHLY = 49.99;
const YEARLY_PER_MO = 39.99;
const YEARLY = +(YEARLY_PER_MO * 12).toFixed(2); // $479.88
const SAVE = Math.round(MONTHLY * 12 - YEARLY); // $120
const SAVE_PCT = Math.round((1 - YEARLY / (MONTHLY * 12)) * 100); // 20%

function Line({ children }: { children: React.ReactNode }) {
  return <li className="text-[15px] leading-7 text-muted">{children}</li>;
}

export function PricingCards() {
  const [yearly, setYearly] = useState(true);

  return (
    <div>
      {/* Billing period toggle */}
      <div className="mt-10 flex justify-center">
        <div className="inline-flex items-center rounded-full border border-border bg-surface p-1">
          <button
            onClick={() => setYearly(false)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !yearly ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setYearly(true)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              yearly ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            Yearly
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em] ${
                yearly ? "bg-white/20 text-white" : "bg-brand-soft text-brand-ink"
              }`}
            >
              Save {SAVE_PCT}%
            </span>
          </button>
        </div>
      </div>
      {/* The 20% claim, legible at the point you see the toggle. */}
      <p className="mt-3 text-center text-[13px] text-muted">
        ${YEARLY_PER_MO.toFixed(2)}/mo billed yearly, ${MONTHLY.toFixed(2)}/mo
        billed monthly.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Free */}
        <div className="rounded-[20px] border border-border bg-surface p-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Free
          </p>
          <p className="mt-4 font-mono text-4xl tracking-[-0.02em] text-ink">$0</p>
          <ul className="mt-6 space-y-1">
            <li className="text-[15px] font-medium leading-7 text-ink">
              Apply to 20 jobs / mo
            </li>
            <Line>20 tailored resumes</Line>
            <Line>30 contacts, 60 drafts</Line>
            <Line>Full autofill</Line>
          </ul>
          <a
            href={STORE_URL}
            className="mt-8 block rounded-full border border-border px-5 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            Add to Chrome
          </a>
          {/* Reassurance lives at the point of action (Guardrails). */}
          <p className="mt-3 text-center text-[13px] text-muted">
            Free forever. No card required.
          </p>
        </div>

        {/* Pro */}
        <div className="rounded-[20px] bg-brand-soft p-8">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
              Pro
            </p>
            <span className="rounded-full bg-brand px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-white">
              1,000 resumes / mo
            </span>
          </div>
          <p className="mt-4 font-mono text-4xl tracking-[-0.02em] text-ink">
            ${yearly ? YEARLY_PER_MO.toFixed(2) : MONTHLY.toFixed(2)}
            <span className="text-base text-muted"> / mo</span>
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            {yearly ? (
              <>
                Billed ${YEARLY} a year ·{" "}
                <span className="font-medium text-positive">you save ${SAVE}</span>
              </>
            ) : (
              "Billed monthly"
            )}
          </p>
          <ul className="mt-6 space-y-1">
            <li className="text-[15px] font-medium leading-7 text-ink">
              1,000 tailored resumes / mo
            </li>
            <Line>Automatic form filling</Line>
            <Line>500 contacts, 1,000 drafts</Line>
            <Line>Cancel anytime, same clicks</Line>
          </ul>
          <a
            href="/login"
            className="mt-8 block rounded-full bg-brand px-5 py-2.5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Go Pro
          </a>
        </div>
      </div>
    </div>
  );
}
