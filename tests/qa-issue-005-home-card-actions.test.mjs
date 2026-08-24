import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

test("Home keeps job actions inside each card and one primary action near the job", () => {
  assert.match(
    source,
    /<ButtonLink href="\/dashboard\/applications\?new=1&intent=fill" variant="secondary">\s*Fill application\s*<\/ButtonLink>/,
  );
  assert.match(
    source,
    /className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4"/,
  );
  assert.match(
    source,
    /href=\{`\/dashboard\/applications\?job=\$\{job\.id\}&intent=fill`\}[^>]+bg-action/,
  );
});
