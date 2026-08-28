import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* BUG: a Tracker row whose linked legacy packet was genuinely portal_supported and ready_to_submit
 * still showed the extension-only "Continue on the employer's form" copy, with no send action at
 * all - not because CanonicalApplicationDetail was the wrong screen for a supported row (the click
 * handler, selectPacket, already refuses to route a sendable envelope there), but because the
 * page's own merge of `/resume/history` never attached that row's linked packet in the first place.
 * `canonicalTrackerPacket` falls back to a placeholder with `portal_supported: false` hardcoded
 * whenever nothing in the loaded page matched, and on an account with hundreds of queued
 * applications that placeholder is what a real, sendable row can merge down to - a statement about
 * what one page load happened to see, read by the UI as a statement about the account.
 *
 * Measured on production 2026-08-20: Databricks, Product Management Intern, canonical id
 * `095b9ad8-71fa-412c-a0a7-eabaf5bf9ad6`, legacy packet `93822837-5102-4188-9cb2-6d194380e04b`,
 * `_review: { status: "ready_to_submit", portal_supported: true, ats_name: "greenhouse" }` on the
 * real packet - yet the merged Tracker row it produced could not be told from a genuinely
 * extension-only application.
 *
 * THE FIX reuses PR #383's stub-hydration pattern (ApplicationPacket, `isStubPacketSpec`) for the
 * ROUTING decision rather than only for packet content: canonicalEnvelopeLegacyHydrationId names
 * the exact packet worth fetching, and a page.tsx effect fetches it and rebuilds the envelope.
 *
 * REVISED AFTER CODE REVIEW ON THIS SAME PR (2026-08-20): the effect originally called selectPacket
 * itself the instant a rebuild turned out sendable - the SAME selectPacket the Tracker's own row
 * click uses, so there was no second, drifting copy of the eligibility check, but that call ran from
 * a `.then()` with no user gesture behind it. selectPacket's moveToScreen unconditionally scrolls to
 * top and swaps CanonicalApplicationDetail for the Review screen, which is correct behaviour for
 * every OTHER caller (all of them are click handlers) and wrong here: a student reading the detail
 * panel got the screen pulled out from under them a few hundred ms to seconds after opening the row,
 * violating ACCESSIBILITY.md's "status changes are announced once without moving focus
 * unexpectedly". The fix keeps the single-eligibility-check property (still one function decides
 * sendability, still one function performs the navigation) but moves the CALL of that navigation
 * behind an explicit "Continue to send" button the student presses themselves. The effect now only
 * folds the hydrated packet into `packets` state; CanonicalApplicationDetail computes readiness
 * reactively from that state and offers the button instead of auto-navigating.
 *
 * WHAT THIS FILE CAN AND CANNOT DO, in the words of tests/tracker-row-opens-detail.regression-1.
 * test.mjs beside it: this is static analysis of source text, pinning the SHAPE of the fix so a
 * straight revert goes red here. features/applications/domain/canonical-tracker.test.mts covers the
 * actual hydration-id logic against real fixtures.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments carry the words this file asserts on, so they come off before any structural check. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const applications = stripComments(read("app/dashboard/applications/page.tsx"));
const domain = stripComments(read("features/applications/domain/canonical-tracker.ts"));

describe("a canonical row's linked packet is hydrated before its send eligibility is trusted", () => {
  test("the domain names the packet worth fetching, not a boolean the page would have to re-derive", () => {
    assert.match(
      domain,
      /export function canonicalEnvelopeLegacyHydrationId\(/,
      "the id-to-fetch decision belongs in the domain layer beside canonicalTrackerPacket, not inlined in page.tsx",
    );
  });

  test("page.tsx fetches the exact packet the canonical row names, keyed off the same id", () => {
    assert.match(
      applications,
      /const hydrationId = canonicalEnvelopeLegacyHydrationId\(canonicalEnvelopePacket\);/,
    );
    assert.match(
      applications,
      /api<\{ resumes: GeneratedResume\[\] \}>\(`\/resume\/history\?application=\$\{encodeURIComponent\(hydrationId\)\}`\)/,
      "must fetch by the exact legacy id the row names, the same route PR #383 already uses for packet content",
    );
  });

  test("the hydration effect never calls selectPacket itself", () => {
    /* This is the assertion that pins Finding 1's fix: navigating away from whatever the student is
       currently looking at must never happen from a background .then() with no user gesture behind
       it. selectPacket is still the ONLY function that performs the navigation - see the next
       describe block for where it is now called from - but it must not appear inside this effect. */
    const effectStart = applications.indexOf("useEffect(() => {\n    const application = canonicalSelected;");
    assert.notEqual(effectStart, -1, "could not locate the routing hydration effect to scope this assertion to");
    const effectEnd = applications.indexOf("}, [canonicalEnvelopePacket, canonicalSelected, qaMode]);", effectStart);
    assert.notEqual(effectEnd, -1, "could not locate the end of the routing hydration effect");
    const effectBody = applications.slice(effectStart, effectEnd);
    assert.doesNotMatch(
      effectBody,
      /selectPacket\(/,
      "the routing hydration effect must only fold the hydrated packet into state - navigation belongs to an explicit click, not a background fetch resolving",
    );
  });

  test("the hydrated packet is folded back into packets state, not held only in a local variable", () => {
    // Without this, a row that hydrates once but is not immediately sendable (a needs_attention
    // packet, say) would refetch on every render forever, since canonicalEnvelopeLegacyHydrationId
    // reads off `packets` and nothing would ever record the fetch's result.
    assert.match(
      applications,
      /setPackets\(\(current\) => \(current \?\? \[\]\)\.map\(\(item\) =>\s*\n\s*canonicalApplicationFromPacket\(item\)\?\.id === application\.id \? hydratedEnvelope : item\)\);/,
    );
  });

  test("a not-found hydration result is also persisted, not merely answered for this render", () => {
    /* Finding 2, same review: without this, a not-found outcome never left a mark on the packet, so
       canonicalEnvelopeLegacyHydrationId kept naming the same doomed id, and any unrelated
       setPackets call that rebuilt this row's identity (canonicalTrackerPacket does, on every merge)
       re-triggered the identical fetch. */
    assert.match(
      applications,
      /canonicalEnvelopeWithMissingLegacyHydration\(item, hydrationId\)/,
    );
  });

  test("a race between two hydrations is guarded the same way ApplicationPacket's stub hydration is", () => {
    assert.match(applications, /let cancelled = false;[\s\S]{0,400}if \(cancelled\) return;/);
  });

  test("setState inside the effect body itself is deferred, not called synchronously", () => {
    // react-hooks/set-state-in-effect: a direct call here would fire on every render this effect's
    // deps recompute, not only on a genuine transition, cascading renders the same way a bare
    // setState in the cover-letter effect beside this one was already written to avoid.
    assert.match(applications, /queueMicrotask\(\(\) => setCanonicalHydration\(null\)\);/);
    assert.match(applications, /queueMicrotask\(\(\) => setCanonicalHydration\(\{ id: application\.id, status: "loading" \}\)\);/);
  });
});

describe("send eligibility discovered by hydration is offered, never forced", () => {
  test("readiness is computed reactively from packets state, with the same eligibility check selectPacket uses", () => {
    assert.match(
      applications,
      /const canonicalReadyToSend = useMemo\(\s*\n\s*\(\) => sendableLinkedPacketFromCanonicalEnvelope\(canonicalEnvelopePacket\),\s*\n\s*\[canonicalEnvelopePacket\],\s*\n\s*\);/,
    );
  });

  test("CanonicalApplicationDetail receives readiness as a prop rather than re-deriving it", () => {
    assert.match(applications, /readyToSend: boolean;/);
    assert.match(applications, /onContinueToSend: \(\) => void;/);
    assert.match(applications, /readyToSend=\{canonicalReadyToSend !== null\}/);
  });

  /* BUG, separate from the hydration bug above: a detail-view row (intent=detail) can still show
   * this button once canonicalReadyToSend goes non-null, but intent=detail deliberately sets
   * resolvedActionableRequestId to null and leaves the URL's intent on "detail" - see the branch
   * a few hundred lines up that reads "Detail is deliberately read-only." selectedPacketForRequest
   * refuses on BOTH of those independently (its own intent check, and its
   * requestedApplicationId/resolvedActionableRequestId match), regardless of what selectPacket
   * resolves internally. Calling selectPacket alone therefore leaves selected permanently null and
   * the row shows "the saved list does not contain a packet with this id" - correct button, correct
   * eligibility check, and still no way to open the screen it just offered.
   *
   * Measured on this account 2026-08-22 via intent=detail: Databricks, IMC Trading, and a
   * freshly-created Notion application (no prior edits, no stale state) all hit it identically.
   *
   * A production Fully row exposed the remaining hole: hydration can finish after the URL is already
   * the exact restored application=...&intent=apply pair. Replacing that URL is a no-op, so the
   * bootstrap effect never reruns and the summary stays open forever. The click must use the existing
   * openApplication transition, which records local intent, selects the packet, and synchronizes the
   * URL as one operation. */
  test("the handler opens the hydrated ready packet through the standard local transition", () => {
    const handler = applications.match(/onContinueToSend=\{\(\) => \{[\s\S]*?\n\s{10}\}\}/)?.[0];
    assert.ok(handler, "could not find the onContinueToSend handler body");
    assert.match(
      handler,
      /if \(!canonicalReadyToSend\) return;/,
      "the transition must use the exact packet that passed the managed-send eligibility check",
    );
    assert.match(
      handler,
      /openApplication\(canonicalReadyToSend, \{ history: "replace" \}\);/,
      "Continue to send must use the standard local packet-open transition",
    );
    assert.doesNotMatch(handler, /router\.replace\(|selectPacket\(/);
  });

  test("a ready row gets an explicit button to press, not an automatic screen change", () => {
    assert.match(
      applications,
      /!submitted && !unresolvedAttempt && retryAllowed && !checkingSendPath && readyToSend && \(\s*\n\s*<Button type="button" onClick=\{onContinueToSend\}>Continue to send<\/Button>/,
      "the explicit send transition must remain behind the server-owned immutable retry verdict",
    );
  });
});

describe("CanonicalApplicationDetail says it is checking, not that this application is extension-only, while eligibility is still unknown", () => {
  test("the component receives a checking flag rather than deciding eligibility itself", () => {
    assert.match(
      applications,
      /checkingSendPath: boolean;/,
      "CanonicalApplicationDetail must not re-derive eligibility from application; it only knows whether the page is still checking",
    );
  });

  test("the render call computes the flag from the same keyed hydration state the effect writes", () => {
    assert.match(
      applications,
      /checkingSendPath=\{canonicalHydration\?\.id === canonicalSelected\.id && canonicalHydration\.status === "loading"\}/,
    );
  });

  test("the extension-only copy only shows once checking has settled", () => {
    assert.match(applications, /checkingSendPath\s*\n\s*\? "Checking whether Litos can send this one for you\.\.\."/);
    assert.match(applications, /"Litos will verify the extension account, bind this exact application, and open the employer page\./);
  });

  test("the extension handoff button is held back while eligibility is still being checked, and once it is known ready", () => {
    // Pressing it opens a real Chrome tab. A row that is about to offer the managed send screens
    // must not also offer starting an extension handoff for the same application.
    assert.match(
      applications,
      /!submitted && !unresolvedAttempt && retryAllowed && !checkingSendPath && !readyToSend && application\.portal_url/,
      "the extension handoff must also wait for the exact prior attempt to be safely resolved",
    );
  });
});
