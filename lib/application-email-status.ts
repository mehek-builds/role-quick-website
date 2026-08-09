/**
 * What the Automation tab is allowed to claim about the Litos application email.
 *
 * THE DEFECT THIS EXISTS FOR, measured in production on 2026-08-08. The panel rendered a green
 * ACTIVE badge, "Application domain: applications@trylitos.com" and "Forwarding:
 * mehekmandal05@gmail.com", while GET /health reported the same subsystem
 * `status: degraded, deliverable: false, detail: "Resend /domains answered 401"`, and every real
 * submission that day fell back to the plain account address with `tracked: false`. The badge was
 * reading `configured`, which is true when an environment variable is set. Nothing on the screen
 * was reading whether a reply from an employer would actually arrive.
 *
 * The backend has distinguished the two since the outage: GET /application-email sends `configured`
 * AND `tracking_active`, with `tracking_blocked_reason` when the second is false. Its own comment
 * says why both are sent: so a client can tell "never set up" apart from "set up and broken". This
 * module is the client finally doing that.
 *
 * Pure and dependency-free so it can be tested as behaviour by node:test with no DOM.
 */

export type ApplicationEmailTracking = {
  configured: boolean;
  tracking_active?: boolean;
  tracking_blocked_reason?: string | null;
  domain?: string | null;
};

export type ApplicationEmailBadge = {
  label: string;
  /** A Chip kind, from the five looks components/app/ui.tsx defines. "draft" is the quiet grey,
   *  "sent" is the green that means it happened, "warn" is the amber that means it stopped. The
   *  panel previously passed "happened", which is not a key at all and fell through to grey, so
   *  the badge could not have gone green even when the claim behind it was true. */
  kind: "draft" | "sent" | "warn";
  /** One sentence under the panel, or null when there is nothing to explain. */
  note: string | null;
};

/**
 * Plain language for each reason the backend can give.
 *
 * A reason it does not recognise still produces a sentence rather than the raw enum member: an
 * unmapped value is a backend that has grown a new failure mode, and printing
 * "domain_not_verified_in_resend" at a student is how "all time counter" reached production.
 */
const BLOCKED_COPY: Record<string, string> = {
  alias_not_configured: "The Litos address is not set up on this deployment yet, so applications use your own email.",
  inbound_disabled: "Replies to the Litos address are not being received, so applications use your own email.",
  no_mx_record: "The Litos address cannot receive mail yet, so applications use your own email.",
  domain_not_verified_in_resend: "The Litos mail domain is not verified yet, so applications use your own email.",
  inbound_route_missing: "Nothing is routing replies to the Litos address yet, so applications use your own email.",
  check_unavailable: "Litos could not confirm that replies to the Litos address arrive, so applications use your own email.",
};

function isMailbox(value: string | null | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function isDomain(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value));
}

export function applicationEmailBadge(status: ApplicationEmailTracking | null): ApplicationEmailBadge {
  if (status === null) return { label: "Checking", kind: "draft", note: null };
  if (!status.configured) {
    return { label: "Not configured", kind: "draft", note: null };
  }
  /* A backend that predates tracking_active sends neither field. Treating undefined as "working"
     would restore the exact defect; treating it as "broken" would put a red badge on a healthy
     deployment mid-rollout. It is neither: the honest answer is that this client cannot tell. */
  if (status.tracking_active === undefined) {
    return {
      label: "Set up",
      kind: "draft",
      note: "Litos cannot check right now whether employer replies come back through it.",
    };
  }
  if (status.tracking_active) {
    if (status.domain === undefined) {
      return {
        label: "Set up",
        kind: "draft",
        note: "Litos cannot confirm which address is on applications, so it uses your own email.",
      };
    }
    if (!isMailbox(status.domain) && !isDomain(status.domain)) {
      return {
        label: "Not delivering",
        kind: "warn",
        note: "The configured Litos address is invalid, so applications use your own email.",
      };
    }
    return { label: "Active", kind: "sent", note: null };
  }
  return {
    label: "Not delivering",
    kind: "warn",
    note: BLOCKED_COPY[status.tracking_blocked_reason ?? ""]
      ?? "Replies to the Litos address are not arriving, so applications use your own email.",
  };
}

/**
 * The address employers would see, only when it is really being used.
 *
 * The panel printed the configured address unconditionally under the heading "Application domain".
 * On a deployment where the alias is not delivering, that address is on no application: the runner
 * has already fallen back to the account email. Naming it anyway tells the student to watch a
 * mailbox nothing is being sent to.
 */
export function applicationEmailAddressInUse(
  status: ApplicationEmailTracking & { domain?: string | null } | null,
  accountEmail: string | null | undefined,
): string {
  if (status?.tracking_active && isMailbox(status.domain)) return status.domain;
  if (status?.tracking_active && isDomain(status.domain)) return `A packet-specific address at ${status.domain}`;
  return accountEmail ?? "Your account email";
}
