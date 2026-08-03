import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  applicationFilterFromSearch,
  applicationFilterHeading,
  ledgerRendersOnLanding,
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

  test("the page actually seeds its filter from the URL", () => {
    /* The parser being correct proves nothing if the page never calls it. Dropping the initialiser
       for a bare `useState("all")` survived every other assertion in this file: the parser still
       passed its own unit tests, the ledger still rendered whenever a filter was set, and no filter
       could ever be set, so all four Home controls went silently dead exactly as they did in
       ISSUE-037. The wiring is the thing the deep link rides on, so it is pinned here. */
    assert.match(
      applications,
      /useState<ApplicationFilter>\(\s*\(\) => \(typeof window === "undefined" \? "all" : applicationFilterFromSearch\(window\.location\.search\)\),?\s*\)/,
      "the filter's initial value has to come from the URL, or ?state= sets nothing at all",
    );
  });

  test("the list and the heading are driven by that same filter", () => {
    /* Both call sites, because either one pinned to a constant is the defect wearing a different
       hat: a list that ignores the filter, or a heading that misdescribes a list that honours it. */
    assert.match(
      applications,
      /statusMatchesApplicationFilter\(packet\.spec\._review\?\.status, applicationFilter\)/,
      "the rows have to be filtered by the chosen view, not by a constant",
    );
    assert.match(
      applications,
      /applicationFilterHeading\(applicationFilter\)/,
      "the heading has to name the chosen view, not a constant",
    );
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
       has no selection, so the one thing that consumed the filter never mounted.

       This asserts the exact expression, not that the word "applicationFilter" appears somewhere
       near it. The first version of this test matched the vocabulary and nothing else, and an
       adversarial pass walked straight through it: inverting the filter check to `=== "all"`, and
       raising the count threshold to `> 99`, both left the suite green while restoring the defect
       in full. The polarity and the threshold now live in ledgerRendersOnLanding, whose truth table
       is asserted below; what is left here is the wiring, so both halves have to be right.

       The `selected ?` branch is pinned with it: the ledger is also the switcher, and a mutant that
       dropped that branch would take the only in-context way to move between applications with it. */
    const gate = ledger.source.slice(Math.max(0, ledger.start - 400), ledger.start);
    assert.match(
      gate,
      /selected \? reviewablePackets\.length > 1 : ledgerRendersOnLanding\(applicationFilter, reviewablePackets\.length\)/,
      "the ledger's gate must be the tested predicate, over the real filter and the real count",
    );
  });

  test("the gate opens on exactly the arrivals that need it", () => {
    /* The truth table the wiring above delegates to. Every one of these was a surviving mutant.

       Inverted polarity is the nastier of the two, because it is not a return to the old bug: it
       makes ?state=action render NO list while a plain visit renders a spurious one, so the deep
       link is dead AND the default view grows a duplicate of the board under a heading that says
       "Your applications". */
    for (const filter of ["action", "ready", "submitted"]) {
      assert.equal(ledgerRendersOnLanding(filter, 1), true, `${filter} with one application must render the list`);
      assert.equal(ledgerRendersOnLanding(filter, 9), true, `${filter} with a real history must render the list`);
      assert.equal(ledgerRendersOnLanding(filter, 0), false, `${filter} on an empty history leaves the empty state to speak`);
    }
    // The unfiltered board view: the list would only restate the board below it.
    assert.equal(ledgerRendersOnLanding("all", 9), false);
    assert.equal(ledgerRendersOnLanding("all", 1), false);
    assert.equal(ledgerRendersOnLanding("all", 0), false);
    /* A threshold above one is the purest reproduction of ISSUE-037: every deep link inert for
       every real account, with nothing on screen to say why. */
    assert.equal(ledgerRendersOnLanding("action", 1), true, "one matching application is a list worth rendering");
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

    /* BOTH branches, or the ternary is decoration. `selected ? "sr-only" : "sr-only"` satisfied a
       test that only looked for the word `selected` and put the heading straight back into the
       screen reader-only layer it was moved out of, which is the whole of the visible half of this
       fix. The true branch stays sr-only on purpose: beside an open packet this heading would
       compete with the packet's own. */
    const branches = className.match(/selected \? "([^"]*)" : "([^"]*)"/);
    assert.ok(branches, `expected the heading className to be a two-branch ternary on selected, got: ${className}`);
    const [, whenSelected, whenLanding] = branches;
    assert.equal(whenSelected, "sr-only", "beside an open packet the heading stays the switcher's label");
    assert.doesNotMatch(whenLanding, /\bsr-only\b/, "on the landing view the heading has to be readable, not announced only");
    assert.doesNotMatch(whenLanding, /\bhidden\b/, "nor display:none at any width");
    assert.match(whenLanding, /text-/, "and carries real type, so it reads as the heading of the list below it");
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

  test("no two views can be given the same heading", () => {
    /* Pairwise, not the two comparisons this used to make. `ready` returning the `submitted`
       wording survived those, and it is the worst failure available here: a heading reading
       "Applications you have sent" printed above a list of applications that have NOT been sent,
       on the screen a student uses to decide what still needs doing. */
    const headings = ["all", "action", "ready", "submitted"].map(applicationFilterHeading);
    assert.equal(new Set(headings).size, headings.length, `two views share a heading: ${headings.join(" | ")}`);
  });

  test("each heading says what is actually in its list", () => {
    /* Distinctness alone does not make a heading true. These pin the one word in each that carries
       the meaning, and leave the rest of the wording free to be improved. */
    assert.match(
      applicationFilterHeading("ready"),
      /\bready\b|\bsend\b/i,
      "the ready view holds applications that are built and NOT yet sent",
    );
    assert.match(
      applicationFilterHeading("submitted"),
      /\bsent\b/i,
      "the submitted view holds applications that have already gone out",
    );
    assert.doesNotMatch(
      applicationFilterHeading("ready"),
      /\bsent\b/i,
      "calling unsent applications sent is a false statement above a real list",
    );
    assert.match(
      applicationFilterHeading("action"),
      /\byou\b/i,
      "the action view is the one waiting on the student, and has to say so",
    );
  });
});
