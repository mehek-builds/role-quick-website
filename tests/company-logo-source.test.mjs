import assert from "node:assert/strict";
import { describe, test } from "node:test";

/* The rules that keep a WRONG logo off a real job.
 *
 * Every case below is a real company that was resolved wrongly at some point
 * while building this, not an invented edge case. The board is hundreds of
 * employers and grows on its own, so the only thing standing between it and a
 * confidently-wrong mark is this file. */

const {
  domainCandidates,
  identifies,
  iconUrls,
  imageTypeOf,
  isDenied,
  monogramSvg,
  pngInsideIco,
  WRONG_DOTCOM,
} = await import("../lib/company-logo-source.ts");

describe("domainCandidates", () => {
  test("only ever proposes .com", () => {
    /* The first version tried .ai/.io/.co too, and EVERY false positive came
       from them: block.co is an NFT company, ashby.ai is not Ashby, elastic.io
       is not Elastic. The impostor's own title contains the word, so no name
       check can separate them — the alternates simply are not tried. */
    for (const company of ["Stripe", "Scale AI", "Qube Research & Technologies"]) {
      for (const d of domainCandidates(company)) {
        assert.ok(d.endsWith(".com"), `${company} proposed ${d}`);
      }
    }
  });

  test("strips legal and filler suffixes without eating the name", () => {
    assert.ok(domainCandidates("Datadog Inc.").includes("datadog.com"));
    assert.ok(domainCandidates("Scale AI").includes("scale.com"));
    /* "Match Group" must not become "match": a different company. */
    assert.ok(domainCandidates("Match Group").includes("matchgroup.com"));
  });

  test("proposes nothing at all for a denied name", () => {
    for (const company of ["crisp", "Peloton", "Unit", "prefect"]) {
      assert.deepEqual(domainCandidates(company), [], `${company} should be denied`);
    }
  });

  test("the denylist is matched on letters, not exact spelling", () => {
    assert.ok(isDenied("Crisp"));
    assert.ok(isDenied("PELOTON"));
    assert.ok(isDenied("Peloton Interactive"));
    assert.ok(!isDenied("Stripe"));
  });

  test("every denied name is one somebody actually checked", () => {
    /* A denylist that grows by guessing is just a second way to be wrong. */
    assert.ok(WRONG_DOTCOM.size >= 13);
    for (const name of WRONG_DOTCOM) assert.match(name, /^[a-z0-9]+$/);
  });
});

describe("identifies", () => {
  const page = (title, extra = "") => `<html><head><title>${title}</title>${extra}</head></html>`;

  test("accepts a page that names the company", () => {
    assert.ok(identifies("Stripe", page("Stripe | Financial Infrastructure")));
    assert.ok(identifies("Datadog", page("Cloud Monitoring as a Service | Datadog")));
  });

  test("reads og:site_name in either attribute order", () => {
    assert.ok(
      identifies("Vercel", page("Home", `<meta property="og:site_name" content="Vercel">`)),
    );
    assert.ok(
      identifies("Vercel", page("Home", `<meta content="Vercel" property="og:site_name">`)),
    );
  });

  test("rejects a page that never says who it is", () => {
    assert.ok(!identifies("Stripe", page("Welcome")));
    assert.ok(!identifies("Stripe", "<html><head></head></html>"));
  });

  test("holds short names to a stricter test", () => {
    /* A four-letter company buried in a long marketing title is as likely to be
       a coincidence as a match, so it has to lead the title. */
    assert.ok(identifies("Calm", page("Calm - The #1 App for Meditation and Sleep")));
    assert.ok(!identifies("Papa", page("Enterprise software for the modern papa workflow")));
  });
});

describe("iconUrls", () => {
  test("prefers SVG, then the largest raster, and leaves .ico last", () => {
    const html = `
      <link rel="icon" href="/favicon.ico">
      <link rel="apple-touch-icon" href="/touch.png" sizes="180x180">
      <link rel="icon" href="/mark.svg">
      <link rel="icon" href="/small.png" sizes="32x32">`;
    const urls = iconUrls(html, "https://x.com");
    assert.equal(urls[0], "https://x.com/mark.svg");
    assert.equal(urls[1], "https://x.com/touch.png");
    assert.ok(urls.indexOf("https://x.com/favicon.ico") > urls.indexOf("https://x.com/small.png"));
  });

  test("always offers the well-known paths as a backstop", () => {
    const urls = iconUrls("<html></html>", "https://x.com");
    assert.ok(urls.includes("https://x.com/apple-touch-icon.png"));
    assert.ok(urls.includes("https://x.com/favicon.ico"));
  });

  test("a malformed href does not throw", () => {
    assert.doesNotThrow(() => iconUrls(`<link rel="icon" href="ht!tp://[[">`, "https://x.com"));
  });
});

describe("pngInsideIco", () => {
  /* Build a real one-entry .ico wrapping a PNG, so this tests the parser rather
     than a mock of it. */
  const buildIco = (payload) => {
    const head = new Uint8Array(6 + 16);
    const v = new DataView(head.buffer);
    v.setUint16(0, 0, true);
    v.setUint16(2, 1, true);
    v.setUint16(4, 1, true);
    head[6] = 64; // width
    v.setUint32(6 + 8, payload.length, true);
    v.setUint32(6 + 12, head.length, true);
    const out = new Uint8Array(head.length + payload.length);
    out.set(head);
    out.set(payload, head.length);
    return out;
  };

  test("extracts the PNG hiding inside", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    assert.deepEqual([...pngInsideIco(buildIco(png))], [...png]);
  });

  test("returns null for a bitmap .ico rather than serving nonsense", () => {
    /* Half of real favicons are raw DIB. Decoding those needs an image encoder,
       which is a devDependency and cannot run in a request — so they are given
       up on and the company keeps its monogram. */
    const dib = new Uint8Array([40, 0, 0, 0, 9, 9, 9, 9]);
    assert.equal(pngInsideIco(buildIco(dib)), null);
  });

  test("does not read past the buffer on a truncated file", () => {
    assert.doesNotThrow(() => pngInsideIco(new Uint8Array([0, 0, 1, 0, 5, 0])));
    assert.equal(pngInsideIco(new Uint8Array([0, 0, 1, 0, 5, 0])), null);
  });

  test("returns a copy, not a view of the whole icon", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7]);
    const ico = buildIco(png);
    const out = pngInsideIco(ico);
    assert.equal(out.byteLength, png.length, "must not carry the parent buffer along");
    assert.equal(out.byteOffset, 0);
  });
});

describe("imageTypeOf", () => {
  test("trusts an image content-type", () => {
    assert.equal(imageTypeOf("image/png", new Uint8Array([1])), "image/png");
    assert.equal(imageTypeOf("image/svg+xml; charset=utf-8", new Uint8Array([1])), "image/svg+xml");
  });

  test("sniffs the bytes when the header is unhelpful", () => {
    assert.equal(imageTypeOf(null, new Uint8Array([0x89, 0x50, 0x4e, 0x47])), "image/png");
    assert.equal(imageTypeOf("application/octet-stream", new Uint8Array([0xff, 0xd8])), "image/jpeg");
  });

  test("refuses an HTML page served as 200, which is what bot-blocks return", () => {
    /* Chime, Gusto and Zocdoc answer asset requests with a 200 and an HTML
       error page. Passing that through would put a broken image on the tile. */
    const html = new TextEncoder().encode("<!doctype html><html><body>Access denied");
    assert.equal(imageTypeOf("text/html", html), null);
  });
});

describe("monogramSvg", () => {
  test("is a real SVG carrying the company's initial", () => {
    const svg = monogramSvg("Stripe");
    assert.match(svg, /^<svg/);
    assert.match(svg, />S</);
  });

  test("cannot be used to inject markup through a company name", () => {
    /* Company names come from employer job boards, which is to say from
       strangers. This string is rendered into an SVG served from our origin. */
    const svg = monogramSvg('<script>alert(1)</script>');
    assert.ok(!svg.includes("<script"));
    assert.ok(!svg.includes("&"));
  });

  test("survives an empty or whitespace name", () => {
    assert.match(monogramSvg("   "), /^<svg/);
    assert.match(monogramSvg(""), /\?</);
  });
});

/* ---- the mark taken from the board we already poll ---- */

const { parseBoardUrl, boardHostedLogo, ownDomainFromBoard } = await import(
  "../lib/company-logo-source.ts"
);

describe("parseBoardUrl", () => {
  test("accepts the boards we actually poll", () => {
    assert.deepEqual(parseBoardUrl("https://job-boards.greenhouse.io/stripe"), {
      ats: "greenhouse",
      token: "stripe",
      url: "https://job-boards.greenhouse.io/stripe",
    });
    assert.equal(parseBoardUrl("https://jobs.lever.co/palantir/some-job")?.ats, "lever");
    assert.equal(parseBoardUrl("https://jobs.ashbyhq.com/ramp")?.token, "ramp");
    assert.equal(parseBoardUrl("https://boards.greenhouse.io/datadog")?.ats, "greenhouse");
  });

  test("refuses anything that is not one of those hosts — this is the SSRF gate", () => {
    /* The board URL arrives as a query parameter and OUR SERVER fetches it.
       Without an exact-hostname allowlist, anyone could point this at an
       internal address and have the response handed back to them. Every case
       here is a real shape of that attack. */
    for (const bad of [
      "http://job-boards.greenhouse.io/stripe", // http, not https
      "https://job-boards.greenhouse.io.evil.com/stripe", // suffix trick
      "https://evil.com/job-boards.greenhouse.io/stripe", // path trick
      "https://localhost/admin",
      "https://127.0.0.1/",
      "https://169.254.169.254/latest/meta-data/", // cloud metadata
      "file:///etc/passwd",
      "https://jobs.lever.co", // no token
      "",
      null,
      undefined,
      "not a url",
    ]) {
      assert.equal(parseBoardUrl(bad), null, `should have refused ${String(bad)}`);
    }
  });

  test("refuses a token that is not a plain slug", () => {
    assert.equal(parseBoardUrl("https://jobs.lever.co/..%2f..%2fetc"), null);
    assert.equal(parseBoardUrl("https://jobs.ashbyhq.com/a b"), null);
  });
});

describe("boardHostedLogo", () => {
  test("finds the logo Ashby and Lever host for the organisation", () => {
    const ashby = `<img src="https://app.ashbyhq.com/api/images/org-theme-logo/7a158cac-9866-4881-95a8-bc946d3dca79/x">`;
    assert.match(boardHostedLogo(ashby, "ashby"), /org-theme-logo/);
    const lever = `<img src="https://lever-client-logos.s3.us-west-2.amazonaws.com/b8300af6.png">`;
    assert.match(boardHostedLogo(lever, "lever"), /lever-client-logos/);
  });

  test("does not confuse Ashby's social banner with its logo", () => {
    /* org-theme-social is a 745KB share image, not a square mark. */
    const social = `<meta property="og:image" content="https://app.ashbyhq.com/api/images/org-theme-social/abc/x">`;
    assert.equal(boardHostedLogo(social, "ashby"), null);
  });

  test("greenhouse hosts no logo, and saying so is the point", () => {
    assert.equal(boardHostedLogo("<img src='https://anything'>", "greenhouse"), null);
  });
});

describe("ownDomainFromBoard", () => {
  const page = (...hrefs) => hrefs.map((h) => `<a href="${h}">x</a>`).join("");

  test("finds the employer's real domain even when it is not a .com", () => {
    /* Every one of these is a company whose NAME resolved to somebody else's
       .com: block.co is an NFT company, imply.com sells LED panels, suki.com is
       a German DIY supplier. The board gets them right. */
    assert.equal(
      ownDomainFromBoard(page("https://block.xyz/a", "https://block.xyz/b"), "job-boards.greenhouse.io", "block"),
      "block.xyz",
    );
    assert.equal(
      ownDomainFromBoard(page("https://imply.io/a", "https://imply.io/b"), "job-boards.greenhouse.io", "imply"),
      "imply.io",
    );
  });

  test("the token anchor rejects a vendor link even when it is the most common", () => {
    /* `honor` resolved to datasubject.com purely because their board links a
       "do not sell my data" page more than anything else. The anchor is what
       turns most-linked-host from a guess into a check. */
    const html = page(
      "https://datasubject.com/1",
      "https://datasubject.com/2",
      "https://datasubject.com/3",
      "https://joinhonor.com/careers",
    );
    assert.equal(ownDomainFromBoard(html, "job-boards.greenhouse.io", "honor"), "joinhonor.com");
  });

  test("returns null rather than a wrong answer when nothing relates to the token", () => {
    const html = page("https://datasubject.com/1", "https://onetrust.com/2");
    assert.equal(ownDomainFromBoard(html, "job-boards.greenhouse.io", "honor"), null);
  });

  test("ignores the board's own host and the usual third parties", () => {
    const html = page(
      "https://job-boards.greenhouse.io/stripe",
      "https://linkedin.com/company/stripe",
      "https://stripe.com/a",
      "https://stripe.com/b",
    );
    assert.equal(ownDomainFromBoard(html, "job-boards.greenhouse.io", "stripe"), "stripe.com");
  });

  test("a token too short to anchor on resolves nothing", () => {
    assert.equal(ownDomainFromBoard(page("https://ab.com/x"), "jobs.lever.co", "ab"), null);
  });
});
