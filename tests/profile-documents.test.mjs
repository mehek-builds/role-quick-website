import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * PROFILE > DOCUMENTS: the account-level home for a file the student handed Litos.
 *
 * WHAT WAS WRONG. app/privacy/page.tsx publishes "We encrypt it and keep it until you remove it or
 * delete your account." The control that removes it lived only inside TranscriptModal, and that
 * modal opens only from a control on an application screen. Two rounds of fixes tried to keep that
 * control reachable by binding it to per-application UI state, and both sprang leaks in the same
 * place: a re-verifier confirmed the control was still unreachable once an application left
 * needs_attention or ready_for_final_approval, which is the normal terminal state of a sent
 * application. A stored document is an ACCOUNT object and outlives every application it was
 * attached to, so no per-application screen can be its home.
 *
 * WHY THIS FILE IS SOURCE ANALYSIS. `npm test` runs node --experimental-strip-types, which strips
 * TypeScript but cannot compile JSX, so no test in this repo can mount a component. The parts of
 * this feature that ARE executable are tested for real: lib/document-size.test.mts drives the size
 * formatter, and features/applications/domain/submission-checklist.test.mts drives the per-kind
 * control decision. What only this file can pin is that the surface exists, that it is on the route
 * a student is sent to, and that the confirmation step is built out of the accessible pieces.
 */

const card = await readFile(new URL("../components/app/DocumentsCard.tsx", import.meta.url), "utf8");
const settings = await readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8");
const profileRoute = await readFile(new URL("../app/dashboard/profile/page.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../lib/api.ts", import.meta.url), "utf8");
const privacy = await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");

/* Comments are prose, not shipped markup. Every "is it there?" assertion below reads the source with
   comments stripped, so a card that only DESCRIBES a control in a comment cannot satisfy them. */
function shippedCode(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("the promise on /privacy has a control behind it that no application screen owns", async () => {
  /* The sentence and the surface, asserted together on purpose. If the sentence is ever softened
     this test should be revisited rather than silently kept passing by a card nobody needs; if the
     card is ever deleted, the sentence becomes untrue and this fails. */
  // Whitespace-tolerant: the sentence is wrapped across source lines inside its JSX paragraph.
  assert.match(privacy, /keep it until you remove it or delete\s+your account/);
  assert.match(shippedCode(card), /deleteUserDocument\(file\.id\)/);
});

test("the section reads the library, not one application", async () => {
  const shipped = shippedCode(card);
  /* GET /documents is account-scoped and takes no application id. Reading a per-application
     endpoint here would rebuild the exact dependency that made the control unreachable: a list that
     empties when an application reaches a terminal status. */
  assert.match(shipped, /listUserDocuments\(\)/);
  assert.equal(/applications\//.test(shipped), false, "nothing here may be scoped to one application");
  assert.match(api, /export function listUserDocuments\(\): Promise<\{ documents: DocumentSummary\[\] \}>/);
  assert.match(api, /return api<\{ documents: DocumentSummary\[\] \}>\("\/documents"\)/);
});

test("/dashboard/profile lands on the panel the section is in", async () => {
  /* The route is a redirect, and the section has to be in the panel it redirects TO. Filed anywhere
     else, a student following the product's own "your profile" link would land on a page that does
     not contain the thing this whole feature exists to give her. */
  assert.match(profileRoute, /redirect\("\/dashboard\/settings#job-search"\)/);

  const shipped = shippedCode(settings);
  assert.match(shipped, /<DocumentsCard \/>/);
  assert.match(shipped, /import DocumentsCard from "@\/components\/app\/DocumentsCard"/);

  /* INSIDE the job-search tabpanel, never a sibling of it. ISSUE-013b is the record of what happens
     otherwise: a card outside the region the tab's aria-controls names is a card a screen reader
     user moving panel to panel never reaches, which is how Export data and Delete account came to
     sit outside their own panel. */
  const panel = shipped.slice(shipped.indexOf('{activeTab === "job-search"'), shipped.indexOf('{activeTab === "sign-in"'));
  assert.ok(panel.includes("<DocumentsCard />"), "the section must render inside the job-search panel");
});

test("each row says what the file is, how big, when it arrived and whether it has ever been used", () => {
  const shipped = shippedCode(card);
  assert.match(shipped, /\{file\.file_name\}/);
  assert.match(shipped, /formatDocumentBytes\(file\.byte_size\)/);
  assert.match(shipped, /Added \$\{formatDate\(file\.created_at\)\}/);
  /* Never-used is stated rather than left blank: a gap in a row of facts reads as missing data. */
  assert.match(shipped, /Last used \$\{formatRelativeDate\(file\.last_used_at\)\}/);
  assert.match(shipped, /Not used on an application yet/);
});

test("the section builds none of the things it was told not to build", () => {
  const shipped = shippedCode(card);
  for (const absent of [/type="file"/, /FormData/, /attachApplicationDocument/, /onDrop/]) {
    assert.equal(absent.test(shipped), false, `${absent} does not belong on an account page`);
  }
});

test("the empty state states a fact and asks for nothing", () => {
  const shipped = shippedCode(card);
  assert.match(shipped, /Litos is not storing any files for you\./);
  /* Most students will never have a document, so this is the state the card spends its life in. It
     is one sentence with no control under it: a button inviting an upload would be an account page
     asking a student for a transcript nobody wants. */
  const empty = shipped.slice(shipped.indexOf("{empty && ("), shipped.indexOf("{documents && documents.length > 0 && ("));
  assert.equal(/<Button/.test(empty), false, "the empty state must not carry a call to action");
});

/* MERGE ORDER, WHICH IS NOT A HYPOTHETICAL HERE.
 *
 * Both repos deploy to production on merge to main and this feature is two separate pull requests,
 * so there is a window in which this component is live and GET /documents is not. An error card in
 * that window is a permanent failure on EVERY signed-in student's account page, for a feature almost
 * none of them use. Rendering nothing claims nothing, which is the only state that is honest while
 * the route is missing AND while it is merely down. */
test("a list that cannot be read renders nothing at all, never an error and never an empty library", () => {
  const shipped = shippedCode(card);
  assert.match(shipped, /setLoadFailed\(true\)/);
  assert.match(shipped, /if \(loadFailed\) return null;/);

  assert.equal(/<ErrorNote message=\{loadError\}/.test(shipped), false, "a missing endpoint is not this student's error to read");
  assert.equal(/Try again/.test(shipped), false, "a retry against a route that does not exist is an invitation to press it forever");
  assert.equal(/This does not mean Litos is holding nothing/.test(shipped), false, "there is no card left for that to sit in");

  /* Still not allowed: the empty state standing in for a failure. "You have no files" is a claim
     about what Litos is holding that a request which failed cannot make, and a student who came here
     to delete a transcript would read it as proof the file was already gone. */
  assert.match(shipped, /const empty = documents !== null && documents\.length === 0/);
});

test("deleting is confirmed first, and the confirmation is honest about its own reach", async () => {
  const shipped = shippedCode(card);
  const copy = shippedCode(await readFile(new URL("../lib/document-removal.ts", import.meta.url), "utf8"));

  // The delete call is reachable only from the dialog's own submit, never straight off a row.
  assert.match(shipped, /onSubmit=\{\(event\) => \{\s*event\.preventDefault\(\);\s*void remove\(confirming\);/);
  assert.match(shipped, /setConfirming\(file\)/);
  assert.match(shipped, /DOCUMENT_REMOVAL_CONSEQUENCES\.map/);

  /* THE SENTENCE THE REQUEST DOES NOT BACK UP. This read "Any application you have not sent yet
     stops carrying it", and nothing in DELETE /documents/:id does that: the route deletes the blob
     and tombstones the row, and deliberately leaves every application's own spec pointer alone so a
     sent application can still name what went out with it. The other delete path on this branch
     calls the detach endpoint explicitly, precisely because nothing else will. */
  const surface = `${shipped}\n${copy}`;
  assert.equal(/stops carrying it/.test(surface), false, "the delete request detaches nothing");
  assert.match(copy, /An application you have not sent yet still names this file\./);
  assert.match(copy, /attach a copy before you send it/);
  assert.match(copy, /Litos asks you for it again rather than reusing this/);
  assert.match(copy, /An employer who already received it keeps their copy/);
  assert.match(copy, /Removing it here does not reach\s+them/);
  assert.match(copy, /You cannot undo this\./);

  /* The claim this copy must never make. Litos cannot withdraw a document from an employer's
     system, and a student pressing Remove after a rejection is often trying to do exactly that. */
  for (const overclaim of [/deleted from the employer/i, /withdraw/i, /recall/i]) {
    assert.equal(overclaim.test(surface), false, `${overclaim} promises a reach this product does not have`);
  }
});

/* ONE OBJECT, ONE TREATMENT.
 *
 * The upload modal deletes the same stored file through the same endpoint. It did it on a single
 * click, with no confirmation and nothing said about what deletion reaches, one control away from a
 * green Send button, while this card confirmed first and explained. Two answers to "what happens if
 * I press this" for one object is how the weaker one ends up being the one she meets. */
test("the modal deletes the same file with the same confirmation, in the same words", async () => {
  const modal = shippedCode(await readFile(new URL("../components/app/TranscriptModal.tsx", import.meta.url), "utf8"));

  assert.equal(
    /onClick=\{\(\) => void remove\(\)\} variant="quiet"/.test(modal),
    false,
    "Remove this file may not be wired straight to the delete",
  );
  assert.match(modal, /setConfirmingRemoval\(true\)/);
  assert.match(modal, /stage === "attached" && confirmingRemoval/);
  assert.match(modal, /DOCUMENT_REMOVAL_CONSEQUENCES\.map/);

  // Focus lands on Keep here too, by the same query, because Button forwards no ref.
  assert.match(modal, /data-confirm-keep="true"/);
  assert.match(modal, /querySelector<HTMLElement>\("\[data-confirm-keep\]"\)\?\.focus\(\)/);

  // Both surfaces read one module, so the two accounts cannot drift apart again.
  for (const source of [modal, shippedCode(card)]) {
    assert.match(source, /from "@\/lib\/document-removal"/);
  }
});

/* TWO DIFFERENT DECISIONS, TWO DIFFERENT CONTROLS, and the second one is what the reuse made
 * necessary.
 *
 * A file she uploaded once and left the reuse checkbox ticked on is now attached to later
 * applications by the prepare run, without asking her, which is the promise the checkbox and
 * /privacy both make. The only removal on this modal deletes the file everywhere, so before this the
 * answer to "not this employer" was "then Litos forgets your transcript and asks for it again next
 * time". A student who wants one employer skipped had to give up the whole thing.
 *
 * The account-level delete keeps its confirmation and its four consequences. This one takes nothing
 * away that she cannot get back, so it does not ask twice.
 */
test("a reused file can be taken off one application without being deleted from the account", async () => {
  const modal = shippedCode(await readFile(new URL("../components/app/TranscriptModal.tsx", import.meta.url), "utf8"));

  assert.match(modal, /async function detach\(\) \{[\s\S]{0,400}?await detachApplicationDocument\(applicationId, kind\)/);
  assert.match(modal, /onClick=\{\(\) => void detach\(\)\} variant="secondary"/);
  assert.match(modal, /Not for \$\{company\}/, "the control has to name the employer it is about");
  // It clears this application's mark and nothing else: no deleteUserDocument on this path.
  const detach = modal.slice(modal.indexOf("async function detach()"), modal.indexOf("async function remove()"));
  assert.equal(/deleteUserDocument/.test(detach), false, "taking a file off one employer must not delete it from her account");
  assert.match(detach, /onAttachmentChange\(kind, null\)/);
  /* Focus, for the same reason the delete path manages it: the stage changes under the control that
     had focus, and <body> is outside this component's hand-built trap. */
  assert.match(detach, /closeButton\.current\?\.focus\(\)/);
  // And the account-level delete still confirms first. One control losing its confirmation to a
  // sibling that does not need one is exactly how the weaker treatment spreads.
  assert.match(modal, /setConfirmingRemoval\(true\)/);
});

/* THE FOCUS THE FAILURE PATH USED TO LOSE.
 *
 * `disabled` takes the control out of the tab order while it is holding focus, so the browser drops
 * focus to <body>: outside the dialog, outside its trap, with the error that just rendered
 * announcing to nobody. A screen reader user whose delete failed was left at the top of the document
 * with no idea whether her transcript still existed. */
test("the destructive control keeps focus while its own request is in flight", () => {
  const shipped = shippedCode(card);

  assert.match(shipped, /<Button variant="danger" type="submit" aria-disabled=\{deleting\} aria-busy=\{deleting\}>/);
  assert.equal(/type="submit" disabled=\{deleting\}/.test(shipped), false, "disabling the focused control is the defect");

  // The attribute is no longer the re-entry guard, so the handler has to be.
  assert.match(shipped, /async function remove\(file: DocumentSummary\) \{[\s\S]{0,300}?if \(deleting\) return;/);

  /* And the announcement has a region to land in that was there before there was anything to say.
     ONE element, not an ErrorNote inside a live wrapper: a live region nested in a live region is
     two announcements or none depending on the reader. */
  assert.match(shipped, /role="alert"\s*\n\s*aria-live="assertive"/);
  assert.match(shipped, /\{deleteError \? userFacingError\(deleteError\) : ""\}/);
  assert.equal(/<ErrorNote/.test(shipped), false, "the box carried a second role=alert inside the region");
});

test("the confirmation is keyboard reachable, focus-managed, and announces its result", () => {
  const shipped = shippedCode(card);

  /* Native <dialog> with showModal, matching the account-deletion confirmation on this same page.
     The browser supplies the focus trap, the Escape handling and the inert background. This product
     already carries two hand-built traps with two different bugs. */
  assert.match(shipped, /<dialog/);
  assert.match(shipped, /const node = dialog\.current;\s*if \(node && !node\.open\) node\.showModal\(\)/);
  assert.match(shipped, /aria-labelledby="remove-document-title"/);
  assert.match(shipped, /aria-describedby="remove-document-description"/);
  assert.match(shipped, /id="remove-document-title"/);
  assert.match(shipped, /id="remove-document-description"/);

  /* Focus lands on Keep. Left to the browser's own rule it takes the first focusable element, and a
     destructive control under a freshly pressed Enter is a confirmation step in name only. */
  assert.match(shipped, /querySelector<HTMLElement>\("\[data-confirm-keep\]"\)\?\.focus\(\)/);
  assert.match(shipped, /data-confirm-keep="true"/);

  // Escape is disarmed only while the request is in flight, so a half-finished delete cannot be
  // closed out from under its own error message.
  assert.match(shipped, /onCancel=\{\(event\) => \{\s*event\.preventDefault\(\);\s*if \(!deleting\) requestDocumentDialogClose\(\);/);

  /* Closing returns focus to the row's own trigger, and to the announcement when that trigger has
     just been deleted with its row. A dialog that closes onto nothing drops a keyboard user at the
     top of the document. */
  assert.match(shipped, /const trigger = closed \? removeButtons\.current\.get\(closed\.id\) : null/);
  assert.match(shipped, /window\.requestAnimationFrame\(\(\) => \{\s*if \(trigger\?\.isConnected\) trigger\.focus\(\);\s*else status\.current\?\.focus\(\)/);
  assert.match(shipped, /requestDocumentDialogClose\(\)/);

  /* The result is announced, and the live region is in the DOM before there is anything to say.
     Rendered only alongside its text, a live region is one a screen reader may never read. */
  assert.match(shipped, /role="status"/);
  assert.match(shipped, /aria-live="polite"/);
  assert.match(shipped, /setRemoved\(`\$\{file\.file_name\} was removed from Litos\.`\)/);

  // Every row's own control is named for its file, not the bare word down a column of identical ones.
  assert.match(shipped, /aria-label=\{`Remove \$\{file\.file_name\}`\}/);
});
