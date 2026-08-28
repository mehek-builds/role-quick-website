import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardBootstrap } from "../../../lib/api.ts";
import { dashboardStateFromBootstrap, loadDashboardInitialState } from "./load-dashboard.ts";
/* A stub with the injected contract's shape. The REAL merge's semantics belong to
 * canonical-tracker.test.mts; these tests own only the loader's plumbing: that the canonical list
 * is fetched exactly when a merge is injected, that its output becomes Home's packets, and that a
 * failed fetch keeps the plain history window. */
const appendCanonicalStub = (
  legacy: readonly { id: string }[],
  canonical: readonly { id: string }[],
) => [...legacy, ...canonical.map((application) => ({ id: `from-${application.id}` }))] as never[];

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

test("bootstrap packets are completed with the canonical applications the Tracker merges", async () => {
  const canonicalApplication = {
    id: "canonical-1",
    legacy_generated_resume_id: null,
    job_id: null,
    company: "Acme",
    role: "Product Intern",
    portal_url: "https://jobs.lever.co/acme/requisition-2",
    tracker_state: "applying",
    review_state: "filling",
    submission_state: "not_started",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  };
  const paths: string[] = [];
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    paths.push(path);
    if (path === "/dashboard/bootstrap") return completeBootstrap as T;
    if (path === "/applications?limit=100") return { applications: [canonicalApplication] } as T;
    throw new Error(`unexpected request: ${path}`);
  }, appendCanonicalStub as never);
  assert.deepEqual(paths, ["/dashboard/bootstrap", "/applications?limit=100"]);
  assert.equal(state.packets.length, 1, "the canonical-only application joins Home's packets");
});

test("legacy-path packets get the same canonical merge", async () => {
  const canonicalApplication = {
    id: "canonical-legacy-1",
    legacy_generated_resume_id: null,
    job_id: null,
    company: "Acme",
    role: "Product Intern",
    portal_url: "https://jobs.lever.co/acme/requisition-9",
    tracker_state: "applying",
    review_state: "filling",
    submission_state: "not_started",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  };
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    if (path === "/dashboard/bootstrap") throw Object.assign(new Error("gone"), { status: 404 });
    if (path === "/applications?limit=100") return { applications: [canonicalApplication] } as T;
    if (path === "/resume/history") return { resumes: [] } as T;
    if (path === "/me") return completeBootstrap.me as T;
    if (path === "/jobs?offset=0") return completeBootstrap.jobs as T;
    if (path === "/profile/targeting") return completeBootstrap.targeting as T;
    if (path === "/profile") return completeBootstrap.profile as T;
    if (path === "/profile/application") return {} as T;
    if (path === "/track/events") return [] as T;
    if (path === "/onboarding/state") return { automatic_submission_enabled: false } as T;
    throw new Error(`unexpected request: ${path}`);
  }, appendCanonicalStub as never);
  assert.equal(state.packets.length, 1);
});

test("a failed canonical fetch keeps the history window instead of failing Home", async () => {
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    if (path === "/dashboard/bootstrap") {
      return { ...completeBootstrap, resume_history: { resumes: [{ id: "only" }] } } as T;
    }
    if (path === "/applications?limit=100") throw new Error("canonical route down");
    throw new Error(`unexpected request: ${path}`);
  }, appendCanonicalStub as never);
  assert.equal(state.packets.length, 1);
  assert.equal(state.packets[0]?.id, "only");
});
