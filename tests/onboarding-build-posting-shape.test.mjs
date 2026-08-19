import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* THE POSTING THE BUILD TAILORS AGAINST HAS TO BE THE POSTING, NOT THE ENVELOPE AROUND IT.
 *
 * Found by walking production. Every onboarding build failed at the resume stage with "Invalid
 * request body / company: Required, role: Required, jd_text: Required" - an error naming three
 * fields the client believed it had sent. GET /jobs/:id answers `{ job: {...} }`, `getJob` cast
 * that envelope straight to MonitoredJob, and so `full.description`, `full.title` and
 * `full.company_name` were all undefined. JSON.stringify then DROPPED them, which is why the
 * request arrived missing fields rather than carrying nulls.
 *
 * Nothing caught it: `api<T>()` is an unchecked cast, so the compiler saw three strings where
 * there were three undefineds, and the e2e specs stub the endpoint with the unwrapped shape.
 *
 * This is a source assertion rather than a behavioural one for that exact reason - the defect
 * lives in the gap between the real response and every stub of it, so a test that stubs the
 * response cannot see it. */
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("getJob unwraps the job envelope the route actually sends", async () => {
  const api = await read("lib/api.ts");
  const fn = api.slice(api.indexOf("export function getJob("));
  const body = fn.slice(0, fn.indexOf("\n}"));

  assert.match(body, /api<\{\s*job:\s*MonitoredJob\s*\}>/, "getJob types the response as the bare job again");
  assert.match(body, /\.then\(\(data\) => data\.job\)/, "getJob stopped unwrapping the envelope");
  assert.doesNotMatch(body, /api<MonitoredJob>/, "the envelope is being cast straight to the job again");
});

test("the build sends the three fields the resume route requires", async () => {
  const build = await read("components/start/BuildStep.tsx");
  const deps = build.slice(build.indexOf("loadPosting:"), build.indexOf("loadQuestions:"));

  // Read off the posting, which is what the unwrap above makes real.
  for (const field of ["full.description", "full.title", "full.company_name"]) {
    assert.ok(deps.includes(field), `loadPosting stopped reading ${field}`);
  }
  // And carried into the generate call under the names the backend validates.
  for (const field of ["company:", "role:", "jd_text:"]) {
    assert.ok(deps.includes(field), `the generate call stopped sending ${field}`);
  }
});
