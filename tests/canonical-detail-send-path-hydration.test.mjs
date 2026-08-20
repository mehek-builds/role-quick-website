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
 * the exact packet worth fetching, a page.tsx effect fetches it and rebuilds the envelope, and if
 * that rebuild turns out sendable it calls the SAME selectPacket the Tracker's own row click uses -
 * no second copy of the eligibility check, no new send path.
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

  test("a sendable hydration result routes through selectPacket, not a duplicated eligibility branch", () => {
    /* This is the one assertion that actually pins the fix: a second, independent "is this sendable"
       branch inside the hydration effect is exactly the kind of drift that caused the bug, because
       it can silently disagree with sendableLinkedPacketFromCanonicalEnvelope the way the merge
       fallback already disagreed with the real packet. */
    assert.match(
      applications,
      /if \(sendableLinkedPacketFromCanonicalEnvelope\(hydratedEnvelope\)\) selectPacket\(hydratedEnvelope\);/,
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

  test("the extension handoff button is held back while eligibility is still being checked", () => {
    // Pressing it opens a real Chrome tab. A row that is about to be routed to the managed send
    // screens must not have already started an extension handoff in the half-second before that.
    assert.match(applications, /!submitted && !checkingSendPath && application\.portal_url/);
  });
});
