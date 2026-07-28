/* Company marks for the board tiles.
 *
 * Self-hosted on purpose. The easy way to do this is a third-party logo API
 * (Clearbit, Google's favicon service), but that puts a request to somebody
 * else's server in every visitor's browser, on a page that lists 24 employers
 * at a time — which hands a third party a log of who is looking at which jobs.
 * For a product whose whole pitch is that it does not do things behind your
 * back, that is the wrong trade. scripts/fetch-company-logos.mjs pulls each
 * mark once from the company's OWN domain and commits it to public/company/.
 *
 * Keyed by company_name exactly as monitored_jobs stores it, which is the
 * display name in the backend's src/lib/jobSources.ts. Those two lists have to
 * be edited together; a company added there and missed here falls back to its
 * initial rather than breaking, and tests/browse-jobs.test.mjs fails if a name
 * in this map has no file on disk.
 */

/* Chime and Gusto are DELIBERATELY absent. Both answer every asset request
   with a 403 bot-block — homepage, /favicon.ico, /apple-touch-icon.png, with
   and without www — so there is no mark to fetch from their own domain, and
   the alternative is exactly the third-party logo API this file exists to
   avoid. They render as a monogram. Re-check occasionally; if either opens up,
   add it here and re-run the fetch script. */
export const COMPANY_DOMAINS: Record<string, string> = {
  // Consumer + marketplaces
  Airbnb: "airbnb.com",
  Pinterest: "pinterest.com",
  Reddit: "reddit.com",
  Lyft: "lyft.com",
  Instacart: "instacart.com",
  Twitch: "twitch.tv",
  Discord: "discord.com",
  Duolingo: "duolingo.com",
  Faire: "faire.com",
  Flexport: "flexport.com",
  "Match Group": "mtch.com",

  // Fintech
  Stripe: "stripe.com",
  Brex: "brex.com",
  Affirm: "affirm.com",
  Coinbase: "coinbase.com",
  Robinhood: "robinhood.com",
  SoFi: "sofi.com",
  Carta: "carta.com",
  Betterment: "betterment.com",
  Marqeta: "marqeta.com",
  Gemini: "gemini.com",
  Ramp: "ramp.com",

  // Quant + trading
  Point72: "point72.com",
  "IMC Trading": "imc.com",
  "Qube Research & Technologies": "qube-rt.com",
  Palantir: "palantir.com",

  // Infra, data and dev tools
  Cloudflare: "cloudflare.com",
  GitLab: "gitlab.com",
  MongoDB: "mongodb.com",
  Datadog: "datadoghq.com",
  Asana: "asana.com",
  Airtable: "airtable.com",
  Amplitude: "amplitude.com",
  Notion: "notion.com",
  Linear: "linear.app",
  Vanta: "vanta.com",
  Supabase: "supabase.com",
  Replit: "replit.com",
  Render: "render.com",

  // AI labs and AI products
  Anthropic: "anthropic.com",
  "Scale AI": "scale.com",
  Perplexity: "perplexity.ai",
  Cursor: "cursor.com",
  Baseten: "baseten.co",

  // Design, HR and health
  Figma: "figma.com",
  Checkr: "checkr.com",
  Zocdoc: "zocdoc.com",
  Doximity: "doximity.com",
  "Khan Academy": "khanacademy.org",
};

/* The filename a company's mark is stored under. Derived from the name rather
   than the domain so the asset is greppable from the tile that renders it. */
export function logoSlug(company: string): string {
  return company
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function logoPath(company: string): string | null {
  return company in COMPANY_DOMAINS ? `/company/${logoSlug(company)}.png` : null;
}

/* Fallback when a company has no mark: its first letter. Deliberately not a
   coloured circle — DESIGN.md bans icons-in-coloured-circles, and a board where
   the missing logos are the loudest thing on the page reads as broken. */
export function monogram(company: string): string {
  const first = company.trim()[0];
  return first ? first.toUpperCase() : "?";
}
