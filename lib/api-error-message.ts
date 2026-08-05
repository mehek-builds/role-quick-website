function cleanApiIssue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const issue = value.replace(/\s+/g, " ").trim();
  return issue ? issue : null;
}

export function apiErrorMessage(data: unknown, status: number): { message: string; issues: string[] } {
  const body = data as { error?: unknown; issues?: unknown } | null;
  const base =
    typeof body?.error === "string" && body.error.trim()
      ? body.error.trim()
      : `Request failed (${status})`;
  const issues = Array.isArray(body?.issues)
    ? body.issues.map(cleanApiIssue).filter((issue): issue is string => Boolean(issue))
    : [];
  if (issues.length === 0) return { message: base, issues };
  const shown = issues.slice(0, 5);
  const hidden = issues.length - shown.length;
  const suffix = hidden > 0 ? ` ${hidden} more issue${hidden === 1 ? "" : "s"} hidden.` : "";
  return { message: `${base} Issues: ${shown.join("; ")}.${suffix}`, issues };
}
