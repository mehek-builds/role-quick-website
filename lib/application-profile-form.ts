/** Clearing a text control means "not answered", never an empty factual answer. */
export function nullableProfileText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Preserve meaningful spaces while typing, but never turn whitespace alone into a fact. */
export function editableProfileText(value: string): string | null {
  return value.trim().length > 0 ? value : null;
}

/** Comma-separated controls store a factual list, or null when the applicant clears it. */
export function nullableProfileList(value: string): string[] | null {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}
