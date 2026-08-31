import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { backendLogoEvidence, evidenceImageUrl } from "@/lib/company-logo-evidence";
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
 * WHERE THE IDENTITY COMES FROM. Preferably not the company's name. The best
 * source is the backend's own verified evidence: it gates every surfaced job on
 * a proven first-party logo URL and sends it on every /jobs row, so this route
 * asks for that first (lib/company-logo-evidence.ts has the numbers on what
 * ignoring it cost). Failing that, we poll each employer's board by a token we
 * chose, so the page at that token is that company's by construction: asking IT
 * who they are beats guessing a domain from their name, which is how block.co
 * (an NFT company) nearly ended up on Block's jobs. Name-guessing survives only
 * as a last resort, for boards that are bot-blocked or say nothing about
 * themselves.
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
/* The backend verifier accepts assets up to 1MB (its MAX_IMAGE_BYTES), so a
   verified evidence URL is allowed the same, or this route would re-reject
   marks the pipeline already accepted. The 512KB cap stays for everything this
   route discovers on its own. */
const MAX_EVIDENCE_BYTES = 1024 * 1024;
/* The evidence lookup gets under half the route's 8s budget: if the backend is
   slow, the remaining time still has to cover the board fetch and icon fetches
   the legacy chain needs, or a degraded backend would turn every logo into a
   monogram instead of merely losing the shortcut. */
const EVIDENCE_LOOKUP_MS = 3500;
/* And the WHOLE evidence step, fetches included, gets a cap of its own. The
   lookup being fast does not make the evidence host fast: a hung asset host
   given the bare 8s signal would starve the legacy chain that used to have the
   full budget, so a company that resolved fine before the evidence step existed
   would return a week-cached monogram whenever its evidence host wedged. */
const EVIDENCE_STEP_MS = 5000;

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

/* A body, read no further than the cap. `arrayBuffer()` buffers everything
   before any length check can run, which makes a size cap a statement about
   what gets SERVED rather than what gets read: an oversized body would be
   downloaded in full into this invocation's memory just to be thrown away.
   Content-Length settles it for free when the server declares it; otherwise
   the stream is abandoned at the first byte past the cap. */
async function boundedBytes(res: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    return null;
  }
  if (!res.body) {
    const raw = new Uint8Array(await res.arrayBuffer());
    return raw.length && raw.length <= maxBytes ? raw : null;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (!total) return null;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

type Mark = { bytes: Uint8Array<ArrayBuffer>; type: string };

/* One URL to bytes the tile can draw, shared by every resolution step: sniff
   the type rather than trusting the header (Lever's S3 serves image bytes as
   application/octet-stream), unwrap an .ico to its embedded PNG where the
   caller allows one, and refuse everything else. `finalUrlAllowed` re-checks
   the response's FINAL URL: `get` follows redirects, and a host gate that only
   sees the first hop guarantees nothing about where the bytes came from. */
async function fetchImage(
  url: string,
  signal: AbortSignal,
  opts: { maxBytes: number; allowIco: boolean; finalUrlAllowed?: (finalUrl: string) => boolean },
): Promise<Mark | null> {
  try {
    const res = await get(url, signal);
    if (opts.finalUrlAllowed && !opts.finalUrlAllowed(res.url)) {
      await res.body?.cancel();
      return null;
    }
    const raw = await boundedBytes(res, opts.maxBytes);
    if (!raw) return null;
    let bytes: Uint8Array<ArrayBuffer> = raw;
    let type = imageTypeOf(res.headers.get("content-type"), raw);
    if (type === "image/x-icon") {
      if (!opts.allowIco) return null;
      const inner = pngInsideIco(raw);
      if (!inner) return null;
      bytes = inner;
      type = "image/png";
    }
    if (!type) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}

/* Every resolved mark leaves through here, so the headers cannot drift between
   resolution steps. The source label is squeezed to printable ASCII before it
   becomes a header: undici throws on a header value with a control or
   non-Latin-1 character, that throw would land in the route-level catch AFTER
   the image was already fetched, and the whole rest of the chain would be
   skipped for a string that only ever existed for observability. */
function markResponse(mark: Mark, source: string) {
  return new NextResponse(mark.bytes, {
    status: 200,
    headers: {
      "Content-Type": mark.type,
      "Cache-Control": CACHE,
      "X-Logo-Source": source.replace(/[^\x20-\x7e]/g, "_").slice(0, 200),
    },
  });
}

export async function GET(request: Request) {
  const company = (new URL(request.url).searchParams.get("c") ?? "").slice(0, 120).trim();
  if (!company) return miss("?", request);

  /* The curated set wins. Those marks were looked at by a human, and a redirect
     to the static file is cheaper than anything this route can do. */
  const committed = logoPath(company);
  if (committed && existsSync(path.join(process.cwd(), "public", committed))) {
    /* A ROOT-RELATIVE Location, never one built from request.url.
     *
     * request.url is the origin the server saw, not the origin the browser asked for. Behind
     * Railway's proxy that is the container's own http://localhost:3000, so `new URL(committed,
     * request.url)` sent every visitor to port 3000 ON THEIR OWN MACHINE and every committed logo
     * silently became an empty tile. It worked on Vercel, which rewrote request.url to the public
     * origin, so the cutover broke it with no code change. RFC 7231 allows a relative Location and
     * the browser resolves it against the URL it actually requested, which is correct on any host
     * and needs no trust in x-forwarded-* headers. */
    return new Response(null, {
      status: 308,
      headers: { Location: committed, "Cache-Control": CACHE },
    });
  }

  /* One budget for the whole resolution. A slow employer site must not hold a
     serverless invocation open; the tile shows a monogram and the next request
     tries again. */
  const controller = new AbortController();
  const budget = setTimeout(() => controller.abort(), 8000);

  /* One helper for "given a domain I trust, get its mark". Every path below
     ends here; only the way it arrived at the domain differs. The signal is a
     parameter because the evidence step runs on a tighter budget than the
     legacy chain (see EVIDENCE_STEP_MS). */
  const markFromDomain = async (domain: string, signal: AbortSignal = controller.signal) => {
    const origin = `https://${domain}`;
    let html = "";
    try {
      html = await (await get(origin, signal)).text();
    } catch {
      /* the icon may still sit at a well-known path */
    }
    for (const url of iconUrls(html, origin).slice(0, 6)) {
      const mark = await fetchImage(url, signal, { maxBytes: MAX_BYTES, allowIco: true });
      if (mark) return mark;
    }
    return null;
  };

  const boardParam = new URL(request.url).searchParams.get("board");

  try {
    /* 1. THE BACKEND'S VERIFIED EVIDENCE. The backend refuses to surface a job
       until its own verifier has proven a first-party logo for the source, so
       for any (company, board) pair the tile can legitimately ask about, the
       answer usually already exists and only has to be fetched. This step is
       what covers the Workable, Rippling, Recruitee, Breezy and Crelate boards
       the extraction below was never taught. The lookup is fed the RAW board
       parameter, not the parsed one: it is compared against career_url strings
       from the same API, never fetched, so parseBoardUrl's gate does not apply
       to it. */
    const evidenceBudget = AbortSignal.any([controller.signal, AbortSignal.timeout(EVIDENCE_STEP_MS)]);
    const evidence = await backendLogoEvidence(
      company,
      boardParam,
      AbortSignal.any([evidenceBudget, AbortSignal.timeout(EVIDENCE_LOOKUP_MS)]),
    );
    if (evidence?.url) {
      const mark = await fetchImage(evidence.url, evidenceBudget, {
        maxBytes: MAX_EVIDENCE_BYTES,
        allowIco: true,
        /* Redirects are followed, so the gate that admitted the URL is applied
           to where the response actually came from as well. */
        finalUrlAllowed: (finalUrl) => evidenceImageUrl(finalUrl, evidence.domain) !== null,
      });
      if (mark) return markResponse(mark, `verified:${evidence.method ?? "unknown"}`);
    }
    /* The evidence can also be just a verified DOMAIN (the homepage-asset
       method proves the employer's site rather than a hosted image, and its
       asset sometimes lives on a page-builder CDN the host gate rightly will
       not fetch). A backend-verified domain is a strictly better input to
       markFromDomain than the board-backlink guess below, so use it before
       falling through. */
    if (evidence?.domain) {
      const mark = await markFromDomain(evidence.domain, evidenceBudget);
      if (mark) return markResponse(mark, `verified-domain:${evidence.domain}`);
    }

    /* 2. THE BOARD WE POLL. Identity is not inferred here either, so this is
       the next best thing when the backend had no answer for the pair. */
    const board = parseBoardUrl(boardParam);
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
        /* No .ico here: these are the employer's own uploaded marks and an
           icon container in that slot has always meant something went wrong. */
        const mark = await fetchImage(hosted, controller.signal, { maxBytes: MAX_BYTES, allowIco: false });
        if (mark) return markResponse(mark, `${board.ats}:${board.token}`);
      }

      /* Greenhouse hosts no logo, but its boards link the employer's own site.
         Anchored on the token, so this is a check rather than a guess. */
      const owned = html ? ownDomainFromBoard(html, new URL(board.url).hostname, board.token) : null;
      if (owned) {
        const mark = await markFromDomain(owned);
        if (mark) return markResponse(mark, `${board.ats}:${board.token} -> ${owned}`);
      }
    }

    /* 3. LAST RESORT: guess a domain from the name. Everything that ever
       attached the wrong company's logo came from here, which is why it runs
       only once the backend and the board have both had their say. */
    for (const domain of domainCandidates(company)) {
      let html = "";
      try {
        html = await (await get(`https://${domain}`, controller.signal)).text();
      } catch {
        continue;
      }
      if (!identifies(company, html)) continue;
      const mark = await markFromDomain(domain);
      if (mark) return markResponse(mark, `name-guess:${domain}`);
    }
  } catch {
    /* the budget fired, or the network did something unhelpful */
  } finally {
    clearTimeout(budget);
  }

  return miss(company, request);
}
