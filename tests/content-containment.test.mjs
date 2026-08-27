import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the shared button wraps content without expanding its viewport", async () => {
  const source = await read("components/app/Button.tsx");

  assert.match(source, /min-w-0 max-w-full/);
  assert.match(source, /whitespace-normal/);
  assert.match(source, /\[overflow-wrap:anywhere\]/);
});

test("the shared card can shrink around content without breakpoints", async () => {
  const source = await read("components/app/ui.tsx");

  assert.match(source, /className=\{`min-w-0 rounded-card[^`]+\[overflow-wrap:anywhere\]/);
});

test("the shared chip wraps labels inside its available width", async () => {
  const source = await read("components/app/ui.tsx");

  assert.match(source, /inline-flex min-w-0 max-w-full items-center rounded-full[^`]+\[overflow-wrap:anywhere\]/);
});

test("the shared meter gives dynamic labels a shrinkable column", async () => {
  const source = await read("components/app/ui.tsx");

  assert.match(source, /flex min-w-0 items-baseline justify-between gap-3/);
  assert.match(source, /min-w-0 text-sm font-medium text-ink \[overflow-wrap:anywhere\]/);
  assert.match(source, /shrink-0 font-mono text-xs text-muted/);
});

test("pending labels wrap only when their container runs out of room", async () => {
  const source = await read("components/app/ui.tsx");

  assert.match(source, /inline-flex min-w-0 max-w-full items-center gap-1\.5/);
  assert.match(source, /<span className="min-w-0 \[overflow-wrap:anywhere\]">\{children\}<\/span>/);
});

test("loading cues reserve the orb and wrap a supplied label", async () => {
  const source = await read("components/app/ui.tsx");

  assert.match(source, /flex min-w-0 items-center gap-2/);
  assert.match(source, /aria-hidden="true" className="shrink-0"/);
  assert.match(source, /min-w-0 text-sm text-muted \[overflow-wrap:anywhere\]/);
});

test("empty and retry states wrap server supplied title and body text", async () => {
  const source = await read("components/app/ui.tsx");

  assert.match(source, /min-w-0 border-y border-border py-10 text-center/);
  assert.match(source, /text-base font-medium text-ink \[overflow-wrap:anywhere\]/);
  assert.match(source, /max-w-md text-sm leading-6 text-muted \[overflow-wrap:anywhere\]/);
});
