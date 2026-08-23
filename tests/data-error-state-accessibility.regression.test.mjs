import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = await readFile(new URL("../components/app/ui.tsx", import.meta.url), "utf8");
const network = await readFile(new URL("../app/dashboard/network/page.tsx", import.meta.url), "utf8");

test("shared asynchronous data failures are announced with their retry action", () => {
  const start = ui.indexOf("export function DataErrorState");
  const end = ui.indexOf("function EmptyStateVisual", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const component = ui.slice(start, end);

  assert.match(component, /<div role="alert">/);
  assert.match(component, /<EmptyState visual="error"/);
  assert.match(component, /<Button type="button" onClick=\{onRetry\}>/);
});

test("Network relies on the shared alert instead of nesting alert regions", () => {
  const start = network.indexOf("function NetworkRequestError");
  const end = network.indexOf("function LockedInsight", start);
  const component = network.slice(start, end);

  assert.match(component, /return <DataErrorState/);
  assert.doesNotMatch(component, /role="alert"/);
});
