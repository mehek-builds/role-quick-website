import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* GAP, not a bug in existing code: a managed run that stopped because the runner SAW a rendered
 * CAPTCHA still standing after the press (`unverified_submission.challenge_on_screen`, set by
 * submissionRunner.ts around the live Mytos Lever run 6757f19a, 2026-08-20) left the applicant with
 * exactly one recovery path once she answered "it is not there": "Try again", which replays the
 * SAME managed press against the SAME wall. The Chrome extension already carries everything needed
 * to finish it a different way - handoff-packet.ts on the extension side reads the identical
 * reviewed answers this managed run already produced, and "Open and fill application" (the
 * CanonicalApplicationDetail button used for portals like SAP that never attempt a managed run at
 * all) already opens the employer's page with the extension primed from that same packet. Nothing
 * synced the two: a captcha-blocked managed row had no way to reach that button.
 *
 * THE FIX offers it here too, gated narrowly on `challenge_on_screen` (not on needs_attention in
 * general - an ordinary timeout or provider error still offers only Try again, because there is no
 * synced-fill packet to fall back to and no evidence retrying is futile the way a rendered CAPTCHA
 * is). It sits ALONSIDE Try again, not replacing it: hCaptcha and friends are not always
 * deterministic, so a retry can still succeed, and the extension path is the guaranteed alternative
 * rather than the only one. */
describe("a managed run stopped by a rendered CAPTCHA can be finished through the synced extension fill", () => {
  const applications = readFileSync(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );
  const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

  test("the frontend type carries the same challenge_on_screen fact the backend records", () => {
    assert.match(
      api,
      /unverified_submission\?:\s*\{[\s\S]*?challenge_on_screen\?:\s*true;[\s\S]*?\};/,
      "lib/api.ts's ApplicationReview type must mirror applicationReview.ts's challenge_on_screen field, " +
      "or the frontend has no way to read the exact fact the backend already persisted",
    );
  });

  test("the extension-recovery flag is gated the same way every other post-resolution control is, and only by a rendered CAPTCHA specifically", () => {
    assert.match(
      applications,
      /const captchaBlockedLastAttempt = needsAttention && !awaitingUnverifiedSubmission\s*\n\s*&& review\.unverified_submission\?\.challenge_on_screen === true;/,
      "captchaBlockedLastAttempt must require needsAttention, must wait for the yes/no card to " +
      "resolve (the same gate Try again, Open packet review, and the handoff controls already use), " +
      "and must check challenge_on_screen specifically, not needs_attention alone",
    );
  });

  test("the extension-recovery button renders next to Try again, not instead of it, and only when captchaBlockedLastAttempt", () => {
    const buttons = applications.match(
      /\{needsAttention && !awaitingUnverifiedSubmission && <Button onClick=\{onRetry\}[\s\S]{0,60}Try again<\/Button>\}\s*\n[\s\S]{0,900}?\{captchaBlockedLastAttempt && \(\s*\n\s*<Button onClick=\{onOpenWithExtension\} variant="secondary" disabled=\{extensionFillBusy\}>\s*\n\s*\{extensionFillBusy \? "Checking extension\.\.\." : "Open and fill with extension"\}\s*\n\s*<\/Button>\s*\n\s*\)\}/,
    );
    assert.ok(buttons, "Open and fill with extension must render immediately after Try again, gated on captchaBlockedLastAttempt");
  });

  test("onOpenWithExtension calls fillApplication with this packet's own job details, on the submission errorSurface so failures render on THIS screen", () => {
    /* canonicalApplicationId is passed for shape-consistency with the CanonicalApplicationDetail
     * call site (line ~3700) - fillApplication's own /applications POST does not read it (that
     * field only matters to the separate createApplication/tailor-resume path), so it is not what
     * prevents a duplicate Tracker row here. Whatever dedup happens on a fresh /applications POST
     * is a backend concern (draft.jobId is what's actually sent), out of scope for this diff. */
    assert.match(
      applications,
      /onOpenWithExtension=\{\(\) => void fillApplication\(\{\s*\n\s*company: selected\.job_context\.company \?\? "",\s*\n\s*role: selected\.job_context\.role \?\? "",\s*\n\s*portalUrl: selectedSubmission\.review\.portal_url \?\? "",\s*\n\s*jobDescription: "",\s*\n\s*jobId: selected\.job_context\.job_id \?\? null,\s*\n\s*canonicalApplicationId: canonicalIdByPacketId\[selected\.id\] \?\? null,\s*\n\s*\}, "submission"\)\}/,
      "onOpenWithExtension must pass errorSurface \"submission\", not \"tracker\" - the tracker surface " +
      "writes into canonicalFillError, which only CanonicalApplicationDetail renders; a failure from " +
      "this screen would otherwise be completely silent",
    );
  });

  test("a failure from the extension-recovery button is visible and the button disables while in flight, unlike the silent-failure shape this replaces", () => {
    assert.match(
      applications,
      /errorSurface === "submission"\) \{\s*\n\s*setSubmissionFillError\(message\);\s*\n\s*setCanonicalFillError\(null\);\s*\n\s*setError\(null\);/,
      "the submission errorSurface must write to its own error state, not silently reuse a state var nothing on this screen reads",
    );
    assert.match(
      applications,
      /<Button onClick=\{onOpenWithExtension\} variant="secondary" disabled=\{extensionFillBusy\}>/,
      "the button must disable while a fill is already in flight, matching every other async action on this file",
    );
    assert.match(
      applications,
      /\{extensionFillError && \(\s*\n\s*<p role="alert"[^>]*>\{extensionFillError\}<\/p>\s*\n\s*\)\}/,
      "extensionFillError must actually render somewhere on SubmissionScreen",
    );
  });

  test("switching to a different packet clears a stale extension-fill error, so it does not follow her to an unrelated application", () => {
    /* selectPacket is the ONE place a packet switch runs (every row click, every apply-intent deep
     * link). Both its branches already reset canonicalFillError for the exact same reason - without
     * this, failing the extension button on application A and then opening application B would show
     * A's error message as if it belonged to B. */
    const selectPacket = applications.match(/const selectPacket = useCallback\(\(incoming: GeneratedResume\) => \{[\s\S]*?\n {2}\}, \[moveToScreen\]\);/)?.[0];
    assert.ok(selectPacket, "could not find the selectPacket body");
    const resets = [...selectPacket.matchAll(/setCanonicalFillError\(null\);\n\s*setSubmissionFillError\(null\);/g)];
    assert.equal(resets.length, 2, "both selectPacket branches (canonical and sendable) must reset submissionFillError alongside canonicalFillError");
  });
});
