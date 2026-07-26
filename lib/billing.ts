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
