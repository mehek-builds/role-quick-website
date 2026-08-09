import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the public demo leaves authorization and voluntary self-identification to the applicant", () => {
  const data = read("lib/try-data.ts");
  const simulator = read("components/try/TrySimulator.tsx");

  assert.doesNotMatch(data, /Work authorization", value: "Yes"/);
  assert.doesNotMatch(data, /Voluntary self-identification", value: "Decline to self-identify"/);
  assert.match(data, /Work authorization[\s\S]*filled: false/);
  assert.match(data, /Voluntary self-identification[\s\S]*filled: false/);
  assert.match(simulator, /25 filled · 2 left for you · nothing sent yet/);
});

test("the homepage promises preparation and review, not every answer", () => {
  const page = read("app/page.tsx");
  const hero = read("components/cinema/CinematicHero.tsx");
  const mockup = read("components/Mockups.tsx");

  assert.doesNotMatch(page, /You autofill every application/);
  assert.doesNotMatch(hero, /Litos handles the rest/);
  assert.match(page, /leave personal decisions for you/);
  assert.match(mockup, /Voluntary self-identification[\s\S]*filled=\{false\}/);
});
