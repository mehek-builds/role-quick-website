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
    const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? "https://student-outreach-backend.vercel.app");
    return url.protocol === "https:"
      && url.origin === api.origin
      && /^\/billing\/litos-pay\/checkout\/[0-9a-f-]{36}$/i.test(url.pathname)
      && Boolean(url.searchParams.get("token"));
  } catch {
    return false;
  }
}

export function isSafeCheckoutUrl(value: string): boolean {
  return isLemonSqueezyCheckoutUrl(value) || isLitosPayCheckoutUrl(value);
}
