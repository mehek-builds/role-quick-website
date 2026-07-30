import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* FAQ answers are plain strings, because StructuredData feeds the same value to
 * FAQPage as acceptedAnswer.text. Links are declared separately, as a `links`
 * array of { text, href }, and spliced into the rendered copy by LinkedAnswer.
 *
 * The failure this guards: reword an answer, leave `links` alone, and the
 * phrase no longer matches. LinkedAnswer skips a phrase it cannot find rather
 * than throwing, so the link just quietly disappears and the answer goes back
 * to naming a destination it does not offer. That is the exact bug the `links`
 * mechanism was added to fix on 2026-07-30, when the support answer said "Use
 * the contact form" with nothing to click.
 *
 * Source is parsed as text rather than imported because app/page.tsx is a
 * server component pulling in the whole cinematic layer. The shapes here are
 * simple and the file is ours, so a regex is the cheaper honest tool. */
const SOURCE = readFileSync("app/page.tsx", "utf8");

/* Each FAQ_ITEMS entry, from `q:` to the closing brace of its object. */
function faqEntries(source) {
  const start = source.indexOf("const FAQ_ITEMS");
  assert.notEqual(start, -1, "FAQ_ITEMS not found in app/page.tsx");
  const end = source.indexOf("\n];", start);
  assert.notEqual(end, -1, "could not find the end of FAQ_ITEMS");
  const block = source.slice(start, end);

  return [...block.matchAll(/\{\s*\n\s*q: "((?:[^"\\]|\\.)*)"/g)].map((m) => {
    const from = m.index;
    const next = block.indexOf('\n  {', from + 1);
    return { q: m[1], body: block.slice(from, next === -1 ? block.length : next) };
  });
}

const ENTRIES = faqEntries(SOURCE);

describe("FAQ answer links", () => {
  test("the FAQ was found and parsed", () => {
    assert.ok(
      ENTRIES.length >= 5,
      `expected at least 5 FAQ entries, parsed ${ENTRIES.length}. If the shape of FAQ_ITEMS changed, fix this parser rather than deleting the test.`
    );
  });

  test("every declared link phrase appears in its own answer", () => {
    const broken = [];

    for (const { q, body } of ENTRIES) {
      const answer = body.match(/a: "((?:[^"\\]|\\.)*)"/);
      if (!answer) continue;
      const text = answer[1];

      for (const [, phrase, href] of body.matchAll(
        /\{ text: "((?:[^"\\]|\\.)*)", href: "([^"]*)" \}/g
      )) {
        if (!text.includes(phrase)) {
          broken.push(`  ${q}\n    phrase not in the answer: "${phrase}" (-> ${href})`);
        }
      }
    }

    assert.equal(
      broken.length,
      0,
      `\n\nThese FAQ links point at a phrase their answer no longer contains, so they would render as plain text and the answer would name a destination without offering it.\n\n${broken.join(
        "\n"
      )}\n\nFix the phrase in \`links\` to match the reworded answer.\n`
    );
  });

  test("the support answer offers the contact form", () => {
    const support = ENTRIES.find((e) => e.q.startsWith("Something is not working"));
    assert.ok(support, "the support FAQ entry is gone; it closes audit finding S25");
    assert.match(
      support.body,
      /href: "\/contact"/,
      'the support answer must link to /contact. It tells a stuck person to "use the contact form", and naming the destination without linking it is the bug fixed on 2026-07-30.'
    );
  });
});
