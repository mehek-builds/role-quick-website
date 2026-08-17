/* `chromium` and headless-Chrome spellings only, never bare "Chrome". The technical strings this
   filter exists for name the BINARY (Playwright's "chromium", the runner's "HeadlessChrome" user
   agent), while the product's own curated copy names the BROWSER ("Update the Litos extension from
   the Chrome Web Store"). The wide `chrom(?:e|ium)` arm swallowed that curated sentence - and every
   other hand-written message naming Chrome - into the generic fallback, so the one screen that knew
   why the attended fill failed told the applicant nothing. Measured on the live Belvedere canonical
   detail, 2026-08-17. */
const TECHNICAL_ERROR = /browserType\.launch|executable[^\n]*doesn'?t exist|chromium\b|headless[\s_-]?chrome|playwright|spawn[^\n]*ENOENT|(?:^|\n)\s*at\s+\S+|\/(?:Applications|tmp|Users)\/|node_modules|ECONN[A-Z]+|SQLSTATE|request failed\s*\(\d{3}\)|internal server error|(?:HTTP|status)\s*5\d\d|\b5\d\d\s+(?:internal|server)|\b(?:postgres|mysql|sqlite|database)\b|\b(?:api[_ -]?key|token|secret|password)\s*[=:]\s*\S+/i;

export function userFacingError(value: unknown, fallback = "Litos hit a problem. Try again."): string {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value.trim() : "";
  if (!message || TECHNICAL_ERROR.test(message)) return fallback;
  return message;
}
