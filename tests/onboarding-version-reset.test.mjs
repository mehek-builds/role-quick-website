import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { focusPatch, focusSeed } from "../lib/onboarding-role-inference.ts";
import { eligibilitySeed } from "../lib/work-eligibility.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function shipped(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function functionBlock(source, name) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} is not exported`);
  const next = source.indexOf("\nexport function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("the versioned onboarding review contract", () => {
  test("the response distinguishes a stale completed account from a current one", async () => {
    const api = shipped(await read("lib/api.ts"));
    const state = api.slice(api.indexOf("export type OnboardingState"), api.indexOf("export function getOnboardingState"));

    assert.match(api, /export const CURRENT_ONBOARDING_FLOW_VERSION\s*=\s*3\b/);
    assert.match(state, /flow_version:\s*number/);
    assert.match(state, /flow_completed:\s*boolean/);
    assert.match(state, /requires_onboarding:\s*boolean/);
  });

  test("each reviewed or skipped step is acknowledged against the current flow", async () => {
    const api = shipped(await read("lib/api.ts"));
    const routeAt = api.indexOf('"/onboarding/flow/steps"');
    assert.notEqual(routeAt, -1, "the flow-step acknowledgement route is missing");
    const call = api.slice(Math.max(0, routeAt - 500), routeAt + 700);

    assert.match(call, /method:\s*"POST"/);
    assert.match(call, /disposition:\s*"continued"\s*\|\s*"skipped"/);
    /* THE VERSION ON THE WIRE IS THE SERVER'S, not this build's constant.
       Both routes validate the field with a strict z.literal on the backend, so while each side
       hardcoded its own copy of the number a bump had no safe deploy order in either direction:
       whichever shipped first sent a number the other rejected, and every acknowledgement 400'd
       mid-setup. The parameter is what removes the coupling, so it is what this case pins. */
    assert.match(call, /flowVersion:\s*number/);
    assert.match(call, /JSON\.stringify\(\{[\s\S]*?flow_version:\s*flowVersion[\s\S]*?step[\s\S]*?disposition[\s\S]*?\}\)/);
    assert.doesNotMatch(call, /flow_version:\s*CURRENT_ONBOARDING_FLOW_VERSION/, "the acknowledgement hardcodes a version instead of echoing the server's");
  });

  test("flow completion stamps the server's version without rewriting historical completion", async () => {
    const api = shipped(await read("lib/api.ts"));
    const routeAt = api.indexOf('"/onboarding/flow/complete"');
    assert.notEqual(routeAt, -1, "the versioned flow completion route is missing");
    const complete = api.slice(Math.max(0, routeAt - 500), routeAt + 600);

    assert.match(complete, /method:\s*"POST"/);
    assert.match(complete, /JSON\.stringify\(\{\s*flow_version:\s*flowVersion\s*\}\)/);
    assert.doesNotMatch(complete, /flow_version:\s*CURRENT_ONBOARDING_FLOW_VERSION/, "completion hardcodes a version instead of echoing the server's");
    assert.doesNotMatch(complete, /completed_at|onboarding_completed_at/);
  });

  test("login follows requires_onboarding, so stale accounts restart and current accounts stay done", async () => {
    const login = shipped(await read("app/login/page.tsx"));
    const route = login.slice(login.indexOf("async function landingRoute"), login.indexOf("function PasswordField"));

    assert.match(route, /getOnboardingState\(\)/);
    assert.match(route, /s\.requires_onboarding\s*\?\s*"\/start"\s*:\s*"\/dashboard"/);
    assert.doesNotMatch(route, /completed_at/, "a historical completion date must not bypass a server-requested review");
    assert.doesNotMatch(route, /flow_version\s*[<>=]/, "the client must not reimplement the server's version comparison");
  });

  test("Finish later exits without acknowledging or completing the flow", async () => {
    const page = shipped(await read("app/start/page.tsx"));
    const later = page.slice(page.indexOf("const later"), page.indexOf("const stepDone"));

    assert.match(later, /router\.push\("\/dashboard"\)/);
    assert.doesNotMatch(later, /acknowledge|flow|completeOnboarding/i);
  });

  test("continued steps and the one skippable step preserve their dispositions", async () => {
    const page = shipped(await read("app/start/page.tsx"));
    const render = page.slice(page.indexOf("const renderStep"));
    for (const step of ["resume", "impact", "focus", "sponsorship", "base"]) {
      assert.match(
        render,
        new RegExp(`acknowledgeOnboardingFlowStep\\(\\s*["']${step}["']\\s*,\\s*["']continued["']\\s*,\\s*state\\.flow_version\\s*\\)`),
        `${step} is not acknowledged as continued`,
      );
    }
    assert.match(render, /acknowledgeOnboardingFlowStep\(\s*["']gaps["']\s*,\s*skipped\s*\?\s*["']skipped["']\s*:\s*["']continued["']/);
  });

  test("returning completion records only the new flow, while new accounts retain legacy completion", async () => {
    const page = shipped(await read("app/start/page.tsx"));
    const done = page.slice(page.indexOf("<DoneStep"), page.indexOf("/>\n", page.indexOf("<DoneStep")) + 3);

    assert.match(done, /flowComplete|completeOnboardingFlow|onComplete/);
    assert.match(page, /completed_at/);
    assert.match(page, /completeOnboarding\(/);
    assert.match(page, /if\s*\([^)]*!?state\.completed_at[^)]*\)/);
  });
});

describe("a reset review preserves stored profile data", () => {
  test("the start route reads parsed and application profiles independently and never clears either", async () => {
    const page = shipped(await read("app/start/page.tsx"));
    const load = page.slice(page.indexOf("const loadProfile"), page.indexOf("useEffect(() =>", page.indexOf("const loadProfile")));

    assert.match(load, /api<ParsedProfile>\("\/profile"\)/);
    assert.match(load, /getApplicationProfile\(\)/);
    assert.doesNotMatch(load, /put|delete|clear|reset/i);
    assert.match(page, /savedProfile=\{hasFlowLedger\(state\) && state\.has_resume && state\.flow_completed === false \? profile : undefined\}/);
    assert.doesNotMatch(page, /savedProfile=\{state\.completed_at/);
    assert.match(page, /hasFlowLedger\(state\) && state\.has_resume && !state\.flow_completed && parsedProfileStatus !== "ready"/);
    /* The ledger check is a >= test, not an equality, because the roles-first reorder bumped the
       server to flow version 3. Ten hardcoded `=== 2` checks would all have gone quietly false:
       every screen would still render and advance, and not one acknowledgement would be written. */
    assert.match(page, /flow_version >= 2/);
    assert.doesNotMatch(page, /flow_version === 2/);
    assert.match(page, /parsedProfileStatus === "error"[\s\S]*?Try loading again/);
  });

  test("saved targeting wins over inference and unseen targeting fields remain omitted", () => {
    const saved = {
      categories: ["quant-trading", "product"],
      titles: ["Quantitative Researcher"],
      role_types: ["internship"],
    };
    const guess = { roles: ["Software Engineer"], roleType: "full-time" };

    assert.deepEqual(focusSeed(saved, guess), {
      titles: ["Quantitative Researcher"],
      roleTypes: ["internship"],
    });
    const patch = focusPatch(saved, focusSeed(saved, guess));
    assert.deepEqual(patch.titles, ["Quantitative Researcher"]);
    assert.deepEqual(patch.role_types, ["internship"]);
    for (const category of saved.categories) {
      assert.ok(patch.categories.includes(category), `${category} was cleared by the review step`);
    }
    const productionPatch = focusPatch(saved, {
      ...focusSeed(saved, guess),
      categories: ["design"],
    });
    assert.ok(productionPatch.categories.includes("quant-trading"), "the final UI payload cleared a saved category");
    assert.ok(productionPatch.categories.includes("design"), "the final UI payload dropped a selected category");
    for (const hidden of ["locations", "remote_only", "primary_period", "backup_period"]) {
      assert.equal(hidden in patch, false, `${hidden} would be cleared by the review step`);
    }
  });

  test("stored country-specific application answers are copied into the review without reinterpretation", () => {
    const stored = [{
      country_code: "AE",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: "Golden Visa",
      authorization_expiry: "2032-04-19",
    }];
    const seeded = eligibilitySeed({
      work_eligibility_by_country: stored,
      work_authorized: false,
      needs_sponsorship: true,
    }, "needs_now");

    assert.deepEqual(seeded, stored);
    assert.notEqual(seeded, stored, "the form must receive its own array rather than mutate the saved profile");
    assert.notEqual(seeded[0], stored[0], "the form must not mutate a saved country record in place");
  });

  test("the base review seeds every stored application fact and sends only nonblank edits", async () => {
    const base = shipped(await read("components/start/BaseResumeStep.tsx"));
    const seed = functionBlock(base, "applicationFactSeed");
    const patch = functionBlock(base, "applicationFactPatch");

    assert.match(seed, /profile\?\.\[field\.key\]/);
    assert.match(seed, /typeof stored === "string" && stored\.trim\(\)/);
    assert.match(patch, /const typed = input\.facts\[field\.key\]\?\.trim\(\)/);
    assert.match(patch, /if \(typed\)/);
    assert.doesNotMatch(patch, /\?\?\s*(?:""|null)|=\s*null/);

    for (const field of [
      "eeo_prefs",
      "prior_application_employers",
      "has_outstanding_offers",
      "outstanding_offer_details",
      "advanced_study_plan",
      "availability_window_start",
      "availability_window_end",
      "availability_cycle",
      "availability_valid_through",
      "referral_source_default",
    ]) {
      assert.match(base, new RegExp(`profile\\?\\.${field}`), `${field} is not prefilled from the saved application profile`);
    }
  });

  test("flow-review handling cannot turn the historical completion date into a blank-account signal", async () => {
    const page = shipped(await read("app/start/page.tsx"));
    /* Start after the localhost QA fixture. That fabricated account deliberately carries
       completed_at: null, because it models a new setup run and is not part of the returning-user
       reset contract. The production branch begins at the auth gate and ends before analytics. */
    const production = page.slice(
      page.indexOf("if (!getToken())"),
      page.indexOf("// One step_view"),
    );

    assert.match(production, /requires_onboarding/, "the production route never reads requires_onboarding");
    assert.doesNotMatch(production, /completed_at\s*=\s*null|completed_at:\s*null/);
    assert.doesNotMatch(production, /setProfile\(null\)|setAppProfile\(null\)/);
  });
});

test("an unknown step renders the done screen rather than a blank page", async () => {
  /* The switch must have an exhaustive arm. Without one a step name this build does not know
     matches no case, renderStep() returns undefined, and /start is blank - which made every
     backend step addition a website-must-ship-first change, and the PR description for the
     application sequence got that order backwards once already. */
  const page = shipped(await read("app/start/page.tsx"));
  const render = page.slice(page.indexOf("switch (step)"));
  assert.match(render, /^\s*default:/m, "the step switch has no default arm, so an unknown step renders nothing");

  // And the default shares the done screen's arm rather than introducing a second behaviour.
  const defaultAt = render.indexOf("default:");
  const doneAt = render.indexOf('case "done":');
  assert.ok(doneAt >= 0 && doneAt < defaultAt, "default must fall through with the done case");
  assert.ok(
    render.slice(doneAt, defaultAt + 400).includes("<DoneStep"),
    "an unknown step must land on the done screen, which is the exit",
  );
});
