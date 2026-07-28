import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { applicationKey, companyDomain, countNewToday, isAppliedStage } from "./job-rows.ts";
import { isQaRenderFor } from "./qa-mode.ts";

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
