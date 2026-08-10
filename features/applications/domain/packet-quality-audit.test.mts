import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildRequirementIndex, segmentText } from "./requirement-terms.ts";
import { explicitTerms } from "./application-review.ts";

/**
 * PACKET QUALITY AUDIT, 2026-08-08. Every case below is taken verbatim from a real packet
 * generated for user a18f774b-a306-4804-93f3-cd6020c27fb3 and scored by the SHIPPED backend
 * engine/jdMatch.ts. Each one is a colour the student was promised and did not get.
 *
 * These tests are expected to FAIL on origin/main. They encode the defects, not the behaviour.
 *
 * The contract they hold, from requirement-terms.ts's own header:
 *   covered - blue, in BOTH panes
 *   missing - amber, JD pane only
 *   edited  - green, resume pane only
 * and, from normalizeTerm's docblock: "The two must agree or a term the scorer counted as matched
 * will fail to highlight, and the panes will contradict the number."
 */

const index = (covered: string[], missing: string[] = []) =>
  buildRequirementIndex(
    covered.map((term) => ({ term, display: term, weight: 1 })),
    missing.map((term) => ({ term, display: term, weight: 1 })),
  );

const marks = (text: string, idx: ReturnType<typeof index>, edited?: ReadonlySet<string>) =>
  segmentText(text, idx, edited)
    .filter((segment) => segment.kind === "mark")
    .map((segment) => (segment.kind === "mark" ? { text: segment.text, tone: segment.tone } : null));

const markedTerms = (text: string, idx: ReturnType<typeof index>, edited?: ReadonlySet<string>) =>
  segmentText(text, idx, edited)
    .filter((segment) => segment.kind === "mark")
    .map((segment) => (segment.kind === "mark" ? segment.term : ""));

describe("packet audit: a slash-joined requirement never gets its colour", () => {
  /**
   * THE LARGEST SINGLE DEFECT IN THE AUDIT: 12 of the 25 most recent packets, 21 term-instances.
   *
   * The backend's tokenizeSection SPLITS a token on "/" unless the normalized form is one of the
   * three entries in SLASH_FORMS ("ci cd", "a b", "r d"), so "HTML/CSS" is extracted as the two
   * requirements `html` and `css`. This file has no counterpart: WORD_RE admits "/" inside a word,
   * so "HTML/CSS" arrives as ONE token, normalizes to the two-word key "html css", and matches
   * nothing in the index. Both requirements are silently colourless.
   */
  test("packet caac7680: Akuna 'HTML/CSS' leaves both amber requirements unmarked", () => {
    // Verbatim from spec._review.jd_text, packet caac7680-b36a-4dfa-9b45-c143ce12a0e1.
    const line = "Basic understanding of web programming languages (JavaScript, TypeScript, Python, HTML/CSS)";
    const idx = index(["javascript", "typescript", "python"], ["html", "css"]);
    assert.deepEqual(
      markedTerms(line, idx).filter((term) => term === "html" || term === "css"),
      ["html", "css"],
      "the scorer counted html and css as missing requirements; the JD pane marks neither",
    );
  });

  test("packet caac7680: Akuna 'Computer Science/Engineering' leaves two covered requirements unmarked", () => {
    const line = "Pursuing a Bachelors, Masters, or Ph.D. in technical field - Computer Science/Engineering or equivalent";
    const idx = index(["computer science", "engineering"]);
    assert.deepEqual(
      markedTerms(line, idx),
      ["computer science", "engineering"],
      "both terms scored as covered, so both must be blue in the JD pane",
    );
  });

  test("packet 2847b750: postman 'Python/Rust' and 'AWS/GCP/Azure' leave five requirements unmarked", () => {
    const line =
      "Solid Python/Rust fundamentals: data structures, functions, basic testing.\n" +
      "Nice to have: familiarity with a cloud platform (AWS/GCP/Azure), Docker, or a model-serving tool.";
    const idx = index(["python"], ["rust", "aws", "gcp", "azure"]);
    assert.deepEqual(
      markedTerms(line, idx).sort(),
      ["aws", "azure", "gcp", "python", "rust"],
      "five of this packet's twelve requirements are written slash-joined and none of them colour",
    );
  });

  test("packet 343b4285: Tower Research 'Linux/Unix' leaves both requirements unmarked", () => {
    const idx = index([], ["linux", "unix"]);
    assert.deepEqual(markedTerms("A working knowledge of Linux/Unix", idx), ["linux", "unix"]);
  });

  test("packet 890c0cc8: IMC 'VHDL/SystemVerilog' leaves both requirements unmarked", () => {
    const line = "Experience with hardware fundamentals, whether through VHDL/SystemVerilog development, HLS tools";
    const idx = index([], ["vhdl", "systemverilog"]);
    assert.deepEqual(markedTerms(line, idx).sort(), ["systemverilog", "vhdl"]);
  });
});

describe("packet audit: the green 'edited' tone can never fire on a real edited term", () => {
  /**
   * TWO normalizeTerm FUNCTIONS IN THIS DIRECTORY, and they are not the same function.
   *
   *   requirement-terms.ts:27  toLowerCase, delete [.'], EVERY other non-[a-z0-9+#] becomes a SPACE
   *   application-review.ts:133 toLowerCase, DELETE every character outside [a-z0-9+#./-]
   *
   * explicitTerms() builds the editedTerms set with the second one; segmentText looks words up with
   * the first. So the set holds "node.js", "ci/cd", "machine-learning" and "productengineering",
   * while the lookup keys are "nodejs", "ci cd", "machine learning", "product" and "engineering".
   * They can only ever agree on a single bare alphanumeric word.
   *
   * Every multiword, dotted, slashed or hyphenated edit is therefore invisible in the resume pane.
   * app/dashboard/applications/qa-data.ts ships exactly such fixtures ("Product Engineering",
   * "Distributed Systems", "Voice AI"), so the QA screen demonstrates the bug rather than the tone.
   */
  test("a dotted, slashed, hyphenated or multiword edited term is green only with posting evidence", () => {
    const edited = explicitTerms(["Node.js", "CI/CD", "Machine-Learning", "Product Engineering"]);
    const bullet = "Built Node.js services with CI/CD and Machine-Learning for Product Engineering.";
    const tones = marks(bullet, index(["nodejs", "ci cd", "machine learning", "product engineering"]), edited);
    assert.deepEqual(
      tones.map((mark) => mark?.text),
      ["Node.js", "CI/CD", "Machine-Learning", "Product Engineering"],
      "explicitTerms and segmentText normalize differently, so no edit is marked",
    );
  });

  test("tailoring provenance without a posting requirement stays uncoloured", () => {
    const edited = explicitTerms(["Node.js", "CI/CD", "Machine-Learning", "Product Engineering"]);
    const bullet = "Built Node.js services with CI/CD and Machine-Learning for Product Engineering.";
    assert.deepEqual(marks(bullet, index([]), edited), []);
  });

  test("explicitTerms produces keys segmentText can never look up", () => {
    assert.deepEqual(
      [...explicitTerms(["Node.js", "CI/CD", "Machine-Learning", "Product Engineering"])],
      ["nodejs", "ci cd", "machine learning", "product engineering"],
      "the edited-term set must be keyed the way the resume pane keys the words it reads",
    );
  });
});

describe("packet audit: a covered requirement must be blue in BOTH panes", () => {
  /**
   * The backend's resumeCovers matches in BOTH number directions: it singularizes the JD term AND
   * it retries the resume word with an "s"/"es" suffix. lookupTone here only ever singularizes the
   * CANDIDATE, so it cannot get from the resume's "Software Developer" to the plural requirement
   * key "software developers". The score counts it; the resume pane shows nothing.
   *
   * Packet 0c6e832a, Five Rings "Summer Intern 2027 - Software Developer". The posting writes
   * "mentored by experienced Software Developers"; the resume's target_role is the singular.
   */
  test("packet 0c6e832a: plural requirement 'software developers' finds no blue on the resume", () => {
    const idx = index(["software developers"]);
    assert.deepEqual(
      markedTerms("Software Developer Intern, Five Rings", idx),
      ["software developers"],
      "resumeCovers credited this term; the resume pane must show the student where",
    );
  });
});

describe("packet audit: overlapping requirements swallow one another", () => {
  /**
   * segmentText is greedy longest-first FROM EACH TOKEN and advances the cursor past whatever it
   * consumed, so of two requirements that overlap on a shared word only the leftmost ever marks.
   *
   * Packet 90062b81, Point72 "Quantitative Developer Intern". The posting says "Point72 Internal
   * Alpha Capture (IAC)" and the extractor takes BOTH `internal alpha` and `alpha capture` out of
   * it. "Internal Alpha" marks; "Alpha Capture" is consumed and never colours anywhere.
   */
  test("packet 90062b81: 'alpha capture' is eaten by 'internal alpha' and never marks", () => {
    const idx = index(["internal alpha"], ["alpha capture"]);
    const terms = markedTerms("Point72 Internal Alpha Capture (IAC) is developing trading signals", idx);
    assert.ok(
      terms.includes("alpha capture"),
      `both requirements are counted in the score; only ${JSON.stringify(terms)} is coloured`,
    );
  });
});
