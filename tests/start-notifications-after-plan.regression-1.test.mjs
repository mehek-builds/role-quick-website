import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STEPS } from "../features/onboarding/domain/rail.ts";

/* The staying-in-touch screen split back out of the trial screen and moved after `plan`
 * (Mehek, 2026-09-07), reversing an earlier fold (10 -> 9, "asked between the gift and the
 * price"). This file pins the pieces that have to move together, the same way the fold's own
 * regression test once did for the opposite arrangement:
 *
 *  1. the trial screen is the gift alone and does not render the switches;
 *  2. finishing the trial acknowledges ONLY that one ledger entry;
 *  3. `notifications` is a rail step of its own again, positioned after `plan`;
 *  4. the notifications screen stands on its own rail position, not on "trial";
 *  5. a switch still saves itself, which the split did not have to undo.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

test("the trial screen does not render the switches", () => {
  const trial = code(read("components/start/TrialStep.tsx"));
  assert.doesNotMatch(trial, /<NotificationChoices \/>/);
  assert.doesNotMatch(trial, /NotificationChoices/);
});

test("finishing the trial acknowledges only 'trial'", () => {
  const page = code(read("app/start/page.tsx"));
  const trialCase = page.slice(page.indexOf('case "trial":'), page.indexOf('case "plan":'));
  assert.doesNotMatch(trialCase, /ack\("notifications"\)/, "the trial screen must not acknowledge notifications for it");
  assert.match(trialCase, /ack\("trial"\)/);
});

test("'notifications' is a rail step again, positioned directly after 'plan'", () => {
  const keys = STEPS.map((s) => s.key);
  assert.ok(keys.includes("notifications"), "notifications left the rail; the split did not restore it");
  assert.equal(
    keys.indexOf("notifications"),
    keys.indexOf("plan") + 1,
    "notifications must sit directly after plan - that order is also the payment gate for it (onboarding.ts, hasVerifiedPaymentMethod)",
  );
});

test("the notifications screen stands on its own rail position", () => {
  const screen = code(read("components/start/NotificationsStep.tsx"));
  assert.match(screen, /<StartShell step="notifications"/);
  assert.doesNotMatch(screen, /step="trial"/);
});

test("a switch still saves itself, so the screen's own Continue stays about one thing", () => {
  const choices = code(read("components/start/NotificationsStep.tsx"));
  assert.match(choices, /function change\(next: Choice\) \{\s*setChoice\(next\);\s*void persist\(next\);/);
});
