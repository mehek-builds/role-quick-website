import type { EmailConnectionsResponse, EmailProvider } from "@/lib/api";

export const VERIFICATION_CONNECTION_INTENT_KEY = "litos:enable-verification-after-connect";

export function hasActiveInbox(connections: EmailConnectionsResponse): boolean {
  return connections.connections.some((connection) => connection.connected);
}

export function verificationEnableDecision(
  connections: EmailConnectionsResponse,
  applicationAliasAvailable = false,
): "enable" | "connect" | "unavailable" {
  if (applicationAliasAvailable) return "enable";
  if (hasActiveInbox(connections)) return "enable";
  return connections.configured ? "connect" : "unavailable";
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
