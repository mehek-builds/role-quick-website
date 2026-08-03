import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeUrl = new URL("../app/dashboard/page.tsx", import.meta.url);

test("Home consolidates its summaries and top jobs into a desktop command view", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /aria-label="At a glance" className="grid gap-3 [^"]*lg:grid-cols-3"/);
  assert.match(home, /border-brand\/20 bg-brand-soft\/70/);
  assert.match(home, /border-coral\/20 bg-coral-soft\/70/);
  assert.match(home, /className="grid gap-3 md:grid-cols-2 [^"]*xl:grid-cols-3"/);
});

test("Home keeps tint meaning tied to applications and emails", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /tone: "applications" \| "emails"/);
  assert.match(home, /tone === "applications"[\s\S]*bg-brand-soft[\s\S]*bg-coral-soft/);
  assert.doesNotMatch(home, /linear-gradient/);
});

test("Home uses the full desktop viewport without changing mobile card density", async () => {
  const [home, funnel] = await Promise.all([
    readFile(homeUrl, "utf8"),
    readFile(new URL("../components/app/Funnel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(home, /lg:space-y-7/);
  assert.match(home, /lg:min-h-\[clamp\(12rem,calc\(100vh-36rem\),20rem\)\]/);
  assert.match(home, /lg:min-h-\[clamp\(19rem,calc\(100vh-29rem\),20rem\)\]/);
  assert.match(home, /min-h-40[^"]*lg:min-h-44/);
  assert.match(funnel, /min-h-40[^"]*lg:min-h-44/);
  assert.match(funnel, /text-heading[^"]*lg:text-section/);
});
