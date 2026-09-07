import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const buildStepSource = readFileSync(new URL("../components/start/BuildStep.tsx", import.meta.url), "utf8");
const planStepSource = readFileSync(new URL("../components/start/PlanStep.tsx", import.meta.url), "utf8");

/* THE TWO SIDES OF ONE PARAMETER, PINNED TOGETHER.
 *
 * /login is the only reader of claim mode and it accepts exactly one spelling. Both onboarding
 * call sites sent `/login?intent=claim&next=/start`, which that reader does not recognise, so
 * `claiming` stayed false and the very next line redirected the guest - who by definition holds a
 * token - straight back out. Nothing threw and nothing logged: landing back on /start is also what
 * success looks like, which is why this survived in two places at once.
 *
 * A test rather than a comment because the failure is silent on both sides. The writer cannot tell
 * its parameter is ignored, and the reader cannot tell it was sent one it does not understand. */
test("login reads claim mode from the parameter the shared route actually sends", () => {
  assert.ok(
    apiSource.includes('export const GUEST_CLAIM_ROUTE = "/login?claim=1";'),
    "the shared guest-claim route must stay /login?claim=1",
  );
  assert.ok(
    loginSource.includes('params.get("claim") === "1"'),
    "login must still turn claim mode on from ?claim=1, which is what GUEST_CLAIM_ROUTE sends",
  );
});

/* The guest's only exit from each dead end, so neither may hand-roll the URL again. BuildStep's
 * button is the one route to an address when the resume yielded none; PlanStep's is, in its own
 * words, "THE ONLY WAY OUT OF THE PAYMENT GATE" for a guest whose checkout is refused with
 * `claim_required`. */
test("both onboarding claim exits go through the shared route", () => {
  for (const [name, source] of [["BuildStep", buildStepSource], ["PlanStep", planStepSource]]) {
    assert.ok(
      source.includes("window.location.assign(GUEST_CLAIM_ROUTE)"),
      `${name} must send the guest to the shared claim route`,
    );
    assert.doesNotMatch(
      source,
      /intent=claim/,
      `${name} must not hand-roll a claim URL /login never reads`,
    );
  }
});

/* `next` is not a parameter /login has ever read. It looked like the thing carrying the student
 * back to setup, so its presence made the broken URL read as deliberate. What actually returns
 * them is landingRoute(), which asks the server whether onboarding is unfinished and answers
 * "/start" when it is - so the promise both screens make is kept by the code that decides it. */
test("no claim exit relies on a next parameter login does not implement", () => {
  assert.doesNotMatch(loginSource, /params\.get\("next"\)/);
  for (const source of [buildStepSource, planStepSource]) {
    assert.doesNotMatch(source, /next=\/start/);
  }
});
