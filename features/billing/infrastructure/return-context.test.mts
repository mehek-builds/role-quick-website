import assert from "node:assert/strict";
import test from "node:test";
import {
  billingReturnContext,
  currentBillingReturnRoute,
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

test("the onboarding checkout can return to the exact start route", () => {
  installWindowStorage();
  try {
    window.location.pathname = "/start";
    window.location.search = "?from=plan";
    window.location.hash = "#checkout";
    assert.equal(currentBillingReturnRoute(), "/start?from=plan#checkout");

    rememberBillingReturnContext(OFFER_ID, {
      accountId: ACCOUNT_ID,
      returnRoute: "/start?from=plan#checkout",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    assert.deepEqual(billingReturnContext(OFFER_ID), {
      accountId: ACCOUNT_ID,
      returnRoute: "/start?from=plan#checkout",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("a start subpath is not accepted as a checkout return route", () => {
  installWindowStorage();
  try {
    rememberBillingReturnContext(OFFER_ID, {
      accountId: ACCOUNT_ID,
      returnRoute: "/start/internal",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    assert.equal(billingReturnContext(OFFER_ID), null);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

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
