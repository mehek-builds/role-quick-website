import type {
  ApplicationEmailStatusResponse,
  EmailConnectionsResponse,
  EmailProvider,
} from "@/lib/api";

export const VERIFICATION_CONNECTION_INTENT_KEY = "litos:enable-verification-after-connect";

export function hasActiveInbox(connections: EmailConnectionsResponse): boolean {
  return connections.connections.some((connection) => connection.connected);
}

export function verificationEnableDecision(
  connections: EmailConnectionsResponse,
): "enable" | "connect" | "unavailable" {
  if (hasActiveInbox(connections)) return "enable";
  return connections.configured ? "connect" : "unavailable";
}

/**
 * The Litos application inbox and a connected personal inbox are separate routes.
 *
 * `automatic_verification_enabled` is the applicant's permission to read Gmail or Outlook. It is
 * never permission for the packet-specific Litos address, because that address belongs to the
 * application flow and receives only mail sent to that application alias. Keeping this derivation
 * pure makes it hard for a green alias probe to silently grant personal-inbox access.
 */
export function verificationRouteAvailability(input: {
  applicationEmail: ApplicationEmailStatusResponse | null;
  connections: EmailConnectionsResponse;
  personalInboxConsent: boolean;
}): "litos_inbox" | "personal_inbox" | "personal_inbox_disconnected" | "none" {
  if (input.applicationEmail?.tracking_active === true) return "litos_inbox";
  if (!input.personalInboxConsent) return "none";
  if (hasActiveInbox(input.connections)) return "personal_inbox";
  return "personal_inbox_disconnected";
}

export function shouldEnableVerificationAfterCallback(input: {
  callbackProvider: EmailProvider | null;
  callbackStatus: string | null;
  intendedProvider: string | null;
  connections: EmailConnectionsResponse;
}): boolean {
  return input.callbackStatus === "success"
    && input.callbackProvider !== null
    && input.intendedProvider === input.callbackProvider
    && input.connections.connections.some(
      (connection) => connection.provider === input.callbackProvider && connection.connected,
    );
}
