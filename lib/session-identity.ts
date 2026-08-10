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
 * verifies the signature on every request, which is where trust belongs.
 *
 * An earlier version of this comment claimed a forged id "would corrupt one
 * analytics profile in the forger's own browser and nothing else". That was
 * WRONG, and the correction is why the checks below exist. posthog.identify on
 * an anonymous browser sends $anon_distinct_id, which is a SERVER-SIDE person
 * merge, and PostHog person merges are irreversible. A forged token therefore
 * reaches another user's profile, not just the forger's own. The shape and
 * expiry checks below narrow that; they do not eliminate it for someone who
 * already knows a real account id.
 */

/* The localStorage key the session token is stored under.
 *
 * It lives HERE rather than in lib/api because two callers need it and this
 * module is a leaf with no imports. lib/api pulls in analytics, config,
 * product and in-flight; importing that chain from the instrumentation entry
 * point to read one string would risk an import cycle at boot, which is the
 * worst possible place to have one. Duplicating the literal instead would mean
 * a rename in lib/api silently stops identifying anyone. */
export const SESSION_TOKEN_KEY = "rq_token";

type SessionClaims = {
  userId?: unknown;
  isGuest?: unknown;
  exp?: unknown;
};

/* The id must look like the backend's UUID and nothing else.
 *
 * posthog.identify on an anonymous browser does a SERVER-SIDE person merge, via
 * $anon_distinct_id, and PostHog person merges cannot be undone. Without a shape
 * check, anyone could paste `{"userId":"<someone else's uuid>"}` into a token in
 * devtools, reload, and permanently fuse their browser into that person's
 * profile. Constraining the id to a v4 UUID does not stop a determined forger
 * who knows a real account id, but it removes the trivial case where any string
 * at all becomes an identity. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/**
 * The account's stable id, or null if the token is unreadable, expired, or not
 * an account we should name.
 *
 * `now` is injectable so the expiry rule can be tested without freezing clocks.
 */
export function userIdFromToken(
  token: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = decodeSegment(parts[1]) as SessionClaims;

    /* Expired tokens must not identify anyone.
     *
     * This is the shared-browser case and it is not hypothetical: on a library
     * or family machine, someone who closed the tab without signing out leaves
     * their token behind, and identify-on-boot would name the NEXT person as
     * them, then merge the two profiles irreversibly. The session is dead to the
     * server either way, so honouring `exp` here costs nothing real. */
    const exp = claims?.exp;
    if (typeof exp === "number" && Number.isFinite(exp) && exp * 1000 <= now) return null;

    const id = claims?.userId;
    if (typeof id !== "string" || !UUID_RE.test(id)) return null;
    return id;
  } catch {
    /* A malformed token is the server's problem, not analytics'. */
    return null;
  }
}
