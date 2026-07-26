import type { BillingInterval, PricingOffer } from "./api";

const SUBJECT_KEY = "litos_pricing_subject_v1";
const SELECTION_KEY = "litos_pricing_selection_v1";

export type PricingSelection = {
  subjectId: string;
  countryCode: string | null;
  interval: BillingInterval;
  quoteToken: string | null;
};

export function isLemonSqueezyCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com"))
      && (url.pathname.startsWith("/checkout/buy/") || url.pathname.startsWith("/checkout/custom/"));
  } catch {
    return false;
  }
}

export function getOrCreatePricingSubject(): string {
  const existing = window.localStorage.getItem(SUBJECT_KEY);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(SUBJECT_KEY, created);
  return created;
}

export function savePricingSelection(offer: PricingOffer): PricingSelection {
  const selection: PricingSelection = {
    subjectId: getOrCreatePricingSubject(),
    countryCode: offer.requested_country_code ?? offer.country_code,
    interval: offer.interval,
    quoteToken: offer.quote_token,
  };
  window.localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
  return selection;
}

export function loadPricingSelection(): PricingSelection {
  const subjectId = getOrCreatePricingSubject();
  try {
    const value = JSON.parse(window.localStorage.getItem(SELECTION_KEY) ?? "null") as Partial<PricingSelection> | null;
    return {
      subjectId,
      countryCode: typeof value?.countryCode === "string" ? value.countryCode : null,
      interval: value?.interval === "monthly" ? "monthly" : "yearly",
      quoteToken: typeof value?.quoteToken === "string" ? value.quoteToken : null,
    };
  } catch {
    return { subjectId, countryCode: null, interval: "yearly", quoteToken: null };
  }
}

export function countryName(code: string, locale = "en"): string {
  if (code === "ZZ") return "Your location";
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
