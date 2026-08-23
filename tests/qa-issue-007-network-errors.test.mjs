import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/dashboard/network/page.tsx", import.meta.url), "utf8");

function functionBody(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `missing ${name}`);
  assert.notEqual(end, -1, `missing ${nextName}`);
  return source.slice(start, end);
}

test("LinkedIn status failures remain failures instead of becoming a disconnected empty state", () => {
  const statusRequest = source.slice(
    source.indexOf('api<LinkedInStatus>("/network/linkedin/status")'),
    source.indexOf("  useEffect(() => {", source.indexOf('api<LinkedInStatus>("/network/linkedin/status")')),
  );

  assert.match(statusRequest, /setStatusError\("Litos could not check your LinkedIn import just now\."\)/);
  assert.doesNotMatch(statusRequest, /setStatus\(\{\s*connected:\s*false/);
  assert.match(source, /statusError \? <NetworkRequestError title="Could not check your LinkedIn import"/);
});

test("people and company request failures cannot render the normal empty copy", () => {
  assert.doesNotMatch(source, /api<\{ people\?: Person\[\] \} \| Person\[]>\("\/network\/people"\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(source, /api<\{ companies\?: Company\[\] \} \| Company\[]>\("\/network\/companies"\)\.catch\(\(\) => \[\]\)/);

  assert.match(source, /peopleError \? \(\s*<NetworkRequestError title="Could not load imported people"/);
  assert.match(source, /companiesError \? <NetworkRequestError title="Could not load company matches"/);
  assert.match(source, /function retryPeople\(\)[\s\S]*setPeopleReload\(\(value\) => value \+ 1\)/);
  assert.match(source, /function retryCompanies\(\)[\s\S]*setCompaniesReload\(\(value\) => value \+ 1\)/);
});

test("successful import and removal clear stale request errors", () => {
  const commit = functionBody("commitImport", "disconnect");
  const disconnect = source.slice(source.indexOf("  async function disconnect"), source.indexOf("\n\n  return (", source.indexOf("  async function disconnect")));

  assert.match(commit, /setStatusError\(null\)/);
  assert.match(commit, /refreshNetworkLists\(\)/);
  for (const cleared of [/setStatusError\(null\)/, /setPeopleError\(null\)/, /setCompaniesError\(null\)/]) {
    assert.match(disconnect, cleared);
  }
});

test("request error states are announced and offer a real retry control", () => {
  assert.match(source, /function NetworkRequestError[\s\S]*role="alert"/);
  assert.match(source, /<DataErrorState[\s\S]*onRetry=\{onRetry\}/);
  assert.match(source, /function retryStatus\(\)[\s\S]*setStatusReload\(\(value\) => value \+ 1\)/);
});
