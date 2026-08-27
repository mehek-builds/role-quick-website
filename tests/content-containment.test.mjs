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
