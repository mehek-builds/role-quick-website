import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* THE DEAD END: "Update the Litos extension from the Chrome Web Store, then try again." named a
 * destination the screen would not take her to. The listing is addressed by a 32-character
 * extension id nobody can guess or search for, so the sentence was an instruction she could not
 * follow from the page she was stuck on. Measured live on the applications composer, 2026-08-26:
 * pressing "Fill application" refused with exactly that sentence and offered no way forward.
 *
 * Evaluated from source in this repo's established style (see user-facing-error.test.mjs), so the
 * predicate is exercised for real rather than pinned as text. The one import is replaced with the
 * URL read out of lib/config.ts, which also proves the two stay in step: change the id in config
 * and this test follows it rather than pinning a stale second copy. */
const configSource = readFileSync(new URL("../lib/config.ts", import.meta.url), "utf8");
const storeUrl = configSource.match(/export const STORE_URL\s*=\s*"([^"]+)"/)?.[1]
  ?? configSource.match(/export const STORE_URL\s*=\s*\n\s*"([^"]+)"/)?.[1];
assert.ok(storeUrl, "could not read STORE_URL out of lib/config.ts");

const moduleSource = readFileSync(
  new URL("../lib/extension-store-link.ts", import.meta.url),
  "utf8",
)
  .replace(/import \{ STORE_URL \} from "\.\/config";/, `const STORE_URL = ${JSON.stringify(storeUrl)};`)
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ")
  .replace(/message: string \| null \| undefined/g, "message")
  .replace(/\): boolean/g, ")");
const { messageAsksForTheExtension, EXTENSION_STORE_URL } = new Function(
  `${moduleSource}; return { messageAsksForTheExtension, EXTENSION_STORE_URL };`,
)();

describe("an extension refusal carries a link to the extension", () => {
  test("the install and update refusals both ask for the store", () => {
    for (const message of [
      "Update the Litos extension from the Chrome Web Store, then try again.",
      "Update the Litos extension from the Chrome Web Store, then try again. This saved application needs the current version.",
      "Install the Litos extension and sign in to this account before filling the company form.",
    ]) {
      assert.equal(messageAsksForTheExtension(message), true, message);
    }
  });

  test("a refusal the store cannot answer gets no link", () => {
    /* Already installed and already current - it is signed in to the WRONG ACCOUNT. Sending her to
       the store would contradict the sentence beside it, which is worse than offering nothing. */
    assert.equal(
      messageAsksForTheExtension(
        "The Litos extension is signed in to another account. Sign out there, then try again.",
      ),
      false,
    );
    for (const unrelated of [
      "Chrome blocked the company tab. Allow pop-ups for Litos, then try again.",
      "Litos could not prepare a safe company tab. Nothing was opened.",
      "",
      null,
      undefined,
    ]) {
      assert.equal(messageAsksForTheExtension(unrelated), false, String(unrelated));
    }
  });

  test("the link points at the real listing and reuses the site's one copy of the id", () => {
    assert.match(EXTENSION_STORE_URL, /^https:\/\/chromewebstore\.google\.com\/detail\/[a-p]{32}$/);
    assert.equal(EXTENSION_STORE_URL, storeUrl);
  });
});

describe("the link renders inside the shared error notice, so every surface gets it", () => {
  const ui = readFileSync(new URL("../components/app/ui.tsx", import.meta.url), "utf8");

  test("Notice renders the link, keyed on the resolved text rather than the raw message", () => {
    /* userFacingError rewrites what is shown, so testing the input would decide the link from a
       sentence the applicant never reads. */
    assert.match(
      ui,
      /const text = variant === "error" \? userFacingError\(message\) : message;/,
      "Notice must resolve the display text once and key the link on it",
    );
    assert.match(
      ui,
      /\{messageAsksForTheExtension\(text\) && <> <ExtensionStoreLink \/><\/>\}/,
      "the link must be gated on the resolved text and render inside the notice",
    );
  });

  test("the link opens the store safely in a new tab", () => {
    assert.match(ui, /href=\{EXTENSION_STORE_URL\}/);
    assert.match(ui, /rel="noopener noreferrer"/);
    assert.match(ui, /Get the Litos extension/);
  });

  test("it is defined once and reused, not copied per call site", () => {
    assert.equal(
      [...ui.matchAll(/export function ExtensionStoreLink/g)].length,
      1,
      "exactly one definition, exported for other surfaces to reuse",
    );
    const page = readFileSync(
      new URL("../app/dashboard/applications/page.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      page,
      /function ExtensionStoreLink/,
      "the applications screen must import the shared component, never redefine it",
    );
    assert.match(page, /ExtensionStoreLink,/, "and must import it from components/app/ui");
  });
});

describe("the composer keeps its pinned alert shape while still offering the way out", () => {
  const page = readFileSync(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  /* These three are the invariants two OTHER regression suites already own
     (composer-refusal-placement, composer-error-placement), restated here so that a future change
     to the extension link is told immediately that it broke them, rather than finding out from a
     suite whose name says nothing about extensions. They are the reason the link is a sibling of
     the alert and reads a flag rather than the message. */
  test("the alert paragraph is untouched: one refusal.message, one live region", () => {
    assert.match(
      page,
      /role="alert">\{refusal\.message\}<\/p>/,
      "the pinned paragraph shape must survive the link being added beside it",
    );
    assert.equal(
      [...page.matchAll(/refusal\.message/g)].length,
      1,
      "still exactly one refusal.message: a second read would announce the refusal twice",
    );
  });

  test("the link is a sibling gated on a flag decided where the refusal was built", () => {
    assert.match(page, /\{refusal\.needsExtension && <ExtensionStoreLink \/>\}/);
    assert.match(
      page,
      /needsExtension: messageAsksForTheExtension\(message\)/,
      "refuseInComposer must decide it once, so every caller is covered without opting in",
    );
  });

  test("the SubmissionScreen extension error keeps its own pinned paragraph too", () => {
    assert.match(
      page,
      /\{extensionFillError && \(\s*\n\s*<p role="alert"[^>]*>\{extensionFillError\}<\/p>\s*\n\s*\)\}/,
      "captcha-extension-recovery pins this verbatim; the link goes beside it, not inside it",
    );
    assert.match(page, /\{messageAsksForTheExtension\(extensionFillError\) && <ExtensionStoreLink/);
  });
});
