import type { ApplicationProfile, CountryWorkEligibility, SponsorshipAnswer } from "@/lib/api";
import { MAX_COUNTRY_ELIGIBILITY_RECORDS } from "./work-eligibility-limit.ts";

export type CountryWorkEligibilityDraft = Omit<
  CountryWorkEligibility,
  "authorized_now" | "needs_sponsorship_now" | "needs_sponsorship_future"
> & {
  authorized_now: boolean | null;
  needs_sponsorship_now: boolean | null;
  needs_sponsorship_future: boolean | null;
};

export const ISO_COUNTRY_CODES = (`AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`).split(" ");
const ISO_COUNTRY_CODE_SET = new Set(ISO_COUNTRY_CODES);
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const STABLE_REGION_NAMES: Readonly<Record<string, string>> = {
  FK: "Falkland Islands",
  HK: "Hong Kong SAR China",
  MO: "Macao SAR China",
  PS: "Palestinian Territories",
};

export const COUNTRY_OPTIONS: readonly (readonly [string, string])[] = ISO_COUNTRY_CODES
  .map((code) => [code, STABLE_REGION_NAMES[code] ?? countryNames.of(code) ?? code] as const)
  .sort((left, right) => left[1].localeCompare(right[1]));

export function blankCountryEligibility(countryCode = ""): CountryWorkEligibilityDraft {
  return {
    country_code: countryCode,
    authorized_now: null,
    needs_sponsorship_now: null,
    needs_sponsorship_future: null,
    authorization_type: null,
    authorization_expiry: null,
  };
}

/**
 * Read an old US declaration only when its present and future meaning is complete.
 *
 * The onboarding answer can safely split the old combined sponsorship scalar for `needs_future`
 * and `no`. Explicit country records remain authoritative, including an explicit empty list.
 */
export function eligibilitySeed(
  profile: ApplicationProfile | null | undefined,
  sponsorshipAnswer?: SponsorshipAnswer | null,
): CountryWorkEligibilityDraft[] {
  if (Array.isArray(profile?.work_eligibility_by_country)) {
    return profile.work_eligibility_by_country.map((row) => ({ ...row }));
  }
  if (
    sponsorshipAnswer === "needs_future"
    && profile?.work_authorized !== false
    && profile?.needs_sponsorship !== false
  ) {
    return [{
      country_code: "US",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: true,
      authorization_type: null,
      authorization_expiry: null,
    }];
  }
  if (
    sponsorshipAnswer === "no"
    && profile?.work_authorized !== false
    && profile?.needs_sponsorship !== true
  ) {
    return [{
      country_code: "US",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: null,
      authorization_expiry: null,
    }];
  }
  if (sponsorshipAnswer != null) return [blankCountryEligibility()];
  if (profile?.work_authorized === true && profile.needs_sponsorship === false) {
    return [{
      country_code: "US",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: null,
      authorization_expiry: null,
    }];
  }
  return [blankCountryEligibility()];
}

export function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function countryEligibilityProblem(
  rows: readonly CountryWorkEligibilityDraft[],
  now: Date = new Date(),
): string | null {
  if (rows.length === 0) return "Add at least one country.";
  if (rows.length > MAX_COUNTRY_ELIGIBILITY_RECORDS) {
    return `Add no more than ${MAX_COUNTRY_ELIGIBILITY_RECORDS} countries.`;
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const code = row.country_code.trim().toUpperCase();
    if (!ISO_COUNTRY_CODE_SET.has(code)) return "Choose a country for every row.";
    if (seen.has(code)) return "Each country can appear only once.";
    seen.add(code);
    if (
      typeof row.authorized_now !== "boolean"
      || typeof row.needs_sponsorship_now !== "boolean"
      || typeof row.needs_sponsorship_future !== "boolean"
    ) return "Answer all three work eligibility questions for every country.";
    if (!row.authorized_now && !row.needs_sponsorship_now) {
      return "If you are not authorized now, say whether you need sponsorship before starting.";
    }
    if (row.authorization_expiry) {
      if (!isRealIsoDate(row.authorization_expiry)) return "Use a real YYYY-MM-DD authorization expiry date.";
      const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
      if (row.authorization_expiry < today) return "Authorization expiry cannot be in the past.";
      if (!row.authorized_now) return "Only an active authorization can have an expiry date.";
    }
  }
  return null;
}

export function normalizedCountryEligibility(rows: readonly CountryWorkEligibilityDraft[]): CountryWorkEligibility[] {
  return rows.map((row) => ({
    ...row,
    country_code: row.country_code.trim().toUpperCase(),
    authorization_type: row.authorization_type?.trim() || null,
    authorization_expiry: row.authorization_expiry || null,
    authorized_now: row.authorized_now as boolean,
    needs_sponsorship_now: row.needs_sponsorship_now as boolean,
    needs_sponsorship_future: row.needs_sponsorship_future as boolean,
  }));
}

export function legacySponsorshipAnswer(rows: readonly CountryWorkEligibility[]): SponsorshipAnswer | null {
  const us = rows.find((row) => row.country_code.trim().toUpperCase() === "US");
  if (!us) return null;
  if (us.needs_sponsorship_now) return "needs_now";
  if (us.needs_sponsorship_future) return "needs_future";
  if (!us.authorized_now) return "not_authorized";
  return "no";
}
