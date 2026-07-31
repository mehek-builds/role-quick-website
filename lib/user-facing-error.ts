const TECHNICAL_ERROR = /browserType\.launch|executable[^\n]*doesn'?t exist|chrom(?:e|ium)|playwright|spawn[^\n]*ENOENT|(?:^|\n)\s*at\s+\S+|\/(?:Applications|tmp|Users)\/|node_modules|ECONN[A-Z]+|SQLSTATE|request failed\s*\(\d{3}\)|internal server error|(?:HTTP|status)\s*5\d\d|\b5\d\d\s+(?:internal|server)|\b(?:postgres|mysql|sqlite|database)\b|\b(?:api[_ -]?key|token|secret|password)\s*[=:]\s*\S+/i;

export function userFacingError(value: unknown, fallback = "Litos hit a problem. Try again."): string {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value.trim() : "";
  if (!message || TECHNICAL_ERROR.test(message)) return fallback;
  return message;
}
