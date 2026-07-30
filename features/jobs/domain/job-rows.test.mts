import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { applicationKey, buildAppliedIndex, companyDomain, companyDomainForRow, countNewToday, isAppliedStage, isJobApplied } from "./job-rows.ts";
import { isQaRenderFor } from "../../../lib/qa-mode.ts";

describe("companyDomain", () => {
  test("a company careers URL yields the company host", () => {
    assert.equal(companyDomain("https://ramp.com/careers"), "ramp.com");
    assert.equal(companyDomain("https://www.ramp.com/careers"), "ramp.com", "www is not part of the identity");
    assert.equal(companyDomain("https://RAMP.COM/Careers"), "ramp.com");
    assert.equal(companyDomain("http://linear.app/careers"), "linear.app");
  });

  test("every job board is rejected, at the apex and on any subdomain", () => {
    for (const host of [
      "greenhouse.io", "boards.greenhouse.io", "job-boards.greenhouse.io",
      "lever.co", "jobs.lever.co",
      "ashbyhq.com", "jobs.ashbyhq.com",
      "myworkdayjobs.com", "acme.wd1.myworkdayjobs.com",
      "workable.com", "apply.workable.com",
      "jazzhr.com", "applytojob.com", "paylocity.com", "recruiting.paylocity.com",
      "bamboohr.com", "acme.bamboohr.com",
      "smartrecruiters.com", "careers.smartrecruiters.com",
      "icims.com", "acme.icims.com", "taleo.net", "acme.taleo.net",
      "jobvite.com", "recruitee.com", "breezy.hr", "teamtailor.com",
    ]) {
      assert.equal(companyDomain(`https://${host}/acme`), null, `${host} is a board, not an employer`);
    }
  });

  test("the fully-qualified trailing-dot form of a board is still a board", () => {
    // "boards.greenhouse.io." is the same host. It matched neither arm of the check before, so the
    // board's own domain reached the favicon lookup and drew its logo on the row.
    assert.equal(companyDomain("https://boards.greenhouse.io./acme"), null);
    assert.equal(companyDomain("https://greenhouse.io./acme"), null);
  });

  test("a lookalike host is NOT treated as a board and is NOT suppressed", () => {
    assert.equal(companyDomain("https://notgreenhouse.io/careers"), "notgreenhouse.io");
    assert.equal(companyDomain("https://greenhouse.io.example.com/careers"), "greenhouse.io.example.com");
  });

  test("credentials and ports cannot smuggle a board past the check", () => {
    assert.equal(companyDomain("https://evil.com@greenhouse.io/x"), null, "userinfo is not the host");
    assert.equal(companyDomain("https://boards.greenhouse.io:8443/x"), null, "a port is not part of the host");
  });

  test("anything that does not identify a company is null, and fires no request", () => {
    assert.equal(companyDomain(null), null);
    assert.equal(companyDomain(undefined), null);
    assert.equal(companyDomain(""), null);
    assert.equal(companyDomain("   "), null);
    assert.equal(companyDomain("not a url"), null);
    assert.equal(companyDomain("/careers"), null, "a relative path has no host");
    assert.equal(companyDomain("javascript:alert(1)"), null, "no hostname, so nothing to draw");
    assert.equal(companyDomain("https://localhost/careers"), null, "no dot, no company");
  });

  test("every ATS the backend actually polls is blocked", () => {
    // MonitoredJob["ats_name"] is greenhouse | lever | ashby. If the backend learns a new board and
    // it is not listed here, that board's favicon lands on every row from it.
    for (const url of [
      "https://boards.greenhouse.io/acme",
      "https://jobs.lever.co/acme",
      "https://jobs.ashbyhq.com/acme",
    ]) {
      assert.equal(companyDomain(url), null, `${url} is polled by the backend and must be blocked`);
    }
  });
});

describe("applicationKey", () => {
  test("the same employer written two ways is one employer", () => {
    assert.equal(applicationKey("Airbnb, Inc.", "Product Analyst"), applicationKey("Airbnb", "Product Analyst"));
    assert.equal(applicationKey("Acme Corp", "Engineer"), applicationKey("acme", "engineer"));
    assert.equal(applicationKey("Acme Co.", "Engineer"), applicationKey("Acme", "Engineer"));
    assert.equal(applicationKey("Acme  LLC", "Senior  Product Analyst"), applicationKey("Acme", "Senior Product Analyst"));
  });

  test("a suffix inside a word is not a suffix", () => {
    assert.notEqual(applicationKey("Coinbase", "Engineer"), applicationKey("inbase", "Engineer"));
    assert.notEqual(applicationKey("Coca Cola", "Engineer"), applicationKey("ca Cola", "Engineer"));
    assert.notEqual(applicationKey("Corpay", "Engineer"), applicationKey("ay", "Engineer"));
  });

  test("a legal suffix is stripped only at the end, never mid-string", () => {
    // The old \b(...)\b rule treated the hyphen as a word boundary, so "Co-op Software Engineer"
    // flattened to "-op software engineer" and "Corp Dev Analyst" flattened to "dev analyst",
    // colliding with a genuinely different posting.
    assert.notEqual(applicationKey("Acme", "Co-op Software Engineer"), applicationKey("Acme", "Software Engineer"));
    assert.notEqual(applicationKey("Acme", "Corp Dev Analyst"), applicationKey("Acme", "Dev Analyst"));
    assert.notEqual(applicationKey("Co-operative Bank", "Analyst"), applicationKey("operative Bank", "Analyst"));
  });

  test("a company whose whole name is a legal suffix keeps an identity", () => {
    // Flattening "Co" to "" would give every such employer the same key, so one application would
    // mark them all Applied.
    assert.notEqual(applicationKey("Co", "Engineer"), applicationKey("Corp", "Engineer"));
    assert.notEqual(applicationKey("Co", "Engineer"), applicationKey("", "Engineer"));
  });

  test("TWO DIFFERENT ROLES AT ONE COMPANY ARE NEVER FOLDED TOGETHER", () => {
    // This is the direction that costs a student an application: a false "Applied".
    for (const [a, b] of [
      ["Product Analyst", "Senior Product Analyst"],
      ["Data Analyst", "Data Analyst, Operations"],
      ["Frontend Engineer", "Backend Engineer"],
      ["Engineer", "Engineer II"],
    ] as const) {
      assert.notEqual(applicationKey("Acme", a), applicationKey("Acme", b), `"${a}" is not "${b}"`);
    }
  });

  test("the same role at two companies is never folded together", () => {
    assert.notEqual(applicationKey("Ramp", "Product Analyst"), applicationKey("Brex", "Product Analyst"));
  });
});

describe("isAppliedStage", () => {
  test("only stages that mean an application was sent count", () => {
    assert.equal(isAppliedStage("applied"), true);
    assert.equal(isAppliedStage("interview"), true);
    assert.equal(isAppliedStage("offer"), true);
  });

  test("saved and closed are NOT applied", () => {
    // "closed" is where an expired, duplicate, or no-longer-wanted posting goes. Counting it as
    // applied showed the green statement with no control, so the student could not apply at all.
    assert.equal(isAppliedStage("saved"), false);
    assert.equal(isAppliedStage("closed"), false);
  });

  test("an unknown stage is not applied", () => {
    assert.equal(isAppliedStage("archived"), false);
    assert.equal(isAppliedStage(""), false);
  });
});

describe("buildAppliedIndex / isJobApplied", () => {
  const card = (over: Partial<{ job_id: string | null; company: string; role: string; stage: string }> = {}) => ({
    job_id: null as string | null,
    company: "Google",
    role: "Software Engineer",
    stage: "applied",
    ...over,
  });
  const job = (over: Partial<{ id: string; company_name: string; title: string }> = {}) => ({
    id: "job-mtv",
    company_name: "Google",
    title: "Software Engineer",
    ...over,
  });

  test("an exact job-id match marks the row", () => {
    const index = buildAppliedIndex([card({ job_id: "job-mtv" })]);
    assert.equal(isJobApplied(job({ id: "job-mtv" }), index), true);
  });

  /* THE BUG THIS WHOLE CHANGE EXISTS FOR. Google reposts one title in Mountain View, New York and
     London. Applying to one used to mark all three, and a row that wrongly says "Applied" is an
     application the student never sends. */
  test("an id match on one posting does NOT mark a sibling with the same company and title", () => {
    const index = buildAppliedIndex([card({ job_id: "job-mtv" })]);
    assert.equal(isJobApplied(job({ id: "job-mtv" }), index), true, "the one applied to");
    assert.equal(isJobApplied(job({ id: "job-nyc" }), index), false, "New York was never applied to");
    assert.equal(isJobApplied(job({ id: "job-lon" }), index), false, "nor was London");
  });

  /* The other half of the same rule: a card WITH an id must not also register its company+role,
     or the siblings above would match on the fallback and nothing would have been fixed. */
  test("a card with an id contributes no company+role key", () => {
    const index = buildAppliedIndex([card({ job_id: "job-mtv" })]);
    assert.equal(index.keys.size, 0);
    assert.deepEqual([...index.ids], ["job-mtv"]);
  });

  test("the company+role fallback still marks a card that has no job_id", () => {
    // Every application recorded before ids were written, and anything from the extension.
    const index = buildAppliedIndex([card({ job_id: null })]);
    assert.equal(isJobApplied(job({ id: "job-mtv" }), index), true);
    assert.equal(isJobApplied(job({ id: "job-nyc" }), index), true, "still lossy, and unfixably so");
  });

  test("the fallback keeps normalising company and role as it did", () => {
    const index = buildAppliedIndex([card({ job_id: null, company: "Google, Inc." })]);
    assert.equal(isJobApplied(job({ company_name: "Google" }), index), true);
  });

  test("old and new cards coexist, each matching its own way", () => {
    const index = buildAppliedIndex([
      card({ job_id: "job-mtv" }),
      card({ job_id: null, company: "Stripe", role: "Data Analyst" }),
    ]);
    assert.equal(isJobApplied(job({ id: "job-mtv" }), index), true);
    assert.equal(isJobApplied(job({ id: "job-nyc" }), index), false, "the id path stays precise");
    assert.equal(isJobApplied(job({ id: "x", company_name: "Stripe", title: "Data Analyst" }), index), true);
  });

  test("a stage that is not an application is indexed by neither path", () => {
    const index = buildAppliedIndex([
      card({ job_id: "job-mtv", stage: "saved" }),
      card({ job_id: null, company: "Stripe", role: "Data Analyst", stage: "closed" }),
    ]);
    assert.equal(index.ids.size, 0);
    assert.equal(index.keys.size, 0);
    assert.equal(isJobApplied(job({ id: "job-mtv" }), index), false);
  });

  /* Null is "the board has not answered", not "nothing is applied". It must not paint a green
     statement the student cannot act on. */
  test("a null index never claims a row is applied", () => {
    assert.equal(isJobApplied(job(), null), false);
  });
});

describe("countNewToday", () => {
  const job = (first_seen_at: string) => ({ first_seen_at });
  const at = (h: number, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  test("counts only what was first seen since local midnight", () => {
    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setMinutes(-1);
    assert.equal(countNewToday([job(at(9)), job(at(0, 0)), job(yesterday.toISOString())]), 2);
  });

  test("exactly midnight counts as today", () => {
    assert.equal(countNewToday([job(at(0, 0))]), 1);
  });

  test("an empty list is zero, not NaN", () => {
    assert.equal(countNewToday([]), 0);
  });

  test("an unparseable timestamp is not counted", () => {
    assert.equal(countNewToday([job("nonsense")]), 0);
  });
});

describe("isQaRenderFor", () => {
  test("fixtures are unreachable off localhost, whatever the query string says", () => {
    assert.equal(isQaRenderFor("trylitos.com", "?qa=1"), false);
    assert.equal(isQaRenderFor("litos.vercel.app", "?qa=1"), false);
    assert.equal(isQaRenderFor("localhost.trylitos.com", "?qa=1"), false, "a suffix is not localhost");
    assert.equal(isQaRenderFor("127.0.0.1", "?qa=1"), false, "the gate is the literal hostname");
  });

  test("localhost alone is not enough; the flag must be explicit", () => {
    assert.equal(isQaRenderFor("localhost", ""), false);
    assert.equal(isQaRenderFor("localhost", "?other=1"), false);
    assert.equal(isQaRenderFor("localhost", "?qa=1"), true);
    assert.equal(isQaRenderFor("localhost", "?qa"), true, "has() is presence, not value");
  });
});

describe("companyDomainForRow", () => {
  test("the server's answer wins, because the careers URL is a job board on every real source", () => {
    // This is the whole bug: every polled source had a board URL in career_url, so deriving from it
    // returned null on 100 rows out of 100 and the logo never appeared once.
    assert.equal(
      companyDomainForRow({ company_domain: "linear.app", career_url: "https://jobs.ashbyhq.com/linear" }),
      "linear.app",
    );
  });

  test("falls back to a real careers URL when the server has no mapping", () => {
    assert.equal(companyDomainForRow({ company_domain: null, career_url: "https://ramp.com/careers" }), "ramp.com");
    assert.equal(companyDomainForRow({ career_url: "https://ramp.com/careers" }), "ramp.com");
  });

  test("no mapping and a board careers URL is null, so the row shows an initial", () => {
    assert.equal(
      companyDomainForRow({ company_domain: null, career_url: "https://job-boards.greenhouse.io/lyft" }),
      null,
    );
    assert.equal(companyDomainForRow({}), null);
  });

  test("a served value is normalized the same way a derived one is", () => {
    assert.equal(companyDomainForRow({ company_domain: "  WWW.Ramp.com. " }), "ramp.com");
  });

  test("a served value that is somehow a job board is refused, not trusted", () => {
    // Defence in depth: the backend should never send this, and if it ever does the row must not
    // paint Greenhouse's logo on an employer.
    assert.equal(
      companyDomainForRow({ company_domain: "boards.greenhouse.io", career_url: "https://ramp.com/careers" }),
      "ramp.com",
      "it falls through to the careers URL rather than using the board",
    );
    assert.equal(companyDomainForRow({ company_domain: "greenhouse.io" }), null);
  });

  test("a served value that is not a domain is ignored", () => {
    assert.equal(companyDomainForRow({ company_domain: "notadomain" }), null);
    assert.equal(companyDomainForRow({ company_domain: "" }), null);
  });
});
