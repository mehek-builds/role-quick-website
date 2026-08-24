import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ISSUE-025, filed as "the application packet dialog has no accessible name"
 * because a live check on /dashboard/applications read `aria-labelledby` and
 * found null. It is null, and the dialog is named anyway: the name comes from
 * `aria-label`, which is the other half of the accname spec and the half that
 * suits this component. The contrast used to be drawn against the review drawer
 * in app/dashboard/page.tsx, which could point `aria-labelledby` at
 * `id="review-title"` because there was exactly one drawer on that page. That
 * drawer has since been deleted (reviewing a packet is one screen now), so the
 * comparison is historical, but it is the clearest way to say why this component
 * differs. The packet dialog is instantiated per packet and its own scroll
 * spy already scopes every lookup to `dialog.current` rather than to
 * document.getElementById, on the recorded grounds that its section ids are not
 * unique across instances. Naming it by id would reintroduce the collision the
 * rest of the file works to avoid, and the interpolated label carries the role
 * AND the company, where the visible heading carries only the role.
 *
 * Driving the real thing at /qa/packet/dashboard confirmed the rest of the
 * modal contract on the same pass: focus is trapped in both directions, Escape
 * closes, focus returns to the trigger, and body scroll is restored. So this
 * suite exists to pin what was found working rather than to guard a fix, which
 * is the honest reason a false positive should still leave a test behind: the
 * next reader who greps for `aria-labelledby` will find this instead of the
 * ticket again.
 *
 * Static, in the style of tests/header-mobile-nav.test.mjs. These assertions
 * cannot prove the trap holds in a browser, only that the code that made it
 * hold is still there. */

const packet = await readFile(new URL("../components/app/ApplicationPacket.tsx", import.meta.url), "utf8");
const sandbox = await readFile(new URL("../components/PacketViewer.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

/* The dashboard component and the sandbox it is iterated in, held to the same
   contract on purpose: a sandbox that behaves differently stops being one. */
const DIALOGS = [
  ["ApplicationPacket", packet, /aria-label=\{`Application packet: \$\{role\} at \$\{company\}`\}/, /\}, \[requestClose\]\);/],
  ["PacketViewer", sandbox, /aria-label=\{`Application packet: \$\{packet\.role\} at \$\{packet\.company\}`\}/, /\}, \[\]\);/],
];

for (const [name, source, label, trapDependencies] of DIALOGS) {
  test(`${name} names its dialog, and the name says which packet`, () => {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    /* A generic "Dialog" would satisfy an automated name check and tell a
       screen reader nothing. The role and the company are both on screen in the
       header, so both belong in the name. */
    assert.match(source, label, "the dialog must be named after the role and the company");
  });

  test(`${name} traps Tab in DOM order, both directions`, () => {
    /* querySelectorAll returns document order, so first and last are the real
       ends of the ring. Written from a hand-listed array instead, the ends can
       disagree with the order the browser actually walks, the wrap never fires,
       and Tab lands in the page behind the overlay. That is the shape of the
       bug ISSUE-016 shipped in the header. */
    assert.match(source, /dialog\.current\.querySelectorAll<HTMLElement>\(/);
    assert.match(source, /const first = focusable\[0\]/);
    assert.match(source, /const last = focusable\[focusable\.length - 1\]/);
    assert.match(source, /event\.shiftKey && document\.activeElement === first/);
    assert.match(source, /!event\.shiftKey && document\.activeElement === last/);
  });

  test(`${name} closes on Escape, returns focus, and restores scroll`, () => {
    assert.match(source, /event\.key === "Escape"/, "Escape must close the dialog");
    assert.match(source, /closeButton\.current\?\.focus\(\)/, "opening moves focus into the dialog");
    assert.match(source, /previous\?\.focus\?\.\(\)/, "closing returns focus to the trigger");
    /* The prior overflow is captured and put back, not blanked: a blanket reset
       would clobber whatever a surface behind had set for its own reasons. */
    assert.match(source, /const overflow = document\.body\.style\.overflow/);
    assert.match(source, /document\.body\.style\.overflow = "hidden"/);
    assert.match(source, /document\.body\.style\.overflow = overflow/);
  });

  test(`${name} holds onClose in a ref, so the trap survives a parent render`, () => {
    /* The production trap depends on the shared lifecycle's stable requestClose function, while
       the sandbox has no lifecycle hook and still runs on an empty list. Neither keys on onClose:
       an inline callback would otherwise tear the trap down every parent commit and restore focus
       into the page behind the still-open dialog. */
    assert.match(source, /onCloseRef\.current\(\)/);
    assert.match(source, trapDependencies);
  });
}

test("ApplicationPacket restores focus to a stable page heading when its trigger disappears", () => {
  assert.match(packet, /previous\?\.focus\?\.\(\)/);
  assert.match(packet, /previous\?\.isConnected && document\.activeElement === previous/);
  assert.match(packet, /document\.getElementById\("application-ledger-heading"\)/);
  assert.match(packet, /document\.querySelector<HTMLElement>\("\[data-dashboard-job-focus-id\]"\)/);
  assert.match(packet, /document\.querySelector<HTMLElement>\("main h1"\)/);
  assert.match(packet, /candidate\.focus\(\{ preventScroll: true \}\)/);
});

/* The upload modal is the third dialog on this surface and it takes the same shell,
   so the three tests above hold for it too. What is different is the name, and the
   part of the name that was wrong.

   `job_context.role` is optional on every packet built before 2026-07-28 and on
   anything from the extension, so it is routinely an empty string. Interpolated
   into one template, the name came out as "transcript for  at Databricks": a
   doubled space and a preposition with nothing after it. On a visible header that
   is a blemish; on aria-label it is the sentence a screen reader reads aloud the
   moment the dialog opens, and it is the ONLY name this dialog has. The header one
   screen below already branched on the same value, which is what made the single
   template look deliberate. */
const transcript = await readFile(new URL("../components/app/TranscriptModal.tsx", import.meta.url), "utf8");

test("TranscriptModal names its dialog without a hole where the role should be", () => {
  assert.match(transcript, /role="dialog"/);
  assert.match(transcript, /aria-modal="true"/);
  assert.match(
    transcript,
    /const dialogName = role \? `\$\{kind\} for \$\{role\} at \$\{company\}` : `\$\{kind\} for \$\{company\}`/,
    "a missing role has to drop the clause, not interpolate an empty string into it",
  );
  assert.match(transcript, /aria-label=\{dialogName\}/);
});

test("TranscriptModal keeps the trap, the Escape close and the ref that survives the poll", () => {
  /* The 2.5s submission poll re-renders this modal's parent on every tick, which is
     exactly the caller the onCloseRef indirection exists for. */
  assert.match(transcript, /dialog\.current\.querySelectorAll<HTMLElement>\(/);
  assert.match(transcript, /button:not\(\[disabled\]\)/);
  assert.match(transcript, /input:not\(\[type="hidden"\]\):not\(\[disabled\]\)/);
  assert.match(transcript, /style\.display !== "none"[\s\S]{0,180}?style\.visibility !== "hidden"[\s\S]{0,180}?rect\.width > 0[\s\S]{0,80}?rect\.height > 0/);
  assert.match(transcript, /const first = focusable\[0\]/);
  assert.match(transcript, /const last = focusable\[focusable\.length - 1\]/);
  assert.match(transcript, /event\.key === "Escape"/);
  assert.match(transcript, /previous\?\.focus\?\.\(\)/);
  assert.match(transcript, /onCloseRef\.current\(\)/);
  assert.match(transcript, /\}, \[requestClose\]\);/);
});

test("TranscriptModal keeps async initiators focused through deferred success and failure", () => {
  /* Native disabled is allowed only for the attach control's no-file state. Once a request starts,
     all three initiators stay in the tab ring with aria-disabled while their handler-level busy
     guard prevents a second request. A failed request therefore leaves focus on the same control;
     a successful stage replacement first moves it to Close, which survives every modal stage. */
  assert.match(
    transcript,
    /data-transcript-action="attach"[\s\S]{0,240}?disabled=\{!chosen\}[\s\S]{0,160}?aria-disabled=\{busy !== null\}[\s\S]{0,100}?aria-busy=\{busy === "attaching"\}/,
  );
  assert.match(
    transcript,
    /data-transcript-action="order"[\s\S]{0,240}?aria-disabled=\{busy !== null\}[\s\S]{0,100}?aria-busy=\{busy === "ordering"\}/,
  );
  assert.match(
    transcript,
    /data-transcript-action="detach"[\s\S]{0,280}?aria-disabled=\{busy !== null\}[\s\S]{0,100}?aria-busy=\{busy === "detaching"\}/,
  );
  assert.doesNotMatch(transcript, /data-transcript-action="(?:attach|order|detach)"[^>]*disabled=\{busy !== null\}/);
  assert.match(transcript, /async function attach\(\) \{\s*if \(!chosen \|\| busy\) return;/);
  assert.match(transcript, /async function recordOrdered\(\) \{\s*if \(busy\) return;/);
  assert.match(transcript, /async function detach\(\) \{\s*if \(busy\) return;/);
  assert.match(
    transcript,
    /const result = await attachApplicationDocument[\s\S]{0,420}?closeButton\.current\?\.focus\(\);[\s\S]{0,100}?setLocalAttachment\(result\.attachment\)/,
    "attach success must focus a control that survives the stage replacement before committing it",
  );
  assert.match(
    transcript,
    /async function detach\(\)[\s\S]{0,280}?await detachApplicationDocument[\s\S]{0,500}?setLocalAttachment\(null\)[\s\S]{0,300}?closeButton\.current\?\.focus\(\)/,
    "detach success must finish on a control that survives the stage replacement",
  );
  const unofficialAction = transcript.slice(
    transcript.lastIndexOf("<Button", transcript.indexOf("Attach an unofficial copy anyway")),
    transcript.indexOf("Attach an unofficial copy anyway") + "Attach an unofficial copy anyway".length,
  );
  assert.match(unofficialAction, /closeButton\.current\?\.focus\(\);\s*setUnofficialChosen\(true\)/);
  const keepAction = transcript.slice(
    transcript.indexOf('data-confirm-keep="true"'),
    transcript.indexOf("aria-disabled={busy !== null}", transcript.indexOf('data-confirm-keep="true"')),
  );
  assert.match(keepAction, /closeButton\.current\?\.focus\(\);\s*setConfirmingRemoval\(false\)/);
});

/* Was "the review drawer keeps its own naming pattern, which is the one-per-page
   case", pinning aria-labelledby="review-title" on the dashboard drawer as the
   deliberate counter-example to the packet dialog's aria-label.

   The drawer is gone. Reviewing a packet happens on /dashboard/applications and
   nowhere else, so the dashboard has no modal to name. The contrast the old test
   drew is preserved in the header comment above, because the REASON the packet
   dialog uses aria-label is still worth knowing and no longer has a live foil.

   What is pinned now is the absence: Home must not grow another dialog. A second
   review surface on this page is exactly what was removed, and it took two
   separate fixes before anyone noticed it was a duplicate rather than a screen
   with bugs. */
test("Home has no dialog of its own", () => {
  assert.doesNotMatch(dashboard, /role="dialog"/, "reviewing a packet is one screen; Home links to it");
  assert.doesNotMatch(dashboard, /aria-modal/);
  assert.doesNotMatch(dashboard, /aria-labelledby="review-title"/);
});
