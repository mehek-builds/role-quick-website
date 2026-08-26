import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const REVISION = "abcdef0123456789abcdef0123456789abcdef01";

function loadConfig(overrides = {}, removed = []) {
  const env = { ...process.env, ...overrides };
  for (const key of removed) delete env[key];
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "-e",
      "import('./next.config.ts').then(({default:c})=>console.log(JSON.stringify(c.env)))",
    ],
    { cwd: ROOT, env, encoding: "utf8" },
  );
}

test("next.config stamps the complete normalised Git revision into the build", () => {
  const result = loadConfig({ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: REVISION.toUpperCase() });
  assert.equal(result.status, 0, result.stderr);
  const env = JSON.parse(result.stdout.trim());
  assert.equal(env.LITOS_WEB_REVISION, REVISION);
  assert.match(env.BUILD_TIME, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("a Vercel build without a complete Git revision fails before deployment", () => {
  for (const revision of [undefined, "0123456", "z".repeat(40)]) {
    const result = revision === undefined
      ? loadConfig({ VERCEL: "1" }, ["VERCEL_GIT_COMMIT_SHA"])
      : loadConfig({ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: revision });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /VERCEL_GIT_COMMIT_SHA/);
  }
});

test("a local build carries an explicit incomplete revision", () => {
  const result = loadConfig({}, ["VERCEL", "VERCEL_GIT_COMMIT_SHA"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout.trim()).LITOS_WEB_REVISION, "local");
});
