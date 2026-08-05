/* Read the user id out of the session token, for analytics identity only.
 *
 * The backend signs `{ userId, email?, isGuest, authMethod, sessionVersion }`
 * (volley-backend src/routes/auth.ts). Every auth path on the site ends at
 * setSession(token, ...), so decoding the token there is the one place that
 * catches password, email-code, email-verification, Google and guest sign-in
 * at once, including any auth method added later.
 *
 * THIS DOES NOT VERIFY THE TOKEN AND MUST NOT BE USED FOR AUTHORISATION.
 * A JWT payload is base64url, not encryption: anyone can write one. The server
 * verifies the signature on every request, which is where trust belongs. The
 * only thing done with this value is naming a PostHog person, so a forged id
 * would corrupt one analytics profile in the forger's own browser and nothing
 * else. Decoding without verifying is the right trade here and the wrong one
 * almost everywhere else, hence the shouting.
 */

type SessionClaims = {
  userId?: unknown;
  isGuest?: unknown;
};

function decodeSegment(segment: string): unknown {
  // base64url differs from base64 in two characters and drops the padding,
  // both of which atob refuses.
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);

  // A JWT payload is UTF-8, and atob yields one char per byte. Without this
  // step any non-ASCII claim decodes to mojibake. The id is a UUID today, but
  // silently corrupting a future claim is not worth saving three lines.
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The account's stable id, or null if the token is unreadable. */
export function userIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = decodeSegment(parts[1]) as SessionClaims;
    const id = claims?.userId;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    /* A malformed token is the server's problem, not analytics'. */
    return null;
  }
}
