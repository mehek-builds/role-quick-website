import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { exactQuestionOption } from "../features/applications/domain/question-review-presentation.ts";

/* A STORED ANSWER THAT IS NOT ON THE EMPLOYER'S LIST MUST READ AS UNANSWERED.
 *
 * MEASURED live on trylitos.com, 2026-08-27, on a Five Rings Greenhouse packet. The stored answer
 * to "how did you first hear about five rings?" was "Job board" - a value on no employer list,
 * written by a backend defect fixed separately. The question card renders that answer into a
 * <select>, and a <select> whose value matches no <option> does NOT stay blank: the browser
 * selects the first selectable entry and reports it as the value. Read straight off the live DOM:
 *
 *     { value: "Coffee Chat", selectedIndex: 1 }
 *
 * So the control displayed, and would have submitted, "Coffee Chat" - a claim that she had a
 * coffee chat with the firm, which never happened. One Save was all it needed.
 *
 * This is not a cosmetic default. Referral lists are ordered warmest-first, so the first option is
 * almost always a relationship claim: a coffee chat, a referral, a recruiter, a career fair. The
 * product rule is that Litos never auto-picks one of those, and the resolver honours it - this was
 * the one place the rule could be broken without any code choosing to break it.
 *
 * MEMBERSHIP IS THE FILL PATH'S EQUIVALENCE, NOT BYTE EQUALITY. The converse defect was measured
 * on the Mytos Lever packet (application 55de7c9e, 2026-08-28): the stored answer "GPA 3.5-3.8"
 * names one of the nine offered options to every backend reader (which matches trimmed and
 * case-insensitively), but byte-strict membership refused it, so the select opened on the
 * placeholder every visit and re-picking her own saved answer counted as an edit that voided the
 * acknowledged exact-packet audit. exactQuestionOption resolves the stored answer to the OFFERED
 * label it names, and still resolves an off-list answer to nothing.
 */
const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

describe("an off-list answer cannot impersonate the first option", () => {
  test("the select falls back to the placeholder rather than to the answer", () => {
    assert.match(
      page,
      /value=\{selectedExactOption \?\? ""\}/,
      "the question-card select must render '' when the answer names no offered option",
    );
    assert.match(
      page,
      /const selectedExactOption = !acceptsMultipleOptions && exactOptions\.length > 0\s*\n\s*\? exactQuestionOption\(answer, exactOptions\)\s*\n\s*: null;/,
      "the displayed choice must resolve through the fill path's own equivalence",
    );
    assert.doesNotMatch(
      page,
      /<select\s*\n\s*value=\{answer\}/,
      "a bare value={answer} is the defect: it lands the control on option one",
    );
  });

  test("the placeholder is present and unselectable, so '' shows but cannot be submitted", () => {
    assert.match(page, /<option value="" disabled>Choose an answer<\/option>/);
  });

  test("the behaviour is exercised, not just pinned", () => {
    // The real resolver, run against the live Five Rings values: off-list still reads as
    // unanswered, and an on-list answer still shows.
    const options = ["Coffee Chat", "Conference", "Other"];
    assert.equal(exactQuestionOption("Job board", options), null, "an off-list answer reads as unanswered");
    assert.equal(exactQuestionOption("", options), null, "an empty answer stays empty");
    assert.equal(exactQuestionOption("Other", options), "Other", "an on-list answer is still shown");
    assert.equal(exactQuestionOption("Coffee Chat", options), "Coffee Chat", "including one she really did pick");
  });

  test("the stored Mytos answer reads as the choice it names, never as unanswered", () => {
    // The converse case, with the production option list shape: the stored, server-accepted
    // answer binds its offered label even when the bytes differ by edge whitespace or case.
    const options = ["First-Class Honours", "GPA 3.8-4.0", "GPA 3.5-3.8", "GPA 3.0-3.5", "Other"];
    assert.equal(exactQuestionOption("GPA 3.5-3.8", options), "GPA 3.5-3.8");
    assert.equal(exactQuestionOption("gpa 3.5-3.8", options), "GPA 3.5-3.8", "case skew still names the option");
    assert.equal(exactQuestionOption("GPA 3.5-3.8\n", options), "GPA 3.5-3.8", "edge whitespace still names the option");
    assert.equal(exactQuestionOption("3.89/4.00 (US 4.0 scale)", options), null, "the unfit draft text stays off-list");
  });
});
