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
