import assert from "node:assert/strict";
import test from "node:test";
import { homePrimaryAction } from "./home-primary-action.ts";

test("Home prioritizes applications that need the user", () => {
  assert.deepEqual(homePrimaryAction({ ready: 4, needsAction: 1 }), {
    href: "/dashboard/applications?state=action",
    label: "Continue 1 application",
  });
  assert.deepEqual(homePrimaryAction({ ready: 4, needsAction: 187 }), {
    href: "/dashboard/applications?state=action",
    label: "Continue 187 applications",
  });
});

test("Home offers ready applications before starting another one", () => {
  assert.deepEqual(homePrimaryAction({ ready: 1, needsAction: 0 }), {
    href: "/dashboard/applications?state=ready",
    label: "Review 1 ready application",
  });
  assert.deepEqual(homePrimaryAction({ ready: 3, needsAction: 0 }), {
    href: "/dashboard/applications?state=ready",
    label: "Review 3 ready applications",
  });
});

test("Home starts a new application only when no existing work is actionable", () => {
  assert.deepEqual(homePrimaryAction({ ready: 0, needsAction: 0 }), {
    href: "/dashboard/applications?new=1&intent=fill",
    label: "Fill application",
  });
});
