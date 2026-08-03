import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ISSUE-015. The App Router had no error boundary anywhere: app/not-found.tsx
 * was the only recovery surface in the product, so any render-time throw
 * produced a blank document with no message and no way back. ISSUE-010 found a
 * dashboard function one malformed API payload away from that outcome.
 *
 * The two properties worth guarding forever are that the boundaries exist and
 * that they never put error text on screen. A boundary that renders
 * `error.message` is worse than none on an authenticated surface, because the
 * messages that reach it carry API shapes and occasionally an identifier. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/* These files explain themselves at length, and the explanations name the very
   things the assertions forbid ("never render error.message"). Assertions about
   what reaches the visitor therefore run against code with the prose removed. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const readCode = async (path) => stripComments(await read(path));

const BOUNDARIES = [
  "app/error.tsx",
  "app/dashboard/error.tsx",
  "app/global-error.tsx",
];

test("the router has a boundary at the root, the dashboard, and below the layout", async () => {
  for (const path of BOUNDARIES) {
    const source = await read(path);
    assert.match(source, /^"use client";/, `${path} must be a client component`);
    assert.match(source, /reset:\s*\(\)\s*=>\s*void/, `${path} must accept reset`);
    assert.match(source, /onClick=\{reset\}/, `${path} must offer reset as a real control`);
  }
});

test("no boundary leaks the error message or the stack to the visitor", async () => {
  for (const path of BOUNDARIES) {
    const source = await readCode(path);
    /* `digest` is allowed and is the point: Next generates it on the server with
       the message stripped, so it is a reference code, not a trace. Everything
       else on the error object is not for the visitor. */
    assert.doesNotMatch(source, /error\.message/, `${path} renders the error message`);
    assert.doesNotMatch(source, /error\.stack/, `${path} renders the stack`);
    assert.doesNotMatch(source, /error\.cause/, `${path} renders the error cause`);
    assert.doesNotMatch(source, /String\(error\)|\{error\}/, `${path} renders the raw error`);
  }
});

test("the recovery copy is plain and calm, in the voice of app/not-found.tsx", async () => {
  const marketing = await readCode("app/error.tsx");
  const dashboard = await readCode("app/dashboard/error.tsx");
  for (const source of [marketing, dashboard]) {
    assert.match(source, /This page did not load\./);
    assert.match(source, /Try again/);
    /* Words that describe the machine rather than the situation. */
    assert.doesNotMatch(source, /\b(exception|stack trace|crashed|fatal|500|undefined)\b/i);
  }
  assert.match(dashboard, /Nothing you saved was lost\./);
});

test("boundaries report one named event and do not turn on automatic error capture", async () => {
  const marketing = await read("app/error.tsx");
  const dashboard = await read("app/dashboard/error.tsx");
  assert.match(marketing, /track\("render_error", \{ surface: "marketing", digest:/);
  assert.match(dashboard, /track\("render_error", \{ surface: "dashboard", digest:/);

  /* The event carries a surface name and a digest. Never the message. */
  for (const source of [marketing, dashboard]) {
    const call = source.slice(source.indexOf('track("render_error"'));
    assert.doesNotMatch(call.slice(0, 200), /message|stack/);
  }

  /* PostHog's own exception capture stays off: the privacy policy says it is
     off, and it would ship the message and stack this whole test forbids. */
  const instrumentation = await read("instrumentation-client.ts");
  assert.match(instrumentation, /capture_exceptions:\s*false/);

  /* global-error.tsx replaces the root layout, so it stays dependency-free:
     every import there is another thing that can throw inside the handler for
     a throw. */
  const global = await read("app/global-error.tsx");
  assert.doesNotMatch(global, /@\/lib\/analytics/);
});

test("the privacy policy discloses what a recovery screen sends", async () => {
  const privacy = await read("app/privacy/page.tsx");
  assert.match(privacy, /a page fails to load and shows you a recovery screen/);
  assert.match(privacy, /without\s+the error text/);
});
