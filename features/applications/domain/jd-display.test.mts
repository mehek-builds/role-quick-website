import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanJdCapture } from "./jd-display.ts";

/* The live capture this cleaner was written against: Belvedere Trading, Lever apply page,
 * observed in production 2026-08-28. The form chrome rendered under "Job description" and the
 * matcher highlighted "Loading" as a missing requirement. */
const BELVEDERE_CAPTURE = [
  "Software Engineer Intern - Summer 2027",
  "Chicago, IllinoisTechnology - Campus /Intern /On-Site",
  "SUBMIT YOUR APPLICATION",
  "LinkedIn profile",
  "Loading...",
  "",
  "Authorize sharing of selected",
  "LinkedIn profile details to",
  "auto-complete this form. Learn more",
  "",
  "Resume/CV",
  "✱",
  "ATTACH RESUME/CV",
  "Full name",
  "✱",
  "Email",
  "✱",
  "Phone",
  "✱",
  "Current location",
  "Current company",
  "Twitter URL",
  "GitHub URL",
  "Portfolio URL",
  "We are looking for interns who write robust C++ and love low-latency systems.",
].join("\n");

test("drops every known chrome line from the Belvedere capture and keeps the prose", () => {
  const cleaned = cleanJdCapture(BELVEDERE_CAPTURE);
  assert.match(cleaned.text, /Software Engineer Intern - Summer 2027/);
  assert.match(cleaned.text, /robust C\+\+ and love low-latency systems/);
  for (const gone of ["SUBMIT YOUR APPLICATION", "Loading", "ATTACH RESUME/CV", "Full name", "Learn more", "✱"]) {
    assert.ok(!cleaned.text.includes(gone), `${gone} should have been removed`);
  }
  assert.ok(cleaned.removedLines.length >= 15, `removed ${cleaned.removedLines.length} lines`);
  assert.ok(cleaned.removedLines.includes("Loading..."));
});

test("a capture with no chrome comes back byte-identical with nothing removed", () => {
  const prose = "Senior Analyst\n\nBuild models.\nShip weekly.\n\nEmail us your questions any time.";
  const cleaned = cleanJdCapture(prose);
  assert.equal(cleaned.text, prose);
  assert.deepEqual(cleaned.removedLines, []);
});

test("prose that merely CONTAINS a field word survives: only whole chrome lines are dropped", () => {
  const prose = [
    "You will manage the full name matching pipeline.",
    "Email deliverability experience is a plus.",
    "Phone screening is the first interview step.",
  ].join("\n");
  const cleaned = cleanJdCapture(prose);
  assert.equal(cleaned.text, prose);
  assert.deepEqual(cleaned.removedLines, []);
});

test("blank runs left by removal collapse instead of rendering as holes", () => {
  const cleaned = cleanJdCapture("Intro line.\n\nLoading...\n\nSUBMIT YOUR APPLICATION\n\nReal requirement line.");
  assert.equal(cleaned.text, "Intro line.\n\nReal requirement line.");
});

test("null and empty captures pass through untouched", () => {
  assert.deepEqual(cleanJdCapture(null), { text: "", removedLines: [] });
  assert.deepEqual(cleanJdCapture("   "), { text: "   ", removedLines: [] });
});

test("chrome lines without a strong form marker are left alone: gate before cleaning", () => {
  const capture = "Data Analyst\n\nLoading...\n\nBuild dashboards weekly.\nEmail\nreports to stakeholders.";
  const cleaned = cleanJdCapture(capture);
  assert.equal(cleaned.text, capture);
  assert.deepEqual(cleaned.removedLines, []);
});

test("a capture that is ONLY form chrome comes back raw, never empty", () => {
  const capture = "SUBMIT YOUR APPLICATION\nATTACH RESUME/CV\nFull name\nEmail\nPhone\nLoading...";
  const cleaned = cleanJdCapture(capture);
  assert.equal(cleaned.text, capture);
  assert.deepEqual(cleaned.removedLines, []);
});

test("the second form section of an apply capture is cleaned too", () => {
  const capture = [
    "Software Engineer Intern - Summer 2027",
    "SUBMIT YOUR APPLICATION",
    "LINKS",
    "Other website",
    "OCR APPLICATION FOR EMPLOYMENT",
    "Street Address",
    "City",
    "State",
    "Zip Code",
    "How did you learn about Belvedere Trading?",
    "Select...",
    "Belvedere Trading Website",
    "Handshake/Campus Job Board",
    "Campus Career Fair",
    "Other Campus Event",
    "LinkedIn",
    "Glassdoor",
    "Indeed",
    "Built in Chicago",
    "We write robust C++ for low-latency trading systems.",
  ].join("\n");
  const cleaned = cleanJdCapture(capture);
  assert.match(cleaned.text, /Software Engineer Intern - Summer 2027/);
  assert.match(cleaned.text, /robust C\+\+ for low-latency trading systems/);
  for (const gone of ["LINKS", "OCR", "Street Address", "Zip Code", "Select...", "How did you learn", "Handshake", "Built in Chicago", "Glassdoor"]) {
    assert.ok(!cleaned.text.includes(gone), `${gone} should have been removed`);
  }
});

test("a posting that merely says Application for Employment never opens the gate", () => {
  const prose = [
    "Operations Associate",
    "Download our Application for Employment from the careers page.",
    "Application for Employment",
    "Email",
    "City",
  ].join("\n");
  const cleaned = cleanJdCapture(prose);
  assert.equal(cleaned.text, prose);
  assert.deepEqual(cleaned.removedLines, []);
});
