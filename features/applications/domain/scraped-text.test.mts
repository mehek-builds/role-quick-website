import assert from "node:assert/strict";
import test from "node:test";
import { cleanScrapedLabel, cleanScrapedPrompt } from "./scraped-text.ts";

/* The two live strings this module was written against, both read on trylitos.com 2026-08-29. */
const SANCTIONS_PROMPT =
  "select all that apply. note: this information will only be used to ensure compliance with u.s. sanctions and export control laws.";
const PREFERRED_NAME_LABEL = "Preferred first name* preferred first name preferred_name";

test("the measured prompt reads as a sentence, with the initialism restored", () => {
  assert.equal(
    cleanScrapedPrompt(SANCTIONS_PROMPT),
    "Select all that apply. Note: this information will only be used to ensure compliance with U.S. sanctions and export control laws.",
  );
});

test("the measured label loses its duplicate captures and its raw field key", () => {
  assert.equal(cleanScrapedLabel(PREFERRED_NAME_LABEL), "Preferred first name");
});

test("case is restored, never imposed: an employer's own capitals survive untouched", () => {
  /* Any existing capital is evidence of authorial styling. Only an all-lowercase capture is
     evidence of a machine-lowercased DOM read. */
  assert.equal(cleanScrapedPrompt("What is your GPA?"), "What is your GPA?");
  assert.equal(cleanScrapedPrompt("Do you require H-1B sponsorship?"), "Do you require H-1B sponsorship?");
  assert.equal(cleanScrapedPrompt("iOS development experience?"), "iOS development experience?");
  assert.equal(
    cleanScrapedPrompt("Describe your experience with ai and ML."),
    "Describe your experience with AI and ML.",
    "acronyms are still restored inside a mixed-case prompt; only the sentence casing is withheld",
  );
});

test("the prompt every form asks is not turned into shouting", () => {
  /* "tell us about yourself" is why bare "us" is not in the acronym list. This is the false
     positive the narrow list is protecting against, and it is not hypothetical: it is on more
     application forms than every other acronym here combined. */
  assert.equal(cleanScrapedPrompt("tell us about yourself"), "Tell us about yourself");
  assert.equal(cleanScrapedPrompt("why do you want to work with us?"), "Why do you want to work with us?");
});

test("a lowercased capture gets its acronyms back", () => {
  assert.equal(cleanScrapedPrompt("provide your best result on sat"), "Provide your best result on SAT");
  assert.equal(cleanScrapedPrompt("what is your gpa?"), "What is your GPA?");
  assert.equal(cleanScrapedPrompt("are you authorized to work in the u.s.?"), "Are you authorized to work in the U.S.?");
});

test("a colon does not start a sentence, but terminal punctuation does", () => {
  assert.equal(cleanScrapedPrompt("note: read this."), "Note: read this.");
  assert.equal(cleanScrapedPrompt("first. second? third! fourth"), "First. Second? Third! Fourth");
});

test("nothing is ever cleaned to empty", () => {
  /* jd-display.ts's rule, restated for shorter strings: a prompt is the question an employer is
     asking, and losing it entirely is far worse than printing it awkwardly. */
  assert.equal(cleanScrapedPrompt(""), "");
  assert.equal(cleanScrapedPrompt("   "), "   ");
  assert.equal(cleanScrapedPrompt(null), "");
  assert.equal(cleanScrapedPrompt(undefined), "");
  assert.equal(cleanScrapedLabel(""), "");
  assert.equal(cleanScrapedLabel("   "), "   ");
  assert.equal(cleanScrapedLabel("*"), "*", "a label that is only a required marker keeps its bytes");
  assert.equal(cleanScrapedLabel(null), "");
});

test("a label with nothing duplicate in it is returned unchanged", () => {
  assert.equal(cleanScrapedLabel("Preferred first name"), "Preferred first name");
  assert.equal(cleanScrapedLabel("Are you legally authorized to work in the United States?"), "Are you legally authorized to work in the United States?");
  assert.equal(cleanScrapedLabel("Pronouns"), "Pronouns", "a single ordinary word is a real label, not a field key");
  assert.equal(cleanScrapedLabel("First name"), "First name");
});

test("only a token that cannot be prose is treated as a field key", () => {
  assert.equal(cleanScrapedLabel("Preferred name preferred_name"), "Preferred name");
  assert.equal(cleanScrapedLabel("Work authorization work_authorization_us"), "Work authorization");
  assert.equal(cleanScrapedLabel("Answer job_application[answers][3]"), "Answer");
  /* A BRACKET ALONE IS NOT A FIELD KEY. Matching one anywhere in the token ate genuine label
     fragments and silently changed the question being answered: the unit off a salary field, the
     scale off a rating. A form path always has an identifier in front of its first subscript. */
  assert.equal(cleanScrapedLabel("Salary expectation [USD]"), "Salary expectation [USD]");
  assert.equal(cleanScrapedLabel("Rate your experience [1-5]"), "Rate your experience [1-5]");
  assert.equal(cleanScrapedLabel("Availability (summer 2027)"), "Availability (summer 2027)");
  /* Hyphenated and possessive words are prose and must survive: dropping one silently rewrites the
     employer's question. */
  assert.equal(cleanScrapedLabel("Full-time availability"), "Full-time availability");
  assert.equal(cleanScrapedLabel("Sponsorship"), "Sponsorship");
});

/* The same defect in the shapes production actually holds. Read off the snapAddy packet's
   filled_fields on 2026-08-29, after the first pass at this shipped: the audit named one string and
   these are its siblings, arriving from the same DOM triple-capture. */
test("the sibling shapes of the measured junk are cleaned too", () => {
  assert.equal(cleanScrapedLabel("location* (required) location location field-location"), "location");
  assert.equal(
    cleanScrapedLabel("github* (required) github custom_attribute_2706278 field-custom_attribute_270627"),
    "github",
  );
});

test("control chrome is not the question", () => {
  assert.equal(cleanScrapedLabel("Cover letter (optional)"), "Cover letter");
  assert.equal(cleanScrapedLabel("Phone number (required)"), "Phone number");
  /* A parenthetical that says something about the ANSWER stays: it is the employer speaking to the
     applicant, not the form describing its own control. */
  assert.equal(cleanScrapedLabel("Start date (mm/yyyy)"), "Start date (mm/yyyy)");
  assert.equal(cleanScrapedLabel("Salary (USD)"), "Salary (USD)");
});

test("a prefixed field name survives when it is the only name that field has", () => {
  /* The drop is evidence-based: "field-location" goes because "location" is already there. With no
     plain-word stem present, the prefixed token is the label and removing it would leave nothing. */
  assert.equal(cleanScrapedLabel("field-location"), "field-location");
  assert.equal(cleanScrapedLabel("Where are you based? field-location"), "Where are you based? field-location");
});

test("only ADJACENT repeats collapse, so a label may use a word twice", () => {
  assert.equal(cleanScrapedLabel("Name Name"), "Name");
  assert.equal(
    cleanScrapedLabel("What name is on your passport, and what name do you use?"),
    "What name is on your passport, and what name do you use?",
  );
});

test("a short echo cannot truncate a real question", () => {
  /* The duplicate rule has a six-character floor precisely so a coincidental repeat does not eat
     the rest of a prompt. */
  const echo = "What name do you go by, and what name is on your passport?";
  assert.equal(cleanScrapedLabel(echo), echo);
});

test("the required marker comes off the end, and only off the end", () => {
  assert.equal(cleanScrapedLabel("Email*"), "Email");
  assert.equal(cleanScrapedLabel("University attended? ✱"), "University attended?");
  assert.equal(cleanScrapedLabel("Rate 1*-5"), "Rate 1*-5", "an asterisk inside the text is the employer's");
});
