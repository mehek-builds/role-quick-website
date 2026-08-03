import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* THE PREVIEW MUST NAME THE APPLICANT, AND IT MUST READ THE BACKEND'S KEYS.
 *
 * Two bugs shipped together in the packet pane and neither one could fail loudly:
 *
 *   1. `ResumePaper` opened with `spec.school` in the name slot. `ResumeSpec` has no name field -
 *      the applicant lives on `_contact.full_name` - so a student checking the document about to
 *      go out read their university where their own name belongs, and the EDUCATION heading
 *      vanished with it. The rendered PDF was correct the whole time, which is what made this so
 *      hard to see: the file was right and the preview of the file was wrong.
 *
 *   2. `contactLine()` looked up "location" and "linkedin" and "website". The backend stores
 *      `_contact` verbatim from the resume request body (routes/resume.ts `_contact: body.contact`),
 *      whose schema is full_name / email / phone / linkedin_url / github_url / portfolio_url. Three
 *      of the five lookups matched nothing, so a LinkedIn on the PDF simply did not appear here.
 *      A missing key is indistinguishable from an empty one after a `.filter(Boolean)`, so it
 *      failed in total silence.
 *
 * The QA harness could not catch either, because its fixture had been written to match the reader
 * rather than the producer: it carried `location` and `linkedin` and no name at all. That is the
 * real lesson and it is why this test pins the fixture too. A sandbox whose data has a different
 * shape from production cannot catch a shape bug, which is the one thing it exists to catch.
 */

/* Comments are stripped before scanning, on purpose and for the same reason the match-score guard
   does it: the explanation of this bug has to be allowed to quote the keys that caused it. Without
   this, the comment above `contactLine` documenting the wrong key names fails the test that exists
   to keep those key names out of the code. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const PACKET = code(readFileSync("components/app/ApplicationPacket.tsx", "utf8"));
const HARNESS = code(readFileSync("app/qa/packet/dashboard/harness.tsx", "utf8"));

/* The backend's contact schema, from student-outreach-backend
   src/routes/resumeRequestSchema.ts. If that schema gains a field, this list is the reminder that
   two repositories have to move together. */
const BACKEND_CONTACT_KEYS = [
  "full_name",
  "email",
  "phone",
  "linkedin_url",
  "github_url",
  "portfolio_url",
];

/* Keys that were read once, are not in the schema, and never resolved to anything. */
const KEYS_THE_BACKEND_NEVER_WRITES = ["location", "linkedin", "website"];

describe("the packet resume preview", () => {
  test("puts the applicant's name in the header, not their school", () => {
    assert.match(
      PACKET,
      /full_name/,
      "ResumePaper must read _contact.full_name; without it the header falls back to whatever renders first"
    );
    const header = PACKET.slice(PACKET.indexOf("function ResumePaper"));
    const nameAt = header.indexOf("{name}");
    const schoolAt = header.indexOf("{spec.school}");
    assert.ok(nameAt !== -1, "ResumePaper must render the applicant's name");
    assert.ok(schoolAt !== -1, "ResumePaper must still render the school somewhere");
    assert.ok(
      nameAt < schoolAt,
      "the name must come before the school: the top slot is the applicant, not the university"
    );
  });

  /* Legacy packets predate `_contact` and carry no name. Without this, `{name && <p>}` followed by
     a sibling `{spec.target_role && <p>}` leaves the ROLE as the first line on exactly those
     packets, which is the reported bug reproduced on old data. The role must be nested inside the
     name branch so it cannot outlive it. */
  test("never lets the target role lead when there is no name", () => {
    const header = PACKET.slice(PACKET.indexOf("function ResumePaper"));
    const roleAt = header.indexOf("{spec.target_role");
    const nameAt = header.indexOf("{name &&");
    const contactAt = header.indexOf("{contact &&");
    assert.ok(nameAt !== -1 && roleAt !== -1, "both the name and the target role must render");
    assert.ok(
      roleAt > nameAt && roleAt < contactAt,
      "the target role must sit inside the name branch, not as a sibling that survives a missing name"
    );
  });

  test("gives education its own section rather than floating it under the header", () => {
    assert.match(
      PACKET,
      /Education\s*\n?\s*<\/p>/,
      "education needs its own section heading, the way drawEducation() emits one"
    );
  });

  test("reads only contact keys the backend actually writes", () => {
    for (const key of KEYS_THE_BACKEND_NEVER_WRITES) {
      assert.doesNotMatch(
        PACKET,
        new RegExp(`"${key}"`),
        `"${key}" is not a key the backend stores on _contact; it will silently resolve to nothing`
      );
    }
    for (const key of ["email", "phone", "linkedin_url"]) {
      assert.match(
        PACKET,
        new RegExp(`"${key}"`),
        `the contact line must read "${key}", which is what the backend stores`
      );
    }
  });

  test("the QA fixture carries the same contact shape production does", () => {
    const contact = HARNESS.slice(HARNESS.indexOf("_contact:"));
    const block = contact.slice(0, contact.indexOf("}"));
    for (const key of KEYS_THE_BACKEND_NEVER_WRITES) {
      assert.doesNotMatch(
        block,
        new RegExp(`\\b${key}:`),
        `the fixture must not invent "${key}"; a fixture shaped like the bug cannot reveal the bug`
      );
    }
    assert.match(block, /full_name:/, "the fixture needs a name, or the header bug renders clean");
  });
});
