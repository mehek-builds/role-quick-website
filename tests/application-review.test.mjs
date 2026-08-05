import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mergeDiscoveredQuestions, portalName, reviewablePackets } from "../features/applications/domain/application-review.ts";

describe("dashboard application review compatibility", () => {
  test("legacy resumes without review metadata cannot become dead selectable cards", () => {
    const legacy = { id: "legacy", spec: {} };
    const current = { id: "current", spec: { _review: { jd_text: "Build software" } } };

    assert.deepEqual(reviewablePackets([legacy, current]), [current]);
  });

  test("recognizes the common portal families used by review packets", () => {
    assert.equal(portalName("https://job-boards.greenhouse.io/acme/jobs/123"), "Greenhouse");
    assert.equal(portalName("https://jobs.ashbyhq.com/acme/123"), "Ashby");
    assert.equal(portalName("https://acme.wd1.myworkdayjobs.com/job/123"), "Workday");
    assert.equal(portalName("https://careers.acme.com/jobs/123"), "the company's application page");
  });

  test("adds portal-discovered questions without overwriting an answer already edited locally", () => {
    const local = [
      { id: "why-us", question: "Why us?", answer: "My reviewed answer", kind: "essay", required: true },
    ];
    const discovered = [
      { id: "why-us", question: "Why us?", answer: "Server draft", kind: "essay", required: true },
      { id: "work-auth", question: "Authorized to work?", answer: "", kind: "required", required: true },
    ];

    assert.deepEqual(mergeDiscoveredQuestions(local, discovered), [
      { id: "why-us", question: "Why us?", answer: "My reviewed answer", kind: "essay", required: true },
      { id: "work-auth", question: "Authorized to work?", answer: "", kind: "required", required: true },
    ]);
  });

  test("dedupes rediscovered questions by label and keeps the non-empty answer", () => {
    const local = [
      { id: "old-gender", question: "gender", answer: "", kind: "required", required: true },
      { id: "old-work-auth", question: "Are you legally authorized to work in the country in which you are applying?", answer: "", kind: "required", required: true },
    ];
    const discovered = [
      { id: "new-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
      { id: "new-work-auth", question: "are you legally authorized to work in the country in which you are applying?", answer: "Yes", kind: "required", required: true },
    ];

    assert.deepEqual(mergeDiscoveredQuestions(local, discovered), [
      { id: "new-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
      { id: "new-work-auth", question: "are you legally authorized to work in the country in which you are applying?", answer: "Yes", kind: "required", required: true },
    ]);
  });

  test("prefers a non-empty local duplicate over a later blank duplicate", () => {
    const local = [
      { id: "answered-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
      { id: "blank-gender", question: "gender", answer: "", kind: "required", required: true },
    ];
    const discovered = [
      { id: "new-gender", question: "gender", answer: "", kind: "required", required: true },
    ];

    assert.deepEqual(mergeDiscoveredQuestions(local, discovered), [
      { id: "new-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
    ]);
  });

  test("prefers the non-empty label match when the discovered id matches a blank duplicate", () => {
    const local = [
      { id: "answered-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
      { id: "blank-gender", question: "gender", answer: "", kind: "required", required: true },
    ];
    const discovered = [
      { id: "blank-gender", question: "gender", answer: "", kind: "required", required: true },
    ];

    assert.deepEqual(mergeDiscoveredQuestions(local, discovered), [
      { id: "blank-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
    ]);
  });

  test("dedupes duplicate discovered labels before sending answers back", () => {
    const discovered = [
      { id: "answered-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
      { id: "blank-gender", question: "gender", answer: "", kind: "required", required: true },
    ];

    assert.deepEqual(mergeDiscoveredQuestions([], discovered), [
      { id: "answered-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
    ]);
  });

  test("keeps required metadata when an answered duplicate arrives later", () => {
    const discovered = [
      { id: "required-gender", question: "gender", answer: "", kind: "required", required: true },
      { id: "answered-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: false },
    ];

    assert.deepEqual(mergeDiscoveredQuestions([], discovered), [
      { id: "required-gender", question: "gender", answer: "Decline to self-identify", kind: "required", required: true },
    ]);
  });
});
