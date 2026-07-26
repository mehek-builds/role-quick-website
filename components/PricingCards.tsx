"use client";

import { useEffect, useMemo, useState } from "react";
import { getPricingOffer, type BillingInterval, type PricingOffer } from "@/lib/api";
import {
  countryName,
  formatUsd,
  getOrCreatePricingSubject,
  savePricingSelection,
} from "@/lib/billing";
import { STORE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

function Line({ children }: { children: React.ReactNode }) {
  return <li className="text-[15px] leading-7 text-muted">{children}</li>;
}

export function PricingCards() {
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [offer, setOffer] = useState<PricingOffer | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [pricingError, setPricingError] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(true);

  useEffect(() => {
    queueMicrotask(() => setSubjectId(getOrCreatePricingSubject()));
  }, []);

  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    void getPricingOffer(subjectId, selectedCountry, interval).then((response) => {
      if (cancelled) return;
      setOffer(response.offer);
      setCountries(response.countries);
      setPricingLoading(false);
      track("pricing_quote_viewed", {
        band: response.offer.band,
        country: response.offer.country_code,
        interval: response.offer.interval,
        amount_cents: response.offer.amount_cents,
        experiment_variant: response.offer.experiment_variant,
      });
    }).catch(() => {
      if (!cancelled) {
        setPricingError(true);
        setPricingLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [interval, selectedCountry, subjectId]);

  const countryOptions = useMemo(() => countries
    .filter((code) => code !== "ZZ")
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [countries]);

  const monthlyEquivalent = offer
    ? offer.amount_cents / (offer.interval === "yearly" ? 12 : 1)
    : interval === "yearly" ? 3999 : 4999;
  const billedAmount = offer?.amount_cents ?? (interval === "yearly" ? 47988 : 4999);

  function chooseInterval(next: BillingInterval) {
    setPricingLoading(true);
    setPricingError(false);
    setInterval(next);
    track("pricing_interval_changed", { interval: next });
  }

  function continueToUpgrade() {
    if (!offer) return;
    savePricingSelection(offer);
    track("pricing_checkout_started", {
      source: "pricing_page",
      band: offer.band,
      country: offer.country_code,
      interval: offer.interval,
      amount_cents: offer.amount_cents,
      experiment_variant: offer.experiment_variant,
    });
    window.location.assign("/login?next=upgrade");
  }

  return (
    <div>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex items-center rounded-full border border-border bg-surface p-1">
          <button type="button" onClick={() => chooseInterval("monthly")} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${interval === "monthly" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Monthly</button>
          <button type="button" onClick={() => chooseInterval("yearly")} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${interval === "yearly" ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Yearly</button>
        </div>
        <label className="sr-only" htmlFor="pricing-country">Billing country</label>
        <select
          id="pricing-country"
          value={selectedCountry ?? ""}
          onChange={(event) => {
            const next = event.target.value || null;
            setPricingLoading(true);
            setPricingError(false);
            setSelectedCountry(next);
            track("pricing_country_changed", { country: next ?? "automatic" });
          }}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="">Detect my country</option>
          {countryOptions.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
        </select>
      </div>
      <p className="mt-3 text-center text-[13px] text-muted">
        {pricingError
          ? "Regional pricing could not load. Standard pricing is shown and checkout will verify it again."
          : !pricingLoading && offer
            ? `${countryName(offer.country_code)} pricing. Prices are shown in USD.`
            : "Detecting your regional price..."}
      </p>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-[20px] border border-border bg-surface p-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Free</p>
          <p className="mt-4 font-mono text-4xl tracking-[-0.02em] text-ink">$0</p>
          <ul className="mt-6 space-y-1">
            <li className="text-[15px] font-medium leading-7 text-ink">Apply to 20 jobs / mo</li>
            <Line>20 tailored resumes</Line><Line>30 contacts, 60 drafts</Line><Line>Full autofill</Line>
          </ul>
          <a href={STORE_URL} className="mt-8 block rounded-full border border-border px-5 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-ink">Add to Chrome</a>
          <p className="mt-3 text-center text-[13px] text-muted">Free forever. No card required.</p>
        </div>

        <div className="rounded-[20px] bg-brand-soft p-8">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">Pro</p>
            <span className="rounded-full bg-brand px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-white">1,000 resumes / mo</span>
          </div>
          <p className="mt-4 font-mono text-4xl tracking-[-0.02em] text-ink">
            {formatUsd(Math.round(monthlyEquivalent))}<span className="text-base text-muted"> / mo</span>
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            {interval === "yearly" ? `Billed ${formatUsd(billedAmount)} a year` : "Billed monthly"}
          </p>
          {offer?.band === "access" && <p className="mt-2 text-[13px] font-medium text-positive">Regional access discount applied.</p>}
          {offer?.band === "premium" && <p className="mt-2 text-[13px] text-muted">Regional price applied.</p>}
          <ul className="mt-6 space-y-1">
            <li className="text-[15px] font-medium leading-7 text-ink">1,000 tailored resumes / mo</li>
            <Line>Automatic form filling</Line><Line>500 contacts, 1,000 drafts</Line><Line>Cancel anytime, same clicks</Line>
          </ul>
          <button type="button" disabled={!offer || pricingLoading} onClick={continueToUpgrade} className="mt-8 block w-full rounded-full bg-brand px-5 py-2.5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {offer && !pricingLoading ? "Go Pro" : "Loading price..."}
          </button>
        </div>
      </div>
    </div>
  );
}
