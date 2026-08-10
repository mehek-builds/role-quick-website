import assert from "node:assert/strict";
import test from "node:test";
import { CAPTCHA_BLOCKER, exactAttendedHandoffUrl, MANAGED_NETWORK_ACCESS_RESTRICTION_REASON } from "./attended-handoff.ts";

const SEEKA_FORM = "https://jobs.smartrecruiters.com/oneclick-ui/company/SeekaTechnology/publication/a8f863ea-c116-45b9-9e49-e56ad16833f0?dcr_ci=SeekaTechnology";

function review(overrides: Record<string, unknown> = {}) {
  return {
    status: "needs_attention" as const,
    ats_name: "smartrecruiters",
    attention_reason: MANAGED_NETWORK_ACCESS_RESTRICTION_REASON,
    extension_handoff_url: SEEKA_FORM,
    ...overrides,
  };
}

test("accepts the exact server-authorized SEEKA one-click form", () => {
  assert.equal(exactAttendedHandoffUrl(review()), SEEKA_FORM);
});

test("accepts the live-shaped exact CAPTCHA line alongside evidence gaps", () => {
  assert.equal(exactAttendedHandoffUrl(review({
    attention_reason: `${CAPTCHA_BLOCKER}\nA required answer still needs evidence from you`,
  })), SEEKA_FORM);
});

test("rejects a posting, another state, and another blocker", () => {
  assert.equal(exactAttendedHandoffUrl(review({ extension_handoff_url: "https://jobs.smartrecruiters.com/SeekaTechnology/744000063648206-role" })), null);
  assert.equal(exactAttendedHandoffUrl(review({ status: "failed" })), null);
  assert.equal(exactAttendedHandoffUrl(review({ attention_reason: "CAPTCHA requires attention" })), null);
  assert.equal(exactAttendedHandoffUrl(review({ attention_reason: `${CAPTCHA_BLOCKER}: solve it` })), null);
  assert.equal(exactAttendedHandoffUrl(review({ ats_name: "lever" })), null);
});

test("rejects another origin, credentials, fragments, and malformed publications", () => {
  for (const extension_handoff_url of [
    "https://evil.example/oneclick-ui/company/SeekaTechnology/publication/a8f863ea-c116-45b9-9e49-e56ad16833f0",
    "https://user:pass@jobs.smartrecruiters.com/oneclick-ui/company/SeekaTechnology/publication/a8f863ea-c116-45b9-9e49-e56ad16833f0",
    `${SEEKA_FORM}#other-job`,
    "https://jobs.smartrecruiters.com/oneclick-ui/company/SeekaTechnology/publication/not-a-uuid",
  ]) assert.equal(exactAttendedHandoffUrl(review({ extension_handoff_url })), null);
});
