import assert from "node:assert/strict";
import test from "node:test";
import { trackZeroResultJobSearchWithRuntime } from "./job-search-demand.ts";

function runtime(storageThrows = false) {
  const captured: Record<string, string | number | boolean>[] = [];
  const stored = new Set<string>();
  return {
    captured,
    value: {
      capture: (properties: Record<string, string | number | boolean>) => captured.push(properties),
      getSessionStorage: () => {
        if (storageThrows) throw new Error("storage disabled");
        return {
          getItem: (key: string) => stored.has(key) ? "1" : null,
          setItem: (key: string) => { stored.add(key); },
        };
      },
      seen: new Set<string>(),
    },
  };
}

const base = {
  targetRole: "Product Manager",
  surface: "dashboard" as const,
  totalResults: 0,
};

test("captures an identical zero-result search once and changed filters separately", () => {
  const fake = runtime();
  assert.equal(trackZeroResultJobSearchWithRuntime(base, fake.value), true);
  assert.equal(trackZeroResultJobSearchWithRuntime(base, fake.value), false);
  assert.equal(trackZeroResultJobSearchWithRuntime({ ...base, remoteOnly: true }, fake.value), true);
  assert.equal(fake.captured.length, 2);
  assert.equal(fake.captured[0]?.target_role, "product manager");
  assert.equal(fake.captured[1]?.remote_only, true);
});

test("does not capture searches with results or sensitive values", () => {
  const fake = runtime();
  assert.equal(trackZeroResultJobSearchWithRuntime({ ...base, totalResults: 1 }, fake.value), false);
  assert.equal(trackZeroResultJobSearchWithRuntime({ ...base, targetRole: "me@example.com" }, fake.value), false);
  assert.equal(trackZeroResultJobSearchWithRuntime({ ...base, location: "+1 415 555 0199" }, fake.value), false);
  assert.equal(fake.captured.length, 0);
});

test("storage failures remain safe and still deduplicate for the current page", () => {
  const fake = runtime(true);
  assert.equal(trackZeroResultJobSearchWithRuntime(base, fake.value), true);
  assert.equal(trackZeroResultJobSearchWithRuntime(base, fake.value), false);
  assert.equal(fake.captured.length, 1);
});
