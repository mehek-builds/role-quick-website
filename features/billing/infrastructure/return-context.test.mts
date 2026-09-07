import assert from "node:assert/strict";
import test from "node:test";
import {
  billingReturnContext,
  rememberBillingReturnContext,
} from "./return-context.ts";

const OFFER_ID = "9f07c209-b541-48ec-a797-8988141b0a61";
const ACCOUNT_ID = "account-late-return";
const START_MS = Date.parse("2026-08-14T10:00:00.000Z");
const OLD_LOCAL_EXPIRY_MS = START_MS + 30 * 60 * 1000;
const PROVIDER_EXPIRY_MS = START_MS + 31 * 60 * 1000;

function installWindowStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        pathname: "/dashboard/applications",
        search: "",
        hash: "",
      },
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
}

test("the exact provider expiry keeps a late checkout return recoverable", () => {
  const originalNow = Date.now;
  installWindowStorage();
  try {
    Date.now = () => START_MS;
    rememberBillingReturnContext(OFFER_ID, {
      accountId: ACCOUNT_ID,
      returnRoute: "/dashboard/applications?application=app-1",
      expiresAt: new Date(PROVIDER_EXPIRY_MS).toISOString(),
    });

    Date.now = () => OLD_LOCAL_EXPIRY_MS + 1;
    assert.deepEqual(billingReturnContext(OFFER_ID), {
      accountId: ACCOUNT_ID,
      returnRoute: "/dashboard/applications?application=app-1",
      expiresAt: new Date(PROVIDER_EXPIRY_MS).toISOString(),
    });

    Date.now = () => PROVIDER_EXPIRY_MS;
    assert.equal(billingReturnContext(OFFER_ID), null);
  } finally {
    Date.now = originalNow;
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("an onboarding checkout's /start return route survives the round trip", () => {
  /* Regression for the 2026-09-08 incident: components/start/PlanStep.tsx has always
     passed returnRoute: "/start", but safeReturnRoute only allowed /dashboard and
     /billing, so rememberBillingReturnContext silently wrote nothing and every
     onboarding trial payment came back to the "different account" mismatch page
     instead of the confirmation screen -- a real, successful charge with nowhere
     safe to land. */
  const originalNow = Date.now;
  installWindowStorage();
  try {
    Date.now = () => START_MS;
    rememberBillingReturnContext(OFFER_ID, {
      accountId: ACCOUNT_ID,
      returnRoute: "/start",
      expiresAt: new Date(PROVIDER_EXPIRY_MS).toISOString(),
    });
    assert.deepEqual(billingReturnContext(OFFER_ID), {
      accountId: ACCOUNT_ID,
      returnRoute: "/start",
      expiresAt: new Date(PROVIDER_EXPIRY_MS).toISOString(),
    });
  } finally {
    Date.now = originalNow;
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("an unrecognized return route is still refused", () => {
  const originalNow = Date.now;
  installWindowStorage();
  try {
    Date.now = () => START_MS;
    rememberBillingReturnContext(OFFER_ID, {
      accountId: ACCOUNT_ID,
      returnRoute: "/settings",
      expiresAt: new Date(PROVIDER_EXPIRY_MS).toISOString(),
    });
    assert.equal(billingReturnContext(OFFER_ID), null);
  } finally {
    Date.now = originalNow;
    Reflect.deleteProperty(globalThis, "window");
  }
});
