export type ResumeContactFields = {
  email?: unknown;
  phone?: unknown;
  linkedin_url?: unknown;
  github_url?: unknown;
  portfolio_url?: unknown;
};

export const RESUME_CONTACT_KEYS = ["email", "phone", "linkedin_url", "github_url", "portfolio_url"] as const;

export function resumeContactLine(contact: ResumeContactFields): string {
  const seen = new Set<string>();
  const clean = (value: unknown) => {
    if (typeof value !== "string") return "";
    const shown = value
      .trim()
      .replace(/^https?:\/\/(www\.)?/i, "")
      .replace(/\/+$/, "");
    const key = shown.toLowerCase();
    if (!shown || seen.has(key)) return "";
    seen.add(key);
    return shown;
  };

  return RESUME_CONTACT_KEYS.map((key) => clean(contact[key])).filter(Boolean).join(" | ");
}
