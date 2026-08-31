import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const configSource = readFileSync(new URL("../lib/config.ts", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("../lib/billing.ts", import.meta.url), "utf8");
const liveFallback = "https://student-outreach-backend.vercel.app";

test("the dashboard and first-party billing guard share the live API fallback", () => {
  assert.ok(configSource.includes(`NEXT_PUBLIC_API_URL ?? "${liveFallback}"`));
  assert.ok(billingSource.includes(`NEXT_PUBLIC_API_URL ?? "${liveFallback}"`));
});
