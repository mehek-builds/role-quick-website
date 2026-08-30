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
    return url.protocol === "https:"
      && url.hostname === "checkout.stripe.com"
      && url.pathname.startsWith("/c/pay/");
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
