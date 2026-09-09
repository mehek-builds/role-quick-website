import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

test("Home leads with the pipeline action and keeps one secondary action inside each card", () => {
  assert.match(
    source,
    /<ButtonLink href=\{primaryAction\.href\}>\{primaryAction\.label\}<\/ButtonLink>/,
  );
  assert.match(
    source,
    /className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4"/,
  );
  /* intent=tailor, not intent=fill: the card's one action opens the tailoring screen, which is
     where the resume is written against the posting and where the fill and the send follow. */
  assert.match(
    source,
    /href=\{`\/dashboard\/applications\?job=\$\{job\.id\}&intent=tailor`\}/,
  );
  assert.doesNotMatch(source, /<Link href=\{reviewHref\}/);
});
