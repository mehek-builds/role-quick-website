import assert from "node:assert/strict";
import test from "node:test";
import { educationDrift, educationDriftMessage, profileGradDate } from "./education-drift.ts";

const PACKET = {
  school: "University of Southern California",
  degree: "Bachelor of Science in Computer Science",
  grad_date: "May 2027",
};

test("a packet whose graduation date the profile has since changed is drift", () => {
  const drift = educationDrift(PACKET, { ...PACKET, grad_date: "May 2028" });
  assert.deepEqual(drift, [
    {
      field: "grad_date",
      label: "Graduation date",
      packet: "May 2027",
      profile: "May 2028",
    },
  ]);
});

test("a packet that still agrees with the profile reports nothing", () => {
  assert.deepEqual(educationDrift(PACKET, { ...PACKET }), []);
  assert.deepEqual(educationDrift(PACKET, { ...PACKET, grad_date: "  May 2027  " }), []);
});

test("school and degree drift are reported in the order they print", () => {
  const drift = educationDrift(PACKET, {
    school: "USC Viterbi",
    degree: "Bachelor of Science in Computer Science and Business Administration",
    grad_date: "May 2027",
  });
  assert.deepEqual(drift.map((item) => item.field), ["school", "degree"]);
});

test("a blank profile field is not on record, not a contradiction", () => {
  assert.deepEqual(educationDrift(PACKET, { school: "", degree: "   ", grad_date: undefined }), []);
  assert.deepEqual(educationDrift(PACKET, null), []);
  assert.deepEqual(educationDrift(PACKET, undefined), []);
});

test("a packet that omits a line the profile now carries is drift", () => {
  const drift = educationDrift({ ...PACKET, degree: "" }, PACKET);
  assert.deepEqual(drift.map((item) => [item.field, item.packet]), [["degree", ""]]);
});

test("a profile carrying only a graduation year still supplies a date to compare", () => {
  assert.equal(profileGradDate({ grad_year: 2028 }), "2028");
  assert.equal(profileGradDate({ grad_date: "May 2028", grad_year: 2027 }), "May 2028");
  assert.equal(profileGradDate({}), "");
  assert.deepEqual(educationDrift({ ...PACKET, grad_date: "2028" }, { ...PACKET, grad_date: "", grad_year: 2028 }), []);
});

test("the drift message quotes both values so the student can tell which one is wrong", () => {
  const message = educationDriftMessage(educationDrift(PACKET, { ...PACKET, grad_date: "May 2028" }));
  assert.match(message ?? "", /May 2027/);
  assert.match(message ?? "", /May 2028/);
  assert.equal(educationDriftMessage([]), null);
});
