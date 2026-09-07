/* `confirmation` is optional as of 2026-07-27, when both password forms dropped
   their Confirm field in favour of a show/hide toggle.

   The competitor audit criticised LoopCV for exactly what Litos was doing:
   "Confirm Password is a required field in 2026, on a form that already has a
   password visibility toggle." Litos had it worse. It had the confirm field and
   no toggle, so a 15-character password had to be typed correctly twice with
   no way to check either one.

   Kept as a parameter rather than deleted, so the match check still runs for any
   caller that does collect a confirmation and the rule lives in one place.
   Passing nothing skips only the match check; the other rules are the API's
   and always apply. */

// Mirrors passwordPolicyError in student-outreach-backend/src/lib/passwordAuth.ts.
// Keep both in sync: this is only a UX shortcut, the backend is authoritative.
// \p{Nd} covers decimal digits in any script, not just ASCII 0-9. \p{Cf}
// (zero-width space/joiner, BOM, ...) is treated the same as whitespace: a
// password whose full content isn't visible defeats the point of "no spaces."
const HAS_DIGIT = /\p{Nd}/u;
const HAS_SYMBOL = /[^\p{L}\p{Nd}\s\p{Cf}]/u;
const HAS_SPACE_LIKE = /[\s\p{Cf}]/u;

export function passwordFormProblem(
  password: string,
  confirmation?: string,
): string | null {
  const normalized = password.normalize("NFC");
  const length = Array.from(normalized).length;
  if (length < 15) return "Use at least 15 characters.";
  if (length > 128) return "Use no more than 128 characters.";
  if (HAS_SPACE_LIKE.test(normalized)) return "Remove any spaces or invisible characters from your password.";
  if (!HAS_DIGIT.test(normalized)) return "Add at least one number.";
  if (!HAS_SYMBOL.test(normalized)) return "Add at least one symbol.";
  if (confirmation !== undefined && normalized !== confirmation.normalize("NFC")) {
    return "Passwords do not match.";
  }
  return null;
}
