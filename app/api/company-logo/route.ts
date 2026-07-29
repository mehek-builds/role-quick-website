import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { logoPath } from "@/lib/company-logos";
import {
  domainCandidates,
  identifies,
  iconUrls,
  imageTypeOf,
  monogramSvg,
  pngInsideIco,
} from "@/lib/company-logo-source";

/* The board's logo service.
 *
 * WHY THIS IS A ROUTE AND NOT A BUILD STEP. The job monitor adds companies on
 * its own schedule — 51 became 253 in a day — and a committed folder of PNGs is
 * a snapshot that goes stale the moment somebody adds a source. Every new
 * employer showed a monogram until a human noticed and re-ran a script. This
 * route means a company that appeared on the board an hour ago has its mark on
 * the next request, with nobody involved.
 *
 * WHY OUR SERVER FETCHES IT rather than pointing the tile at the company's own
 * CDN: a page listing 24 employers would otherwise tell 24 third parties who is
 * looking at which jobs. The visitor's browser only ever talks to us. This is
 * the same reason the committed set was never a logo API.
 *
 * HOW OLD COMPANIES FALL OFF. Nothing has to delete them. The tile asks for the
 * companies on the board today; a company that left the board is simply never
 * requested again and its cache entry expires. That is also why the cache is
 * keyed by company name rather than accumulated in a directory somebody has to
 * prune — there is no state to go stale, only answers that stop being asked for.
 *
 * FAILURE IS AN IMAGE, NOT AN ERROR. Anything unresolved returns the company's
 * initial as an SVG, with a 200. A 404 would need the tile to notice and swap
 * in a fallback, which means client JavaScript on a page that has none and a
 * broken-image icon until it runs.
 */

export const runtime = "nodejs";
/* A logo is not news. Long at the edge so a company is resolved about once a
   week across all visitors, and stale-while-revalidate so nobody ever waits for
   a re-check. The negative case is cached too, or every page view would re-probe
   the same handful of companies that have no findable mark. */
const CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const MAX_BYTES = 512 * 1024;

function svg(company: string) {
  return new NextResponse(monogramSvg(company), {
    status: 200,
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE },
  });
}

async function get(url: string, signal: AbortSignal) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    redirect: "follow",
    signal,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res;
}

export async function GET(request: Request) {
  const company = (new URL(request.url).searchParams.get("c") ?? "").slice(0, 120).trim();
  if (!company) return svg("?");

  /* The curated set wins. Those marks were looked at by a human, and a redirect
     to the static file is cheaper than anything this route can do. */
  const committed = logoPath(company);
  if (committed && existsSync(path.join(process.cwd(), "public", committed))) {
    return NextResponse.redirect(new URL(committed, request.url), {
      status: 308,
      headers: { "Cache-Control": CACHE },
    });
  }

  /* One budget for the whole resolution. A slow employer site must not hold a
     serverless invocation open; the tile shows a monogram and the next request
     tries again. */
  const controller = new AbortController();
  const budget = setTimeout(() => controller.abort(), 8000);

  try {
    for (const domain of domainCandidates(company)) {
      const origin = `https://${domain}`;
      let html: string;
      try {
        html = await (await get(origin, controller.signal)).text();
      } catch {
        continue;
      }
      if (!identifies(company, html)) continue;

      for (const url of iconUrls(html, origin).slice(0, 6)) {
        try {
          const res = await get(url, controller.signal);
          const raw = new Uint8Array(await res.arrayBuffer());
          if (!raw.length || raw.length > MAX_BYTES) continue;

          let bytes: Uint8Array<ArrayBuffer> = raw;
          let type = imageTypeOf(res.headers.get("content-type"), raw);
          if (type === "image/x-icon") {
            /* Serve the PNG hiding inside the .ico where there is one; browsers
               render a bare .ico unevenly and half of them are bitmaps this
               module cannot touch. */
            const inner = pngInsideIco(raw);
            if (!inner) continue;
            bytes = inner;
            type = "image/png";
          }
          if (!type) continue;

          return new NextResponse(bytes, {
            status: 200,
            headers: {
              "Content-Type": type,
              "Cache-Control": CACHE,
              /* Which host the mark came from, so a wrong logo can be traced to
                 a decision rather than guessed at. */
              "X-Logo-Source": domain,
            },
          });
        } catch {
          /* next icon */
        }
      }
    }
  } catch {
    /* the budget fired, or the network did something unhelpful */
  } finally {
    clearTimeout(budget);
  }

  return svg(company);
}
