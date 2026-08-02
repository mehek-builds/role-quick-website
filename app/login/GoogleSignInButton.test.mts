import test from "node:test";
import assert from "node:assert/strict";
import { renderGoogleControl } from "./google-button.ts";

function harness(width = 318) {
  const calls: string[] = [];
  const parent = {
    clientWidth: width,
    replaceChildren() {
      calls.push("replace");
    },
  };
  const api = {
    initialize() {
      calls.push("initialize");
    },
    renderButton(_parent: unknown, options: { width: number }) {
      calls.push(`render:${options.width}`);
    },
  };
  return { api, calls, parent };
}

test("Google sign-in initializes and renders the official button without opening an automatic prompt", () => {
  const { api, calls, parent } = harness();

  const initialized = renderGoogleControl(
    api,
    parent,
    "client-id",
    null,
    () => {},
  );

  assert.equal(initialized, "client-id");
  assert.deepEqual(calls, ["initialize", "replace", "render:318"]);
});

test("Google sign-in re-renders the visible button when the client is already initialized", () => {
  const { api, calls, parent } = harness(500);

  renderGoogleControl(
    api,
    parent,
    "client-id",
    "client-id",
    () => {},
  );

  assert.deepEqual(calls, ["replace", "render:320"]);
});
