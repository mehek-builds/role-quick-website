import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/dashboard/outreach/page.tsx", import.meta.url), "utf8");
const ownerSource = await readFile(new URL("../app/dashboard/outreach/operation-owner.ts", import.meta.url), "utf8");
const shellSource = await readFile(new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url), "utf8");

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test("Outreach uses a durable external-store owner above route children", () => {
  assert.match(ownerSource, /createOutreachOperationOwner/);
  assert.match(ownerSource, /useSyncExternalStore/);
  assert.match(ownerSource, /if \(activeLeaseId !== null\) return null/);
  assert.match(ownerSource, /applicationIds: new Map<string, string>\(\)/);
  assert.match(ownerSource, /contactOperationIds: new Map<string, string>\(\)/);
  assert.match(ownerSource, /draftOperationIds: new Map<string, string>\(\)/);
  assert.match(shellSource, /<BillingProvider>[\s\S]*<OutreachOperationProvider>[\s\S]*\{children\}[\s\S]*<\/OutreachOperationProvider>[\s\S]*<\/BillingProvider>/);
});

test("canonical application ids publish durably before a retired route callback", () => {
  const ensure = between("async function ensureOutreachApplication", "function findContacts");
  assert.match(ensure, /const scopeKey = outreachApplicationScopeKey\(requestedCompany, requestedCompanyDomain, requestedTargetRole\)/);
  assert.match(ensure, /const ownedApplicationId = operationOwner\.applicationIds\.get\(scopeKey\)/);
  assert.match(ensure, /operationOwner\.applicationIds\.set\(scopeKey, applicationId\)/);
  const durablePublish = ensure.indexOf("operationOwner.applicationIds.set(scopeKey, result.application.id)");
  const localGuard = ensure.indexOf("if (isCurrent?.() ?? true) setApplicationId(result.application.id)");
  assert.ok(durablePublish >= 0 && durablePublish < localGuard, "a response must publish its canonical id before the unmounted route guard");
});

test("every request acquires the durable lane before advancing its UI generation", () => {
  const operations = [
    ["function findContacts", "async function draftWithLitos", "contact-discovery", "contactRequestGenerationRef"],
    ["async function draftWithLitos", "async function copyDraft", "draft-generation", "draftRequestGenerationRef"],
    ["async function saveEditedDraft", "async function saveManualDraft", "edited-save", "saveRequestGenerationRef"],
    ["async function saveManualDraft", "useLayoutEffect(() => () => {", "manual-save", "saveRequestGenerationRef"],
  ];

  for (const [start, end, operation, generationRef] of operations) {
    const request = between(start, end);
    const acquire = request.indexOf(`operationOwner.acquire("${operation}")`);
    const blocked = request.indexOf("if (!lease) return;");
    const generation = request.indexOf(`++${generationRef}.current`);
    assert.ok(acquire >= 0, `${operation} must acquire the shared owner`);
    assert.ok(acquire < blocked && blocked < generation, `${operation} must not stale the real request when acquisition is blocked`);
    assert.match(request, /finally \{\s*lease\.settle\(\);\s*\}/);
  }
});

test("operation-id maps survive remount and successful calls retire ids before UI guards", () => {
  const contact = between("function findContacts", "async function draftWithLitos");
  const draft = between("async function draftWithLitos", "async function copyDraft");
  const manual = between("async function saveManualDraft", "useLayoutEffect(() => () => {");

  assert.match(contact, /operationIdFor\(operationOwner\.contactOperationIds, operationKey\)/);
  assert.match(draft, /operationIdFor\(operationOwner\.draftOperationIds, operationKey\)/);
  assert.match(manual, /operationIdFor\(operationOwner\.draftOperationIds, operationKey\)/);

  for (const [request, map, generationRef] of [
    [contact, "contactOperationIds", "contactRequestGenerationRef"],
    [draft, "draftOperationIds", "draftRequestGenerationRef"],
    [manual, "draftOperationIds", "saveRequestGenerationRef"],
  ]) {
    const complete = request.indexOf(`completeOperationId(operationOwner.${map}, operationKey)`);
    const guard = request.indexOf(`if (generation !== ${generationRef}.current) return;`, complete);
    assert.ok(complete >= 0 && complete < guard, `${map} must retire after server success even if its route callback is stale`);
  }
});

test("route unmount invalidates only page callbacks and never releases durable ownership", () => {
  const cleanup = between("useLayoutEffect(() => () => {", "useEffect(() => {");

  assert.match(cleanup, /contactRequestGenerationRef\.current \+= 1/);
  assert.match(cleanup, /draftRequestGenerationRef\.current \+= 1/);
  assert.match(cleanup, /saveRequestGenerationRef\.current \+= 1/);
  assert.doesNotMatch(cleanup, /settle|activeOperation|OperationIds|\.clear\(|set[A-Z]/);
  assert.doesNotMatch(source, /active(?:Contact|Draft|Save)RequestRef/);
  assert.doesNotMatch(source, /useRef\(new Map<string, string>\(\)\)/);
});

test("settled draft mutations trigger one safe list refresh without a second loadAttempt", () => {
  assert.match(source, /const \{ activeOperation, draftsSettledRevision, owner: operationOwner \} = useOutreachOperationOwner\(\)/);
  assert.match(source, /\}, \[draftsSettledRevision, loadAttempt\]\)/);

  const draft = between("async function draftWithLitos", "async function copyDraft");
  const edited = between("async function saveEditedDraft", "async function saveManualDraft");
  const manual = between("async function saveManualDraft", "useLayoutEffect(() => () => {");
  for (const request of [draft, edited, manual]) assert.doesNotMatch(request, /setLoadAttempt/);
});

test("a stale denial or failure cannot publish after the initiating page retires", () => {
  const contact = between("function findContacts", "async function draftWithLitos");
  const draft = between("async function draftWithLitos", "async function copyDraft");
  const edited = between("async function saveEditedDraft", "async function saveManualDraft");
  const manual = between("async function saveManualDraft", "useLayoutEffect(() => () => {");

  const contactCatch = contact.indexOf("} catch");
  const contactGuard = contact.indexOf("if (generation !== contactRequestGenerationRef.current) return;", contactCatch);
  const contactPublish = contact.indexOf("openUpgrade(", contactCatch);
  assert.ok(contactCatch >= 0 && contactGuard >= 0 && contactPublish >= 0, "contact denial needs a catch, stale guard, and upgrade publish");
  assert.ok(contactGuard < contactPublish, "contact denial must be stale-guarded before opening upgrade");

  const draftCatch = draft.indexOf("} catch");
  const draftGuard = draft.indexOf("if (generation !== draftRequestGenerationRef.current) return;", draftCatch);
  const draftPublish = draft.indexOf("openUpgrade(", draftCatch);
  assert.ok(draftCatch >= 0 && draftGuard >= 0 && draftPublish >= 0, "draft denial needs a catch, stale guard, and upgrade publish");
  assert.ok(draftGuard < draftPublish, "draft denial must be stale-guarded before opening upgrade");

  const editedCatch = edited.indexOf("} catch");
  const manualCatch = manual.indexOf("} catch");
  const editedGuard = edited.indexOf("if (generation !== saveRequestGenerationRef.current) return;", editedCatch);
  const editedPublish = edited.indexOf("setComposeError(", editedCatch);
  assert.ok(editedCatch >= 0 && editedGuard >= 0 && editedPublish >= 0, "edited save needs a catch, stale guard, and error publish");
  assert.ok(editedGuard < editedPublish, "edited save must be stale-guarded before publishing an error");

  const manualGuard = manual.indexOf("if (generation !== saveRequestGenerationRef.current) return;", manualCatch);
  const manualPublish = manual.indexOf("setComposeError(", manualCatch);
  assert.ok(manualCatch >= 0 && manualGuard >= 0 && manualPublish >= 0, "manual save needs a catch, stale guard, and error publish");
  assert.ok(manualGuard < manualPublish, "manual save must be stale-guarded before publishing an error");
});

test("draft generation and both save paths snapshot mutable composer inputs", () => {
  const draft = between("async function draftWithLitos", "async function copyDraft");
  for (const field of ["contactName", "contactTitle", "contactEmail", "company", "companyDomain", "targetRole", "draftType", "selectedContact"]) {
    assert.match(draft, new RegExp(`${field}[:,]`), `${field} must be captured before draft generation awaits`);
  }

  const edited = between("async function saveEditedDraft", "async function saveManualDraft");
  for (const field of ["editingDraftId", "subject", "draft", "contactEmail"]) {
    assert.match(edited, new RegExp(`${field}[:,]`), `${field} must be captured before the PATCH`);
  }
  assert.match(edited, /subject: request\.subject[\s\S]*body: request\.draft[\s\S]*contact_email: request\.contactEmail \|\| null/);

  const manual = between("async function saveManualDraft", "useLayoutEffect(() => () => {");
  for (const field of ["applicationId", "contactName", "contactTitle", "contactEmail", "company", "companyDomain", "targetRole", "subject", "draft", "draftType", "selectedContact"]) {
    assert.match(manual, new RegExp(`${field}[:,]`), `${field} must be captured before the manual POST`);
  }
  assert.match(manual, /subject: request\.subject[\s\S]*body: request\.draft/);
});

test("remounted controls derive one disabled lane and truthful labels from the durable snapshot", () => {
  assert.match(source, /const mutationBusy = activeOperation !== null/);
  assert.match(source, /const resolveBusy = activeOperation === "contact-discovery"/);
  assert.match(source, /const draftBusy = activeOperation === "draft-generation"/);
  assert.match(source, /const saveBusy = activeOperation === "edited-save" \|\| activeOperation === "manual-save"/);
  assert.match(source, /disabled=\{mutationBusy \|\| !company\.trim\(\)/);
  assert.match(source, /disabled=\{mutationBusy \|\| !subject\.trim\(\) \|\| !draft\.trim\(\)\}/);
  assert.match(source, /disabled=\{mutationBusy \|\| !contactName\.trim\(\)/);
});

test("editing supersedes only local UI continuations while durable work remains owned", () => {
  const contactInvalidation = between("function invalidateContactRequest", "function invalidateDraftRequest");
  const draftInvalidation = between("function invalidateDraftRequest", "function invalidateComposerRequests");

  assert.match(contactInvalidation, /contactRequestGenerationRef\.current \+= 1/);
  assert.match(draftInvalidation, /draftRequestGenerationRef\.current \+= 1/);
  assert.match(draftInvalidation, /saveRequestGenerationRef\.current \+= 1/);
  assert.doesNotMatch(`${contactInvalidation}${draftInvalidation}`, /settle|activeOperation|OperationIds|setComposeBusy|setResolveBusy/);
});
