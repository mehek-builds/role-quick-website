import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  optionalQuestionNeedsDecision,
  questionReviewPresentation,
  questionsLeftBlankByKnownFalseCondition,
  requiredQuestionReviewRoute,
  unansweredRequiredQuestionCount,
} from "../features/applications/domain/question-review-presentation.ts";
import { directInputTaskPlan } from "../features/applications/domain/submission-checklist.ts";

/* A QUESTION LITOS ASKS THAT SHE CANNOT TRUTHFULLY ANSWER.
 *
 * MEASURED live on the Hudson River Trading Greenhouse packet (application 4a79eec1, account
 * a18f774b-a306-4804-93f3-cd6020c27fb3, 2026-09-03), then confirmed against the employer's own
 * published form, boards-api.greenhouse.io/v1/boards/wehrtyou/jobs/8052083?questions=true, which
 * gives the order, the required flags and the exact option labels used below:
 *
 *   15  "Do you have any upcoming offer deadlines?"   required false, multi_value_single_select
 *       Less than 2 weeks | 2 to 4 weeks | More than 4 weeks | I have an offer with no deadline
 *       stored answer "No"
 *   16  "If yes, what company (or companies) do you have an offer from?"  required false, text
 *
 * She has no offer. All four choices assert that she has one, so no option on that list is true for
 * her, and the answer Litos already resolved is a word the employer never offered. The control
 * paints blank, the question re-opens on every visit, and `optionalQuestionNeedsDecision` feeds
 * `continuationBlocked`, so her only exit was Skip: a decision recorded about a question that
 * should never have reached her.
 */

const OFFER_DEADLINES = "Do you have any upcoming offer deadlines?";
const OFFER_COMPANY = "If yes, what company (or companies) do you have an offer from?";
const OFFER_DEADLINE_OPTIONS = [
  "Less than 2 weeks",
  "2 to 4 weeks",
  "More than 4 weeks",
  "I have an offer with no deadline",
];
/* Question 20 and its follow-up 21 on the same measured form. Before volley #845 the backend's
   offer rule reached this one too and stored "No" on it, so it is the exact near miss this rule has
   to refuse: it has no polar opener, and "If you equally prefer" is not a backward reference. */
const OFFICE_LOCATION = "Please select your top preferred HRT office location. Return offers will be specific to the office you have selected.";
const OFFICE_SECOND_CHOICE = "If you equally prefer two office locations, please indicate the other below";
const OFFICE_OPTIONS = ["Austin", "Chicago", "New York", "London", "Singapore"];

const closed = (id, question, answer, options, required = false, extra = {}) => ({
  id,
  question,
  answer,
  options,
  options_complete: true,
  optionsComplete: true,
  portal_input_type: "combobox",
  kind: "required",
  required,
  ...extra,
});

const text = (id, question, answer, required = false, extra = {}) => ({
  id,
  question,
  answer,
  options: null,
  portal_input_type: "text",
  kind: "required",
  required,
  ...extra,
});

/** The two questions as they actually stand on the live packet. */
const hrtOfferBlock = (extra = {}) => [
  closed("q_15", OFFER_DEADLINES, "No", OFFER_DEADLINE_OPTIONS, false, extra),
  text("q_16", OFFER_COMPANY, "No"),
];

const presentedById = (questions) => new Map(
  questionReviewPresentation(questions).editableQuestions.map((question) => [question.id, question]),
);

describe("the measured Hudson River Trading offer block", () => {
  test("the question with no true option is left blank instead of put in front of her", () => {
    const questions = hrtOfferBlock();
    const blanks = questionsLeftBlankByKnownFalseCondition(questions);
    assert.equal(blanks.get("q_15"), OFFER_DEADLINES);

    const presented = presentedById(questions).get("q_15");
    assert.equal(presented.answer_state, "skipped");
    assert.equal(presented.answer, "", "the presented control is blank, not holding an off-list word");
    assert.equal(presented.answer_draft, "No", "and the word Litos resolved is still shown to her");
  });

  test("the screen stops halting on it, which is the defect", () => {
    const questions = hrtOfferBlock();
    const editable = questionReviewPresentation(questions).editableQuestions;
    assert.equal(
      editable.some(optionalQuestionNeedsDecision),
      false,
      "an optional question nobody can answer truthfully no longer owes a decision",
    );
    assert.equal(requiredQuestionReviewRoute(questions).kind, "continue");
    assert.equal(unansweredRequiredQuestionCount(questions), 0);
  });

  test("it is not handed to her one question at a time either", () => {
    /* The same rule has to reach the one-at-a-time navigator, or the questions screen clears and
       the "your turn" queue still opens on the question she cannot answer. */
    const plan = directInputTaskPlan({
      status: "needs_attention",
      attention_reason: `Answer required: ${OFFER_DEADLINES}`,
      questions: hrtOfferBlock(),
      filled_fields: [],
      question_metadata_blockers: [],
    });
    assert.equal(plan.questionTasks.some((task) => task.question.id === "q_15"), false);
  });

  test("the screen is told Litos left it blank, and which condition decided that", () => {
    const presentation = questionReviewPresentation(hrtOfferBlock());
    assert.deepEqual(presentation.leftBlankQuestions, [
      { questionId: "q_15", conditionQuestion: OFFER_DEADLINES },
    ]);
  });

  test("the re-opened shape is the same fact and gets the same answer", () => {
    /* The backend's reopenUnfitClosedChoiceQuestions blanks a closed answer that fits no exact
       option and parks it in answer_draft. Reading only `answer` would mean this rule fired before
       that pass and stopped firing after it, on identical facts. */
    const reopened = [
      closed("q_15", OFFER_DEADLINES, "", OFFER_DEADLINE_OPTIONS, false, { answer_draft: "No" }),
      text("q_16", OFFER_COMPANY, "No"),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(reopened).get("q_15"), OFFER_DEADLINES);
    assert.equal(
      questionReviewPresentation(reopened).editableQuestions.some(optionalQuestionNeedsDecision),
      false,
    );
  });

  test("a blank with nothing resolved for it is still hers, because nothing is known", () => {
    const nothingKnown = [
      closed("q_15", OFFER_DEADLINES, "", OFFER_DEADLINE_OPTIONS),
      text("q_16", OFFER_COMPANY, ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(nothingKnown).size, 0);
    assert.equal(
      questionReviewPresentation(nothingKnown).editableQuestions.some(optionalQuestionNeedsDecision),
      true,
      "with no negative on file this is exactly the decision she does owe",
    );
  });
});

describe("a required question with no true option still reaches the applicant", () => {
  /* THE ONE ARM THAT MUST NEVER BE OPTIMISED AWAY. A required question whose options are all untrue
     is an EMPLOYER FORM problem, and she is the only party who can decide what to do about it. A
     silent skip sends a blank required field, which the portal either refuses outright or accepts
     as an answer she never gave. */
  const requiredBlock = () => [
    closed("q_15", OFFER_DEADLINES, "No", OFFER_DEADLINE_OPTIONS, true),
    text("q_16", OFFER_COMPANY, ""),
  ];

  test("it is never left blank, and it settles nothing for the questions under it", () => {
    assert.equal(questionsLeftBlankByKnownFalseCondition(requiredBlock()).has("q_15"), false);
    /* AND ITS FOLLOW-UP STAYS TOO. Every option on a shape B question asserts the affirmative, so
       whatever she picks on the required one makes the condition TRUE. Blanking the follow-up on the
       strength of a negative she is about to overwrite would hide a question she is then owed. */
    assert.equal(questionsLeftBlankByKnownFalseCondition(requiredBlock()).has("q_16"), false);
    assert.deepEqual(questionReviewPresentation(requiredBlock()).leftBlankQuestions, []);
    assert.equal(presentedById(requiredBlock()).get("q_15").answer_state, undefined);
  });

  test("it still stops the send and still routes her to itself", () => {
    assert.equal(unansweredRequiredQuestionCount(requiredBlock()), 1);
    assert.deepEqual(requiredQuestionReviewRoute(requiredBlock()), { kind: "answer", questionId: "q_15" });
  });

  test("a required follow-up under a known-false condition is also still asked", () => {
    const questions = [
      closed("sponsor", "Do you require visa sponsorship?", "No", ["Yes", "No"], true),
      text("sponsor_detail", "If yes, what type of visa do you hold?", "", true),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).has("sponsor_detail"), false);
    assert.deepEqual(
      requiredQuestionReviewRoute(questions),
      { kind: "answer", questionId: "sponsor_detail" },
    );
  });
});

describe("the ordinary yes/no parent, which is the shape every board writes", () => {
  const sponsorship = (followUpAnswer = "") => [
    closed("sponsor", "Do you require visa sponsorship?", "No", ["Yes", "No"]),
    text("sponsor_detail", "If yes, what type of visa do you hold?", followUpAnswer),
  ];

  test("its optional follow-up is not hers once she is on the no", () => {
    const blanks = questionsLeftBlankByKnownFalseCondition(sponsorship());
    assert.equal(blanks.get("sponsor_detail"), "Do you require visa sponsorship?");
    /* The parent itself is ANSWERED. Nothing about it changes. */
    assert.equal(blanks.has("sponsor"), false);
    assert.equal(presentedById(sponsorship()).get("sponsor").answer, "No");
  });

  test("an answer she can see standing in the follow-up is left exactly as it is", () => {
    const blanks = questionsLeftBlankByKnownFalseCondition(sponsorship("H-1B, expiring 2029"));
    assert.equal(blanks.has("sponsor_detail"), false);
    assert.equal(
      presentedById(sponsorship("H-1B, expiring 2029")).get("sponsor_detail").answer,
      "H-1B, expiring 2029",
      "the rule never discards a value",
    );
  });

  test("a yes on the parent brings the follow-up straight back", () => {
    const questions = [
      closed("sponsor", "Do you require visa sponsorship?", "Yes", ["Yes", "No"]),
      text("sponsor_detail", "If yes, what type of visa do you hold?", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).size, 0);
    assert.equal(
      questionReviewPresentation(questions).editableQuestions.some(optionalQuestionNeedsDecision),
      true,
    );
  });
});

describe("what the parent link refuses to pair", () => {
  test("a choice list with no polar opener and no backward reference is untouched", () => {
    /* THE NEAR MISS, and the reason a shared noun is not enough on its own. Before volley #845 the
       backend's offer rule stored "No" on this required office choice. Optional or not, it is a
       genuine choice with real consequences printed in its own label, and a rule that reached it
       would hide it behind an answer nobody made. */
    const questions = [
      closed("q_20", OFFICE_LOCATION, "No", OFFICE_OPTIONS),
      closed("q_21", OFFICE_SECOND_CHOICE, "", OFFICE_OPTIONS),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).size, 0);
  });

  test("a polar question the form never follows up on is untouched", () => {
    /* The very question this rule was written for, on a form that asks it and then moves on. With
       no follow-up saying "if yes", nothing but the prompt's own grammar suggests it is a
       condition, and grammar alone is not evidence. She is asked, which costs one extra question. */
    const questions = [
      closed("q_15", OFFER_DEADLINES, "No", OFFER_DEADLINE_OPTIONS),
      closed("language", "What is your preferred coding language?", "", ["Python", "C++"]),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).size, 0);
  });

  test("a non-polar question with an explicit follow-up under it is untouched", () => {
    /* THE OTHER HALF OF THE PAIR, and the more expensive one to get wrong. This prompt carries a
       real backward reference below it and a closed list with no way to say none, so everything
       except the grammar lines up. It is not a yes/no question, so it is not a condition, and
       hiding a sanctions-compliance question behind an answer nobody made is the worst outcome
       available in this file. A stray "No" written into the wrong control is not hypothetical: the
       backend's offer rule put one on HRT's office choice until volley #845. */
    const questions = [
      closed(
        "sanctions",
        "Select the country your work has involved. Note: this information is only used to ensure compliance with U.S. sanctions.",
        "No",
        ["Cuba", "Iran", "North Korea", "Syria"],
        false,
        { portal_input_type: "radio" },
      ),
      /* Affirmative and polarity-stating on purpose. An unstated follow-up would stand shape B down
         one guard earlier, and this test would then pass without the polar reading being run. */
      text("sanctions_detail", "If yes, please provide additional detail about that work.", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).size, 0);
  });

  test("a decline option does not turn a list that offers no yes into a yes/no question", () => {
    /* "I don't wish to answer" IS a way to say no, and on an EEO list it is the only one. A list
       with no yes on it is not a polar question however negative one of its options reads, and
       without that test a stray "No" on the gender control would read as an established condition
       and take the question below it off the screen with it. */
    const questions = [
      closed("gender", "What is your gender?", "No", ["Woman", "Man", "Non-binary", "I don't wish to answer"]),
      /* Affirmative, and it names the same subject, so ONLY the missing yes on that list keeps this
         pair apart. Both other guards are satisfied here by construction. */
      text("gender_detail", "If yes, how would you like your gender recorded?", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).size, 0);
  });

  test("an off-list answer that is not a negative is untouched", () => {
    /* The HRT gender question, measured the same day: required, and its stored answer was the
       profile spelling "Female", which no offered option holds. That is a vocabulary mismatch, not
       a condition, and it must reach her. */
    const questions = [
      closed("gender", "What is your gender?", "Female", ["Woman", "Man", "Non-binary", "I don't wish to answer"], true),
      text("gender_detail", "If you selected another option above, please specify.", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).size, 0);
  });

  test("an incomplete option inventory is untouched", () => {
    const questions = [
      { ...closed("q_15", OFFER_DEADLINES, "No", OFFER_DEADLINE_OPTIONS), options_complete: false },
      text("q_16", OFFER_COMPANY, ""),
    ];
    assert.equal(
      questionsLeftBlankByKnownFalseCondition(questions).size,
      0,
      "discovery kept fewer choices than it saw, so a truthful option may be one of the ones it dropped",
    );
  });

  test("a box with no list at all is untouched, because it accepts the answer already", () => {
    const questions = [
      text("q_15", OFFER_DEADLINES, "No"),
      text("q_16", OFFER_COMPANY, ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).size, 0);
  });

  test("a free-text box that merely carries suggestions is untouched too", () => {
    /* Membership means nothing on a control that accepts anything she types, so the stored "No" is
       already a perfectly good answer sitting on the form and there is nothing here to repair. */
    const questions = [
      { ...closed("q_15", OFFER_DEADLINES, "No", OFFER_DEADLINE_OPTIONS), portal_input_type: "text" },
      text("q_16", OFFER_COMPANY, ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).size, 0);
  });

  test("a negative already on the employer's list is untouched", () => {
    /* If she can say no on the control, the control is not the problem, and an answer that misses
       the label is an ordinary off-list value the existing rules already handle. */
    const questions = [
      closed("offers", "Do you have any current offers?", "No", ["Yes", "No"]),
      closed("also", "Do you have any interviews scheduled?", "", ["Yes", "No"]),
    ];
    const blanks = questionsLeftBlankByKnownFalseCondition(questions);
    assert.equal(blanks.has("offers"), false);
    assert.equal(blanks.has("also"), false);
  });

  test("an affirmative option holding the word no is not read as a way to say no", () => {
    /* "I have an offer with no deadline" is the whole reason the option test is anchored at the
       start of the label. Read as a negative it would find a no on HRT's list, stand the rule down,
       and leave the defect exactly where it was. */
    const blanks = questionsLeftBlankByKnownFalseCondition(hrtOfferBlock());
    assert.equal(blanks.has("q_15"), true);
  });

  test("a chain of follow-ups resolves to the condition at its head, not to the middle of itself", () => {
    const questions = [
      closed("offers", "Do you have any outstanding offers?", "No", ["Yes", "No"]),
      text("which", "If yes, which firms have made you an offer?", ""),
      text("when", "If yes to the above, when does each offer expire?", ""),
      text("start", "If hired, when could you start?", ""),
    ];
    const blanks = questionsLeftBlankByKnownFalseCondition(questions);
    assert.equal(blanks.get("which"), "Do you have any outstanding offers?");
    assert.equal(blanks.get("when"), "Do you have any outstanding offers?");
    assert.equal(
      blanks.has("start"),
      false,
      "a prompt carrying its own condition is free-standing and is never chained to what sat above it",
    );
  });

  test("a question held back as a metadata blocker is not announced as left blank", () => {
    const questions = [
      { ...closed("q_15", OFFER_DEADLINES, "No", []), options: [] },
      text("q_16", OFFER_COMPANY, ""),
    ];
    const presentation = questionReviewPresentation(questions);
    assert.deepEqual(presentation.leftBlankQuestions, []);
    assert.ok(presentation.metadataBlockers.length > 0, "it is still reported, not silently lost");
  });
});

describe("a follow-up the condition does NOT take with it", () => {
  /* PR #530 review, both reproduced on the merged tree before the guards below existed. A
     backward reference proves a follow-up points UP. It proves neither which answer makes the
     follow-up apply nor which question above it means, and under subtraction each gap takes a
     question off the screen that the applicant was owed. */

  test("a follow-up conditioned on the NO is asked exactly when the answer is no", () => {
    /* THE WORST CASE THE REVIEW FOUND, and BACKWARD_REFERENCE_PATTERNS matches "if no" on purpose:
       dependent-questions.test.mts asserts questionDependsOnPrior("If no, why not?") is true. So
       this follow-up was a dependent of a known-false condition, and the condition being false is
       precisely why it applies. Sponsorship is the most consequential question on a US form, and
       only `required` stood between it and a silent blank. */
    const questions = [
      closed("auth", "Are you legally authorized to work in the United States?", "No", ["Yes", "No"]),
      text("sponsor", "If no, will you now or in the future require sponsorship for an employment visa?", ""),
    ];
    const blanks = questionsLeftBlankByKnownFalseCondition(questions);
    assert.equal(blanks.has("sponsor"), false);
    assert.equal(
      questionReviewPresentation(questions).editableQuestions.some(optionalQuestionNeedsDecision),
      true,
      "it is still hers to answer or skip",
    );
  });

  test("the other spellings of a negative condition are asked too", () => {
    for (const prompt of [
      "If not, please explain your work authorization status.",
      "If you answered no to the question above, tell us what you will need.",
      "If you selected \u201cNo\u201d above, describe your situation.",
      "If the answer above is no, when will that change?",
    ]) {
      const questions = [
        closed("auth", "Are you legally authorized to work in the United States?", "No", ["Yes", "No"]),
        text("child", prompt, ""),
      ];
      assert.equal(
        questionsLeftBlankByKnownFalseCondition(questions).has("child"),
        false,
        `a negative-conditioned follow-up was hidden: ${prompt}`,
      );
    }
  });

  test("a follow-up that states no polarity at all is asked", () => {
    /* The measured Lever prompt this module was originally written for. It refers backward and says
       nothing about which way it points, and unstated is not affirmative. */
    const questions = [
      closed("sanctions", "Are you subject to any sanctions restrictions?", "No", ["Yes", "No"]),
      text("detail", "If you selected a response to the prior question, please provide additional detail.", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).has("detail"), false);
  });

  test("a nearer question cannot steal parenthood and take a follow-up down with it", () => {
    /* PROXIMITY PROVES THAT A PARENT EXISTS, NEVER WHICH. dependentQuestionParents resolves to the
       nearest free-standing question above, so the relocation question is named here and the
       clearance follow-up was blanked against it. In #526's use a mispair only ADDED a question to
       the queue, which is safe; this use SUBTRACTS one, so the pair has to be about the same thing
       before it counts. */
    const questions = [
      closed("clearance", "Do you hold an active security clearance?", "Yes", ["Yes", "No"]),
      closed("relocate", "Are you willing to relocate?", "No", ["Yes", "No"]),
      text("level", "If yes, what level of clearance do you hold?", ""),
    ];
    const blanks = questionsLeftBlankByKnownFalseCondition(questions);
    assert.equal(blanks.has("level"), false);
  });

  test("a follow-up with no subject of its own is asked, which is the price of that guard", () => {
    /* "If yes, please explain." shares nothing with anything, so proximity is the only evidence
       available for it and proximity can be stolen. She is asked. That costs one screen and cannot
       hide a question, which is the direction this whole module errs in. */
    const questions = [
      closed("sponsor", "Do you require visa sponsorship?", "No", ["Yes", "No"]),
      text("explain", "If yes, please explain.", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).has("explain"), false);
  });

  test("an \"if no\" follow-up still proves the question above it is answerable yes or no", () => {
    /* The negative openers are not merely a refusal list. A follow-up opening "if no" is the form
       stating that the question above has a no arm, which is exactly the evidence shape B needs,
       even though that follow-up is never taken along itself. Read as unstated instead, HRT's own
       question would go back to being asked. */
    const questions = [
      closed("q_15", OFFER_DEADLINES, "No", OFFER_DEADLINE_OPTIONS),
      text("why", "If no, why not?", ""),
    ];
    const blanks = questionsLeftBlankByKnownFalseCondition(questions);
    assert.equal(blanks.get("q_15"), OFFER_DEADLINES, "the condition is still proved polar");
    assert.equal(blanks.has("why"), false, "and the follow-up that applies on the no is still asked");
  });

  test("two prompts sharing only form furniture do not count as being about the same thing", () => {
    /* The subject test is only as good as what it throws away. Here the sponsorship question is the
       real parent, the willingness question sits closer and takes parenthood, and the follow-up
       shares "your", "employer", "provide" and "details" with the thief: generic application-form
       vocabulary, present on half the questions of any form, and not evidence of anything. */
    const questions = [
      closed("sponsor", "Do you require visa sponsorship?", "Yes", ["Yes", "No"]),
      closed("contact", "Are you willing to provide your current employer's contact details?", "No", ["Yes", "No"]),
      text("who", "If yes, please list the employer that sponsors your visa.", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).has("who"), false);
  });

  test("a plural of form furniture is furniture too, not a shared subject", () => {
    /* The stopword list enumerates singulars it cannot enumerate every inflection of, so the fold
       to a stem is checked against it a SECOND time. Without that second check "forms" survives as
       "form" and bridges two prompts using the word in unrelated senses, which is a mispair built
       out of nothing but a plural. */
    const questions = [
      closed("offers", "Do you have any outstanding offers?", "Yes", ["Yes", "No"]),
      closed("consent", "Are you willing to sign our standard consent forms?", "No", ["Yes", "No"]),
      text("ident", "If yes, which forms of identification can you provide?", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).has("ident"), false);
  });

  test("shape B needs a follow-up that states a polarity, not merely one that points up", () => {
    /* A backward reference with no polarity proves a question sits above it and nothing about that
       question's shape, so it is not evidence that the question above is answerable yes or no. */
    const questions = [
      closed("q_15", OFFER_DEADLINES, "No", OFFER_DEADLINE_OPTIONS),
      text("detail", "If you selected a response to the prior question, please provide additional detail.", ""),
    ];
    assert.equal(questionsLeftBlankByKnownFalseCondition(questions).has("q_15"), false);
  });
});

describe("she can see it and take it back", () => {
  test("Answer instead stands the rule down and stays down", () => {
    const reopened = hrtOfferBlock({ answer_state: "unanswered" });
    assert.equal(questionsLeftBlankByKnownFalseCondition(reopened).size, 0);
    const presented = presentedById(reopened).get("q_15");
    assert.equal(presented.answer_state, "unanswered");
    assert.equal(presented.answer, "No", "and pressing it deleted nothing");
  });

  test("her own Skip is still recorded as hers", () => {
    const skipped = hrtOfferBlock({ answer_state: "skipped" });
    assert.equal(
      questionsLeftBlankByKnownFalseCondition(skipped).size,
      0,
      "so the badge does not relabel a decision she made as one Litos made",
    );
    assert.deepEqual(questionReviewPresentation(skipped).leftBlankQuestions, []);
  });
});

describe("the question screen", () => {
  const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

  test("does not print Skipped over a blank Litos left", () => {
    assert.match(
      page,
      /leftBlankConditions\.has\(question\.id\) \? "Left blank by Litos" : "Skipped"/,
      "the badge distinguishes her decision from Litos's",
    );
  });

  test("routes Answer instead through the writer that stands the rule down", () => {
    assert.match(page, /Answer instead/, "the way back is still on screen");
    assert.match(
      page,
      /onClick=\{\(\) => reopenSkippedQuestion\(question\.id\)\}/,
      "and it records unanswered rather than an absent state the rule would re-apply over",
    );
    assert.match(
      page,
      /reopenSkippedQuestion = \(questionId: string\) => \{[\s\S]{0,240}?answer_state: "unanswered" as const/,
    );
  });

  test("names the condition rather than describing the blank as her choice", () => {
    assert.match(page, /leftBlankConditions\.get\(question\.id\) === question\.question/);
    /* The sentence claims only what the rule now proves: this follow-up says it applies on a yes,
       and the answer to the question it names is no. It used to claim the parent itself was "not
       true for you", which was false for an "if no" follow-up and false again whenever proximity
       had named the wrong parent. */
    assert.match(page, /it applies only if the answer to/);
    /* Anchored on the rendered template literal, not the phrase: the comment above it in page.tsx
       quotes the old sentence to explain why it went. */
    assert.doesNotMatch(page, /`Litos left this blank: it follows up on/);
  });
});
