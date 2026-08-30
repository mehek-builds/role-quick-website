/* Finding one company's mark, at request time.
 *
 * The committed set in lib/company-logos.ts is a snapshot, and a snapshot of a
 * moving board is wrong the moment it stops moving. The job monitor added 202
 * companies in a day; every one of them showed a monogram until a human noticed
 * and ran a script. This module is the half that does not need the human: given
 * a company name, work out its mark from scratch.
 *
 * The rules below are not fussiness. They were each paid for:
 *
 * .com ONLY. The first version also tried .ai/.io/.co and every false positive
 * came from them: Block resolved to block.co, an NFT company, not Jack
 * Dorsey's Block; Ashby to ashby.ai rather than ashbyhq.com; Elastic to
 * elastic.io. The impostor's own title contains the word, so no name check can
 * separate them. A company whose real domain is not .com keeps its monogram.
 *
 * THE SITE MUST NAME THE COMPANY. A candidate is accepted only if its <title>
 * or og:site_name contains the company name. Necessary, and famously not
 * sufficient, hence the two rules either side of it.
 *
 * A DENYLIST, because reading the 79 shortest names by hand rejected 13 that
 * passed every automated check: crisp.com is a programmers' editor (ours is
 * crisp.chat), peloton.com sells oil-and-gas software, honor.com sells phones,
 * unit.com sells workwear, lottie.com sells dolls, prefect.com is parked. A 16%
 * error rate among short names is why a name that has been judged wrong once
 * stays wrong rather than being re-guessed on every deploy.
 *
 * No sharp here on purpose: it is a devDependency, and this code runs in a
 * request. Everything below is pure JS, which is why the ICO handling only
 * reads the embedded-PNG variant and leaves raw bitmaps alone.
 */

/* Names whose obvious .com belongs to somebody else. Checked by hand
   2026-07-29; each one resolved and was rejected on sight. */
export const WRONG_DOTCOM = new Set([
  "crisp",
  "depot",
  "disney",
  "honor",
  "imply",
  "knock",
  "lottie",
  "peloton",
  "prefect",
  "sophos",
  "stone",
  "suki",
  "unit",
]);

/* Trailing noise that is never part of a domain. "group" is deliberately NOT in
   here, despite reading like filler: stripping it turns "Match Group" into
   "match", which is a different company with a very well known .com. The rule is
   that a suffix may only be dropped when doing so cannot change WHO the name
   refers to. */
const SUFFIX =
  /\s+(inc|llc|ltd|limited|corp|corporation|co|technologies|technology|labs|ai|the)\.?$/i;

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/* The name forms this company could plausibly own a .com under. */
function slugs(company: string): string[] {
  const base = company.replace(/\(.*?\)/g, " ").replace(/&/g, "and").replace(SUFFIX, "").trim();
  const tight = base.toLowerCase().replace(/[^a-z0-9]/g, "");
  const dashed = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const first = base.toLowerCase().split(/[^a-z0-9]+/)[0];
  return [...new Set([tight, dashed, first])].filter((s) => s && s.length > 2);
}

/* Denied if ANY form of the name is one that was checked and found to belong to
   somebody else. "Peloton Interactive" has to be caught by the same entry that
   catches "Peloton", or the denylist only works on whichever spelling the board
   happened to use the day it was written. Deliberately conservative: a false
   denial costs a monogram, a false accept puts another company's logo on a real
   job. */
export function isDenied(company: string): boolean {
  return slugs(company).some((s) => WRONG_DOTCOM.has(s.replace(/-/g, "")));
}

/* Candidate hosts for a company, best first. .com only, see the file header. */
export function domainCandidates(company: string): string[] {
  if (isDenied(company)) return [];
  return slugs(company).map((s) => `${s}.com`);
}

/* Does this page belong to this company? Short names are held to a stricter
   test: a three-letter company inside a long marketing title is as likely to be
   a coincidence as a match. */
export function identifies(company: string, html: string): boolean {
  const name = letters(company.replace(/\(.*?\)/g, " ").replace(SUFFIX, ""));
  if (name.length < 3) return false;
  const head = html.slice(0, 60_000);
  const title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(head)?.[1] ?? "";
  const site =
    /property=["']og:site_name["'][^>]*content=["']([^"']{0,120})["']/i.exec(head)?.[1] ??
    /content=["']([^"']{0,120})["'][^>]*property=["']og:site_name["']/i.exec(head)?.[1] ??
    "";
  if (!title && !site) return false;
  if (name.length < 5) return letters(title).startsWith(name) || letters(site) === name;
  return letters(`${title} ${site}`).includes(name);
}

/* Icon URLs declared by a page, best first. SVG outranks everything (it is the
   only source that scales without softening); .ico ranks last because half of
   them hold a bitmap this module cannot decode without sharp. */
export function iconUrls(html: string, origin: string): string[] {
  const out: { url: string; px: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/icon/.test(rel)) continue;
    const sizes = /sizes=["'](\d+)x/i.exec(tag)?.[1];
    const isSvg = /\.svg(\?|$)/i.test(href);
    const isIco = /\.ico(\?|$)/i.test(href);
    const px = isIco ? 1 : isSvg ? 512 : sizes ? Number(sizes) : rel.includes("apple") ? 180 : 32;
    try {
      out.push({ url: new URL(href, origin).href, px });
    } catch {
      /* a malformed href is not worth a 500 */
    }
  }
  out.sort((a, b) => b.px - a.px);
  const wellKnown = [
    `${origin}/apple-touch-icon.png`,
    `${origin}/icon.png`,
    `${origin}/favicon.svg`,
    `${origin}/favicon.png`,
    `${origin}/favicon.ico`,
  ];
  return [...new Set([...out.map((o) => o.url), ...wellKnown])];
}

/* An .ico is a container. Roughly half hold a PNG, which is returned here.
   The other half hold raw DIB bitmaps and are given up on: decoding those needs
   an image encoder, and this runs in a request. */
export function pngInsideIco(buf: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 6 || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) return null;
  const count = view.getUint16(4, true);
  let best: { px: number; data: Uint8Array } | null = null;
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16;
    if (entry + 16 > buf.length) break;
    const size = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    if (offset + size > buf.length) continue;
    const data = buf.subarray(offset, offset + size);
    if (!(data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)) continue;
    const px = buf[entry] === 0 ? 256 : buf[entry];
    if (!best || px > best.px) best = { px, data };
  }
  /* Copied out rather than returned as a view: a subarray keeps the whole .ico
     alive behind it, and the caller hands this straight to a response body. */
  if (!best) return null;
  const copy = new Uint8Array(best.data.byteLength);
  copy.set(best.data);
  return copy;
}

export function monogram(company: string): string {
  const first = company.trim()[0];
  return first ? first.toUpperCase() : "?";
}

/* The answer when there is no mark: the company's initial, drawn server-side.
 *
 * Returned as an image rather than a 404 on purpose. A 404 would need the tile
 * to notice and swap in a fallback, which means client JavaScript on a page that
 * has none, and a broken-image icon in the window before it does. This way the
 * tile is one <img> that always renders something, and the page stays static.
 * Deliberately not a coloured circle: DESIGN.md bans those. */
export function monogramSvg(company: string): string {
  const ch = monogram(company).replace(/[<&>"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-hidden="true">
<rect x="0.5" y="0.5" width="63" height="63" rx="12" fill="#ffffff" stroke="#e8e6e1"/>
<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="26" fill="#a3a19a">${ch}</text>
</svg>`;
}

export const LOGO_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/* Only bitmap/vector types a browser will draw in an <img>. Anything else (an
   HTML error page served with 200, which bot-blocked hosts love to do) is not a
   logo and must not be passed through. */
export function imageTypeOf(contentType: string | null, bytes: Uint8Array): string | null {
  const ct = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) {
    if (ct.includes("svg")) return "image/svg+xml";
    return ct;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01) return "image/x-icon";
  const head = new TextDecoder().decode(bytes.subarray(0, 200)).trim().toLowerCase();
  if (head.startsWith("<svg") || head.includes("<svg")) return "image/svg+xml";
  return null;
}

/* ---------------------------------------------------------------------------
 * The company's mark, taken from the board we already poll.
 *
 * Everything above this line guesses a domain from a company's NAME, and that
 * is where every wrong logo came from: block.co is an NFT company, imply.com
 * sells LED panels, suki.com is a German DIY supplier. The guessing survives
 * only as a last resort.
 *
 * This is the better source, and the reason is that identity is not inferred at
 * all. We poll each employer's board by a token WE chose when the source was
 * added (greenhouse/block, ashby/crisp) so the page at that token is that
 * company's, by construction. Whatever it says about itself is authoritative.
 *
 * Measured on 30 random live sources: 14 gave a logo the ATS hosts directly,
 * 10 more gave a verified domain, 6 gave nothing (mostly bot-blocked boards).
 * It also recovers names guessing could never reach: rocketlabcorp.com,
 * akunacapital.com, oldmissioncapital.com, sigmacomputing.com.
 * ------------------------------------------------------------------------- */

/* The only hosts a board URL may point at.
 *
 * This is an SSRF gate, not tidiness. The board URL arrives as a query
 * parameter, so without this anyone could hand the route an internal address
 * and have our server fetch it and hand back the body. The allowlist is the
 * whole defence; keep it exact-match on hostname. */
const BOARD_HOSTS: Record<string, BoardAts> = {
  "job-boards.greenhouse.io": "greenhouse",
  "boards.greenhouse.io": "greenhouse",
  "jobs.lever.co": "lever",
  "jobs.ashbyhq.com": "ashby",
  "apply.workable.com": "workable",
  "ats.rippling.com": "rippling",
  "jobs.crelate.com": "crelate",
};

type BoardAts = "greenhouse" | "lever" | "ashby" | "workable" | "rippling" | "breezy" | "recruitee" | "crelate";

export type Board = { ats: BoardAts; token: string; url: string };

/* Returns null for anything not recognisably one of our boards. Callers must
   treat null as "do not fetch", never as "fetch it anyway". */
export function parseBoardUrl(raw: string | null | undefined): Board | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  let ats = BOARD_HOSTS[u.hostname];
  let tokenFromHost: string | null = null;
  const tenant = /^([A-Za-z0-9-]{1,100})\.(breezy\.hr|recruitee\.com)$/.exec(u.hostname);
  if (!ats && tenant) {
    ats = tenant[2] === "breezy.hr" ? "breezy" : "recruitee";
    tokenFromHost = tenant[1];
  }
  if (!ats) return null;
  if (ats === "crelate") {
    const parts = u.pathname.split("/").filter(Boolean);
    const token = parts[0] === "portal" ? parts[1] : null;
    if (!token || !/^[A-Za-z0-9._-]{1,100}$/.test(token)) return null;
    return { ats, token, url: `https://${u.hostname}/portal/${token}` };
  }
  const token = tokenFromHost ?? u.pathname.split("/").filter(Boolean)[0];
  if (!token || !/^[A-Za-z0-9._-]{1,100}$/.test(token)) return null;
  if (ats === "breezy" || ats === "recruitee") return { ats, token, url: `https://${u.hostname}` };
  if (ats === "rippling") return { ats, token, url: `https://${u.hostname}/${token}/jobs` };
  return { ats, token, url: `https://${u.hostname}/${token}` };
}

/* Ashby and Lever host the employer's own uploaded logo and say so in the page.
   Both are keyed to the organisation, so a hit here needs no corroboration. */
export function boardHostedLogo(html: string, ats: Board["ats"]): string | null {
  if (ats === "ashby") {
    return /https:\/\/app\.ashbyhq\.com\/api\/images\/org-theme-logo\/[^"'\\\s>]+/.exec(html)?.[0] ?? null;
  }
  if (ats === "lever") {
    return /https:\/\/lever-client-logos[^"'\\\s>]+/.exec(html)?.[0] ?? null;
  }
  return null;
}

/* Hosts that appear on employer career pages without belonging to the employer:
   consent and privacy vendors, analytics, CDNs. `honor` resolved to
   datasubject.com purely because their board links a "do not sell my data"
   page more than once. */
const NOT_THE_EMPLOYER =
  /greenhouse|lever\.co|ashbyhq|workable\.com|linkedin|twitter|x\.com|facebook|instagram|youtube|glassdoor|google|w3\.org|schema\.org|gstatic|cloudflare|datasubject|onetrust|trustarc|cookiebot|osano|segment|hotjar|^fonts\./i;

/* The employer's own domain, read off their board page and ANCHORED ON THE
 * TOKEN.
 *
 * The anchor is what makes this safe. The most-linked outbound host is a good
 * guess and no more: it picked datasubject.com for `honor`. Requiring the
 * host's own label to relate to the board token turns a guess into a check,
 * because the token is the slug the employer chose on their ATS and we recorded
 * when we added them: greenhouse/block -> block.xyz, greenhouse/suki ->
 * suki.ai, greenhouse/imply -> imply.io, all correct and none of them .com.
 */
export function ownDomainFromBoard(html: string, boardHost: string, token: string): string | null {
  const tok = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (tok.length < 3) return null;
  const hosts = new Map<string, number>();
  for (const m of html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)) {
    let host: string;
    try {
      host = new URL(m[1]).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (host === boardHost || NOT_THE_EMPLOYER.test(host)) continue;
    if (/\.(css|js|png|jpe?g|svg|woff2?)($|\?)/i.test(m[1])) continue;
    const root = host.split(".").slice(-2).join(".");
    hosts.set(root, (hosts.get(root) ?? 0) + 1);
  }
  for (const [root] of [...hosts.entries()].sort((a, b) => b[1] - a[1])) {
    const label = root.split(".")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (label.includes(tok) || tok.includes(label)) return root;
  }
  return null;
}
