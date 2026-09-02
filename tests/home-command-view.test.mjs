import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeUrl = new URL("../app/dashboard/page.tsx", import.meta.url);
const funnelUrl = new URL("../components/app/Funnel.tsx", import.meta.url);

test("Home gathers its three summaries into one divided card", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /aria-label="At a glance"/);
  // One set of card chrome for the whole band, on the grid that holds the columns.
  assert.match(home, /className="grid divide-y divide-border [^"]*rounded-card border border-border[^"]*"/);
  assert.match(home, /lg:divide-x lg:divide-y-0/);
  // Columns divide evenly across however many of the three actually render.
  assert.match(home, /lg:auto-cols-fr lg:grid-flow-col/);
  assert.match(home, /empty:hidden/);
  assert.match(home, /className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"/);
});

test("The header subtitle names only what the link beside it can change", async () => {
  const home = await readFile(homeUrl, "utf8");

  // targeting.titles and targeting.categories are its only inputs. Both are edited by
  // TargetingCard, which is what "Change what you want" opens, so the label and its own control
  // always agree. profile.target_roles is editable too, but on /dashboard/resume and not by that
  // link, and it ranks nothing - so it stays out of the header.
  assert.match(home, /const targetLabel = targetingHeadline\(targeting\?\.titles, targeting\?\.categories\) \?\? "Your target roles"/);
  assert.doesNotMatch(home, /targetLabel[^\n]*target_roles/);
  // The subtitle is the only place the label is printed, and it still carries that link.
  assert.match(home, /\{targetLabel\}/);
  assert.match(home, /href="\/dashboard\/settings#job-search"/);
});

test("Home keeps no parsed-profile state now that nothing on it reads one", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.doesNotMatch(home, /setProfile/);
  // The fetch behind it is still load-bearing: identity.full_name comes from the same response.
  assert.match(home, /setIdentity\(initial\.identity\)/);
});

test("Overview columns carry no card chrome and no nested tiles of their own", async () => {
  const [home, funnel] = await Promise.all([readFile(homeUrl, "utf8"), readFile(funnelUrl, "utf8")]);

  // The tints and the white sub-tiles are what made one figure sit three containers deep.
  assert.doesNotMatch(home, /bg-brand-soft\/70/);
  assert.doesNotMatch(home, /bg-coral-soft\/70/);
  assert.doesNotMatch(home, /bg-white\/65/);
  assert.doesNotMatch(home, /linear-gradient/);

  // Every column is the same padded, chromeless section.
  assert.match(home, /function OverviewColumn/);
  assert.match(home, /<section aria-labelledby=\{id\} className="flex flex-col p-5">/);
  assert.match(funnel, /<section className="flex flex-col p-5">/);
  assert.doesNotMatch(funnel, /rounded-card border border-border/);
});

test("Pillar colour survives only where it points somewhere", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /tone: "applications" \| "emails"/);
  assert.match(home, /tone === "applications" \? "text-brand-ink" : "text-coral-ink"/);
});

test("The overview prints one number scale and one zero rule, readably", async () => {
  const [home, funnel] = await Promise.all([readFile(homeUrl, "utf8"), readFile(funnelUrl, "utf8")]);

  // Both sides of the divider quiet a zero, and both quiet it the same way.
  assert.match(home, /metric\.value === 0 \? "text-muted" : "text-ink"/);
  assert.match(funnel, /value === 0 \? "text-muted" : "text-ink"/);
  // text-faint is #a3a19a: 2.6:1 on this surface, under WCAG AA for 20px regular text.
  assert.doesNotMatch(home, /=== 0 \? "text-faint"/);
  assert.doesNotMatch(funnel, /=== 0 \? "text-faint"/);
  // No desktop step-up on either side of the divider: same figure, same size, whichever column.
  assert.doesNotMatch(home, /text-heading[^"]*lg:text-section/);
  assert.doesNotMatch(funnel, /text-heading[^"]*lg:text-section/);
});

test("Height comes from content, not from the viewport", async () => {
  const [home, funnel] = await Promise.all([readFile(homeUrl, "utf8"), readFile(funnelUrl, "utf8")]);

  assert.doesNotMatch(home, /min-h-\[clamp\(/);
  assert.doesNotMatch(home, /min-h-40[^"]*lg:min-h-44/);
  assert.doesNotMatch(funnel, /min-h-40[^"]*lg:min-h-44/);
  assert.doesNotMatch(home, /lg:space-y-7/);
  assert.match(home, /className="space-y-6"/);
  // The sparkline gets a plot box of its own rather than the card's leftover space.
  assert.match(funnel, /className="flex h-8 items-end gap-1"/);
  assert.doesNotMatch(funnel, /mt-auto/);
});

/* THE PLACEHOLDER 0 MUST NOT BE PRINTED AS A COUNT.
 *
 * `packets` starts as [], so pipeline.sent is 0 from first paint until the inventory resolves, and
 * Funnel's `sent ?? f.applications_submitted` cannot fall back because 0 is neither null nor
 * undefined. Measured 2026-09-02: Home read "0 sent in total" beside a live "1 in the last 7 days"
 * while the API reported 12 submitted. One funnel response cannot carry applications_submitted 0
 * with submitted_this_week 1 (both derive from the same array), so the 0 was the placeholder. */
test("Home does not claim a sent figure before its inventory has loaded", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /const inventoryLoaded = qaMode \|\| \(loadedAt > 0 && inventoryObserved\);/,
    "the load signal has to be explicit; `packets.length` cannot tell empty from unloaded");
  /* loadedAt alone is not the signal. Every packet source in the loader fails soft to [], so a dead
     /resume/history resolves the load and stamps loadedAt over an empty inventory - the same 0,
     printed as a count, just after the load window instead of during it. */
  assert.doesNotMatch(home, /const inventoryLoaded = qaMode \|\| loadedAt > 0;/,
    "a resolved load is not a counted one; the inventory has to have actually answered");
  assert.match(home, /<Funnel sent=\{inventoryLoaded \? pipeline\.sent : undefined\}/,
    "undefined is what lets Funnel's ?? reach the backend figure while the inventory is still loading");
  assert.doesNotMatch(home, /<Funnel sent=\{pipeline\.sent\}/,
    "passing the raw count republishes the placeholder 0 as a real answer");
});

test("Funnel still prefers the caller's figure once it has one", async () => {
  const funnel = await readFile(funnelUrl, "utf8");

  // Precedence is deliberate: Home's Sent tile and this stat count the same inventory, and the
  // 13-vs-12 disagreement recorded at this Stat is what happens when the backend figure wins.
  assert.match(funnel, /value=\{sent \?\? f\.applications_submitted\}/,
    "the fix belongs in the caller, not in this precedence");
});
