import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* A bodyless mutating request used to send neither body nor Content-Type, and whether the
 * backend's Fastify accepts that proved DEPLOYMENT-DEPENDENT: identical bodyless
 * POST /applications/:id/packet-audit calls returned 200 on one production deployment and 415
 * FST_ERR_CTP_INVALID_MEDIA_TYPE on the next (measured live 2026-08-26; replaying the bare POST
 * from the page console 415'd while the same POST with an empty JSON body returned 200 and a
 * passed audit). Every bodyless-POST route ignores its body, so the empty JSON object changes
 * nothing a handler reads - it only makes the request well-formed under the strictest parser. */
describe("a bodyless mutating request is made well-formed instead of gambling on the backend parser", () => {
  const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

  test("requestApi gives bodyless non-GET/HEAD requests an empty JSON body and content type", () => {
    assert.match(
      api,
      /\} else if \(!body && !\["GET", "HEAD"\]\.includes\(\(init\.method \?\? "GET"\)\.toUpperCase\(\)\)\) \{[\s\S]*?body = "\{\}";\s*\n\s*headers\.set\("Content-Type", "application\/json"\);/,
      "bodyless POST/PUT/PATCH/DELETE must carry an explicit empty JSON body - a bare mutating " +
      "request 415s on some production deployments and not others",
    );
  });

  test("a real string body still gets its JSON content type, and non-string bodies stay untouched", () => {
    assert.match(
      api,
      /if \(body && typeof body === "string"\) \{\s*\n\s*headers\.set\("Content-Type", "application\/json"\);/,
      "the existing string-body branch must survive - and by being the FIRST branch it keeps " +
      "FormData and other non-string bodies out of both overrides, so uploads keep their own " +
      "browser-set multipart boundary",
    );
    assert.match(
      api,
      /await fetch\(`\$\{API_URL\}\$\{path\}`, \{ \.\.\.init, body, headers \}\);/,
      "the fetch must send the possibly-defaulted body, not the raw init.body it replaced",
    );
  });
});
