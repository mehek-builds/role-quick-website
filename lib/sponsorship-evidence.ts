export type SponsorshipEvidence = "posting_offers" | "employer_h1b_filings";

function normalizedCountryCodes(value: string | readonly string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code)))];
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function joined(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function sponsorshipEvidenceLabel(
  evidence: SponsorshipEvidence,
  countryCodes?: string | readonly string[] | null,
): string {
  const base = evidence === "posting_offers" ? "Sponsorship offered" : "Company has sponsored visas";
  const codes = normalizedCountryCodes(countryCodes);
  if (codes.length === 0) return base;
  const visible = codes.slice(0, 2).join(", ");
  const remainder = codes.length > 2 ? ` +${codes.length - 2}` : "";
  return `${base} in ${visible}${remainder}`;
}

export function sponsorshipEvidenceTitle(
  evidence: SponsorshipEvidence,
  countryCodes?: string | readonly string[] | null,
): string {
  const countries = normalizedCountryCodes(countryCodes).map(countryName);
  const where = countries.length > 0 ? ` in ${joined(countries)}` : "";
  if (evidence === "posting_offers") {
    return `This job post says visa sponsorship is available${where}.`;
  }
  return `This company has H-1B filings on record with the US government${where}: an approved petition, or an application it filed and the Labor Department certified. That is not a promise to sponsor you.`;
}
