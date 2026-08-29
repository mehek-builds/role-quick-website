import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { logoPath } from "@/lib/company-logos";
import {
  boardHostedLogo,
  domainCandidates,
  identifies,
  iconUrls,
  imageTypeOf,
  monogramSvg,
  ownDomainFromBoard,
  parseBoardUrl,
  pngInsideIco,
} from "@/lib/company-logo-source";

/* The board's logo service.
 *
 * WHY THIS IS A ROUTE AND NOT A BUILD STEP. The job monitor adds companies on
 * its own schedule (51 became 253 in a day) and a committed folder of PNGs is
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
 * prune: there is no state to go stale, only answers that stop being asked for.
 *
 * WHERE THE IDENTITY COMES FROM. Preferably not the company's name. We poll
 * each employer's board by a token we chose, so the page at that token is that
 * company's by construction: asking IT who they are beats guessing a domain
 * from their name, which is how block.co (an NFT company) nearly ended up on
 * Block's jobs. Name-guessing survives only as a last resort, for boards that
 * are bot-blocked or say nothing about themselves.
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

/* What "no mark found" looks like, which depends on who is asking.
 *
 * The board tiles want an IMAGE, for the reason the header gives: that page has no client
 * JavaScript, so a 404 would leave a broken-image icon with nothing to swap it out. That stays the
 * default and nothing about it changes.
 *
 * The DASHBOARD wants a 404. It draws its marks inside a circle with its own border and already has
 * a designed monogram for the empty case, so handing it monogramSvg would nest a bordered rounded
 * SQUARE inside that circle. It runs client JavaScript and CompanyLogo already has an onError path,
 * so a 404 is the answer it can actually use.
 *
 * THE MISS IS STILL CACHED, with the same header as a hit. Without that, every dashboard render
 * re-probes the same handful of companies that have no findable mark - which is the whole failure
 * this route exists to end. */
function miss(company: string, request: Request) {
  if (new URL(request.url).searchParams.get("miss") !== "404") return svg(company);
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": CACHE } });
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
  if (!company) return miss("?", request);

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

  /* One helper for "given a domain I trust, get its mark". Both paths below end
     here; only the way they arrived at the domain differs. */
  const markFromDomain = async (domain: string) => {
    const origin = `https://${domain}`;
    let html = "";
    try {
      html = await (await get(origin, controller.signal)).text();
    } catch {
      /* the icon may still sit at a well-known path */
    }
    for (const url of iconUrls(html, origin).slice(0, 6)) {
      try {
        const res = await get(url, controller.signal);
        const raw = new Uint8Array(await res.arrayBuffer());
        if (!raw.length || raw.length > MAX_BYTES) continue;
        let bytes: Uint8Array<ArrayBuffer> = raw;
        let type = imageTypeOf(res.headers.get("content-type"), raw);
        if (type === "image/x-icon") {
          const inner = pngInsideIco(raw);
          if (!inner) continue;
          bytes = inner;
          type = "image/png";
        }
        if (!type) continue;
        return { bytes, type, source: domain };
      } catch {
        /* next icon */
      }
    }
    return null;
  };

  try {
    /* 1. THE BOARD WE POLL. Identity is not inferred here, so this wins. */
    const board = parseBoardUrl(new URL(request.url).searchParams.get("board"));
    if (board) {
      let html = "";
      try {
        html = await (await get(board.url, controller.signal)).text();
      } catch {
        /* bot-blocked board; fall through to the name */
      }

      /* Ashby and Lever host the employer's own uploaded logo. Nothing to
         corroborate: the URL is keyed to the organisation. */
      const hosted = boardHostedLogo(html, board.ats);
      if (hosted) {
        try {
          const res = await get(hosted, controller.signal);
          const raw = new Uint8Array(await res.arrayBuffer());
          const type = imageTypeOf(res.headers.get("content-type"), raw);
          if (raw.length && raw.length <= MAX_BYTES && type && type !== "image/x-icon") {
            const bytes = new Uint8Array(raw.byteLength);
            bytes.set(raw);
            return new NextResponse(bytes, {
              status: 200,
              headers: {
                "Content-Type": type,
                "Cache-Control": CACHE,
                "X-Logo-Source": `${board.ats}:${board.token}`,
              },
            });
          }
        } catch {
          /* fall through */
        }
      }

      /* Greenhouse hosts no logo, but its boards link the employer's own site.
         Anchored on the token, so this is a check rather than a guess. */
      const owned = html ? ownDomainFromBoard(html, new URL(board.url).hostname, board.token) : null;
      if (owned) {
        const mark = await markFromDomain(owned);
        if (mark) {
          return new NextResponse(mark.bytes, {
            status: 200,
            headers: {
              "Content-Type": mark.type,
              "Cache-Control": CACHE,
              "X-Logo-Source": `${board.ats}:${board.token} -> ${owned}`,
            },
          });
        }
      }
    }

    /* 2. LAST RESORT: guess a domain from the name. Everything that ever
       attached the wrong company's logo came from here, which is why it runs
       only once the board has had its say. */
    for (const domain of domainCandidates(company)) {
      let html = "";
      try {
        html = await (await get(`https://${domain}`, controller.signal)).text();
      } catch {
        continue;
      }
      if (!identifies(company, html)) continue;
      const mark = await markFromDomain(domain);
      if (mark) {
        return new NextResponse(mark.bytes, {
          status: 200,
          headers: {
            "Content-Type": mark.type,
            "Cache-Control": CACHE,
            "X-Logo-Source": `name-guess:${domain}`,
          },
        });
      }
    }
  } catch {
    /* the budget fired, or the network did something unhelpful */
  } finally {
    clearTimeout(budget);
  }

  return miss(company, request);
}
