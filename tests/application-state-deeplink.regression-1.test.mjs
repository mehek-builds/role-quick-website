import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  applicationFilterFromSearch,
  applicationFilterHeading,
  statusMatchesApplicationFilter,
} from "../features/applications/domain/application-filter.ts";

/* ISSUE-037, found live on trylitos.com on 2026-08-04.
 *
 * Home's Overview links into the Tracker with `?state=`: the amber "N stopped for you" banner and
 * the Ready / Needs you / Sent tiles are all deep links. The Tracker seeded its filter from that
 * parameter and a comment on the seeding said, in as many words, that this made the metrics real
 * filter links rather than decoration. It did not. The value fed one list that only rendered inside
 * a section gated on `selected && reviewablePackets.length > 1`, and nothing is selected on arrival,
 * so the filter was applied to nothing, displayed nowhere, and could not be changed or cleared.
 *
 * Measured: /dashboard/applications?state=action, ?state=ready and the bare URL all rendered a
 * byte-identical board of the same five SENT applications, on an account whose Home reported five
 * applications waiting on the student. The most prominent call to action on the dashboard promised
 * those five and delivered the other five.
 *
 * Two halves, so both can bite:
 *   - the parsing, the predicate and the wording are a tested unit;
 *   - the page actually renders the filtered list when nothing is selected, and does not assume a
 *     selection while doing it.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments carry the words this file asserts on, so they come off before any structural check. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const applications = read("app/dashboard/applications/page.tsx");
const home = read("app/dashboard/page.tsx");

describe("the ?state= deep link resolves to a view", () => {
  test("every value Home links with is a view the Tracker honours", () => {
    const linked = [...home.matchAll(/[?&]state=([a-z]+)/g)].map((match) => match[1]);
    assert.ok(linked.length >= 3, `expected Home to still deep-link the Overview metrics, found ${linked.length}`);
    for (const value of new Set(linked)) {
      assert.notEqual(
        applicationFilterFromSearch(`?state=${value}`),
        "all",
        `Home links ?state=${value}; falling back to "all" would land the student on the unfiltered board`,
      );
    }
  });

  test("an absent, empty or unknown state shows everything rather than nothing", () => {
    assert.equal(applicationFilterFromSearch(""), "all");
    assert.equal(applicationFilterFromSearch("?application=abc"), "all");
    assert.equal(applicationFilterFromSearch("?state="), "all");
    assert.equal(applicationFilterFromSearch("?state=archived"), "all");
    // An empty tracker reads as "you have nothing", which is a lie about the student's own history.
  });

  test("each view holds exactly the applications its Home tile counted", () => {
    const action = ["needs_attention", "ready_for_final_approval", "failed"];
    const ready = ["resume_ready", "questions_ready", "ready_to_submit"];
    for (const status of action) {
      assert.equal(statusMatchesApplicationFilter(status, "action"), true, status);
      assert.equal(statusMatchesApplicationFilter(status, "ready"), false, status);
      assert.equal(statusMatchesApplicationFilter(status, "submitted"), false, status);
    }
    for (const status of ready) {
      assert.equal(statusMatchesApplicationFilter(status, "ready"), true, status);
      assert.equal(statusMatchesApplicationFilter(status, "action"), false, status);
    }
    assert.equal(statusMatchesApplicationFilter("submitted", "submitted"), true);
    assert.equal(statusMatchesApplicationFilter("submitted", "action"), false);
    // A packet with no review at all belongs in no filtered view, and in the unfiltered one.
    assert.equal(statusMatchesApplicationFilter(undefined, "action"), false);
    assert.equal(statusMatchesApplicationFilter(undefined, "all"), true);
  });

  test("Home still counts its tiles with those same status groups", () => {
    /* The tile says 5 and the list it links to has to hold those 5. Asserted on Home's own arrays
       rather than by importing them, because Home computes the summary inline. If that moves into
       the domain, point this at it. */
    assert.match(home, /\["needs_attention", "ready_for_final_approval", "failed"\]/);
    assert.match(home, /\["resume_ready", "questions_ready", "ready_to_submit"\]/);
  });
});

describe("the chosen view is visible on the page it lands on", () => {
  const ledger = (() => {
    const source = stripComments(applications);
    const start = source.indexOf('<section aria-labelledby="application-ledger-heading"');
    assert.notEqual(start, -1, "expected the ledger section to still be labelled by its heading id");
    const end = source.indexOf("</section>", start);
    assert.notEqual(end, -1, "expected the ledger section to close");
    return { source, start, body: source.slice(start, end) };
  })();

  test("the list renders without a packet being open", () => {
    /* THE DEFECT. The gate read `selected && reviewablePackets.length > 1`, and a ?state= arrival
       has no selection, so the one thing that consumed the filter never mounted. The gate has to
       consult the filter itself for the deep link to land anywhere. */
    const gate = ledger.source.slice(Math.max(0, ledger.start - 300), ledger.start);
    assert.match(
      gate,
      /applicationFilter/,
      "the ledger's own render gate must consult the filter, or a ?state= arrival renders nothing that uses it",
    );
  });

  test("nothing inside the list assumes a packet is selected", () => {
    assert.doesNotMatch(
      ledger.body,
      /selected\.id/,
      "the list now renders as the landing view for a deep link, where `selected` is null",
    );
  });

  test("the current view is readable as words, not only as a select option", () => {
    assert.match(
      ledger.body,
      /applicationFilterHeading\(applicationFilter\)/,
      "a filter the student cannot see is a filter they cannot clear",
    );
    const heading = ledger.body.slice(ledger.body.indexOf('id="application-ledger-heading"'));
    const className = heading.match(/className=\{([^}]+)\}/)?.[1] ?? "";
    assert.match(className, /selected/, "the heading is only sr-only beside an open packet, not on the landing view");
  });

  test("the filter can still be set back to everything from that view", () => {
    const select = ledger.body.slice(ledger.body.indexOf('id="application-filter"'));
    assert.match(select, /value=\{applicationFilter\}/, "the select has to show the seeded value");
    assert.match(select, /setApplicationFilter/, "and has to be able to change it");
    assert.match(select, /<option value="all">/, "clearing the filter is how the student gets the whole tracker back");
  });
});

describe("the wording of each view", () => {
  test("every view names itself in plain language", () => {
    for (const filter of ["all", "action", "ready", "submitted"]) {
      const heading = applicationFilterHeading(filter);
      /* A phrase a student reads, not a key they decode. "action" in particular is the one that
         has no plain-English meaning here: it is the codebase's word for "Litos stopped and is
         waiting on you", and printing it raw is how "all time counter" reached production. */
      assert.match(heading, /^[A-Z]/, `${filter} needs a sentence, not an enum member`);
      if (filter !== "all") {
        assert.ok(heading.split(" ").length >= 3, `${filter} needs a phrase that says what is in the list`);
      }
      assert.doesNotMatch(heading, /\baction\b/i, `${filter} must not print the codebase's own word`);
    }
    assert.notEqual(applicationFilterHeading("action"), applicationFilterHeading("ready"));
    assert.notEqual(applicationFilterHeading("action"), applicationFilterHeading("all"));
  });
});
