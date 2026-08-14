import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const source = readFileSync(new URL("../app/dashboard/jobs/page.tsx", import.meta.url), "utf8");
const page = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("a Jobs row keeps detail and apply as separate intentions", () => {
  test("the row receives both the exact packet and the historical sent fact", () => {
    assert.match(
      page,
      /<JobRow job=\{job\} application=\{jobApplicationFor\(job, applications\)\} applied=\{isJobApplied\(job, applications\)\}/,
      "an ambiguous legacy match can still render Applied without inventing an exact packet link",
    );
    assert.match(page, /\{applied \? \(/, "the sent fact must win before any unsent action is rendered");
  });

  test("the role and company open detail while the sibling CTA continues the packet", () => {
    const start = page.indexOf("function JobRow");
    const end = page.indexOf("function SponsorBadge", start);
    const row = page.slice(start, end);

    assert.match(row, /href=\{jobApplicationDetailHref\(application\)\}/);
    assert.match(row, /href=\{jobApplicationHref\(application\)\}/);
    assert.match(row, /\{jobApplicationActionLabel\(application\)\}/);
    assert.match(row, /href=\{job\.posting_url\}[\s\S]{0,120}target="_blank"/);
    assert.doesNotMatch(
      row,
      /aria-label=\{`View (?:application details|job posting)/,
      "the link name must retain its visible match and sponsorship evidence",
    );
    assert.ok(
      row.indexOf("jobApplicationDetailHref(application)") < row.indexOf("jobApplicationHref(application)"),
      "the detail target and application CTA must be sibling branches, not one link nested in the other",
    );
  });
});
