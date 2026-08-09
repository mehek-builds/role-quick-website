import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeHtmlEntities } from "../lib/html-entities.ts";

test("scraped pay ranges render punctuation instead of literal entities", () => {
  assert.equal(
    decodeHtmlEntities("SF Bay Area Hourly Rate $54 &mdash; $56 USD"),
    "SF Bay Area Hourly Rate $54 - $56 USD",
  );
  assert.equal(
    decodeHtmlEntities("Bellevue Hourly Rate $51.50 &#8212; $53.50 USD"),
    "Bellevue Hourly Rate $51.50 - $53.50 USD",
  );
});

test("decoded posting text remains plain text", () => {
  assert.equal(decodeHtmlEntities("React &amp; TypeScript &lt;3"), "React & TypeScript <3");
  assert.equal(decodeHtmlEntities("unknown &madeup; entity"), "unknown &madeup; entity");
});
