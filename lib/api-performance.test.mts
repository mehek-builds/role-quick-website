import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { requestShareKey, shareInFlight } from "./in-flight.ts";
import { normalizedScrollProgress } from "./scroll-progress.ts";

test("scroll progress handles zero-height documents and clamps both bounds", () => {
  assert.equal(normalizedScrollProgress(0, 720, 720), 0);
  assert.equal(normalizedScrollProgress(100, 600, 720), 0);
  assert.equal(normalizedScrollProgress(-20, 1720, 720), 0);
  assert.equal(normalizedScrollProgress(500, 1720, 720), 0.5);
  assert.equal(normalizedScrollProgress(1000, 1720, 720), 1);
  assert.equal(normalizedScrollProgress(1200, 1720, 720), 1);
});

test("concurrent GET requests share one network call", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = new Map<string, Promise<unknown>>();
  const fetchMetric = () => {
    calls += 1;
    return gate.then(() => ({ ok: true }));
  };

  const first = shareInFlight(cache, "funnel", fetchMetric);
  const second = shareInFlight(cache, "funnel", fetchMetric);
  assert.equal(calls, 1);
  release?.();
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
  assert.equal(cache.size, 0);
});

test("mutations are never deduplicated", async () => {
  let calls = 0;
  const mutate = async () => {
    calls += 1;
    return { ok: true };
  };
  const cache = new Map<string, Promise<unknown>>();

  await Promise.all([
    shareInFlight(cache, null, mutate),
    shareInFlight(cache, null, mutate),
  ]);
  assert.equal(calls, 2);
});

test("a settled request is forgotten so later reads stay fresh", async () => {
  let calls = 0;
  const cache = new Map<string, Promise<unknown>>();
  const fetchMetric = async () => {
    calls += 1;
    return { call: calls };
  };

  assert.deepEqual(await shareInFlight(cache, "funnel", fetchMetric), { call: 1 });
  assert.deepEqual(await shareInFlight(cache, "funnel", fetchMetric), { call: 2 });
  assert.equal(calls, 2);
  assert.equal(cache.size, 0);
});

test("a rejected request is forgotten and can be retried", async () => {
  let calls = 0;
  const cache = new Map<string, Promise<unknown>>();
  const fetchMetric = async () => {
    calls += 1;
    if (calls === 1) throw new Error("offline");
    return { ok: true };
  };

  await assert.rejects(shareInFlight(cache, "funnel", fetchMetric), /offline/);
  assert.equal(cache.size, 0);
  assert.deepEqual(await shareInFlight(cache, "funnel", fetchMetric), { ok: true });
  assert.equal(calls, 2);
});

test("different authenticated reads do not share work", async () => {
  let calls = 0;
  const cache = new Map<string, Promise<unknown>>();
  const fetchMetric = async () => {
    calls += 1;
    return calls;
  };

  const [first, second] = await Promise.all([
    shareInFlight(cache, "token-a|/me", fetchMetric),
    shareInFlight(cache, "token-b|/me", fetchMetric),
  ]);

  assert.deepEqual([first, second], [1, 2]);
  assert.equal(calls, 2);
});

test("an older request cannot delete a newer entry for the same key", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = new Map<string, Promise<unknown>>();
  const first = shareInFlight(cache, "funnel", () => gate);
  const replacement = Promise.resolve("newer");
  cache.set("funnel", replacement);

  release?.();
  await first;
  assert.equal(cache.get("funnel"), replacement);
});

test("the API only shares semantically identical default GET requests", () => {
  assert.equal(requestShareKey("/me", "token-a", {}), "token-a|/me");
  assert.equal(requestShareKey("/me", "token-a", { method: "get" }), "token-a|/me");
  assert.equal(requestShareKey("/me", "token-b", {}), "token-b|/me");
  assert.equal(requestShareKey("/jobs", "token-a", {}), "token-a|/jobs");
  assert.equal(requestShareKey("/me", "token-a", { method: "POST" }), null);
  assert.equal(requestShareKey("/me", "token-a", { body: "payload" }), null);
  assert.equal(requestShareKey("/me", "token-a", { signal: AbortSignal.abort() }), null);
  assert.equal(
    requestShareKey("/me", "token-a", { headers: { "X-Request-Variant": "fresh" } }),
    null,
  );
});

test("the homepage performance fallbacks remain scoped and cancellable", async () => {
  const [hero, progress, globals] = await Promise.all([
    readFile(
      new URL("../components/cinema/CinematicHero.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/ScrollProgress.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(hero, /import\("\.\/paperRollEngine"\)/);
  assert.match(hero, /if \(cancelled \|\| inited\) return/);
  assert.match(hero, /if \(cancelled\) return/);
  assert.match(hero, /cancelled = true/);
  assert.match(hero, /if \(initRaf\) cancelAnimationFrame\(initRaf\)/);
  assert.doesNotMatch(hero, /<img[\s\S]*dashboard-emails\.png/);

  assert.match(progress, /requestAnimationFrame\(paint\)/);
  assert.match(progress, /cancelAnimationFrame\(raf\)/);
  assert.doesNotMatch(progress, /setP\(/);

  const reducedMotionBlock = globals.slice(
    globals.indexOf("@media (prefers-reduced-motion: reduce)"),
  );
  assert.match(
    reducedMotionBlock,
    /\.rq-cine-still-product\s*\{[\s\S]*background-image:\s*url\("\/product\/dashboard-emails\.png"\)/,
  );
});
