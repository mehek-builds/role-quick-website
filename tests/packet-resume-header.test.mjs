import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
const START_PAPER = code(readFileSync("components/start/ResumePaper.tsx", "utf8"));
const CONTACT_HELPER = code(readFileSync("lib/resumeContact.ts", "utf8"));
const HARNESS = code(readFileSync("app/qa/packet/dashboard/harness.tsx", "utf8"));
const { RESUME_CONTACT_KEYS, resumeContactLine } = await import("../lib/resumeContact.ts");

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

  /* The renderer no longer prints the target role, so neither does this. `spec.target_role` is
     still on the packet and still drives targeting, which is precisely why this needs pinning: the
     field is right there, and the obvious reading of a field named target_role on a resume spec is
     that the resume shows it. It does not. */
  test("does not print the target role, because the document does not", () => {
    const paper = PACKET.slice(
      PACKET.indexOf("function ResumePaper"),
      PACKET.indexOf("function SectionHeading")
    );
    assert.doesNotMatch(
      paper,
      /\{spec\.target_role\}/,
      "the header is the name, a rule, and the contact line; a role line here is not on the PDF"
    );
  });

  /* Entry typography, against drawEntrySection() + drawSplitLine(). The pane printed
     `{entry.title} · {entry.org}` as one bold line, which is not a line the renderer draws
     anywhere: org alone on the split line, role italic beneath. */
  test("puts the organisation alone on the split line, role italic beneath", () => {
    assert.doesNotMatch(
      PACKET,
      /\{entry\.title\}\s*·\s*\{entry\.org\}/,
      "org and role must not share one line; the renderer separates them and the hierarchy is the point"
    );
    assert.match(PACKET, /\{entry\.org\}<\/p>/, "the organisation gets the split line to itself");
    assert.match(
      PACKET,
      /italic[^>]*>\{entry\.title\}/,
      "the role renders in italic, the way drawEntrySection does it"
    );
  });

  /* TWO SPLIT LINES, matching drawSplitLine twice: the place is the right column of line one and
     the date is the right column of line two. Pinned as pairs because the failure mode is a date
     drifting back up beside the organisation, which is where it used to be and is the shape the
     applicant's own template does not have. */
  test("pairs place with organisation and date with role", () => {
    const paper = PACKET.slice(
      PACKET.indexOf("function ResumePaper"),
      PACKET.indexOf("function SectionHeading")
    );
    /* Anchored on the closing tag, not the bare expression. The entry key is
       `key={`${entry.org}-${entry.title}-${index}`}`, and "{entry.title}" is a substring of
       "${entry.title}" inside it, so a bare search finds the key and reports the role rendering
       before the place. */
    const orgAt = paper.indexOf("{entry.org}</p>");
    const entryPlaceAt = paper.indexOf("{entry.location}</p>");
    const titleAt = paper.indexOf("{entry.title}</p>");
    const rangeAt = paper.indexOf("{entry.date_range}</p>");
    assert.ok([orgAt, entryPlaceAt, titleAt, rangeAt].every((i) => i !== -1), "all four columns render");
    assert.ok(orgAt < entryPlaceAt, "the place is the right column of the organisation line");
    assert.ok(entryPlaceAt < titleAt, "the role line comes after the organisation line");
    assert.ok(titleAt < rangeAt, "the date is the right column of the role line");

    const schoolAt = paper.indexOf("{spec.school}</p>");
    const schoolPlaceAt = paper.indexOf("{spec.school_location}</p>");
    const degreeAt = paper.indexOf("{spec.degree}</p>");
    const gradAt = paper.indexOf("{spec.grad_date}</p>");
    assert.ok(schoolAt < schoolPlaceAt && schoolPlaceAt < degreeAt && degreeAt < gradAt,
      "education follows the same shape: school with place, degree with date");
  });

  /* The renderer wraps org and school inside their split-line column. `truncate` would show LESS
     than the file, and hiding content is the one thing a preview of a document must not do. */
  test("never truncates content the rendered file shows in full", () => {
    /* Bounded to ResumePaper + Education, which sit between these two declarations. An unbounded
       slice runs to end of file and catches the packet dialog's own header, where truncating a
       long job title into a fixed chrome row is correct. The rule is about the paper, not the
       furniture around it. */
    const paper = PACKET.slice(
      PACKET.indexOf("function ResumePaper"),
      PACKET.indexOf("function SectionHeading")
    );
    assert.ok(paper.includes("function Education"), "the slice must cover ResumePaper and Education");
    assert.doesNotMatch(
      paper,
      /truncate/,
      "no truncate on the resume paper: the PDF wraps these, so truncating hides content from the check"
    );
  });

  /* Both separators, pinned together. They drifted from the PDF independently and only the skills
     one was caught the first time, so a test that covers one and not the other has already been
     proven insufficient. engine/resumeRender.ts is the reference for both. */
  test("uses the separators the renderer uses", () => {
    assert.match(
      PACKET,
      /skills\.join\(" • "\)/,
      "the renderer joins skills with a bullet, not a middot"
    );
    assert.match(
      CONTACT_HELPER,
      /\.join\(" \| "\)/,
      "the renderer joins contact details with a pipe, not a middot"
    );
  });

  test("shortens and deduplicates contact links", () => {
    const line = resumeContactLine({
      email: "mehekmandal05@gmail.com",
      phone: "+971 567417451",
      linkedin_url: "https://www.linkedin.com/in/mehekmandal/",
      github_url: "https://github.com/mehek-builds",
      portfolio_url: "github.com/mehek-builds/",
    });

    assert.equal(
      line,
      "mehekmandal05@gmail.com | +971 567417451 | linkedin.com/in/mehekmandal | github.com/mehek-builds"
    );
    assert.equal(line.match(/github\.com\/mehek-builds/g)?.length, 1);
    assert.doesNotMatch(line, /https?:\/\//);
  });

  test("gives education its own section rather than floating it under the header", () => {
    assert.match(
      PACKET,
      /Education\s*\n?\s*<\/p>/,
      "education needs its own section heading, the way drawEducation() emits one"
    );
  });

  /* The GPA, in the renderer's order: degree, GPA, coursework. Absent shows nothing, because a
     resume that never stated a GPA is not missing one and the product does not keep asking for a
     number the student chose not to give. */
  test("shows the GPA where drawEducation prints it", () => {
    const education = PACKET.slice(
      PACKET.indexOf("function Education"),
      PACKET.indexOf("function SectionHeading")
    );
    const degreeAt = education.indexOf("{spec.degree &&");
    const gpaAt = education.indexOf("{spec.gpa &&");
    const courseworkAt = education.indexOf("{spec.coursework &&");
    assert.ok(gpaAt !== -1, "the preview must show a GPA the rendered file prints");
    assert.ok(
      degreeAt < gpaAt && gpaAt < courseworkAt,
      "degree, then GPA, then coursework: the order drawEducation() emits"
    );
    assert.match(education, /GPA: \{spec\.gpa\}/, "printed with the same label the renderer uses");
  });

  test("reads only contact keys the backend actually writes", () => {
    assert.deepEqual([...RESUME_CONTACT_KEYS], ["email", "phone", "linkedin_url", "github_url", "portfolio_url"]);
    for (const key of KEYS_THE_BACKEND_NEVER_WRITES) {
      assert.doesNotMatch(
        CONTACT_HELPER,
        new RegExp(`"${key}"`),
        `"${key}" is not a key the backend stores on _contact; it will silently resolve to nothing`
      );
    }
    for (const key of ["email", "phone", "linkedin_url", "github_url", "portfolio_url"]) {
      assert.match(
        CONTACT_HELPER,
        new RegExp(`"${key}"`),
        `the contact line must read "${key}", which is what the backend stores`
      );
    }
  });

  test("all resume previews use the shared contact formatter", () => {
    assert.match(PACKET, /resumeContactLine\(spec\._contact \?\? \{\}\)/);
    assert.match(START_PAPER, /resumeContactLine\(contact\)/);
    assert.doesNotMatch(START_PAPER, /function contactLine/);
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

/* THE ROOT CAUSE, AND THE GUARD THAT IS SUPPOSED TO OUTLIVE IT.
 *
 * The header bug above has now shipped THREE times, on three different surfaces:
 *
 *   1. components/app/ApplicationPacket.tsx  ResumePaper  opened with `spec.school`
 *   2. app/dashboard/page.tsx                ResumePreview opened with `job_context.role`
 *   3. app/dashboard/applications/page.tsx   ResumeEditor  opened with `spec.school`
 *
 * Three separate authors, one cause, and it is a TYPE rather than a mistake:
 *
 *   `ResumeSpec` has no name field. The applicant lives on `spec._contact.full_name`, and
 *   `stripMetadata` drops `_contact` on purpose. So a component typed `spec: ResumeSpec` - the
 *   natural, type-correct signature for something that renders a resume - is STRUCTURALLY unable to
 *   render the applicant. The name slot is then empty, and whatever field happens to come first
 *   floats up into it. On two of the three that was the school; on the third it was the posting.
 *
 * Nothing about this fails loudly. The render is valid, the types check, the page looks like a
 * resume, and the rendered PDF is correct throughout, so the only way to notice is for a human to
 * read the top of the preview and know what should be there. Fixing renderers one at a time found
 * these one at a time, over weeks.
 *
 * So the guard below is DISCOVERY-BASED rather than a list. It finds every file that renders a
 * resume and requires each one to render a name. A new resume surface is picked up automatically
 * and fails until it is given the applicant, which is the only version of this test that can catch
 * occurrence number four.
 *
 * It deliberately does NOT assert file order. `components/start/ResumePaper.tsx` renders the name
 * before education, but its `Education` helper is DEFINED earlier in the file, so a positional
 * check reports it broken. That false positive is exactly how a guard like this gets weakened into
 * uselessness, so ordering is asserted per component, against a slice of that component, below.
 */
describe("every surface that renders a resume names the applicant", () => {
  function walk(dir) {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (entry === "node_modules" || entry === ".next") return [];
      return statSync(full).isDirectory() ? walk(full) : full.endsWith(".tsx") ? [full] : [];
    });
  }

  /* Renders the school INTO the document, which is what makes a file a resume surface. Anchored on
     a render or a bound value rather than on the identifier alone: plenty of files mention a school
     while passing it around, and only the ones that draw it owe the reader a name above it. */
  const RENDERS_SCHOOL = /\{spec\.school\}|value=\{spec\.school\}|left=\{spec\.school\}|\{[\w.]*\.school\}|value=\{[\w.]*\.school\}/;
  /* Any of the shapes a name legitimately takes across these surfaces: a prop the caller passes
     (`{name}`), the contact record read directly (`{contact.full_name}`), or a bound editable
     field (`value={draft.full_name}`). */
  const RENDERS_NAME = /\{name\}|\{[\w.]*full_name\}|value=\{[\w.]*full_name\}|full_name=\{/;

  const surfaces = [...walk("app"), ...walk("components")]
    .map((file) => ({ file, source: code(readFileSync(file, "utf8")) }))
    .filter(({ source }) => RENDERS_SCHOOL.test(source));

  test("the scan finds the surfaces it is supposed to be guarding", () => {
    /* A discovery test that silently discovers nothing passes forever while guarding nothing, which
       is a worse failure than the bug. These three are known resume surfaces and must be found. */
    const found = surfaces.map(({ file }) => file.replace(/\\/g, "/"));
    for (const expected of [
      "components/app/ApplicationPacket.tsx",
      "components/start/ResumePaper.tsx",
      "app/dashboard/applications/page.tsx",
    ]) {
      assert.ok(found.includes(expected), `the scan must find ${expected}; it found ${found.join(", ")}`);
    }
  });

  test("no surface draws a resume without the applicant on it", () => {
    for (const { file, source } of surfaces) {
      assert.ok(
        RENDERS_NAME.test(source),
        `${file} renders a resume but never renders a name. ResumeSpec has no name field and ` +
          `stripMetadata drops _contact, so this component has to be GIVEN the applicant as its ` +
          `own prop, the way ResumePaper and ResumeEditor take one. Without it the school floats ` +
          `into the name slot and the student reads their university where their name belongs.`,
      );
    }
  });
});

/* The review screen's editable resume, held to the same contract as the read-only pane. Sliced to
   the component, because ordering is only meaningful inside one render tree. */
describe("the review screen's resume editor", () => {
  const REVIEW = code(readFileSync("app/dashboard/applications/page.tsx", "utf8"));
  const editor = REVIEW.slice(REVIEW.indexOf("function ResumeEditor"), REVIEW.indexOf("function EditableLine"));

  test("puts the applicant's name in the header, not their school", () => {
    assert.ok(editor.length > 0, "the slice must cover ResumeEditor");
    const nameAt = editor.indexOf("{name}");
    const schoolAt = editor.indexOf("{spec.school}");
    assert.ok(nameAt !== -1, "ResumeEditor must render the applicant's name");
    assert.ok(schoolAt !== -1, "ResumeEditor must still render the school somewhere");
    assert.ok(nameAt < schoolAt, "the name must come before the school: the top slot is the applicant");
  });

  test("takes the name as a prop, because its own spec cannot carry one", () => {
    /* The signature is the fix. `spec` here is `stripMetadata(packet.spec)`, which removes
       `_contact`, so any attempt to read the name off `spec` would be reading a field that was
       deleted on the way in. */
    assert.match(editor, /name: string/, "ResumeEditor must accept a name");
    assert.match(editor, /contact: string/, "ResumeEditor must accept a contact line");
    assert.doesNotMatch(editor, /spec\._contact/, "the editable spec has no _contact; it is stripped");
  });

  test("the caller reads the name off the raw packet, not off the editable copy", () => {
    assert.match(REVIEW, /name=\{contactName\(selected\.spec\)\}/);
    assert.match(REVIEW, /contact=\{contactLine\(selected\.spec\)\}/);
    /* Shared with the packet pane rather than re-derived. The contact record's key names have
       already been got wrong once. */
    assert.match(REVIEW, /import \{ ApplicationPacket, contactLine, contactName \}/);
  });

  test("education becomes a section rather than a floating page header", () => {
    /* The school sat at the top with no heading, which is how it came to look like the header slot
       in the first place. drawEducation() emits a heading and so does this. */
    assert.match(editor, /Education<\/p>/, "education needs its own heading");
  });
});

/* THE REVIEW SCREEN'S SANDBOX, pinned for the reason the packet harness already was.
 *
 * `app/dashboard/applications/qa-data.ts` carried no `_contact` at all. That is not a cosmetic gap
 * in a fixture: with no contact record, contactName() returns "" and the review screen correctly
 * draws no name, so the BROKEN version and the FIXED version of that screen render identically in
 * the sandbox. Driving `?qa=acme` could never have found this bug, and did not, for as long as the
 * screen has existed.
 *
 * A fixture shaped like the bug cannot reveal the bug. */
describe("the review screen's QA fixture", () => {
  const FIXTURE = code(readFileSync("app/dashboard/applications/qa-data.ts", "utf8"));

  test("carries the contact shape production sends", () => {
    assert.match(FIXTURE, /_contact:/, "without _contact the sandbox cannot show a name at all");
    assert.match(FIXTURE, /full_name:/, "the fixture needs a name, or the header bug renders clean");
  });

  test("uses the backend's key names, not invented ones", () => {
    for (const key of KEYS_THE_BACKEND_NEVER_WRITES) {
      assert.doesNotMatch(
        FIXTURE,
        new RegExp(`\\b${key}:`),
        `"${key}" is not a key the backend stores on _contact; a fixture that invents it hides the drift`,
      );
    }
    for (const key of BACKEND_CONTACT_KEYS.slice(0, 4)) {
      assert.match(FIXTURE, new RegExp(`\\b${key}:`), `the fixture should exercise "${key}"`);
    }
  });
});
