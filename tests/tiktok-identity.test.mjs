import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEmailForTikTok,
  normalizePhoneE164ForTikTok,
  tiktokPurchaseContentId,
} from "../lib/tiktok-identity.ts";

/* CROSS-REPO PINNED VECTORS. volley-backend's src/lib/tiktokEvents.ts holds a
   hand-mirrored copy of these two rules, and its test file asserts this EXACT list.
   A drift between the repos hashes one person two different ways, which is invisible
   in production: TikTok accepts anything (code 0 even for a made-up field name) and
   EMQ only moves over real traffic with a lag. Change one side, change both. */
test("cross-repo normalization vectors", () => {
  const cases = [
    ["+1 (415) 555-2671", null, "+14155552671"],
    ["415-555-2671", "US", "+14155552671"],
    ["415-555-2671", "United States", "+14155552671"],
    ["415-555-2671", "u.s.", "+14155552671"],
    ["415-555-2671", null, null],
    ["13812345678", "CN", null],
    ["13812345678", null, null],
    ["00971501234567", null, "+971501234567"],
    ["+44 20 7946 0958", null, "+442079460958"],
    ["20 7946 0958", "GB", null],
  ];
  for (const [phone, country, expected] of cases) {
    assert.equal(normalizePhoneE164ForTikTok(phone, country), expected, `phone ${phone} / ${country}`);
  }
  assert.equal(normalizeEmailForTikTok("  Student@Example.COM "), "student@example.com");
  assert.equal(normalizeEmailForTikTok("@"), null);
  assert.equal(normalizeEmailForTikTok("a@b"), null);
});

test("an encrypted-looking value never becomes a phone number", () => {
  /* The backend reads this field from an encrypted column. Both copies of the rule
     must refuse ciphertext, or a decrypt that is skipped upstream turns into a
     fabricated identity reported to TikTok. */
  assert.equal(normalizePhoneE164ForTikTok("aXU+RNDeixpE2Im9cn6MBzUIZ4kLr86TXS8pXnIdoj1mSSe08o/oOg=="), null);
  assert.equal(normalizePhoneE164ForTikTok("+rv44eFCdGGCKD4iDghJkuHtV7tsXLapilaheAbDAYVJb3W1Ni63Tg=="), null);
});

test("content_id canonicalizes the legacy cadence aliases so both reporters agree", () => {
  /* BillingReceipt.interval carries "monthly"/"weekly" on the legacy path, while the
     webhook builds from term_code, which is only ever "month"/"week"/"quarter". */
  assert.equal(tiktokPurchaseContentId("litos_plus", "monthly"), "litos_plus_month");
  assert.equal(tiktokPurchaseContentId("litos_plus", "month"), "litos_plus_month");
  assert.equal(tiktokPurchaseContentId("litos_plus", "weekly"), "litos_plus_week");
  assert.equal(tiktokPurchaseContentId("litos_plus", "quarter"), "litos_plus_quarter");
  // Omitted rather than guessed: an id the other reporter cannot produce is worse.
  assert.equal(tiktokPurchaseContentId("litos_plus", "fortnightly"), undefined);
  assert.equal(tiktokPurchaseContentId(null, "month"), undefined);
});
