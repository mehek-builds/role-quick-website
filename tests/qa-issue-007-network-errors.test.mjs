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

test("request error states use the shared announced retry control without nesting alerts", () => {
  assert.doesNotMatch(source, /function NetworkRequestError[\s\S]{0,300}?role="alert"/);
  assert.match(source, /<DataErrorState[\s\S]*onRetry=\{onRetry\}/);
  assert.match(source, /function retryStatus\(\)[\s\S]*setStatusReload\(\(value\) => value \+ 1\)/);
  assert.match(source, /function focusNetworkPanel\(\)[\s\S]*getElementById\("network-panel"\)\?\.focus\(\)/);
  for (const retry of ["retryStatus", "retryPeople", "retryCompanies", "retryBilling"]) {
    assert.match(source, new RegExp(`function ${retry}\\(\\) \\{\\s*focusNetworkPanel\\(\\)`));
  }
});

test("unknown network access stays loading only while billing is active", () => {
  assert.match(source, /const networkAccess = canUse\("networking_discovery"\)/);
  assert.match(source, /loading: billingLoading/);
  assert.match(source, /error: billingError/);
  assert.match(source, /refresh: refreshBilling/);
  assert.match(source, /const billingUnavailable = !billingLoading && networkAccess === null/);
  assert.doesNotMatch(source, /if \(!premium \|\| status\?\.connected === false\)/);

  const statusRequestEnd = source.indexOf("}, [statusReload]);");
  const peopleRequestStart = source.indexOf("  useEffect(() => {", statusRequestEnd);
  const companiesRequestStart = source.indexOf("  useEffect(() => {", peopleRequestStart + 1);
  const retryStart = source.indexOf("  function retryStatus");
  const peopleRequest = source.slice(peopleRequestStart, companiesRequestStart);
  const companiesRequest = source.slice(companiesRequestStart, retryStart);
  for (const request of [peopleRequest, companiesRequest]) {
    assert.match(request, /if \(networkAccess === false \|\| status\?\.connected === false\)/);
    assert.match(request, /if \(networkAccess !== true \|\| status\?\.connected !== true\) return/);
  }

  const peoplePanel = source.slice(source.indexOf('{tab === "people"'), source.indexOf('{tab === "companies"'));
  const companiesPanel = source.slice(source.indexOf('{tab === "companies"'), source.indexOf('{tab === "linkedin"'));
  for (const panel of [peoplePanel, companiesPanel]) {
    assert.match(panel, /billingLoading[\s\S]{0,80}<ShimmerRows rows=\{3\}/);
    assert.match(panel, /billingUnavailable[\s\S]{0,260}?title="Could not check your plan access"/);
    assert.match(panel, /onRetry=\{retryBilling\}/);
    assert.match(panel, /status === null[\s\S]{0,80}<ShimmerRows rows=\{3\}/);
  }
});

test("an older status request cannot overwrite a successful mutation", () => {
  assert.match(source, /const statusRequestGenerationRef = useRef\(0\)/);
  assert.match(source, /const generation = \+\+statusRequestGenerationRef\.current/);
  assert.equal(
    source.match(/if \(cancelled \|\| generation !== statusRequestGenerationRef\.current\) return/g)?.length,
    2,
    "both successful and failed older reads must be ignored",
  );

  const commit = functionBody("commitImport", "disconnect");
  const disconnect = source.slice(source.indexOf("  async function disconnect"), source.indexOf("\n\n  return (", source.indexOf("  async function disconnect")));
  for (const mutation of [commit, disconnect]) {
    const invalidate = mutation.indexOf("statusRequestGenerationRef.current += 1");
    const apply = mutation.indexOf("setStatus(next)");
    assert.notEqual(invalidate, -1, "mutation must invalidate older status reads");
    assert.notEqual(apply, -1, "mutation must apply its returned status");
    assert.ok(invalidate < apply, "status reads must be invalidated before mutation state is applied");
  }
});

test("in-panel routes to LinkedIn restore focus to the persistent selected tab", () => {
  assert.match(source, /const pendingTabFocusRef = useRef<NetworkTab \| null>\(null\)/);
  assert.match(source, /function chooseTab\(next: NetworkTab, options: \{ focusTab\?: boolean \} = \{\}\)/);
  assert.match(source, /if \(pendingTabFocusRef\.current !== tab\) return;\s*pendingTabFocusRef\.current = null;\s*tabRefs\.current\[tab\]\?\.focus\(\);/);
  assert.equal(
    source.match(/chooseTab\("linkedin", \{ focusTab: true \}\)/g)?.length,
    2,
    "both retained-data and empty-state actions must hand focus to LinkedIn",
  );
});

test("LinkedIn import consent stays authoritative and the visible chooser owns keyboard focus", () => {
  const commit = functionBody("commitImport", "disconnect");
  assert.match(commit, /if \(!preview \|\| !consent \|\| !consentRef\.current\) return/);
  assert.match(source, /const previewRequestGenerationRef = useRef\(0\)/);
  assert.match(source, /const consentRef = useRef\(false\)/);
  assert.match(source, /if \(generation !== previewRequestGenerationRef\.current \|\| !consentRef\.current\) return/);
  assert.match(source, /function changeConsent\(nextConsent: boolean\)[\s\S]*if \(!nextConsent\) \{\s*previewRequestGenerationRef\.current \+= 1;[\s\S]{0,160}setPreview\(null\)/);
  assert.match(source, /type="file"[^>]*hidden/);
  const previewPanel = source.slice(source.indexOf("{preview &&"), source.indexOf("</Card>", source.indexOf("{preview &&")));
  assert.match(previewPanel, /disabled=\{!consent \|\| busy\}/);
});

test("a held network mutation keeps exclusive ownership of its busy state", () => {
  assert.match(source, /type NetworkOperationKind = "preview" \| "commit" \| "disconnect" \| "delete"/);
  assert.match(source, /const operationRef = useRef<NetworkOperation \| null>\(null\)/);
  assert.match(source, /function beginOperation\(kind: NetworkOperationKind\)[\s\S]*if \(operationRef\.current\) return null;[\s\S]*operationRef\.current = owner;[\s\S]*setOperation\(owner\)/);
  assert.match(source, /function finishOperation\(owner: NetworkOperation\)[\s\S]*if \(operationRef\.current !== owner\) return;[\s\S]*operationRef\.current = null;[\s\S]*setOperation\(null\)/);

  const commit = functionBody("commitImport", "disconnect");
  const disconnect = source.slice(source.indexOf("  async function disconnect"), source.indexOf("\n\n  return (", source.indexOf("  async function disconnect")));
  assert.match(commit, /const owner = beginOperation\("commit"\);\s*if \(!owner\) return/);
  assert.match(commit, /finally \{\s*finishOperation\(owner\)/);
  assert.match(disconnect, /if \(operationRef\.current\) return/);
  assert.match(disconnect, /const owner = beginOperation\(removeData \? "delete" : "disconnect"\);\s*if \(!owner\) return/);
  assert.match(disconnect, /finally \{\s*finishOperation\(owner\)/);
});

test("preview revocation cannot release a held commit, disconnect, or delete", () => {
  const consentChange = source.slice(source.indexOf("  function changeConsent"), source.indexOf("  function chooseFile"));
  assert.match(consentChange, /if \(activeOperation && activeOperation\.kind !== "preview"\) return/);
  assert.match(consentChange, /if \(activeOperation\?\.kind === "preview"\) finishOperation\(activeOperation\)/);
  assert.doesNotMatch(consentChange, /setOperation\(null\)/);

  assert.match(source, /const mutationBusy = operationKind !== null && operationKind !== "preview"/);
  assert.match(source, /type="checkbox" checked=\{consent\} disabled=\{mutationBusy\}/);
  assert.match(source, /type="file" accept="\.csv,text\/csv" hidden disabled=\{busy\}/);
  assert.match(source, /data-network-operation=\{operationKind \?\? "idle"\}/);
  assert.match(source, /aria-busy=\{busy\}/);
});

test("an old preview completion cannot release a newer operation", () => {
  const previewImport = functionBody("previewImport", "commitImport");
  assert.match(previewImport, /const owner = beginOperation\("preview"\)/);
  assert.match(previewImport, /if \(generation === previewRequestGenerationRef\.current\) finishOperation\(owner\)/);
  assert.match(source, /if \(operationRef\.current !== owner\) return/);
});
