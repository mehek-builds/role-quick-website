import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

test("presentation imports features only through their public APIs", () => {
  const presentationFiles = [
    ...sourceFiles(`${root}/app`),
    ...sourceFiles(`${root}/components`),
  ];

  for (const file of presentationFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /@\/features\/[^/"']+\/(?:domain|application|infrastructure)\//,
      `${file} bypasses a feature public API`,
    );
  }
});

test("domain modules do not depend on framework or infrastructure code", () => {
  const domainDirectories = sourceFiles(`${root}/features`)
    .filter((file) => file.includes("/domain/") && !file.includes(".test."));

  for (const file of domainDirectories) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from ["'](?:react|next(?:\/[^"']*)?)["']/, `${file} imports a framework`);
    assert.doesNotMatch(source, /from ["'][^"']*infrastructure[^"']*["']/, `${file} imports infrastructure`);
  }
});

test("every feature exposes one stable public entry point", () => {
  for (const entry of readdirSync(`${root}/features`, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    assert.equal(
      statSync(`${root}/features/${entry.name}/index.ts`).isFile(),
      true,
      `${entry.name} needs an index.ts public API`,
    );
  }
});
