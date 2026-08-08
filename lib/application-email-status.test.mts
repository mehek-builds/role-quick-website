import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { applicationEmailAddressInUse, applicationEmailBadge } from "./application-email-status.ts";

/**
 * MEASURED IN PRODUCTION, 2026-08-08.
 *
 * GET /application-email answered `{configured: true, tracking_active: false,
 * tracking_blocked_reason: "check_unavailable", domain: "applications@trylitos.com"}`. GET /health
 * answered `application_email: {status: "degraded", deliverable: false, detail: "Resend /domains
 * answered 401"}`. Every submission that day resolved to the plain account address with
 * `tracked: false`. The Automation tab showed a badge reading ACTIVE and printed the Litos address
 * as the one on her applications.
 *
 * The backend already sent everything needed to say otherwise. This pins the client reading it.
 */
describe("the application email badge", () => {
  test("configured but not delivering never says Active", () => {
    const badge = applicationEmailBadge({ configured: true, tracking_active: false, tracking_blocked_reason: "check_unavailable" });
    assert.notEqual(badge.label, "Active");
    assert.equal(badge.label, "Not delivering");
    assert.equal(badge.kind, "warn");
    assert.match(badge.note ?? "", /could not confirm/i);
    assert.match(badge.note ?? "", /your own email/i);
  });

  test("the badge is Active only when the live probe says replies arrive", () => {
    const badge = applicationEmailBadge({ configured: true, tracking_active: true });
    assert.equal(badge.label, "Active");
    assert.equal(badge.kind, "sent");
    assert.equal(badge.note, null);
  });

  test("the Active look is a Chip kind that actually resolves to the green", () => {
    /* The panel used to pass kind="happened", which is not a key in CHIP_STYLES at all, so it fell
       through to the quiet grey. The claim was wrong AND the colour asserting it never rendered. */
    const styles = readFileSync(new URL("../components/app/ui.tsx", import.meta.url), "utf8");
    const table = styles.slice(styles.indexOf("const CHIP_STYLES"), styles.indexOf("export function Chip"));
    for (const kind of ["draft", "sent", "warn"]) {
      assert.match(table, new RegExp(`\\b${kind}:`), `Chip has no "${kind}" key, so the badge would fall through to grey`);
    }
    assert.doesNotMatch(table, /\bhappened:/, "if this key is ever added, revisit the badge kinds rather than leaving both spellings alive");
  });

  test("never configured is quiet, not an alarm", () => {
    const badge = applicationEmailBadge({ configured: false });
    assert.equal(badge.label, "Not configured");
    assert.equal(badge.kind, "draft");
    assert.equal(badge.note, null);
  });

  test("still loading says so rather than guessing", () => {
    assert.equal(applicationEmailBadge(null).label, "Checking");
  });

  test("a backend that does not send tracking_active is 'cannot tell', not 'working'", () => {
    /* Both wrong answers are available here. Defaulting to true restores the exact defect on every
       staggered deploy; defaulting to false paints a healthy deployment amber. */
    const badge = applicationEmailBadge({ configured: true });
    assert.notEqual(badge.label, "Active");
    assert.notEqual(badge.label, "Not delivering");
    assert.match(badge.note ?? "", /cannot check/i);
  });

  test("every reason the backend can give has a sentence, and none prints the enum member", () => {
    const reasons = [
      "alias_not_configured",
      "inbound_disabled",
      "no_mx_record",
      "domain_not_verified_in_resend",
      "inbound_route_missing",
      "check_unavailable",
    ];
    for (const reason of reasons) {
      const note = applicationEmailBadge({ configured: true, tracking_active: false, tracking_blocked_reason: reason }).note ?? "";
      assert.ok(note.length > 20, `${reason} needs a sentence`);
      assert.doesNotMatch(note, /_/, `${reason} must not print the codebase's own word`);
    }
  });

  test("a reason this client has never seen still produces a sentence", () => {
    const note = applicationEmailBadge({ configured: true, tracking_active: false, tracking_blocked_reason: "some_new_failure" }).note ?? "";
    assert.ok(note.length > 20);
    assert.doesNotMatch(note, /some_new_failure/);
  });
});

describe("the address the panel prints", () => {
  const status = { configured: true, domain: "applications@trylitos.com" };

  test("the Litos address only when it is really on the applications", () => {
    assert.equal(
      applicationEmailAddressInUse({ ...status, tracking_active: true }, "mehekmandal05@gmail.com"),
      "applications@trylitos.com",
    );
  });

  test("the account address when the alias is not delivering, because that is what the runner used", () => {
    assert.equal(
      applicationEmailAddressInUse({ ...status, tracking_active: false }, "mehekmandal05@gmail.com"),
      "mehekmandal05@gmail.com",
    );
  });

  test("and when this client cannot tell, it does not claim the Litos address either", () => {
    assert.equal(applicationEmailAddressInUse(status, "mehekmandal05@gmail.com"), "mehekmandal05@gmail.com");
  });

  test("no account email on hand still produces words rather than an empty line", () => {
    assert.equal(applicationEmailAddressInUse(null, null), "Your account email");
  });
});
