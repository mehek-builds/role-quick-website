import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

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
 */
const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

describe("an off-list answer cannot impersonate the first option", () => {
  test("the select falls back to the placeholder rather than to the answer", () => {
    assert.match(
      page,
      /value=\{task\.question\.options\.includes\(answer\) \? answer : ""\}/,
      "the question-card select must render '' when the answer is not one of the options",
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
    // The predicate itself, lifted out and run: this is the whole fix, and it is small enough that
    // reading it back as text would prove nothing about what it does.
    const match = page.match(/value=\{(task\.question\.options\.includes\(answer\) \? answer : "")\}/);
    assert.ok(match, "the fallback expression must still be findable");
    const choose = new Function("task", "answer", `return ${match[1]};`);
    const task = { question: { options: ["Coffee Chat", "Conference", "Other"] } };
    assert.equal(choose(task, "Job board"), "", "an off-list answer reads as unanswered");
    assert.equal(choose(task, ""), "", "an empty answer stays empty");
    assert.equal(choose(task, "Other"), "Other", "an on-list answer is still shown");
    assert.equal(choose(task, "Coffee Chat"), "Coffee Chat", "including one she really did pick");
  });
});
