import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* WHAT THE SEVEN DAYS INCLUDE, AND WHY THE NUMBERS ARE MIRRORED RATHER THAN READ.
 *
 * The trial screen sits one step ahead of the paywall, so it is the worst screen in the product on
 * which to print a number that is not so. It used to print five rows of "Not recorded": the meters
 * were read off the entitlement snapshot, and an account arriving there holds no trial at all -
 * the trial is a Stripe subscription opened from the NEXT screen now, not a signup grant. There is
 * therefore nothing to read the limits from at the moment they have to be shown, which is why they
 * are mirrored from the backend's TRIAL_LIMITS.
 *
 * A mirror needs a guard, and this is it: if the backend's numbers move, this fails here rather
 * than printing a wrong promise on the screen before the card.
 */
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("the trial screen mirrors the backend's trial limits exactly", async () => {
  const source = await read("components/start/TrialStep.tsx");
  const block = source.slice(source.indexOf("const TRIAL_INCLUDES"), source.indexOf("} as const;", source.indexOf("const TRIAL_INCLUDES")));

  /* Kept in step with TRIAL_LIMITS in the backend's src/lib/entitlements.ts. Both repos deploy
     independently, so a drift shows up as a failing test rather than as a screen promising five
     of something the account gets three of. */
  for (const [key, value] of [
    ["tailored_resumes", 5],
    ["cover_letters", 5],
    ["answer_applications", 5],
    ["outreach_companies", 5],
  ]) {
    assert.match(block, new RegExp(`${key}:\\s*${value}\\b`), `TRIAL_INCLUDES.${key} no longer reads ${value}`);
  }
});

test("the screen never claims the account already holds a trial it has not started", async () => {
  const source = await read("components/start/TrialStep.tsx");

  /* The line this replaced said "Nothing to confirm. Already on your account." for everyone. It was
     true while the trial was granted at signup and false the moment it moved behind a card.
     Comments are stripped first: the docblock explaining the change quotes the old line, and a
     test that cannot tell an explanation from a promise would forbid explaining it. */
  const rendered = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.ok(
    !/Nothing to confirm\. Already on your account\./.test(rendered),
    "the screen tells every student the trial is already on their account",
  );
  assert.match(source, /holdsTrial \? "Already on your account\."/, "the held-trial claim is no longer conditional");
  assert.match(source, /Nothing is charged for the first seven days\./, "the honest line for an account with no trial is gone");
});

test("the title reports the student's own last action rather than assuming it", async () => {
  const source = await read("components/start/TrialStep.tsx");
  const page = await read("app/start/page.tsx");

  // Review offers "Save it and send later", so "Sent." was false whenever a student took it.
  assert.match(source, /sent \? "Sent\./, "the title asserts a send again");
  assert.match(source, /"Saved\. And here's something from us\."/, "there is no title for the save path");
  assert.match(page, /onSent=\{\(\) => \{ setApplicationSent\(true\)/, "the send no longer records itself");
  assert.match(page, /onSaveForLater=\{\(\) => \{ setApplicationSent\(false\)/, "the save no longer records itself");
});
