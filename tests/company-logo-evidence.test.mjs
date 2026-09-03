import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* The backend's verified logo evidence, and the gate on what this process will
 * fetch because of it.
 *
 * The stakes are the same two that shaped company-logo-source.ts, in tension:
 * a wrong logo tells a job seeker the row is a different company than it is,
 * and a missing one turned a third of the measured board into monograms while
 * the proven URL sat unused in the /jobs payload (46.94% coverage measured
 * 2026-09-01 against a backend that verifies 100% of surfaced rows). These
 * tests hold the line on both: use the evidence, and refuse both a fetch and a
 * row that is not provably this company's. */

const {
  ATS_EVIDENCE_HOSTS,
  backendLogoEvidence,
  evidenceImageUrl,
  normalizedDomain,
  pickEvidence,
} = await import("../lib/company-logo-evidence.ts");

describe("normalizedDomain", () => {
  test("strips www BEFORE validating, so www.com cannot collapse to a TLD", () => {
    /* Review finding 2026-09-01: stripping after validation let "www.com" pass
       the two-label check and then suffix-match every .com host. */
    assert.equal(normalizedDomain("www.com"), null);
    assert.equal(normalizedDomain("www.ocrolus.com"), "ocrolus.com");
    assert.equal(normalizedDomain("Zapier.COM"), "zapier.com");
  });

  test("an IP literal is not a domain", () => {
    /* 169.254.169.254 matches the bare-domain regex; fetching it from a server
       is a request to the cloud metadata service. */
    assert.equal(normalizedDomain("169.254.169.254"), null);
    assert.equal(normalizedDomain("10.0.0.1"), null);
  });

  test("private-network suffixes are never employer domains", () => {
    assert.equal(normalizedDomain("metadata.google.internal"), null);
    assert.equal(normalizedDomain("build.corp"), null);
    assert.equal(normalizedDomain("printer.local"), null);
  });

  test("a public registry suffix is not a company", () => {
    assert.equal(normalizedDomain("www.co.uk"), null);
    assert.equal(normalizedDomain("co.uk"), null);
    /* A real company UNDER such a suffix stays fine. */
    assert.equal(normalizedDomain("nexuscareservices.co.uk"), "nexuscareservices.co.uk");
  });

  test("garbage is null, never a throw", () => {
    for (const bad of [null, undefined, 7, "", "not a domain", "https://a.com", "a..b"]) {
      assert.equal(normalizedDomain(bad), null, String(bad));
    }
  });
});

describe("evidenceImageUrl", () => {
  test("accepts every known ATS evidence host, and only over https", () => {
    for (const host of ATS_EVIDENCE_HOSTS) {
      assert.equal(
        evidenceImageUrl(`https://${host}/some/asset.png`, null),
        `https://${host}/some/asset.png`,
      );
      assert.equal(evidenceImageUrl(`http://${host}/some/asset.png`, null), null, `${host} over http`);
    }
  });

  test("accepts our own backend under BOTH its production names", () => {
    /* Durable Rippling copies arrive as {API}/storage/logo/rippling/<tenant>/
       <digest>.png as absolute api.trylitos.com URLs, which is also the host
       this app now calls. The Vercel name is kept as READ-ONLY LEGACY for rows
       the backend persisted before the DNS cutover: this is a fetch allow-list
       for already-stored URLs, so dropping it refuses our own storage and
       returns a monogram silently. Measured locally on 2026-09-01, gating on
       the configured host alone 404ed every Rippling source. */
    assert.ok(
      evidenceImageUrl(
        "https://api.trylitos.com/storage/logo/rippling/thrive-scholars-jobs/aa.png",
        null,
      ),
    );
    assert.ok(
      evidenceImageUrl(
        "https://student-outreach-backend.vercel.app/storage/logo/rippling/acme/aa.png",
        null,
      ),
    );
  });

  test("accepts the employer's own verified domain, including subdomains", () => {
    assert.ok(evidenceImageUrl("https://www.ocrolus.com/logo.svg", "ocrolus.com"));
    assert.ok(evidenceImageUrl("https://assets.zapier.com/mark.png", "zapier.com"));
    /* company_domain values sometimes carry www; the gate must not require the
       asset host to repeat it. */
    assert.ok(evidenceImageUrl("https://ocrolus.com/logo.svg", "www.ocrolus.com"));
  });

  test("a suffix lookalike of the verified domain is refused", () => {
    /* zapier.com.evil.example contains the domain but is not under it. This is
       the same shape of attack parseBoardUrl's exact-host rule exists for. */
    assert.equal(evidenceImageUrl("https://zapier.com.evil.example/x.png", "zapier.com"), null);
    assert.equal(evidenceImageUrl("https://notzapier.com/x.png", "zapier.com"), null);
  });

  test("a degenerate domain cannot widen the gate", () => {
    /* The complete set of review findings on this gate: "www.com" collapsing
       to .com, IP literals, and internal hostnames. None of them may admit a
       fetch, whatever a backend row says. */
    assert.equal(evidenceImageUrl("https://attacker.com/x.png", "www.com"), null);
    assert.equal(evidenceImageUrl("https://evil.co.uk/x.png", "www.co.uk"), null);
    assert.equal(evidenceImageUrl("https://169.254.169.254/x.png", "169.254.169.254"), null);
    assert.equal(evidenceImageUrl("https://metadata.google.internal/x", "metadata.google.internal"), null);
  });

  test("an unknown host is refused even when the URL came from evidence", () => {
    /* The homepage-asset method sometimes proves an image on a page-builder CDN
       (cdn.prod.website-files.com, img1.wsimg.com). Those rows fall back to the
       verified DOMAIN, which markFromDomain can resolve; the CDN itself is not
       a place this process fetches. */
    assert.equal(evidenceImageUrl("https://cdn.prod.website-files.com/x/logo.png", "acme.com"), null);
  });

  test("garbage never becomes a fetch", () => {
    assert.equal(evidenceImageUrl(null, "acme.com"), null);
    assert.equal(evidenceImageUrl("not a url", "acme.com"), null);
    assert.equal(evidenceImageUrl("https://acme.com/x.png", "not a domain"), null);
    assert.equal(evidenceImageUrl("ftp://app.ashbyhq.com/x.png", null), null);
  });
});

describe("pickEvidence", () => {
  const verified = (over = {}) => ({
    company_name: "Shield AI",
    career_url: "https://jobs.lever.co/shieldai",
    company_domain: "shield.ai",
    company_logo_url: "https://lever-client-logos.s3.amazonaws.com/shield.png",
    company_logo_verification_status: "verified",
    company_logo_verification_method: "first_party_ats_employer_logo",
    ...over,
  });

  test("the company name must match exactly, because the backend filter is a substring", () => {
    /* Asking the backend for company=ICS matches every "Analytics" row too.
       Those rows are real and verified, and none of them are ICS's evidence. */
    const rows = [verified({ company_name: "Analytics Co" })];
    assert.equal(pickEvidence(rows, "ICS", null), null);
  });

  test("two sources sharing a name are told apart by the board URL", () => {
    /* Two Shield AI sources are on the live board today. The pair (company,
       career_url) is the identity the coverage check measures, so the row with
       THIS board must win over another row with the same name. */
    const other = verified({
      career_url: "https://boards.greenhouse.io/shieldai",
      company_logo_url: "https://recruiting.cdn.greenhouse.io/shield-gh.png",
    });
    const picked = pickEvidence([other, verified()], "Shield AI", "https://jobs.lever.co/shieldai");
    assert.equal(picked?.url, "https://lever-client-logos.s3.amazonaws.com/shield.png");
  });

  test("the board comparison is normalized, not byte equality", () => {
    /* A trailing slash or an uppercased host must not defeat the identity
       check: a missed match here used to fall through to a name-keyed pick. */
    const picked = pickEvidence([verified()], "Shield AI", "https://JOBS.LEVER.CO/shieldai/");
    assert.equal(picked?.url, "https://lever-client-logos.s3.amazonaws.com/shield.png");
  });

  test("a request naming a board gets that board's row or NOTHING", () => {
    /* Review finding 2026-09-01, with live proof: two distinct companies are
       both named exactly "Crisp" on the board right now (crisp.com and
       crispheights.com). When the requested board's row is absent, serving a
       same-named neighbour puts one company's logo on the other's jobs. The
       repo's own docs rank that worse than showing nothing, so nothing wins. */
    const picked = pickEvidence([verified()], "Shield AI", "https://boards.greenhouse.io/shieldai");
    assert.equal(picked, null);
  });

  test("a boardless request is answered only unanimously", () => {
    const twin = verified({ career_url: "https://jobs.lever.co/shieldai-eu" });
    /* Same evidence on both rows: one identity, safe to serve. */
    assert.ok(pickEvidence([verified(), twin], "Shield AI", null)?.url);
    /* Different evidence: could be two companies wearing one name; refuse. */
    const stranger = verified({
      career_url: "https://jobs.ashbyhq.com/crispgrowth",
      company_domain: "crispheights.com",
      company_logo_url: "https://app.ashbyhq.com/api/images/org-theme-logo/other.png",
    });
    assert.equal(pickEvidence([verified(), stranger], "Shield AI", null), null);
  });

  test("unverified rows are never evidence", () => {
    const rows = [verified({ company_logo_verification_status: "pending" })];
    assert.equal(pickEvidence(rows, "Shield AI", null), null);
  });

  test("an off-gate URL degrades to the verified domain rather than to nothing", () => {
    const rows = [verified({ company_logo_url: "https://cdn.prod.website-files.com/x/logo.png" })];
    const picked = pickEvidence(rows, "Shield AI", null);
    assert.equal(picked?.url, null);
    assert.equal(picked?.domain, "shield.ai");
  });

  test("a degenerate company_domain is dropped from the result entirely", () => {
    const rows = [verified({ company_domain: "www.com", company_logo_url: null })];
    assert.equal(pickEvidence(rows, "Shield AI", null), null);
    const picked = pickEvidence(
      [verified({ company_domain: "169.254.169.254" })],
      "Shield AI",
      null,
    );
    assert.equal(picked?.domain, null);
  });

  test("malformed rows degrade instead of throwing", () => {
    const rows = [null, 42, {}, { company_name: 7 }, verified()];
    const picked = pickEvidence(rows, "Shield AI", "https://jobs.lever.co/shieldai");
    assert.ok(picked?.url);
  });
});

describe("backendLogoEvidence", () => {
  const row = (name, board) => ({
    company_name: name,
    career_url: board,
    company_domain: "zapier.com",
    company_logo_url: "https://app.ashbyhq.com/api/images/org-theme-logo/x.png",
    company_logo_verification_status: "verified",
    company_logo_verification_method: "first_party_ats_employer_logo",
  });
  const ok = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  test("asks /jobs by the SOURCE key first and returns the picked evidence", async () => {
    /* The company filter is a substring over display names, and names collide (several live
       sources are literally named "Careers"). When the tile names its board, the board is the
       key: one exact-match query, no name paging, and the junk-named class resolves. */
    const asked = [];
    const fetcher = (url) => {
      asked.push(String(url));
      return ok({ jobs: [row("Zapier", "https://jobs.ashbyhq.com/zapier")] });
    };
    const evidence = await backendLogoEvidence(
      "Zapier",
      "https://jobs.ashbyhq.com/zapier",
      new AbortController().signal,
      fetcher,
    );
    assert.equal(asked.length, 1, "a source-keyed hit needs no name query");
    assert.ok(asked[0].includes("career_url=https%3A%2F%2Fjobs.ashbyhq.com%2Fzapier"));
    assert.ok(!asked[0].includes("company="));
    assert.equal(evidence?.url, "https://app.ashbyhq.com/api/images/org-theme-logo/x.png");
    assert.equal(evidence?.method, "first_party_ats_employer_logo");
  });

  test("falls back to the company query when the source key yields nothing", async () => {
    /* A backend that predates the career_url filter ignores the unknown parameter and answers
       the generic newest page; the exact-match selection finds nothing there and the company
       query must still run, so either deploy order stays correct. */
    const asked = [];
    const fetcher = (url) => {
      asked.push(String(url));
      if (String(url).includes("career_url=")) {
        return ok({ jobs: [row("Somebody Else", "https://jobs.lever.co/other")] });
      }
      return ok({ jobs: [row("Fallback Co", "https://jobs.ashbyhq.com/fallback-co")] });
    };
    const evidence = await backendLogoEvidence(
      "Fallback Co",
      "https://jobs.ashbyhq.com/fallback-co",
      new AbortController().signal,
      fetcher,
    );
    assert.equal(asked.length, 2);
    assert.ok(asked[1].includes("company=Fallback+Co"));
    assert.ok(evidence?.url);
  });

  test("a boardless request goes straight to the company query", async () => {
    const asked = [];
    const fetcher = (url) => {
      asked.push(String(url));
      return ok({ jobs: [row("Solo Co", "https://jobs.ashbyhq.com/solo-co")] });
    };
    const evidence = await backendLogoEvidence("Solo Co", null, new AbortController().signal, fetcher);
    assert.equal(asked.length, 1);
    assert.ok(asked[0].includes("company=Solo+Co"));
    assert.ok(!asked[0].includes("career_url="));
    assert.ok(evidence?.url);
  });

  test("a well-formed answer is cached, so repeats cost the backend nothing", async () => {
    /* This server runs standalone on Railway with no shared CDN, so without
       this every visitor's board page re-asked the backend for the same two
       dozen companies, and junk names reached it once per request forever. */
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return ok({ jobs: [row("Cachet", "https://jobs.ashbyhq.com/cachet")] });
    };
    const signal = new AbortController().signal;
    const first = await backendLogoEvidence("Cachet", "https://jobs.ashbyhq.com/cachet", signal, fetcher);
    const second = await backendLogoEvidence("Cachet", "https://jobs.ashbyhq.com/cachet", signal, fetcher);
    assert.equal(calls, 1);
    assert.deepEqual(second, first);
    /* A miss is cached exactly like a hit; that is the amplification defence. */
    const miss1 = await backendLogoEvidence("No Such Co", null, signal, () => ok({ jobs: [] }));
    let missCalls = 0;
    const miss2 = await backendLogoEvidence("No Such Co", null, signal, () => {
      missCalls += 1;
      return ok({ jobs: [] });
    });
    assert.equal(miss1, null);
    assert.equal(miss2, null);
    assert.equal(missCalls, 0);
  });

  test("a failing or misshapen backend answer is a null, never a throw, and is not cached", async () => {
    /* This lookup can only ever ADD a logo the legacy chain would miss. Any
       problem with it must leave the route exactly where it was before the
       lookup existed, and a network blip must not suppress the next try. */
    const signal = new AbortController().signal;
    assert.equal(await backendLogoEvidence("Wobble", null, signal, () => ok({ nope: true })), null);
    assert.equal(
      await backendLogoEvidence("Wobble", null, signal, () =>
        Promise.resolve(new Response("down", { status: 503 }))),
      null,
    );
    assert.equal(
      await backendLogoEvidence("Wobble", null, signal, () => Promise.reject(new Error("net"))),
      null,
    );
    /* After the failures, a good answer still gets through: nothing was cached. */
    const recovered = await backendLogoEvidence("Wobble", null, signal, () =>
      ok({ jobs: [row("Wobble", "https://jobs.ashbyhq.com/wobble")] }));
    assert.ok(recovered?.url);
  });
});

/* The route consults the evidence FIRST, inside its own budgets, and cannot be
   knocked over by the strings it forwards. Source assertions in the style of
   company-logo.test.mjs: the route module pulls in next/server, which this
   runner does not load, so the contract is held on the source text with
   comments stripped. */
describe("the route uses the evidence", () => {
  const source = readFileSync(new URL("../app/api/company-logo/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  test("the backend lookup runs before any board fetch or name guess", () => {
    const evidenceAt = source.indexOf("backendLogoEvidence(");
    assert.ok(evidenceAt > 0, "the route calls backendLogoEvidence");
    assert.ok(evidenceAt < source.indexOf("boardHostedLogo("), "evidence precedes the board scrape");
    assert.ok(evidenceAt < source.indexOf("domainCandidates("), "evidence precedes the name guess");
  });

  test("the whole evidence step is budgeted, fetches included", () => {
    /* Review finding 2026-09-01: capping only the lookup let a hung evidence
       HOST eat the full 8s and starve the legacy chain. The step budget covers
       the lookup, the evidence-URL fetch, and the verified-domain resolution. */
    assert.match(source, /AbortSignal\.any\(\[controller\.signal, AbortSignal\.timeout\(EVIDENCE_STEP_MS\)\]\)/);
    assert.match(source, /AbortSignal\.any\(\[evidenceBudget, AbortSignal\.timeout\(EVIDENCE_LOOKUP_MS\)\]\)/);
    assert.match(source, /fetchImage\(evidence\.url, evidenceBudget/);
    assert.match(source, /markFromDomain\(evidence\.domain, evidenceBudget\)/);
  });

  test("the gate is re-applied to the final URL after redirects", () => {
    assert.match(source, /finalUrlAllowed: \(finalUrl\) => evidenceImageUrl\(finalUrl, evidence\.domain\) !== null/);
  });

  test("every mark leaves through one response builder with a sanitized source header", () => {
    /* undici throws on non-Latin-1 header values; unsanitized, one odd backend
       method string would abort the whole chain after a successful fetch. */
    assert.match(source, /function markResponse\(/);
    assert.match(source, /source\.replace\(\/\[\^/);
    /* Exactly one construction site: markResponse's own body. A second one is
       a branch that grew its own headers and can drift from the rest. */
    assert.equal((source.match(/new NextResponse\(mark\.bytes/g) ?? []).length, 1);
  });

  test("an evidence hit names its provenance for the coverage check to see", () => {
    assert.match(source, /markResponse\(mark, `verified:\$\{evidence\.method/);
    assert.match(source, /markResponse\(mark, `verified-domain:\$\{evidence\.domain\}`\)/);
  });

  test("body reads are bounded before buffering, not after", () => {
    assert.match(source, /content-length/);
    assert.match(source, /reader\.cancel\(\)/);
  });

  test("a DIB-only favicon is served as-is, never dropped for a monogram", () => {
    /* Half of real-world .ico files hold raw bitmaps with no embedded PNG, and
       browsers draw them in an <img> just fine. Dropping them turned employers
       whose only first-party mark is such a favicon (Gensyn, West Cancer
       Center, FirstSteps for Kids, measured 2026-09-01) into monograms while
       their verified evidence sat unused. The embedded PNG is still preferred
       when it exists; the container is the fallback, not the first choice. */
    assert.match(source, /const inner = pngInsideIco\(raw\);\s*if \(inner\) \{/);
    assert.doesNotMatch(source, /if \(!inner\) return null/);
  });
});
