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
    if (path === "/applications?limit=200") return { applications: [canonicalApplication] } as T;
    throw new Error(`unexpected request: ${path}`);
  }, appendCanonicalStub as never);
  /* Canonical first: the request is issued before the bootstrap await so the two run in
     parallel instead of costing Home a serial round trip. */
  assert.deepEqual(paths, ["/applications?limit=200", "/dashboard/bootstrap"]);
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
    if (path === "/applications?limit=200") return { applications: [canonicalApplication] } as T;
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
    if (path === "/applications?limit=200") throw new Error("canonical route down");
    throw new Error(`unexpected request: ${path}`);
  }, appendCanonicalStub as never);
  assert.equal(state.packets.length, 1);
  assert.equal(state.packets[0]?.id, "only");
});

/* ─── whether the inventory answered at all ──────────────────────────────────────────────────────
 *
 * Every packet source here fails soft to an empty list so a dead dependency cannot blank Home. The
 * cost is that "your inventory did not load" and "you have generated nothing" arrive as the same
 * `packets: []`, and Momentum's "sent in total" prints that as a counted 0 - it renders
 * `pipeline.sent`, and 0 is not nullish, so Funnel's `sent ?? f.applications_submitted` cannot
 * reach the backend's own figure. inventoryObserved is what lets the caller tell them apart. */

test("a bootstrap that carried an empty history measured an empty inventory", () => {
  assert.equal(dashboardStateFromBootstrap(completeBootstrap).inventoryObserved, true);
});

test("a bootstrap with no usable resume_history measured nothing", () => {
  /* isBootstrapV1 validates schema_version, me and jobs - never resume_history - so this shape
     reaches the projection as a successful load. */
  const state = dashboardStateFromBootstrap({
    ...completeBootstrap,
    resume_history: {} as DashboardBootstrap["resume_history"],
  });
  assert.deepEqual(state.packets, []);
  assert.equal(state.inventoryObserved, false, "an absent history is not an empty one");
});

test("a failed history fetch on the legacy path is not reported as an empty inventory", async () => {
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    if (path === "/dashboard/bootstrap") throw Object.assign(new Error("gone"), { status: 404 });
    if (path === "/resume/history") throw new Error("history route down");
    if (path === "/me") return completeBootstrap.me as T;
    if (path === "/jobs?offset=0") return completeBootstrap.jobs as T;
    if (path === "/profile/targeting") return completeBootstrap.targeting as T;
    if (path === "/profile") return completeBootstrap.profile as T;
    if (path === "/profile/application") return {} as T;
    if (path === "/track/events") return [] as T;
    if (path === "/onboarding/state") return { automatic_submission_enabled: false } as T;
    throw new Error(`unexpected request: ${path}`);
  });

  assert.deepEqual(state.packets, [], "the page still renders rather than failing on one dead route");
  assert.equal(state.inventoryObserved, false, "nothing counted this account's packets");
});

test("a history fetch that answered empty IS an empty inventory", async () => {
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    if (path === "/dashboard/bootstrap") throw Object.assign(new Error("gone"), { status: 404 });
    if (path === "/resume/history") return { resumes: [] } as T;
    if (path === "/me") return completeBootstrap.me as T;
    if (path === "/jobs?offset=0") return completeBootstrap.jobs as T;
    if (path === "/profile/targeting") return completeBootstrap.targeting as T;
    if (path === "/profile") return completeBootstrap.profile as T;
    if (path === "/profile/application") return {} as T;
    if (path === "/track/events") return [] as T;
    if (path === "/onboarding/state") return { automatic_submission_enabled: false } as T;
    throw new Error(`unexpected request: ${path}`);
  });

  assert.equal(state.inventoryObserved, true, "0 sent is a true sentence about this account");
});

test("the canonical list answering is enough on its own", async () => {
  /* The canonical fetch can carry applications the history window never held, so it counts as an
     observation even when the history half failed. */
  const canonicalApplication = {
    id: "canonical-only",
    legacy_generated_resume_id: null,
    job_id: null,
    company: "Acme",
    role: "Product Intern",
    portal_url: "https://jobs.lever.co/acme/requisition-3",
    tracker_state: "applying",
    review_state: "filling",
    submission_state: "not_started",
    created_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z",
  };
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    if (path === "/dashboard/bootstrap") throw Object.assign(new Error("gone"), { status: 404 });
    if (path === "/applications?limit=200") return { applications: [canonicalApplication] } as T;
    if (path === "/resume/history") throw new Error("history route down");
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
  assert.equal(state.inventoryObserved, true);
});

test("both inventory sources failing leaves nothing observed", async () => {
  const state = await loadDashboardInitialState(async <T,>(path: string) => {
    if (path === "/dashboard/bootstrap") {
      return { ...completeBootstrap, resume_history: {} } as T;
    }
    if (path === "/applications?limit=200") throw new Error("canonical route down");
    throw new Error(`unexpected request: ${path}`);
  }, appendCanonicalStub as never);

  assert.deepEqual(state.packets, []);
  assert.equal(state.inventoryObserved, false);
});
