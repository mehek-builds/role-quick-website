const CONTEXT_PREFIX = "litos_billing_return_v2:";

export type BillingReturnContext = {
  actionNonce?: string;
  accountId: string;
  returnRoute: string;
  expiresAt: string;
};

function safeOfferId(value: string | null | undefined): string | null {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

function safeReturnRoute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, "https://trylitos.com");
    if (url.origin !== "https://trylitos.com" || !/^\/(dashboard|billing)(?:\/|$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function currentBillingReturnRoute(): string {
  if (typeof window === "undefined") return "/dashboard";
  return safeReturnRoute(`${window.location.pathname}${window.location.search}${window.location.hash}`) ?? "/dashboard";
}

export function rememberBillingReturnContext(offerId: string, context: BillingReturnContext): void {
  const safeId = safeOfferId(offerId);
  const route = safeReturnRoute(context.returnRoute);
  if (!safeId || !route || typeof window === "undefined") return;
  window.sessionStorage.setItem(`${CONTEXT_PREFIX}${safeId}`, JSON.stringify({ ...context, returnRoute: route }));
}

export function billingReturnContext(offerId: string | null | undefined): BillingReturnContext | null {
  const safeId = safeOfferId(offerId);
  if (!safeId || typeof window === "undefined") return null;
  const key = `${CONTEXT_PREFIX}${safeId}`;
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BillingReturnContext>;
    const returnRoute = safeReturnRoute(value.returnRoute);
    const expiresAt = typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : Number.NaN;
    const actionNonce = value.actionNonce === undefined
      ? undefined
      : typeof value.actionNonce === "string" && value.actionNonce.length >= 20
        ? value.actionNonce
        : null;
    if (!returnRoute || actionNonce === null || typeof value.accountId !== "string" || !value.accountId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return {
      ...(actionNonce ? { actionNonce } : {}),
      accountId: value.accountId,
      returnRoute,
      expiresAt: value.expiresAt!,
    };
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function forgetBillingReturnContext(offerId: string | null | undefined): void {
  const safeId = safeOfferId(offerId);
  if (safeId && typeof window !== "undefined") window.sessionStorage.removeItem(`${CONTEXT_PREFIX}${safeId}`);
}
