import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/user-facing-error.ts", import.meta.url), "utf8")
  .replace(/export function /, "function ")
  .replace(/value: unknown/g, "value")
  .replace(/\): string/g, ")");
const userFacingError = new Function(`${source}; return userFacingError;`)();

test("technical failures are replaced with safe copy", () => {
  const fallback = "Please try again.";
  for (const message of [
    "browserType.launch: executable doesn't exist at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "spawn chromium ENOENT",
    "Error: failed\n    at launch (/srv/node_modules/playwright/index.js:12:4)",
    "HTTP 502 Bad Gateway",
    "Request failed (500)",
    "Internal Server Error",
    "database connection failed",
    "token=super-secret-value",
    "ECONNREFUSED 127.0.0.1",
  ]) assert.equal(userFacingError(message, fallback), fallback);
});

test("safe business copy remains specific", () => {
  assert.equal(userFacingError("Add the job link first.", "Fallback"), "Add the job link first.");
  assert.equal(userFacingError("", "Fallback"), "Fallback");
});
