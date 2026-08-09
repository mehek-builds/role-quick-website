import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicationEmailAddressInUse,
  applicationEmailBadge,
} from "../lib/application-email-status.ts";

test("an active flag cannot make a domain-shaped value look like a working mailbox", () => {
  const malformed = {
    configured: true,
    tracking_active: true,
    domain: "garaierkaa.resend.app",
  };

  assert.equal(applicationEmailBadge(malformed).label, "Not delivering");
  assert.match(applicationEmailBadge(malformed).note ?? "", /invalid/);
  assert.equal(
    applicationEmailAddressInUse(malformed, "applicant@example.com"),
    "applicant@example.com",
  );
});

test("a verified full mailbox can still be shown as active", () => {
  const valid = {
    configured: true,
    tracking_active: true,
    domain: "applications@trylitos.com",
  };

  assert.equal(applicationEmailBadge(valid).label, "Active");
  assert.equal(
    applicationEmailAddressInUse(valid, "applicant@example.com"),
    "applications@trylitos.com",
  );
});

test("an active flag with no mailbox cannot contradict the account address", () => {
  const incomplete = {
    configured: true,
    tracking_active: true,
  };

  assert.equal(applicationEmailBadge(incomplete).label, "Set up");
  assert.equal(
    applicationEmailAddressInUse(incomplete, "applicant@example.com"),
    "applicant@example.com",
  );
});
