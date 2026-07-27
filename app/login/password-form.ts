/* `confirmation` is optional as of 2026-07-27, when both password forms dropped
   their Confirm field in favour of a show/hide toggle.

   The competitor audit criticised LoopCV for exactly what Litos was doing:
   "Confirm Password is a required field in 2026, on a form that already has a
   password visibility toggle." Litos had it worse. It had the confirm field and
   no toggle, so a 15-character passphrase had to be typed correctly twice with
   no way to check either one.

   Kept as a parameter rather than deleted, so the match check still runs for any
   caller that does collect a confirmation and the rule lives in one place.
   Passing nothing skips only the match check; the length bounds are the API's
   and always apply. */
export function passwordFormProblem(
  password: string,
  confirmation?: string,
): string | null {
  const normalized = password.normalize("NFC");
  const length = Array.from(normalized).length;
  if (length < 15) return "Use at least 15 characters.";
  if (length > 128) return "Use no more than 128 characters.";
  if (confirmation !== undefined && normalized !== confirmation.normalize("NFC")) {
    return "Passwords do not match.";
  }
  return null;
}
