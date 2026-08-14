import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completeOperationId, operationIdFor } from "../lib/operation-id.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("one exact generation action reuses its UUID until success", () => {
  const registry = new Map();
  const first = operationIdFor(registry, "resume:job-1");
  const retry = operationIdFor(registry, "resume:job-1");
  assert.equal(first, retry);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  completeOperationId(registry, "resume:job-1");
  assert.notEqual(operationIdFor(registry, "resume:job-1"), first);
});

test("every website generation call sends a stable operation id", async () => {
  const [home, applications, outreach, bodyBuilder] = await Promise.all([
    read("app/dashboard/page.tsx"),
    read("app/dashboard/applications/page.tsx"),
    read("app/dashboard/outreach/page.tsx"),
    read("features/applications/domain/daily-matches.ts"),
  ]);

  assert.match(bodyBuilder, /operation_id: operationId/);
  assert.equal((home.match(/operationIdFor\(resumeOperationIds\.current, job(?:\.id|Id)\)/g) ?? []).length, 2);
  assert.equal((home.match(/resumeGenerationBody\([^\n]+operationId\)/g) ?? []).length, 2);
  assert.match(applications, /operationIdFor\(resumeOperationIds\.current, operationKey\)/);
  assert.match(applications, /operation_id: operationId,[\s\S]*initiation: "explicit_click"/);
  assert.match(applications, /operationIdFor\(coverLetterOperationIds\.current, operationKey\)/);
  assert.match(applications, /\/cover-letter`, \{[\s\S]*operation_id: operationId,[\s\S]*options\.jdText/);
  assert.match(outreach, /operationIdFor\(draftOperationIds\.current, operationKey\)/);
  assert.match(outreach, /operation_id: operationId/);
  assert.match(outreach, /operationIdFor\(contactOperationIds\.current, operationKey\)/);
  assert.doesNotMatch(outreach, /operation_id: crypto\.randomUUID\(\)/);
});
