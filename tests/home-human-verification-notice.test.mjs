import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/app/WaitingOnYou.tsx", import.meta.url),
  "utf8",
);

test("the home notice describes status review without asserting an unknown submission outcome", () => {
  assert.match(source, />\s*Human verification\s*<\/h2>/);
  assert.match(source, /This application has a human-verification notice\./);
  assert.match(source, /These applications have human-verification notices\./);
  assert.match(source, /current status and available steps/);
  assert.doesNotMatch(source, /waiting on you/i);
  assert.doesNotMatch(source, /employer requested/i);
  assert.doesNotMatch(source, /stopped rather than send anything/i);
  assert.doesNotMatch(source, /try again/i);
  assert.doesNotMatch(source, /nothing is filled/i);
});

test("the home notice keeps the internal application route and offers no employer-page action", () => {
  assert.match(
    source,
    /href=\{`\/dashboard\/applications\?application=\$\{encodeURIComponent\(item\.id\)\}&intent=apply`\}/,
  );
  assert.match(source, />\s*Continue in Litos\s*<\/ButtonLink>/);
  assert.doesNotMatch(source, /item\.portalUrl/);
  assert.doesNotMatch(source, /target="_blank"/);
  assert.doesNotMatch(source, /Or open it yourself/);
});
