import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTCHA_BLOCKER,
  exactAttendedHandoffUrl,
  ICIMS_ATTENDED_GATE_REASON,
  ICIMS_SECURITY_CODE_GATE_REASON,
  JOBVITE_ATTENDED_GATE_REASON,
  MANAGED_NETWORK_ACCESS_RESTRICTION_REASON,
  ORACLE_ATTENDED_GATE_REASON,
} from "./attended-handoff.ts";

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
    "https://jobs.smartrecruiters.com:444/oneclick-ui/company/SeekaTechnology/publication/a8f863ea-c116-45b9-9e49-e56ad16833f0",
    `${SEEKA_FORM}#other-job`,
    "https://jobs.smartrecruiters.com/oneclick-ui/company/SeekaTechnology/publication/not-a-uuid",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/SeekaTechnology/publication/------------------------------------",
  ]) assert.equal(exactAttendedHandoffUrl(review({ extension_handoff_url })), null);
});

test("accepts only the exact backend-authorized Jobvite consent handoff", () => {
  const url = "https://jobs.jobvite.com/worldfirst/job/oknrAfws/apply";
  assert.equal(exactAttendedHandoffUrl(review({
    ats_name: "jobvite",
    attention_reason: JOBVITE_ATTENDED_GATE_REASON,
    extension_handoff_url: url,
    portal_url: "https://jobs.jobvite.com/worldfirst/job/oknrAfws",
  })), url);
  for (const overrides of [
    { status: "ready_to_submit" },
    { attention_reason: "Privacy consent requires your attention" },
    { attention_reason: CAPTCHA_BLOCKER },
    { ats_name: "icims" },
    { extension_handoff_url: "https://jobs.jobvite.com/worldfirst/job/oknrAfws" },
    { extension_handoff_url: "https://jobs.jobvite.com/worldfirst/job/oknrAfws/apply?source=litos" },
    { extension_handoff_url: "https://jobs.jobvite.com/worldfirst/job/oknrAfws/apply#form" },
    { extension_handoff_url: "https://jobs.jobvite.com:444/worldfirst/job/oknrAfws/apply" },
    { extension_handoff_url: "https://jobs.jobvite.com/worldfirst/jobs" },
    { extension_handoff_url: "https://evil.example/worldfirst/job/oknrAfws/apply" },
    { portal_url: "https://jobs.jobvite.com/worldfirst/job/DIFFERENT" },
    { portal_url: "https://jobs.jobvite.com/WorldFirst/job/oknrAfws" },
    { portal_url: "https://jobs.jobvite.com/worldfirst/job/OKNRAfws" },
    { portal_url: "https://jobs.jobvite.com/other/job/oknrAfws" },
    { portal_url: undefined },
  ]) assert.equal(exactAttendedHandoffUrl(review({
    ats_name: "jobvite",
    attention_reason: JOBVITE_ATTENDED_GATE_REASON,
    extension_handoff_url: url,
    portal_url: "https://jobs.jobvite.com/worldfirst/job/oknrAfws",
    ...overrides,
  })), null);
});

test("accepts only measured iCIMS login and security-code handoffs", () => {
  const url = "https://jobs-express.icims.com/jobs/48173/sales-associate/login";
  for (const attention_reason of [ICIMS_ATTENDED_GATE_REASON, ICIMS_SECURITY_CODE_GATE_REASON]) {
    assert.equal(exactAttendedHandoffUrl(review({
      ats_name: "icims",
      attention_reason,
      extension_handoff_url: url,
      portal_url: "https://jobs-express.icims.com/jobs/48173/sales-associate/job",
    })), url);
  }
  for (const overrides of [
    { status: "awaiting_security_code" },
    { attention_reason: "Account login is required" },
    { attention_reason: CAPTCHA_BLOCKER },
    { ats_name: "jobvite" },
    { extension_handoff_url: "https://jobs-express.icims.com/jobs/48173/sales-associate/job" },
    { extension_handoff_url: "https://jobs-express.icims.com/jobs/48173/sales-associate/apply" },
    { extension_handoff_url: "https://jobs-express.icims.com/jobs/48173/sales-associate/login?source=litos" },
    { extension_handoff_url: "https://jobs-express.icims.com/jobs/search/login" },
    { extension_handoff_url: "https://login.icims.com/jobs/48173/sales-associate/login" },
    { extension_handoff_url: "https://other.example/jobs/48173/sales-associate/login" },
    { portal_url: "https://jobs-express.icims.com/jobs/48174/sales-associate/job" },
    { portal_url: "https://other-valid.icims.com/jobs/48173/sales-associate/job" },
    { portal_url: undefined },
  ]) assert.equal(exactAttendedHandoffUrl(review({
    ats_name: "icims",
    attention_reason: ICIMS_ATTENDED_GATE_REASON,
    extension_handoff_url: url,
    portal_url: "https://jobs-express.icims.com/jobs/48173/sales-associate/job",
    ...overrides,
  })), null);
});

test("unverified and generic account gates never become attended handoffs", () => {
  for (const ats_name of ["jobvite", "icims", "lever"]) {
    assert.equal(exactAttendedHandoffUrl(review({
      ats_name,
      attention_reason: "Litos could not verify the exact account gate for this application, so it did not enter any information or send anything. Open the saved company page in Chrome to continue.",
      extension_handoff_url: ats_name === "jobvite"
        ? "https://jobs.jobvite.com/worldfirst/job/oknrAfws/apply"
        : "https://jobs-express.icims.com/jobs/48173/sales-associate/login",
    })), null);
  }
});

test("Oracle remains non-armable until a measured post-gate and receipt contract exists", () => {
  const gate = "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/jobsearch/job/333913/apply/email";
  assert.equal(exactAttendedHandoffUrl(review({
    ats_name: "oraclecloud",
    attention_reason: ORACLE_ATTENDED_GATE_REASON,
    extension_handoff_url: gate,
    portal_url: gate,
  })), null);
});
