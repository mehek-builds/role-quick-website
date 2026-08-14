import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("status surface is explicit about the independent-host gap", () => { const page = read("app/status/page.tsx"); assert.match(page, /NEXT_PUBLIC_STATUS_PAGE_URL/); assert.match(page, /does not claim live health or uptime/); assert.match(page, /Managed application runs/); });
test("maintenance mode is deploy-safe and never invents an ETA", () => { assert.match(read("app/layout.tsx"), /LITOS_MAINTENANCE_MODE === "1"/); const screen = read("components/MaintenanceScreen.tsx"); assert.match(screen, /LITOS_MAINTENANCE_NEXT_UPDATE/); assert.match(screen, /Return time is not confirmed/); });
test("billing return verifies the exact offer and account record, then handles cancellation and timeout", () => {
  const page = read("app/billing/return/page.tsx");
  assert.match(page, /getBillingOffer\(context\)/);
  assert.match(page, /billingReturnVerdict\(/);
  assert.match(page, /expectedAccountId: storedContext\.accountId/);
  assert.match(page, /api<Me>\("\/me"\)/);
  assert.match(page, /Nothing was charged/);
  assert.match(page, /Payment could not be confirmed yet/);
  assert.match(page, /getBillingReceipt/);
  assert.match(page, /exact amount Stripe confirmed/);
  assert.match(page, /Resume your action/);
});
test("integration permissions and notification limits are stated", () => { const page = read("app/dashboard/settings/page.tsx"); assert.match(page, /requests access only to find a recent application verification code/); assert.match(page, /Request an integration through Contact/); assert.match(page, /There are no marketing notification subscriptions/); });
