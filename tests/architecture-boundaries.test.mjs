import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const featuresRoot = resolve(root, "features");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

function moduleSpecifiers(source) {
  const patterns = [
    /\b(?:export|import)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

function featurePathForImport(file, specifier) {
  if (specifier.startsWith("@/features/")) return specifier.slice("@/features/".length).split("/").filter(Boolean);
  if (!specifier.startsWith(".")) return null;

  const target = resolve(dirname(file), specifier);
  const pathFromFeatures = relative(featuresRoot, target);
  if (pathFromFeatures === "" || pathFromFeatures === ".." || pathFromFeatures.startsWith(`..${sep}`)) return null;
  return pathFromFeatures.split(sep).filter(Boolean);
}

function containingFeature(file) {
  const pathFromFeatures = relative(featuresRoot, file);
  if (pathFromFeatures === ".." || pathFromFeatures.startsWith(`..${sep}`)) return null;
  return pathFromFeatures.split(sep)[0] || null;
}

function bypassesFeatureApi(file, specifier) {
  const featurePath = featurePathForImport(file, specifier);
  if (!featurePath) return false;
  const [targetFeature] = featurePath;
  return featurePath.length > 1 && containingFeature(file) !== targetFeature;
}

function isTestFile(file) {
  return /(?:^|\/)tests?\/|\.test\.[cm]?[jt]sx?$/.test(file);
}

function codeWithoutCommentsOrLiterals(source) {
  let result = "";
  let state = "code";
  let quote = "";

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (current === "\n" || current === "\r") {
        state = "code";
        result += current;
      } else result += " ";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else result += current === "\n" || current === "\r" ? current : " ";
      continue;
    }
    if (state === "literal") {
      if (current === "\\") {
        result += "  ";
        index += 1;
      } else if (current === quote) {
        result += " ";
        state = "code";
      } else result += current === "\n" || current === "\r" ? current : " ";
      continue;
    }

    if (current === "/" && next === "/") {
      result += "  ";
      index += 1;
      state = "line-comment";
    } else if (current === "/" && next === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
    } else if (current === '"' || current === "'" || current === "`") {
      result += " ";
      quote = current;
      state = "literal";
    } else result += current;
  }

  return result;
}

test("production and cross-feature imports use stable feature APIs", () => {
  const filesOutsideFeatures = [
    ...sourceFiles(`${root}/app`),
    ...sourceFiles(`${root}/components`),
    ...sourceFiles(`${root}/lib`),
    ...sourceFiles(`${root}/scripts`),
    ...readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
      .map((entry) => `${root}/${entry.name}`),
  ];
  const featureFiles = sourceFiles(featuresRoot);
  const guardedFiles = [...filesOutsideFeatures.filter((file) => !isTestFile(file)), ...featureFiles];

  for (const file of guardedFiles) {
    const source = readFileSync(file, "utf8");
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(bypassesFeatureApi(file, specifier), false, `${file} bypasses a feature public API via ${specifier}`);
    }
  }
});

test("domain modules do not depend on framework or infrastructure code", () => {
  const domainDirectories = sourceFiles(`${root}/features`)
    .filter((file) => file.includes("/domain/") && !file.includes(".test."));

  for (const file of domainDirectories) {
    const source = readFileSync(file, "utf8");
    for (const specifier of moduleSpecifiers(source)) {
      assert.doesNotMatch(specifier, /^(?:react|next)(?:\/|$)/, `${file} imports a framework via ${specifier}`);
      assert.doesNotMatch(specifier, /(?:^|\/)infrastructure(?:\/|$)/, `${file} imports infrastructure via ${specifier}`);
    }
    assert.doesNotMatch(
      codeWithoutCommentsOrLiterals(source),
      /\b(?:window|document|localStorage|sessionStorage|fetch)\b/,
      `${file} uses a browser or network global`,
    );
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
