import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEmailForTikTok, tiktokPurchaseContentId } from "../lib/tiktok-identity.ts";

/* CROSS-REPO PINNED VECTORS. volley-backend's src/lib/tiktokEvents.ts holds a
   hand-mirrored copy of this rule and its test file asserts this SAME list. A drift
   between the repos hashes one person two different ways, which is invisible in
   production: TikTok accepts anything (code 0 even for a made-up field name) and EMQ
   only moves over real traffic with a lag. Change one side, change both. */
test("cross-repo email normalization vectors", () => {
  assert.equal(normalizeEmailForTikTok("  Student@Example.COM "), "student@example.com");
  assert.equal(normalizeEmailForTikTok("STUDENT+tag@example.co.uk"), "student+tag@example.co.uk");
  assert.equal(normalizeEmailForTikTok("@"), null);
  assert.equal(normalizeEmailForTikTok("a@b"), null);
  assert.equal(normalizeEmailForTikTok("nope"), null);
  assert.equal(normalizeEmailForTikTok("   "), null);
  assert.equal(normalizeEmailForTikTok(null), null);
});

test("phone normalization is not exported, so no surface can start sending one", async () => {
  /* Phone was removed after two review rounds. address_country says where a student
     LIVES, not where their number is from, so an international student in the US had
     their home mobile completed to a real stranger's structurally-valid +1 number --
     undetectable, and the wrong person attributed to the purchase. This asserts the
     capability is GONE rather than merely unused, so bringing it back is a deliberate
     act with this comment attached to it. */
  const identity = await import("../lib/tiktok-identity.ts");
  assert.equal("normalizePhoneE164ForTikTok" in identity, false);
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
