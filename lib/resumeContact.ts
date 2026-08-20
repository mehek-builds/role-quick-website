export type ResumeContactFields = {
  /** Where the applicant is, e.g. "Austin, TX". First on the line, as the PDF prints it. */
  location?: unknown;
  email?: unknown;
  phone?: unknown;
  linkedin_url?: unknown;
  github_url?: unknown;
  portfolio_url?: unknown;
};

/* MIRRORS engine/resumeRender.ts's `contactLine` IN THE BACKEND, in the same order: where they are,
   how to reply, then where to look them up.
 *
   `location` was missing here and present there, so the PDF an employer receives printed the
   applicant's city and every preview of that same document on this side did not. Caught by looking
   at a real build on 2026-08-20: the paper showed email, phone and a LinkedIn for a student whose
   stored contact carried "Evanston, IL" too.
 *
   Two implementations of one line is how that happens. Keeping the order identical is the cheapest
   defence available short of sharing the code across the repos. */
export const RESUME_CONTACT_KEYS = ["location", "email", "phone", "linkedin_url", "github_url", "portfolio_url"] as const;

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
