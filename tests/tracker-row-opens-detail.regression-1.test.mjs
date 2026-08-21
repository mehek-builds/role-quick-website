import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* A Tracker row must open its application, whatever the row's status is.
 *
 * Reported 2026-08-11 from a real account, on trylitos.com. On /dashboard/applications the one row
 * reading SENT opened its detail in place. Every row reading NEEDS YOU did not open at all: the
 * click replaced the entire Tracker with app/dashboard/error.tsx, so one press cost the student the
 * application they asked for and the other 157 with it.
 *
 * The split is screenForStatus. `submitted` is the ONLY reviewable status that routes to
 * SubmissionReceipt, which reads no list off the review; needs_attention, ready_for_final_approval,
 * awaiting_security_code and failed all route to SubmissionScreen, whose fourth line was
 * `review.questions.length`. lib/api.ts declares that field as a required array and the wire does
 * not send it on a packet that never reached a form, so one absent key threw during render.
 *
 * WHAT THIS FILE CAN AND CANNOT DO, stated plainly because the file beside it
 * (application-state-deeplink.regression-1.test.mjs) was believed to prove more than it did. This is
 * static analysis of source text: it pins the SHAPE of the fix, so a straight revert goes red here.
 * It cannot see behaviour. The artifact that catches this defect by behaviour, by driving a real
 * browser and pressing the row, is tests/e2e/tracker-row-opens-detail.spec.mjs, and that one is
 * where the pre-fix and post-fix measurements live.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments carry the words this file asserts on, so they come off before any structural check. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const applications = stripComments(read("app/dashboard/applications/page.tsx"));
const domain = stripComments(read("features/applications/domain/application-review.ts"));

describe("a review's declared lists are made real before anything reads them", () => {
  test("the submission state is not written through a bare setter", () => {
    /* THE DEFECT'S ADDRESS. Eight call sites write this state and more than a dozen readers take a
       list off it. A raw useState setter means every one of those readers is responsible for the
       same guard forever, which is how four of them ended up without it. */
    assert.match(
      applications,
      /const \[submission, setSubmissionState\] = useState<SubmissionResponse \| null>\(null\)/,
      "the raw setter has to be private, so every write goes through the normalising one",
    );
    assert.doesNotMatch(
      applications,
      /const \[submission, setSubmission\] = useState/,
      "binding the raw setter to setSubmission puts every writer back on the unguarded path",
    );
  });

  test("that one writer normalises the review", () => {
    const start = applications.indexOf("const setSubmission = useCallback");
    assert.notEqual(start, -1, "the normalising writer must still exist and still be called setSubmission");
    const body = applications.slice(start, applications.indexOf("}, [", start));
    assert.match(body, /reviewWithLists\(next\.review\)/, "the review has to be normalised on its way into state");
    assert.match(body, /setSubmissionState\(/, "and the raw setter is what it writes through");
    assert.match(
      body,
      /review === next\.review \? next :/,
      "an already whole review must keep its identity, or every poll re-renders the screen it confirms",
    );
  });

  test("the poll normalises its own answer before reading it", () => {
    /* Two lines in refreshSubmission read `result.review.questions` on the way past rather than
       through state, so state normalisation alone would leave the poll throwing inside its own
       promise instead of during a render. */
    const start = applications.indexOf("const refreshSubmission = useCallback");
    assert.notEqual(start, -1);
    const body = applications.slice(start, applications.indexOf("}, [", start));
    assert.match(body, /reviewWithLists\(raw\.review\)/, "the polled review has to be normalised while it is still in hand");
  });

  test("the normaliser defaults lists and only lists", () => {
    const start = domain.indexOf("export function reviewWithLists");
    assert.notEqual(start, -1, "reviewWithLists must still exist");
    const body = domain.slice(start, domain.indexOf("\n}", start));
    for (const field of ["questions", "filled_fields", "skipped_reasons", "edited_terms"]) {
      assert.match(body, new RegExp(`${field}: Array\\.isArray\\(safeReview\\.${field}\\) \\? safeReview\\.${field} : \\[\\]`), field);
    }
    /* Never a status, never a count, never an answer. An absent list means "none of these", which
       is what an empty list says; an absent status has no honest default at all, and inventing one
       is the failure features/applications/infrastructure/response-shape.ts exists to refuse. */
    for (const invented of ["status:", "updated_at:", "attention_reason:", "portal_url:", "submitted_at:"]) {
      assert.doesNotMatch(body, new RegExp(invented.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${invented} must not be defaulted`);
    }
  });
});

describe("the row itself", () => {
  test("the desktop ledger row is a button that acts, not one that submits", () => {
    /* A bare <button> is type="submit". Today there is no <form> above this row, so the default is
       inert rather than harmful, but "inert because of something elsewhere in the tree" is not a
       property a row worth 158 applications should depend on. The chip strip beside it has always
       declared this; the desktop row, the one a student on a laptop actually presses, had not. */
    const start = applications.indexOf('<section aria-labelledby="application-ledger-heading"');
    assert.notEqual(start, -1, "expected the ledger section to still be labelled by its heading id");
    const ledger = applications.slice(start, applications.indexOf("</section>", start));
    const rows = [...ledger.matchAll(/<button([^>]*?)onClick=\{\(\) => selectPacket\(packet\)\}/g)];
    assert.ok(rows.length >= 2, `expected both ledger layouts to open a packet, found ${rows.length}`);
    for (const [, attributes] of rows) {
      assert.match(attributes, /type="button"/, "every row that opens a packet has to declare its type");
    }
  });
});

describe("a ?job= link that is really an application", () => {
  const start = applications.indexOf("const resolvedJobParam = useRef");
  const effect = applications.slice(start, applications.indexOf("}, [packets, qaMode, selectPacket]", start));

  test("the packets already on the page are consulted before the postings endpoint", () => {
    /* THE DEFECT. /dashboard/applications?job=<generated_resume_id> asked /jobs/<id>, got a 404,
       and printed the backend's own "Job not found" as a page-level alert over a Tracker that was
       at that moment listing the very application the id belongs to. Two statements on one screen,
       one of them false, and the false one in red at the top. */
    assert.notEqual(start, -1, "the ?job= effect must still exist");
    const lookup = effect.indexOf("packets.find((item) => item.id === jobId)");
    const fetched = effect.indexOf("api<{ job: MonitoredJob }>");
    assert.notEqual(lookup, -1, "the id has to be checked against the applications this page already holds");
    assert.notEqual(fetched, -1, "a real posting id must still be fetched");
    assert.ok(lookup < fetched, "the local check has to come first, or the 404 happens anyway");
    assert.match(effect, /selectPacket\(packet\)/, "a hit opens that application rather than reporting an error");
    assert.match(effect, /replaceClosedComposerUrl\(/, "and the parameter comes out of the URL so a reload does not ask again");
  });

  test("the effect re-runs when the packets arrive, and asks once", () => {
    assert.match(applications, /\}, \[packets, qaMode, selectPacket\]\)/, "the answer depends on the packets, so it has to wait for them");
    assert.match(effect, /resolvedJobParam\.current === jobId/, "and must not re-ask on every poll that rewrites the packets");
  });

  test("no backend message reaches the banner", () => {
    /* `reason.message` was what put "Job not found" on screen verbatim. What replaces it says what
       is still true, which is that nothing the student built has gone anywhere. */
    assert.doesNotMatch(effect, /reason instanceof Error \? reason\.message/, "the backend's wording must not be the student's");
    assert.match(effect, /could not open that job link/, "the honest sentence stays");
  });
});
