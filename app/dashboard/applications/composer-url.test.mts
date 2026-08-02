import test from "node:test";
import assert from "node:assert/strict";
import { closedComposerPath, replaceClosedComposerUrl } from "./composer-url.ts";

test("closing a job composer removes the reload instruction and preserves unrelated route state", () => {
  const closed = closedComposerPath({
    pathname: "/dashboard/applications",
    search: "?job=job-123&state=action&application=packet-9",
    hash: "#applied",
  });

  assert.equal(
    closed,
    "/dashboard/applications?state=action&application=packet-9#applied",
  );

  const reloaded = new URL(closed, "https://trylitos.com");
  assert.equal(reloaded.searchParams.get("job"), null);
  assert.equal(reloaded.searchParams.get("new"), null);
  assert.equal(reloaded.searchParams.get("state"), "action");
  assert.equal(reloaded.searchParams.get("application"), "packet-9");
});

test("closing a manually opened composer removes new without leaving an empty query", () => {
  assert.equal(
    closedComposerPath({
      pathname: "/dashboard/applications",
      search: "?new=1",
      hash: "",
    }),
    "/dashboard/applications",
  );
});

test("the close action replaces browser history so reload cannot reopen the composer", () => {
  const replacements: string[] = [];
  const next = replaceClosedComposerUrl(
    {
      pathname: "/dashboard/applications",
      search: "?qa=acme&job=job-123&new=1&state=action",
      hash: "#applied",
    },
    (_data, _unused, url) => replacements.push(String(url)),
  );

  assert.equal(next, "/dashboard/applications?qa=acme&state=action#applied");
  assert.deepEqual(replacements, [next]);
  const reloaded = new URL(replacements[0], "http://localhost:3602");
  assert.equal(reloaded.searchParams.has("job"), false);
  assert.equal(reloaded.searchParams.has("new"), false);
  assert.equal(reloaded.searchParams.get("qa"), "acme");
});
