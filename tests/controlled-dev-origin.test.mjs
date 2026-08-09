import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const ENV_KEY = "LITOS_TEST_PORTAL_PUBLIC_ORIGIN";

function loadConfig(origin, nodeEnv = "development") {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      "const m=await import('./next.config.ts'); console.log(JSON.stringify(m.default.allowedDevOrigins));",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: nodeEnv,
        [ENV_KEY]: origin,
      },
    },
  );
  return result;
}

test("development admits only the exact configured HTTPS tunnel hostname", () => {
  const result = loadConfig("https://controlled-origin.trycloudflare.com");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), [
    "127.0.0.1",
    "controlled-origin.trycloudflare.com",
  ]);
});

test("a valid tunnel origin is never admitted to a production build", () => {
  const result = loadConfig("https://controlled-origin.trycloudflare.com", "production");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), ["127.0.0.1"]);
});

test("Litos production hosts are rejected in every environment", () => {
  for (const hostname of ["trylitos.com", "www.trylitos.com"]) {
    for (const nodeEnv of ["development", "production"]) {
      const result = loadConfig(`https://${hostname}`, nodeEnv);
      assert.notEqual(result.status, 0, `${hostname} was accepted in ${nodeEnv}`);
      assert.match(result.stderr, /must never name a Litos production host/);
    }
  }
});

test("public origins reject HTTP, custom ports, and non-tunnel hosts", () => {
  for (const origin of [
    "http://controlled-origin.trycloudflare.com",
    "https://controlled-origin.trycloudflare.com:444",
    "https://controlled-origin.example.com",
  ]) {
    const result = loadConfig(origin);
    assert.notEqual(result.status, 0, `${origin} was accepted`);
  }
});

test("the configured value is an origin, never a signed URL or credential carrier", () => {
  for (const origin of [
    "https://controlled-origin.trycloudflare.com/qa/portal-submission",
    "https://controlled-origin.trycloudflare.com?litos_qa_key=secret",
    "https://user:password@controlled-origin.trycloudflare.com",
  ]) {
    const result = loadConfig(origin);
    assert.notEqual(result.status, 0, `${origin} was accepted`);
    assert.match(result.stderr, /must contain only an origin/);
  }
});

test("HTTP remains valid only for an exact loopback origin in development", () => {
  const result = loadConfig("http://127.0.0.1:3300");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), ["127.0.0.1"]);
});
