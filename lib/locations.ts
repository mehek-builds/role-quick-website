/* Places a student can aim at.
 *
 * The only suggestions used to be /jobs/facets: the fifty most common city strings on the board
 * today. That is a useful list and a bad one to be the ONLY list, because the board is currently
 * US-heavy, so the field quietly told every student outside the US that their city was not a
 * place. Litos is not a US product - it is used from Dubai, and the people it is being shown to
 * are in London, Singapore, Toronto and Bangalore.
 *
 * So the facets are merged with this: a fixed list of hiring hubs, countries and regions across
 * every continent, plus Remote. The field still accepts free text, and always did; this decides
 * what it OFFERS.
 *
 * Cities carry their country (or, in the US, their state) because that is how employers write
 * them, and the matcher is a substring test against the posting's location string.
 */

/** Not a city. Matched against the posting's remote flag, not its location text. */
export const REMOTE_LOCATION = "Remote";

const NORTH_AMERICA = [
  "San Francisco, CA",
  "Palo Alto, CA",
  "Mountain View, CA",
  "San Jose, CA",
  "Los Angeles, CA",
  "San Diego, CA",
  "Seattle, WA",
  "Portland, OR",
  "New York, NY",
  "Boston, MA",
  "Cambridge, MA",
  "Washington, DC",
  "Arlington, VA",
  "Philadelphia, PA",
  "Pittsburgh, PA",
  "Chicago, IL",
  "Austin, TX",
  "Dallas, TX",
  "Houston, TX",
  "Denver, CO",
  "Boulder, CO",
  "Atlanta, GA",
  "Miami, FL",
  "Raleigh, NC",
  "Nashville, TN",
  "Detroit, MI",
  "Minneapolis, MN",
  "Salt Lake City, UT",
  "Phoenix, AZ",
  "Toronto, Canada",
  "Vancouver, Canada",
  "Montreal, Canada",
  "Waterloo, Canada",
  "Ottawa, Canada",
  "Calgary, Canada",
  "Mexico City, Mexico",
  "Guadalajara, Mexico",
  "United States",
  "Canada",
];

const LATIN_AMERICA = [
  "Sao Paulo, Brazil",
  "Rio de Janeiro, Brazil",
  "Buenos Aires, Argentina",
  "Santiago, Chile",
  "Bogota, Colombia",
  "Medellin, Colombia",
  "Lima, Peru",
  "Montevideo, Uruguay",
  "San Jose, Costa Rica",
  "Brazil",
  "Latin America",
];

const EUROPE = [
  "London, UK",
  "Cambridge, UK",
  "Oxford, UK",
  "Manchester, UK",
  "Edinburgh, UK",
  "Dublin, Ireland",
  "Paris, France",
  "Berlin, Germany",
  "Munich, Germany",
  "Hamburg, Germany",
  "Amsterdam, Netherlands",
  "Rotterdam, Netherlands",
  "Brussels, Belgium",
  "Zurich, Switzerland",
  "Geneva, Switzerland",
  "Lausanne, Switzerland",
  "Vienna, Austria",
  "Stockholm, Sweden",
  "Copenhagen, Denmark",
  "Oslo, Norway",
  "Helsinki, Finland",
  "Madrid, Spain",
  "Barcelona, Spain",
  "Lisbon, Portugal",
  "Porto, Portugal",
  "Milan, Italy",
  "Rome, Italy",
  "Warsaw, Poland",
  "Krakow, Poland",
  "Prague, Czechia",
  "Budapest, Hungary",
  "Bucharest, Romania",
  "Athens, Greece",
  "Tallinn, Estonia",
  "Vilnius, Lithuania",
  "United Kingdom",
  "Germany",
  "France",
  "Netherlands",
  "Switzerland",
  "Ireland",
  "Spain",
  "Poland",
  "Europe",
  "EMEA",
];

const MIDDLE_EAST_AND_AFRICA = [
  "Dubai, UAE",
  "Abu Dhabi, UAE",
  "Riyadh, Saudi Arabia",
  "Doha, Qatar",
  "Manama, Bahrain",
  "Kuwait City, Kuwait",
  "Muscat, Oman",
  "Amman, Jordan",
  "Tel Aviv, Israel",
  "Istanbul, Turkey",
  "Cairo, Egypt",
  "Lagos, Nigeria",
  "Nairobi, Kenya",
  "Accra, Ghana",
  "Cape Town, South Africa",
  "Johannesburg, South Africa",
  "Casablanca, Morocco",
  "United Arab Emirates",
  "Saudi Arabia",
  "Israel",
  "South Africa",
  "Middle East",
  "Africa",
];

const ASIA_PACIFIC = [
  "Singapore",
  "Hong Kong",
  "Tokyo, Japan",
  "Osaka, Japan",
  "Seoul, South Korea",
  "Shanghai, China",
  "Beijing, China",
  "Shenzhen, China",
  "Taipei, Taiwan",
  "Bangalore, India",
  "Hyderabad, India",
  "Mumbai, India",
  "Delhi, India",
  "Gurugram, India",
  "Pune, India",
  "Chennai, India",
  "Kuala Lumpur, Malaysia",
  "Jakarta, Indonesia",
  "Manila, Philippines",
  "Bangkok, Thailand",
  "Ho Chi Minh City, Vietnam",
  "Hanoi, Vietnam",
  "Sydney, Australia",
  "Melbourne, Australia",
  "Brisbane, Australia",
  "Auckland, New Zealand",
  "India",
  "Japan",
  "Australia",
  "APAC",
];

export const LOCATION_SUGGESTIONS: string[] = [
  REMOTE_LOCATION,
  ...NORTH_AMERICA,
  ...LATIN_AMERICA,
  ...EUROPE,
  ...MIDDLE_EAST_AND_AFRICA,
  ...ASIA_PACIFIC,
];

/**
 * The board's own cities first, then the world.
 *
 * A city we are actually watching is a better suggestion than one we are not, so the facets keep
 * their ranking (they arrive ordered by how much of the board they account for) and the fixed list
 * fills in behind them. Compared case-insensitively so "london, uk" from the board does not appear
 * twice next to "London, UK".
 */
export function locationSuggestions(facets: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of [REMOTE_LOCATION, ...facets, ...LOCATION_SUGGESTIONS]) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

/** Mirrors the backend's isRemoteLocation, so the chip reads as selected for what it saved. */
export function isRemoteLocation(value: string): boolean {
  const folded = value.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
  return folded === "remote" || folded.startsWith("remote ") || folded === "anywhere" || folded === "work from home" || folded === "wfh";
}
