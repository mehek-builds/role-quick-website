import assert from "node:assert/strict";
import test from "node:test";
import {
  preserveExplicitWorkAuthorization,
  sanitizeTryPacket,
} from "./try-work-authorization.ts";

const VALID_PACKET = {
  tailored_bullets: ["One", "Two", "Three"],
  ats_coverage: 82,
  filled_fields: {
    university: "University of Example",
    work_authorization: "Authorized to work in the United States.",
    short_answer: "I have relevant experience.",
  },
  outreach_opening: "I am applying to this role.",
};

test("keeps an explicit work-authorization statement from the resume", () => {
  assert.equal(
    preserveExplicitWorkAuthorization(
      "Work authorization: U.S. permanent resident. No sponsorship required.",
      "Work authorization: U.S. permanent resident. No sponsorship required.",
    ),
    "Work authorization: U.S. permanent resident. No sponsorship required.",
  );
});

test("rejects a model inference that is not in the resume", () => {
  assert.equal(
    preserveExplicitWorkAuthorization(
      "Based in Austin, Texas. Georgia Tech graduate.",
      "Authorized to work in the United States",
    ),
    null,
  );
});

test("rejects short answers that could match unrelated resume text", () => {
  assert.equal(
    preserveExplicitWorkAuthorization(
      "Yes, I led the project. Experience includes React and TypeScript.",
      "Yes",
    ),
    null,
  );
});

test("rejects an unrelated resume sentence even when the model copies it verbatim", () => {
  assert.equal(
    preserveExplicitWorkAuthorization(
      "Experience includes React and TypeScript across three production applications.",
      "React and TypeScript across three production applications",
    ),
    null,
  );
});

test("normalizes line breaks without inventing an answer", () => {
  assert.equal(
    preserveExplicitWorkAuthorization(
      "Experience\nAuthorized to work in the United Kingdom without sponsorship.\nEducation",
      "Authorized to work in the United Kingdom without sponsorship",
    ),
    null,
  );
});

test("never drops a negation from an authorization statement", () => {
  assert.equal(
    preserveExplicitWorkAuthorization(
      "Not authorized to work in the United States without sponsorship.",
      "Authorized to work in the United States without sponsorship.",
    ),
    null,
  );
});

test("keeps a complete negative authorization statement verbatim", () => {
  const statement =
    "Not authorized to work in the United States without sponsorship.";
  assert.equal(preserveExplicitWorkAuthorization(statement, statement), statement);
});

test("rejects an E-Verify project as candidate authorization", () => {
  const line = "Led the company E-Verify rollout.";
  assert.equal(preserveExplicitWorkAuthorization(line, line), null);
});

test("rejects the Visa company name as candidate authorization", () => {
  const line = "Software Engineer at Visa.";
  assert.equal(preserveExplicitWorkAuthorization(line, line), null);
});

test("rejects a citizenship award as candidate authorization", () => {
  const line = "Citizenship Award recipient.";
  assert.equal(preserveExplicitWorkAuthorization(line, line), null);
});

test("rejects ambiguous citizenship, visa, immigration, and pending labels", () => {
  for (const line of [
    "Citizenship status: Indian",
    "Visa status: F-1",
    "Immigration status: Student",
    "Work authorization: Pending",
  ]) {
    assert.equal(preserveExplicitWorkAuthorization(line, line), null, line);
  }
});

test("accepts an explicit labeled work-authorization answer", () => {
  const line = "Work authorization: Yes, no sponsorship required.";
  assert.equal(preserveExplicitWorkAuthorization(line, line), line);
});

test("the returned packet clears a model inference absent from the resume", () => {
  const packet = sanitizeTryPacket(
    "Experience includes TypeScript and React. Education includes Example University.",
    VALID_PACKET,
  );

  assert.equal(packet?.filled_fields.work_authorization, "");
});

test("the returned packet keeps a verbatim explicit authorization statement", () => {
  const packet = sanitizeTryPacket(
    "Authorized to work in the United States.\nExperience includes TypeScript and React.",
    VALID_PACKET,
  );

  assert.equal(
    packet?.filled_fields.work_authorization,
    "Authorized to work in the United States.",
  );
});

test("the returned packet rejects malformed model output", () => {
  assert.equal(
    sanitizeTryPacket("Authorized to work in the United States.", {
      ...VALID_PACKET,
      tailored_bullets: ["Only one"],
    }),
    null,
  );
});
