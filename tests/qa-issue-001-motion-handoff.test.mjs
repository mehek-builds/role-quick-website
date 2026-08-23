import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing ${selector}`);
  return match[1];
}

test("dashboard panel entry waits for the outgoing panel to finish", () => {
  const outgoing = rule("::view-transition-old(.rq-dashboard-panel)");
  const incoming = rule("::view-transition-new(.rq-dashboard-panel)");

  assert.match(outgoing, /rq-dashboard-panel-exit\s+var\(--motion-exit\)/);
  assert.match(
    incoming,
    /rq-dashboard-panel-enter\s+var\(--motion-state\)\s+var\(--motion-ease-out\)\s+var\(--motion-exit\)\s+both/,
  );
  assert.doesNotMatch(incoming, /55ms/);
});
