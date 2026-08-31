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
 * tests hold the line on both: use the evidence, and refuse to fetch anything
 * that is not recognisably where evidence lives. */

const {
  ATS_EVIDENCE_HOSTS,
  backendLogoEvidence,
  evidenceImageUrl,
  pickEvidence,
} = await import("../lib/company-logo-evidence.ts");

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
       <digest>.png, and the backend writes them as absolute api.trylitos.com
       URLs while this app calls the same service by its Vercel name. Gating on
       the configured host alone refused our own storage: measured locally on
       2026-09-01, every Rippling source 404ed on exactly this. */
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

  test("a same-company row still answers when no row carries this exact board", () => {
    const picked = pickEvidence([verified()], "Shield AI", "https://boards.greenhouse.io/shieldai");
    assert.equal(picked?.url, "https://lever-client-logos.s3.amazonaws.com/shield.png");
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

  test("malformed rows degrade instead of throwing", () => {
    const rows = [null, 42, {}, { company_name: 7 }, verified()];
    const picked = pickEvidence(rows, "Shield AI", null);
    assert.ok(picked?.url);
  });
});

describe("backendLogoEvidence", () => {
  const row = {
    company_name: "Zapier",
    career_url: "https://jobs.ashbyhq.com/zapier",
    company_domain: "zapier.com",
    company_logo_url: "https://app.ashbyhq.com/api/images/org-theme-logo/x.png",
    company_logo_verification_status: "verified",
    company_logo_verification_method: "first_party_ats_employer_logo",
  };
  const ok = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  test("asks /jobs with the company filter and returns the picked evidence", async () => {
    let asked = "";
    const fetcher = (url) => {
      asked = String(url);
      return ok({ jobs: [row] });
    };
    const evidence = await backendLogoEvidence(
      "Zapier",
      "https://jobs.ashbyhq.com/zapier",
      new AbortController().signal,
      fetcher,
    );
    assert.ok(asked.includes("/jobs?"));
    assert.ok(asked.includes("company=Zapier"));
    assert.equal(evidence?.url, row.company_logo_url);
    assert.equal(evidence?.method, "first_party_ats_employer_logo");
  });

  test("a failing or misshapen backend answer is a null, never a throw", async () => {
    /* This lookup can only ever ADD a logo the legacy chain would miss. Any
       problem with it must leave the route exactly where it was before the
       lookup existed. */
    const signal = new AbortController().signal;
    assert.equal(await backendLogoEvidence("Zapier", null, signal, () => ok({ nope: true })), null);
    assert.equal(
      await backendLogoEvidence("Zapier", null, signal, () =>
        Promise.resolve(new Response("down", { status: 503 }))),
      null,
    );
    assert.equal(
      await backendLogoEvidence("Zapier", null, signal, () => Promise.reject(new Error("net"))),
      null,
    );
  });
});

/* The route consults the evidence FIRST. Source assertions in the style of
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

  test("the lookup cannot eat the whole resolution budget", () => {
    assert.match(source, /AbortSignal\.any\(\[controller\.signal, AbortSignal\.timeout\(EVIDENCE_LOOKUP_MS\)\]\)/);
  });

  test("an evidence hit names its provenance for the coverage check to see", () => {
    assert.match(source, /X-Logo-Source": `verified:\$\{evidence\.method/);
    assert.match(source, /X-Logo-Source": `verified-domain:\$\{evidence\.domain\}`/);
  });
});
