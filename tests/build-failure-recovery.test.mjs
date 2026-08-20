import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* A FAILED BUILD MUST NOT BE A DEAD END, and it is step 3 of 10.
 *
 * Found by running ten real builds against production on 2026-08-20. The board offered a frontend
 * student a high-frequency trading firm's software internship - a legitimate offer, since both are
 * "software engineering" - and the resume engine refused it:
 *
 *   resume_quality_hold: no selected bullet shares supported domain evidence with a primary ask
 *
 * The refusal is correct. Leading a resume with an experience that does not answer the posting is
 * the fabrication this product exists not to commit, and the engine declining to choose is the
 * guard working. What was wrong is what came next: the screen offered "Finish later" and nothing
 * else, so a student three screens into setup was stranded on a posting they had not chosen.
 *
 * These assert the recovery, not the refusal.
 */
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("a build that cannot succeed offers another posting", async () => {
  const source = await read("components/start/BuildStep.tsx");
  const errorBranch = source.slice(source.indexOf("if (error) {"), source.indexOf("const building ="));

  assert.match(errorBranch, /onPickAnother/, "the error screen offers no way to a different posting");
  assert.match(errorBranch, /Show me a different one/, "the control is missing its label");
  /* Only when another posting could actually help. A missing resume email follows the student to
     every posting, so offering one there would loop through identical failures. */
  assert.match(errorBranch, /!error\.fixable &&/, "a precondition failure now wrongly offers a different posting");
});

test("picking another posting returns to the match screen", async () => {
  const page = await read("app/start/page.tsx");
  const matches = page.match(/onPickAnother=\{\(\) => setChosenMatch\(null\)\}/g) ?? [];
  assert.equal(
    matches.length,
    2,
    "both BuildStep mounts (the sequence case and the reload recovery) must offer the way back",
  );
});

test("the free build survives a failed one", async () => {
  /* The recovery is only real if the next posting can actually be built. The grant is released on
     any response from 400 up, which is what makes "try another posting" free rather than an offer
     the account can no longer afford. Asserted on the backend's own hook wording so a change there
     that silently narrows the release shows up here. */
  const resume = await readFile(
    new URL("../../student-outreach-backend/src/routes/resume.ts", import.meta.url),
    "utf8",
  ).catch(() => null);
  if (!resume) return; // sibling repo not checked out; the backend has its own tests for this
  assert.match(resume, /reply\.statusCode >= 400/, "the grant is no longer released on a failed build");
  assert.match(resume, /releaseOnboardingBuildGrant/, "the release call is gone");
});

test("a guest is offered the email they cannot add in Account", async () => {
  /* THE GUEST DEAD END, found by walking production. `resume_email` is seeded from the login email
   * at upload, so a signed-in student never reaches this branch (7 of 7 on prod have one). A guest
   * has no email anywhere, so "add it in Account" pointed at a page with nothing to add, three
   * screens into a ten-screen setup, with "Finish later" as the only control.
   *
   * Claiming an email is the real fix, it is the same route the plan screen already uses for a
   * guest who cannot check out, and an application needs a contact address regardless: the employer
   * has to be able to reply to it. */
  const source = await read("components/start/BuildStep.tsx");
  const errorBranch = source.slice(source.indexOf("const guestNeedsEmail"), source.indexOf("const building ="));

  assert.match(errorBranch, /isGuestSession\(\)/, "the screen no longer distinguishes a guest");
  assert.match(errorBranch, /field === "resume_email"/, "the claim is offered for the wrong precondition");
  assert.match(errorBranch, /Add my email/, "there is no control to add one");
  assert.match(errorBranch, /login\?intent=claim&next=\/start/, "the claim route is gone or points elsewhere");
  /* A missing NAME is still an Account fix for everyone, so the guest wording must not swallow it. */
  assert.match(errorBranch, /Add it in Account and Litos will build this one again/, "the non-guest wording was lost");
});
