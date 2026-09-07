export function isLemonSqueezyCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com"))
      && url.pathname.startsWith("/checkout/buy/");
  } catch {
    return false;
  }
}

export function isLitosPayCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    /* Same default as lib/config.ts, and it has to stay the same: this compares a
       checkout intent's origin against the API's, so a default that disagrees with
       the one the dashboard actually calls silently refuses real checkout links. */
    const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? "https://api.trylitos.com");
    return url.protocol === "https:"
      && url.origin === api.origin
      && /^\/billing\/litos-pay\/checkout\/[0-9a-f-]{36}$/i.test(url.pathname)
      && Boolean(url.searchParams.get("token"));
  } catch {
    return false;
  }
}

export function isSafeCheckoutUrl(value: string): boolean {
  return isStripeCheckoutUrl(value) || isLemonSqueezyCheckoutUrl(value) || isLitosPayCheckoutUrl(value);
}

export function isStripeCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    /* No path check: Stripe does not commit to one shape. A Checkout Session with
       nothing due today (our card-required trial, payment_method_collection=always
       + trial_period_days) came back as "/f/pay/..." on 2026-09-07, not the "/c/pay/..."
       this used to require, and got rejected client-side as an invalid Stripe URL even
       though the backend had a live session. checkout.stripe.com is the actual security
       boundary here (only Stripe serves it) -- same reasoning isStripePortalUrl below
       already uses for billing.stripe.com, with no path check either. */
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

export function isStripePortalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com";
  } catch {
    return false;
  }
}

export function isLemonSqueezyPortalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "app.lemonsqueezy.com") {
      return url.pathname.startsWith("/my-orders/") || url.pathname.startsWith("/billing");
    }
    return (url.hostname === "store.lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com"))
      && url.pathname.startsWith("/billing");
  } catch {
    return false;
  }
}

export function isSafeBillingPortalUrl(
  value: string,
  provider?: "stripe" | "lemonsqueezy" | "manual" | null,
): boolean {
  if (provider === "stripe") return isStripePortalUrl(value);
  if (provider === "lemonsqueezy") return isLemonSqueezyPortalUrl(value);
  if (provider === "manual") return false;
  return isStripePortalUrl(value) || isLemonSqueezyPortalUrl(value);
}
