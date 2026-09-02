import { isRemoteLocation } from "./locations.ts";

/* The one place the student asked for, out of the five the employer listed.
 *
 * An employer writes every office a req is open in into one location field, so a single posting
 * arrives as "Austin, TX, United States; Chicago, Illinois, United States; London, United Kingdom;
 * New York, NY, United States; Singapore". Printed whole under the job title in the onboarding
 * flow, that is three wrapped lines of places the student never asked about, above a screen whose
 * whole job is to hand them ONE posting they can say yes to.
 *
 * So the header prints the offices they named and drops the rest. Two rules keep that from
 * becoming a claim the posting does not support:
 *
 *   - narrowing only ever REMOVES. Every string printed came out of the employer's own location
 *     field, so nothing here can invent a city the posting is not open in;
 *   - when nothing matches - no saved locations, a posting written as one place, a matcher that
 *     cannot tell - the full field is printed exactly as it arrived. Falling back to everything is
 *     always honest; a wrong single city is not.
 *
 * The matcher mirrors the backend's own (src/lib/jobPreferences.ts preferenceFit): same fold, same
 * substring test against the posting's location text. It is deliberately looser in one place -
 * see `sameCity` - because the board's preferences offer "London, UK" and employers write "London,
 * United Kingdom", and a matcher that cannot join those two would fall back to the full list on
 * the most common multi-office posting there is.
 */

/** How employers separate offices inside one location field. NOT the comma: a comma separates a
 *  city from its state or country, and splitting on it would turn one office into three places. */
const SEGMENT_SEPARATOR = /\s*(?:;|\||•|\n)\s*/;

/** The separator the narrowed header is rejoined with. Only reached when something was actually
 *  removed - an untouched field is returned as the employer wrote it, spacing included. */
const REJOIN = "; ";

/** Every office in one location field, in the order the employer wrote them. */
export function splitPostingLocations(location: string | null | undefined): string[] {
  if (!location) return [];
  return location.split(SEGMENT_SEPARATOR).map((part) => part.trim()).filter(Boolean);
}

/**
 * The posting's location as this student should read it: the offices they named, or the whole
 * field when that cannot be answered.
 *
 * `preferred` is the account's saved targeting locations, straight off GET /profile/targeting.
 * "Remote" is one of the places a student can pick there, and it is matched against the location
 * text here rather than against the posting's remote flag - this function narrows a written list,
 * so the only thing it can honestly keep is a line the employer wrote the word on.
 */
export function narrowPostingLocation(
  location: string | null | undefined,
  preferred: readonly string[] | null | undefined,
): string | null {
  const original = location?.trim() ? location : null;
  const segments = splitPostingLocations(location);
  /* One place is already the simplest true answer, and there is nothing to remove from it. */
  if (segments.length < 2) return original;

  const wanted = (preferred ?? []).map((value) => value.trim()).filter(Boolean);
  if (wanted.length === 0) return original;
  const wantsRemote = wanted.some(isRemoteLocation);
  const places = wanted.filter((value) => !isRemoteLocation(value));

  const kept = segments.filter((segment) =>
    (wantsRemote && isRemoteLocation(segment))
    || places.some((place) => sameLocation(segment, place)),
  );
  /* Nothing recognised, or everything did: either way the student is told exactly what the
     employer wrote, which is what the header did before any of this. */
  if (kept.length === 0 || kept.length === segments.length) return original;
  return kept.join(REJOIN);
}

/** One office against one saved preference. */
function sameLocation(segment: string, preferred: string): boolean {
  const office = fold(segment);
  const place = fold(preferred);
  if (!office || !place) return false;
  /* Either can be the broader of the two: "United States" is a preference that contains a whole
     office ("Austin, TX, United States"), and "London" is an office contained by a preference
     ("London, UK"). Whole words on both sides, so "US" does not match the "us" inside "Austin". */
  return containsPhrase(office, place) || containsPhrase(place, office) || sameCity(segment, preferred);
}

/**
 * The same city written two ways, which is the common case and the one a substring test misses.
 *
 * The suggestion list offers "London, UK" and "Chicago, IL"; employers write "London, United
 * Kingdom" and "Chicago, Illinois, United States". The cities are identical and the regions are
 * the same region under a different spelling, so this compares the two halves separately.
 *
 * The region check is what stops the obvious false positive. "San Jose, CA" and "San Jose, Costa
 * Rica" share a city and are not the same place, and neither are "Cambridge, MA" and "Cambridge,
 * UK" - `sameRegion` rejects both. When it cannot tell, it says no and the header falls back to
 * printing every office, which is the safe direction.
 */
function sameCity(segment: string, preferred: string): boolean {
  const office = parts(segment);
  const place = parts(preferred);
  return office.city !== "" && office.city === place.city && sameRegion(office.region, place.region);
}

/** A location's city and everything the employer wrote after it. */
function parts(value: string): { city: string; region: string } {
  const [city, ...rest] = value.split(",");
  return { city: fold(city ?? ""), region: fold(rest.join(" ")) };
}

/**
 * Whether two written regions are the same region.
 *
 * Absent on either side is not a conflict: an office written as bare "London" says nothing that
 * contradicts a preference for "London, UK". Beyond that it is the two forms a region is actually
 * written in - a shared word ("New York, NY" / "New York, NY, United States"), or an abbreviation
 * against the words it abbreviates, either as a prefix ("IL" / "Illinois") or as initials ("UK" /
 * "United Kingdom"). Anything else is treated as a different region.
 */
function sameRegion(a: string, b: string): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  const left = a.split(" ").filter(Boolean);
  const right = b.split(" ").filter(Boolean);
  if (left.some((word) => right.includes(word))) return true;
  return abbreviates(a, right) || abbreviates(b, left);
}

/** "il" for ["illinois"], "uk" for ["united", "kingdom"]. Not "ca" for ["costa", "rica"]. */
function abbreviates(short: string, words: readonly string[]): boolean {
  if (short.includes(" ") || short.length > 3 || words.length === 0) return false;
  if (words[0].startsWith(short)) return true;
  return words.map((word) => word[0]).join("") === short;
}

/** `needle` appearing in `haystack` on whole-word boundaries. Both are already folded, so words
 *  are separated by single spaces and the boundary test is a space or an end. */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const end = at + needle.length;
    if ((at === 0 || haystack[at - 1] === " ") && (end === haystack.length || haystack[end] === " ")) return true;
    from = at + 1;
  }
  return false;
}

/** The backend's fold, character for character (src/lib/jobPreferences.ts), so a preference that
 *  matched a posting on the board matches the same posting here. */
function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
}
