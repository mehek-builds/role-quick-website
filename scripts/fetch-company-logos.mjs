/* Pull each watched company's mark from its OWN domain into public/company/.
 *
 *   node scripts/fetch-company-logos.mjs          fetch anything missing
 *   node scripts/fetch-company-logos.mjs --force  re-fetch everything
 *   node scripts/fetch-company-logos.mjs --check  report gaps, write nothing
 *
 * Run it when lib/company-logos.ts gains a company. The assets are committed,
 * so the site never reaches a third party at render time; see the note at the
 * top of lib/company-logos.ts for why that matters on this particular page.
 *
 * Preference order is deliberate: apple-touch-icon first (180px+, drawn to be
 * seen at size), then any declared <link rel=icon> big enough to survive being
 * scaled, then /favicon.ico last, because a 16px favicon upscaled to 64 looks
 * like a mistake next to a crisp neighbour.
 */

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { COMPANY_DOMAINS, logoSlug } from "../lib/company-logos.ts";

const OUT = path.join(process.cwd(), "public", "company");
const SIZE = 64;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const args = process.argv.slice(2);
const force = args.includes("--force");
const checkOnly = args.includes("--check");

async function get(url, as = "buffer", allowError = false) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  /* Chime, Gusto and Zocdoc answer a bare fetch of their homepage with 403 and
     serve the real HTML in the body anyway. Reading it is how we learn where
     their mark lives; the asset itself then fetches fine. */
  if (!res.ok && !allowError) throw new Error(`HTTP ${res.status}`);
  return as === "text" ? res.text() : Buffer.from(await res.arrayBuffer());
}

/* sharp cannot decode ICO at all. An .ico is a container, and roughly half of
   these companies embed a PNG inside it, so pull out the largest such entry and
   hand that to sharp. The other half store raw bitmaps; dibInsideIco below
   handles those. */
function pngInsideIco(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16;
    if (entry + 16 > buf.length) break;
    const size = buf.readUInt32LE(entry + 8);
    const offset = buf.readUInt32LE(entry + 12);
    if (offset + size > buf.length) continue;
    const data = buf.subarray(offset, offset + size);
    if (!data.subarray(0, 4).equals(PNG)) continue;
    const px = buf[entry] === 0 ? 256 : buf[entry];
    if (!best || px > best.px) best = { px, data };
  }
  return best?.data ?? null;
}

/* The other half of the .ico population stores raw DIB bitmaps rather than
   PNGs: MongoDB, Palantir, Supabase and Baseten all do, and they are four of
   the busiest boards we watch, so "no logo" would show up constantly. Only the
   32-bit BGRA case is handled, which is what every one of them ships; the
   palette formats are pre-2010 and not worth a decoder. Rows are bottom-up and
   the header's height counts the colour data plus its AND mask, hence /2. */
function dibInsideIco(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16;
    if (entry + 16 > buf.length) break;
    const size = buf.readUInt32LE(entry + 8);
    const offset = buf.readUInt32LE(entry + 12);
    if (offset + 40 > buf.length || offset + size > buf.length) continue;
    const dib = buf.subarray(offset, offset + size);
    if (dib.readUInt32LE(0) !== 40) continue; // BITMAPINFOHEADER only
    const width = dib.readInt32LE(4);
    const height = Math.floor(dib.readInt32LE(8) / 2);
    const bpp = dib.readUInt16LE(14);
    if (bpp !== 32 || width <= 0 || height <= 0) continue;
    const need = 40 + width * height * 4;
    if (dib.length < need) continue;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const src = 40 + (height - 1 - y) * width * 4; // bottom-up
      for (let x = 0; x < width; x += 1) {
        const s = src + x * 4;
        const d = (y * width + x) * 4;
        rgba[d] = dib[s + 2]; // B -> R
        rgba[d + 1] = dib[s + 1];
        rgba[d + 2] = dib[s]; // R -> B
        rgba[d + 3] = dib[s + 3];
      }
    }
    if (!best || width > best.width) best = { width, height, rgba };
  }
  return best;
}

/* Candidate mark URLs, best first. */
async function candidates(domain) {
  const origin = `https://${domain}`;
  const out = [];
  try {
    const html = await get(origin, "text", true);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    const scored = [];
    for (const tag of links) {
      const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
      const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
      if (!href || !/icon/.test(rel)) continue;
      const sizes = /sizes=["'](\d+)x/i.exec(tag)?.[1];
      /* SVG outranks everything: it is the one source that scales to 64px
         without softening. .ico ranks last because sharp cannot decode ICO at
         all, so it is only ever worth trying after the raster paths. */
      const isSvg = /\.svg(\?|$)/i.test(href);
      const isIco = /\.ico(\?|$)/i.test(href);
      const px = isIco ? 1 : isSvg ? 512 : sizes ? Number(sizes) : rel.includes("apple") ? 180 : 32;
      scored.push({ url: new URL(href, origin).href, px });
    }
    scored.sort((a, b) => b.px - a.px);
    out.push(...scored.map((s) => s.url));

    /* The web app manifest is where a modern site declares its 192 and 512px
       PNGs. Several of these companies (Asana, Supabase, MongoDB, Palantir)
       declare only a .ico in <head>, and theirs hold raw DIB bitmaps, which
       have no PNG inside for pngInsideIco to find, while the manifest points
       at exactly the crisp raster we want. */
    const manifestHref =
      /<link\b[^>]*rel=["'][^"']*manifest[^"']*["'][^>]*>/i
        .exec(html)?.[0]
        ?.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
    for (const mUrl of [manifestHref, "/site.webmanifest", "/manifest.json"].filter(Boolean)) {
      try {
        const manifest = JSON.parse(await get(new URL(mUrl, origin).href, "text", true));
        const icons = (manifest.icons ?? [])
          .filter((i) => i?.src && !/\.ico(\?|$)/i.test(i.src))
          .map((i) => ({ url: new URL(i.src, origin).href, px: Number(String(i.sizes ?? "0").split("x")[0]) || 0 }))
          .sort((a, b) => b.px - a.px);
        if (icons.length) {
          out.push(...icons.map((i) => i.url));
          break;
        }
      } catch {
        /* next manifest location */
      }
    }
  } catch {
    /* no homepage, fall through to the well-known paths */
  }
  /* Well-known paths, tried when the homepage declares nothing usable or
     refuses to serve us at all (several of these companies bot-block a bare
     fetch of their marketing page but serve the asset paths fine). */
  out.push(
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `${origin}/icon.png`,
    `${origin}/favicon.svg`,
    `${origin}/favicon-192x192.png`,
    `${origin}/favicon-96x96.png`,
    `${origin}/favicon.png`,
    `${origin}/favicon.ico`,
  );
  /* Some hosts only serve the asset on the www host: imc.com/favicon.ico fails
     while www.imc.com/favicon.ico is a 300KB icon. Cheap to try, so try it. */
  if (!domain.startsWith("www.")) {
    out.push(`https://www.${domain}/favicon.ico`, `https://www.${domain}/apple-touch-icon.png`);
  }
  return [...new Set(out)];
}

await mkdir(OUT, { recursive: true });

const names = Object.keys(COMPANY_DOMAINS);
const missing = [];
const failed = [];
let fetched = 0;

for (const company of names) {
  const slug = logoSlug(company);
  const file = path.join(OUT, `${slug}.png`);
  if (existsSync(file) && !force) continue;
  if (checkOnly) {
    missing.push(company);
    continue;
  }

  let done = false;
  for (const url of await candidates(COMPANY_DOMAINS[company])) {
    try {
      let raw = await get(url);
      let input = null;
      if (/\.ico(\?|$)/i.test(url) || raw.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) {
        const inner = pngInsideIco(raw);
        if (inner) {
          raw = inner;
        } else {
          const dib = dibInsideIco(raw);
          if (!dib) throw new Error("ico holds neither a png nor a 32bpp bitmap");
          input = sharp(dib.rgba, { raw: { width: dib.width, height: dib.height, channels: 4 } });
        }
      }
      const png = await (input ?? sharp(raw, { animated: false }))
        .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();
      await writeFile(file, png);
      console.log(`  ok    ${company}  <- ${url}`);
      fetched += 1;
      done = true;
      break;
    } catch {
      /* try the next candidate */
    }
  }
  if (!done) {
    failed.push(company);
    console.log(`  FAIL  ${company} (${COMPANY_DOMAINS[company]})`);
  }
}

const onDisk = new Set(
  (await readdir(OUT).catch(() => [])).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)),
);
const gaps = names.filter((c) => !onDisk.has(logoSlug(c)));

if (checkOnly) {
  console.log(`\n${names.length} companies, ${names.length - gaps.length} with a mark on disk.`);
  if (gaps.length) console.log(`missing: ${gaps.join(", ")}`);
  process.exit(gaps.length ? 1 : 0);
}

console.log(`\nfetched ${fetched}, ${names.length - gaps.length}/${names.length} companies have a mark.`);
if (failed.length) console.log(`failed: ${failed.join(", ")}`);
process.exit(0);
