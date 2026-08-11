import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  normalizeResumeHistory,
  normalizeResumeHistoryEntry,
  PartialPayloadError,
} from "../features/applications/infrastructure/response-shape.ts";

/* Found live on trylitos.com/dashboard/applications on 2026-08-10, and measured against the
 * production database on 2026-08-11 for the owner account a18f774b-a306-4804-93f3-cd6020c27fb3:
 *
 *   generated_resumes rows for that user ............................... 158
 *   GET /resume/history rows returned .................................. 50   (a bare LIMIT 50)
 *   GET /applications/board cards returned ............................. 158  (BOARD_LIMIT = 200)
 *
 * One screen showed both numbers. The ledger heading read "50 of 50" and the board note under it
 * read "157 of 158 are not on the board yet", and the smaller number looked like the truth because
 * it was the one with a list beneath it.
 *
 * The window did more than mislead. The Tracker built `openableIds` from those 50 rows and handed
 * the set to Board, which disabled every card outside it: 108 of 158 cards were styled, focusable,
 * labelled and dead. A ?application=<id> deep link for one of them selected nothing and printed no
 * message, because the handler was `if (requested) selectPacket(requested)` with no else. Packet
 * 245c827a-daaa-463a-8026-04f89d6a69eb, a Deepgram application sitting at
 * ready_for_final_approval, was 83rd by recency: present in the database, waiting on the student,
 * and unreachable from the only screen that could act on it.
 *
 * The fix is not a larger window. It is that openability stops being a property of the window at
 * all: the board's own `reviewable` flag decides, and the packet is fetched by id when it is
 * opened. Three things are pinned here, and each one failed before:
 *
 *   1. The response's window is legible: total and next_cursor, defaulted honestly when a backend
 *      that predates them answers.
 *   2. Board gates on the card, not on a set of ids the parent happened to have loaded.
 *   3. The deep link either opens the application or says why. Never silence.
 *
 * Static source assertions for 2 and 3, in the style of tests/application-state-deeplink and
 * tests/packet-dialog-accessibility: they cannot prove the click works in a browser, only that the
 * code which made it work is still there.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments carry the words this file asserts on, so they come off before any structural check. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const board = stripComments(read("components/app/Board.tsx"));
const applications = stripComments(read("app/dashboard/applications/page.tsx"));

const packet = (id, reviewed = true) => ({
  id,
  job_context: { company: "Deepgram", role: "Engineer" },
  spec: reviewed ? { _review: { status: "ready_for_final_approval" } } : {},
  created_at: "2026-08-08T10:28:59.755Z",
});

describe("the history response says how big the window is", () => {
  test("total is the corpus, not the page", () => {
    const page = normalizeResumeHistory({ resumes: [packet("a"), packet("b")], total: 158, reviewable_total: 158, next_cursor: "abc" });
    assert.equal(page.resumes.length, 2);
    assert.equal(page.total, 158);
    assert.equal(page.reviewable_total, 158);
    assert.equal(page.next_cursor, "abc");
  });

  test("the ledger's denominator counts reviewable rows, which is what the ledger lists", () => {
    // An account holding resumes saved before they became applications: `total` would be the wrong
    // denominator for a list that only shows the reviewable ones, and the screen already names the
    // rest separately as "N resumes saved".
    const page = normalizeResumeHistory({ resumes: [packet("a"), packet("b", false)], total: 90, reviewable_total: 61 });
    assert.equal(page.total, 90);
    assert.equal(page.reviewable_total, 61);
  });

  test("a backend without the fields deployed keeps saying what it can measure, and no more", () => {
    const page = normalizeResumeHistory({ resumes: [packet("a"), packet("b", false)] });
    assert.equal(page.total, 2, "an absent total must fall back to the rows received, never to zero");
    assert.equal(page.reviewable_total, 1, "counted off the rows received, not invented");
    assert.equal(page.next_cursor, null, "no cursor means nothing more to ask for");
  });

  test("an empty cursor is the same as no cursor, so no Load more is offered for nothing", () => {
    assert.equal(normalizeResumeHistory({ resumes: [], next_cursor: "" }).next_cursor, null);
    assert.equal(normalizeResumeHistory({ resumes: [], next_cursor: 7 }).next_cursor, null);
  });

  test("a response with no resumes at all is still rejected, as every subject is", () => {
    assert.throws(() => normalizeResumeHistory({ total: 158 }), PartialPayloadError);
    assert.throws(() => normalizeResumeHistory([]), PartialPayloadError);
  });
});

describe("one packet is reachable on its own", () => {
  test("the entry endpoint hands back the packet", () => {
    const { resume } = normalizeResumeHistoryEntry({ resume: packet("245c827a") });
    assert.equal(resume.id, "245c827a");
  });

  test("a response without the packet is rejected rather than resolving to nothing", () => {
    // Resolving to null here is how the deep link went quiet in the first place. The caller has to
    // be given something it must handle.
    assert.throws(() => normalizeResumeHistoryEntry({}), PartialPayloadError);
    assert.throws(() => normalizeResumeHistoryEntry({ resume: null }), PartialPayloadError);
  });
});

describe("the board gates on the card, not on the page of history the parent loaded", () => {
  test("openability is the card's own reviewable flag", () => {
    assert.match(board, /const openable = \(card: BoardCard\) => card\.reviewable;/);
  });

  test("no id-set gate survives anywhere in Board", () => {
    // The exact shape of the defect: a set built from the parent's loaded packets, consulted to
    // decide whether a row could be clicked.
    assert.doesNotMatch(board, /openableIds/, "openableIds is the window leaking into openability");
    assert.doesNotMatch(board, /revisitableIds/, "revisitableIds was the same set with a second name");
  });

  test("the Tracker passes no id set to Board", () => {
    assert.doesNotMatch(applications, /openableIds=/);
    assert.doesNotMatch(applications, /revisitableIds=/);
  });

  test("opening a card goes through the by-id path, which can fetch what is not loaded", () => {
    assert.match(applications, /onOpen=\{\(id\) => void openApplicationById\(id\)\}/);
    assert.match(applications, /onRevisit=\{\(id\) => void revisitApplicationById\(id\)\}/);
    // And no open handler anywhere may go back to searching the loaded array and giving up on a
    // miss. `sendWithoutAsking` still resolves that way and is meant to: it is a send, not an open,
    // and it must never act on a packet the screen has not already loaded and checked.
    assert.doesNotMatch(
      applications,
      /onOpen=\{\(id\) => \{/,
      "resolving the id out of the loaded page is the defect; open by id instead",
    );
  });
});

describe("the deep link is never silent", () => {
  test("a requested id that is not in the loaded page is fetched instead of dropped", () => {
    assert.match(applications, /const requestedId = new URLSearchParams\(window\.location\.search\)\.get\("application"\)/);
    assert.match(applications, /await openApplicationById\(requestedId/, "the miss must fetch the packet, not fall through");
  });

  test("a packet that cannot be fetched produces a message on screen", () => {
    assert.match(applications, /We could not open that application/);
  });

  test("a packet with no review is named rather than selected into a blank screen", () => {
    assert.match(applications, /there is nothing to open yet/);
  });
});

describe("the ledger counts the corpus", () => {
  test("the heading's denominator is the backend total, not the loaded length", () => {
    assert.match(applications, /\{visiblePackets\.length\} of \{historyTotal \?\? reviewablePackets\.length\}/);
  });

  test("there is a way to ask for the rest, and it is offered only when there is a rest", () => {
    assert.match(applications, /historyCursor && \(/);
    assert.match(applications, /void loadMoreHistory\(\)/);
  });

  test("the next page is asked for with the cursor the last one returned", () => {
    assert.match(applications, /fetchApplicationHistory\(historyCursor\)/);
    assert.match(applications, /setHistoryCursor\(page\.next_cursor\)/);
  });

  test("no call site fetches history as a bare array again", () => {
    assert.doesNotMatch(
      applications,
      /api<\{ resumes: GeneratedResume\[\] \}>\("\/resume\/history"\)/,
      "reading the endpoint as an unwindowed list is what made 50 look like everything",
    );
  });
});
