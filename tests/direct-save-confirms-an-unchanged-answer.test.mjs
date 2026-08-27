import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* A DIRECT SAVE OF AN UNCHANGED ANSWER MUST STILL MINT THE APPLICANT'S CLAIM.
 *
 * MEASURED live on trylitos.com, 2026-08-27, Akuna "Software Engineer Intern - Python, Summer 2027"
 * (packet 767d9e42). The sponsorship disclaimer arrived PRE-FILLED "Yes". The direct question card
 * asked for it anyway, and pressing Yes posted unchanged bytes. Read back off the packet afterwards:
 *
 *   top-preference / Chicago / prior-application / pronunciation / certification / PDF ack
 *                                        -> value CHANGED -> answer_source: "applicant_review"
 *   sponsorship disclaimer (already "Yes") -> value UNCHANGED -> answer_source: undefined
 *
 * That absence is not cosmetic. eb8cf2d reads an absent answer_source as a MACHINE answer, so the
 * row counts as unacknowledged; `questionsMatch` in submissionRunner is then false, and that is the
 * one condition under which the employer-delivery re-hash may NOT stand down. The packet parked on
 * "the application questions, how Litos reaches this employer" and could never converge, because
 * re-pressing Yes is unchanged on every pass. Three full approve->fill cycles, never settling.
 *
 * The gate read `intent === "confirm" || intent === "review"`, so a card whose intent is "answer"
 * - the third and last member of DirectQuestionTaskIntent - minted nothing. All three are ONE
 * question on its own screen with its own save press, which is the per-question deliberateness bar
 * the flag exists to hold.
 *
 * THE 802-LAUNDERING GUARD IS UNCHANGED and is the reason this widening is safe: `direct` is
 * single-question by construction, so no bulk save reaches this branch whatever its intent. The
 * incident that guard exists for (802 answers across 174 packets flipped to "hers", including EEO
 * self-identifications and sponsorship declarations) was a BULK stamp over a merged list. */
const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

describe("a single-question direct save claims its answer whether or not it changed", () => {
  test("the mint gate is the presence of a direct task, not its intent", () => {
    assert.match(
      page,
      /const directlyConfirmed = Boolean\(direct\)\s*\n\s*&& question\.id === direct\?\.questionId\s*\n\s*&& question\.answer\.trim\(\);/,
      "every single-question direct save must mint, including intent 'answer'",
    );
    assert.doesNotMatch(
      page,
      /const directlyConfirmed = \(direct\?\.intent === "confirm" \|\| direct\?\.intent === "review"\)/,
      "the intent-restricted gate is the defect: it left 'answer' unable to ever settle",
    );
  });

  test("it still only ever claims the ONE question the direct task is about", () => {
    // The whole safety argument. If this ever became a match on anything broader than the direct
    // task's own questionId, a bulk save could mint claims over answers she never touched.
    const match = page.match(/const directlyConfirmed = ([\s\S]{0,220}?);\n/);
    assert.ok(match, "the expression must still be findable");
    assert.match(match[1], /question\.id === direct\?\.questionId/, "still keyed to the single question");
    assert.match(match[1], /question\.answer\.trim\(\)/, "a confirmation of a blank still claims nothing");
  });

  test("the behaviour, run rather than read back", () => {
    const match = page.match(/const directlyConfirmed = ([\s\S]{0,220}?);\n/);
    const mint = new Function("direct", "question", `return Boolean(${match[1]});`);
    const q = (id, answer) => ({ id, answer });

    // The Akuna row: unchanged value, intent "answer". This is the case that could never settle.
    assert.equal(mint({ intent: "answer", questionId: "q1" }, q("q1", "Yes")), true);
    // The two that already worked stay working.
    assert.equal(mint({ intent: "confirm", questionId: "q1" }, q("q1", "Yes")), true);
    assert.equal(mint({ intent: "review", questionId: "q1" }, q("q1", "drafted essay")), true);
    // A different question on the same save is never claimed.
    assert.equal(mint({ intent: "answer", questionId: "q1" }, q("q2", "Female")), false);
    // A blank claims nothing, however deliberate the press.
    assert.equal(mint({ intent: "confirm", questionId: "q1" }, q("q1", "   ")), false);
    // No direct task at all - a bulk save - claims nothing. This is the 802 guard.
    assert.equal(mint(null, q("q1", "Decline to self-identify")), false);
    assert.equal(mint(undefined, q("q1", "Yes")), false);
  });
});
