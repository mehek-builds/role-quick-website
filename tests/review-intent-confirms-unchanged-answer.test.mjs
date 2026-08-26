import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* THE LOOP THIS PINS SHUT: an essay whose drafted answer is already right could never settle.
 *
 * The checklist gives a drafted essay actionKind "review" ("Drafted answer ready for review"),
 * never "confirm" - that branch is reserved for human-only labels. But only "confirm" presses
 * minted the `confirmed: true` flag on the save, and the backend
 * (mergeSubmittedApplicationReviewQuestions in volley-backend) mints an applicant-claim for an
 * UNCHANGED answer only when that flag arrives. So reading the essay and saving it untouched
 * posted the same bytes with no flag, no claim was minted, `answer_reviewed_at` never stamped,
 * discovery re-flagged the essay as unsettled, and the identical ask came back on every Approve
 * pass. Measured live on the DGA 2026 Organizing Resume Bank packet (Lever), 2026-08-26, three
 * full cycles through BOTH doors - the direct "n of N" screens and the Check-the-answers editor.
 * Same mechanism as the DV Trading confirm loop of 2026-08-17, one intent over.
 *
 * THE FIX treats "review" exactly as "confirm" at both per-question press sites, and ONLY there.
 * The deliberateness bar that shuts out the 802-answer laundering is per-question and
 * press-driven; both sites keep it: `direct` is single-question by construction, and the
 * confirm-intents ref records only a pressed row's own id. A bulk save still flags nothing. */
describe("a review-intent save confirms an unchanged answer, so a correct essay can settle", () => {
  const page = readFileSync(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  test("the direct-task save mints the confirmed flag for review intents, not only confirm", () => {
    assert.match(
      page,
      /const directlyConfirmed = \(direct\?\.intent === "confirm" \|\| direct\?\.intent === "review"\)\s*\n\s*&& question\.id === direct\.questionId\s*\n\s*&& question\.answer\.trim\(\);/,
      "directlyConfirmed must accept intent \"review\" alongside \"confirm\", still scoped to the " +
      "one direct question and still refusing a blank - otherwise an unchanged drafted essay saved " +
      "from its own screen mints no claim and the ask never ends",
    );
  });

  test("a pressed Review row records a confirm intent exactly as a pressed Confirm row does", () => {
    assert.match(
      page,
      /if \(\(intent === "confirm" \|\| intent === "review"\) && focusQuestionId && merged\.some\(\(question\) => question\.id === focusQuestionId\)\)/,
      "reviewPortalQuestions must record the intent for \"review\" presses too - the essay row wears " +
      "Review, and without this the read-and-save path through Check the answers loops identically",
    );
  });

  test("the laundering bar holds: no whole-list flagging, intents stay per-question and press-driven", () => {
    assert.match(
      page,
      /const previouslyConfirmed = confirmedIds\?\.has\(question\.id\) && question\.answer\.trim\(\);/,
      "the full-editor path must still flag only ids a row press recorded, never the whole list",
    );
    const intentsRecordedSites = page.match(/confirmIntentsRef\.current\.set\(/g) ?? [];
    assert.equal(
      intentsRecordedSites.length,
      1,
      "exactly one site records confirm intents (the per-question row press in " +
      "reviewPortalQuestions) - a second writer is how a bulk open could start flagging",
    );
  });
});
