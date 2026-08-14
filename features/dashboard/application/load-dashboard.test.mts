import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardBootstrap } from "../../../lib/api.ts";
import { dashboardStateFromBootstrap, loadDashboardInitialState } from "./load-dashboard.ts";

const completeBootstrap: DashboardBootstrap = {
  schema_version: 1,
  me: {
    email: "me@example.com",
    is_guest: false,
    tier: "free",
    trial_ends_at: null,
    usage: {
      contacts: { used: 0, limit: 10 },
      drafts: { used: 0, limit: 10 },
      resumes: { used: 0, limit: 10 },
    },
  },
  jobs: { jobs: [{ id: "job-1" }] as DashboardBootstrap["jobs"]["jobs"] },
  targeting: { categories: null, titles: null, role_types: null, locations: null, remote_only: false, primary_period: null, backup_period: null },
  profile: { full_name: "Me", resume_email: "me@usc.edu", skills: ["TypeScript"] },
  resume_history: { resumes: [] },
  application_profile: {},
  outreach: [],
  onboarding: { automatic_submission_enabled: true },
  warnings: [],
};

test("maps the complete bootstrap projection into dashboard state", () => {
  const state = dashboardStateFromBootstrap(completeBootstrap);
  assert.equal(state.me.email, "me@example.com");
  assert.equal(state.jobs[0]?.id, "job-1");
  assert.equal(state.identity.full_name, "Me");
  assert.equal(state.identity.resume_email, "me@usc.edu");
  assert.equal(state.identity.email, "me@example.com");
  assert.equal(state.autoSubmitEnabled, true);
});

test("normalizes optional collection drift to safe empty values", () => {
  const state = dashboardStateFromBootstrap({
    ...completeBootstrap,
    jobs: {} as DashboardBootstrap["jobs"],
    profile: null as unknown as DashboardBootstrap["profile"],
    resume_history: {} as DashboardBootstrap["resume_history"],
    outreach: {} as DashboardBootstrap["outreach"],
    onboarding: {} as DashboardBootstrap["onboarding"],
    warnings: ["profile", "resume_history", "outreach", "onboarding"],
  });

  assert.deepEqual(state.jobs, []);
  assert.deepEqual(state.profile, { skills: [], target_roles: [] });
  assert.deepEqual(state.packets, []);
  assert.deepEqual(state.outreach, []);
  assert.equal(state.autoSubmitEnabled, false);
});

test("loads the versioned bootstrap contract with one request", async () => {
  const paths: string[] = [];
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    paths.push(path);
    return completeBootstrap as T;
  });

  assert.deepEqual(paths, ["/dashboard/bootstrap"]);
  assert.equal(state.jobs[0]?.id, "job-1");
});

test("does not reuse a pre-save bootstrap response when Home mounts again", async () => {
  let bootstrapInit: RequestInit | undefined;
  await loadDashboardInitialState(async <T,>(path: string, init?: RequestInit) => {
    if (path === "/dashboard/bootstrap") bootstrapInit = init;
    return completeBootstrap as T;
  });

  assert.equal(bootstrapInit?.cache, "no-store");
});

test("falls back to legacy parallel resources only when the aggregate is unavailable", async () => {
  const paths: string[] = [];
  const responses: Record<string, unknown> = {
    "/me": completeBootstrap.me,
    "/jobs?offset=0": completeBootstrap.jobs,
    "/profile/targeting": completeBootstrap.targeting,
    "/profile": completeBootstrap.profile,
    "/resume/history": completeBootstrap.resume_history,
    "/profile/application": completeBootstrap.application_profile,
    "/track/events": completeBootstrap.outreach,
    "/onboarding/state": completeBootstrap.onboarding,
  };
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    paths.push(path);
    if (path === "/dashboard/bootstrap") throw Object.assign(new Error("not found"), { status: 404 });
    return responses[path] as T;
  });

  assert.equal(paths.length, 9);
  assert.equal(state.me.email, "me@example.com");
  assert.equal(state.autoSubmitEnabled, true);
});

test("rejects bootstrap failures that do not indicate a compatibility gap", async () => {
  await assert.rejects(
    loadDashboardInitialState(async () => {
      throw Object.assign(new Error("service unavailable"), { status: 503 });
    }),
    /service unavailable/,
  );
});
