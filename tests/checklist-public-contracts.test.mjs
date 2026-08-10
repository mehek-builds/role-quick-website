import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("accessibility target and manual contract are explicit", () => {
  const contract = read("ACCESSIBILITY.md");
  assert.match(contract, /WCAG 2\.2 Level AA/);
  assert.match(contract, /VoiceOver with Safari/);
  assert.match(contract, /NVDA with Firefox/);
  assert.match(contract, /focus-visible/);
  assert.match(read("AGENTS.md"), /Read `ACCESSIBILITY\.md`/);
});

test("security page states evidence limits without invented assurances", () => {
  const page = read("app/security/page.tsx");
  assert.match(page, /does not currently claim SOC 2/);
  assert.match(page, /does not currently publish an independently verified specification/);
  assert.match(page, /does not currently offer a customer-selectable data region/);
  assert.match(page, /has not published a third-party penetration test/);
  assert.match(page, /disclosure record, not an uptime or no-incident claim/);
});

test("cookie inventory and policy history are linked from legal surfaces", () => {
  const cookies = read("app/cookies/page.tsx");
  assert.match(cookies, /rq_try/);
  assert.match(cookies, /PostHog identifiers/);
  assert.match(cookies, /Dashboard job controls/);
  assert.match(cookies, /date-keyed names and are ignored after that day/);
  assert.match(cookies, /Preparation locks are ignored after 10 minutes/);
  assert.match(cookies, /Your controls/);
  assert.match(read("app/privacy/page.tsx"), /Policy history/);
  assert.match(read("components/SiteFooter.tsx"), /href="\/cookies"/);
  assert.match(read("components/SiteFooter.tsx"), /href="\/security"/);
});

test("not found page owns metadata and useful recovery routes", () => {
  const page = read("app/not-found.tsx");
  const title = /title:\s*\{\s*absolute:\s*"([^"]+)"\s*\}/.exec(page)?.[1];
  assert.equal(
    title,
    "Page not found: Litos",
    "the 404 title must be absolute so the root template does not append Litos a second time",
  );
  for (const route of ["/browse-jobs", "/login", "/contact"]) assert.match(page, new RegExp(`href="${route}"`));
});

test("comparison is source dated, tabular, actionable, and pricing silent", () => {
  const page = read("app/litos-vs-simplify/page.tsx");
  assert.match(page, /<table/);
  assert.match(page, /Source check: 27 July 2026/);
  assert.match(page, /href="\/try"/);
  assert.match(page, /href="\/browse-jobs"/);
  assert.doesNotMatch(page, /What each one costs|free to use|paid tiers/);
});
