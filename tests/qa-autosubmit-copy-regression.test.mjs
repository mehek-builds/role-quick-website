import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const jobsBoard = readFileSync(new URL("../app/browse-jobs/page.tsx", import.meta.url), "utf8");

test("marketing states the default review path without erasing opt-in auto-submit", () => {
  assert.match(homepage, /By default, we wait for you to check/);
  assert.match(jobsBoard, /By default,[\s\S]*nothing is sent until you read it/);
  assert.match(jobsBoard, /Auto-submit[\s\S]*only if you turn it on/);
  assert.match(jobsBoard, /cancelable countdown/);
  assert.doesNotMatch(jobsBoard, /form filled in\. Nothing is sent/);
});
