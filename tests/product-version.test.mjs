import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the compatibility header version comes from package metadata", async () => {
  const [packageJson, productSource] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../lib/product.ts", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  assert.match(productSource, /import packageMetadata from ["']\.\.\/package\.json["']/);
  assert.match(productSource, /WEB_VERSION\s*=\s*packageMetadata\.version/);
  assert.doesNotMatch(productSource, /WEB_VERSION\s*=\s*["']\d/);
});
