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

  /* --- The board grew from 51 companies to 253; these are the rest. ---
     Domains found by scripts/discover-company-domains.mjs and then READ BY HAND,
     which is not ceremony: the script accepted 144 and 13 of them were a
     different company that happens to share the name. crisp.com is a
     programmers' editor (ours is crisp.chat), peloton.com sells oil-and-gas
     software, honor.com sells phones, unit.com sells workwear, prefect.com is
     parked. Those 13 were rejected and stay on the monogram, along with ~60 the
     script could not resolve at all, and 10 whose site refused the fetch. A
     wrong logo on a real job is worse than no logo, so this list only contains
     marks somebody looked at, and every entry has a file on disk — asserted by
     tests/browse-jobs.test.mjs. */
  Abridge: "abridge.com",
  Adyen: "adyen.com",
  Alloy: "alloy.com",
  anomalo: "anomalo.com",
  aptoslabs: "aptoslabs.com",
  AQR: "aqr.com",
  atlan: "atlan.com",
  attio: "attio.com",
  betterhelp: "betterhelp.com",
  binalyze: "binalyze.com",
  bishopfox: "bishopfox.com",
  Blend: "blend.com",
  blueconic: "blueconic.com",
  Braintrust: "braintrust.com",
  Braze: "braze.com",
  btgpactual: "btgpactual.com",
  buildkite: "buildkite.com",
  Calendly: "calendly.com",
  calm: "calm.com",
  causaly: "causaly.com",
  Cerebras: "cerebras.com",
  circleci: "circleci.com",
  Clickhouse: "clickhouse.com",
  Coder: "coder.com",
  Column: "column.com",
  cresta: "cresta.com",
  cultureamp: "cultureamp.com",
  curative: "curative.com",
  Databricks: "databricks.com",
  datafold: "datafold.com",
  Deepgram: "deepgram.com",
  doppel: "doppel.com",
  Doppler: "doppler.com",
  dremio: "dremio.com",
  Dropbox: "dropbox.com",
  elationhealth: "elationhealth.com",
  elicit: "elicit.com",
  evervault: "evervault.com",
  fireblocks: "fireblocks.com",
  Fireworks: "fireworks.com",
  Fivetran: "fivetran.com",
  "Flow Traders": "flowtraders.com",
  found: "found.com",
  freenome: "freenome.com",
  gorgias: "gorgias.com",
  graphcore: "graphcore.com",
  Hightouch: "hightouch.com",
  Infisical: "infisical.com",
  inkeep: "inkeep.com",
  Inngest: "inngest.com",
  ionq: "ionq.com",
  "Jane Street": "janestreet.com",
  jfrog: "jfrog.com",
  "Jump Trading": "jumptrading.com",
  Klaviyo: "klaviyo.com",
  komodohealth: "komodohealth.com",
  kustomer: "kustomer.com",
  LangChain: "langchain.com",
  lattice: "lattice.com",
  launchdarkly: "launchdarkly.com",
  lightmatter: "lightmatter.com",
  Mercury: "mercury.com",
  Mixpanel: "mixpanel.com",
  Modal: "modal.com",
  modernhealth: "modernhealth.com",
  Monzo: "monzo.com",
  Namespace: "namespace.com",
  nanonets: "nanonets.com",
  natera: "natera.com",
  Netlify: "netlify.com",
  Nuro: "nuro.com",
  omadahealth: "omadahealth.com",
  onemedical: "onemedical.com",
  openzeppelin: "openzeppelin.com",
  Opslevel: "opslevel.com",
  PagerDuty: "pagerduty.com",
  papa: "papa.com",
  phonepe: "phonepe.com",
  "Physical Intelligence": "physicalintelligence.com",
  Pinecone: "pinecone.com",
  PlanetScale: "planetscale.com",
  postman: "postman.com",
  Railway: "railway.com",
  Recursion: "recursion.com",
  Remote: "remote.com",
  Resend: "resend.com",
  "Riot Games": "riotgames.com",
  ripple: "ripple.com",
  Roblox: "roblox.com",
  rogo: "rogo.com",
  Roku: "roku.com",
  rutter: "rutter.com",
  safebreach: "safebreach.com",
  Samsara: "samsara.com",
  science37: "science37.com",
  semgrep: "semgrep.com",
  singlestore: "singlestore.com",
  skyflow: "skyflow.com",
  SpaceX: "spacex.com",
  Spotify: "spotify.com",
  Squarespace: "squarespace.com",
  starburst: "starburst.com",
  Suno: "suno.com",
  "Take-Two": "taketwo.com",
  talkspace: "talkspace.com",
  tebra: "tebra.com",
  tenstorrent: "tenstorrent.com",
  "Tower Research": "towerresearch.com",
  Trustly: "trustly.com",
  truveta: "truveta.com",
  Twilio: "twilio.com",
  veracode: "veracode.com",
  veracyte: "veracyte.com",
  Vercel: "vercel.com",
  Verkada: "verkada.com",
  Virtu: "virtu.com",
  Waymo: "waymo.com",
  Webflow: "webflow.com",
  workboard: "workboard.com",
  WorkOS: "workos.com",
  yugabyte: "yugabyte.com",
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

/* Where the tile points for a company's mark.
 *
 * A curated company gets its committed file directly — no round trip, and those
 * marks were approved by a human. Everything else goes to /api/company-logo,
 * which resolves it live and answers with a monogram if it cannot. That is what
 * keeps the board correct as the job monitor adds employers: a company that
 * appeared an hour ago has a mark on the next request, and one that left the
 * board is simply never asked for again.
 *
 * Always returns a URL, never null, so the tile is one <img> that always renders
 * and never needs client-side fallback handling. */
export function logoSrc(company: string, boardUrl?: string | null): string {
  const committed = logoPath(company);
  if (committed) return committed;
  const params = new URLSearchParams({ c: company });
  /* The board this employer is polled on. Passing it turns the lookup from
     "guess a domain from the name" into "ask the board we already trust", which
     is the difference between block.co and block.xyz. */
  if (boardUrl) params.set("board", boardUrl);
  return `/api/company-logo?${params.toString()}`;
}
