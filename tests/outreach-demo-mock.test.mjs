import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* The lower card of OutreachDemo is a PICTURE of the draft Litos leaves in your
 * Gmail. It is not the product, and nothing in it is meant to be pressable.
 *
 * "Open LinkedIn profile ↗" in that card was filed on 2026-08-03 as a dead
 * control: pill styling, no href, no onClick. Reviewed and kept as is. The
 * reasoning is recorded in full beside the element in components/OutreachDemo.tsx;
 * the short version is that a span is the honest encoding of a pictured button
 * (not focusable, not in the tab order, not announced as a control), and that the
 * only alternative would be an href pointing at a fabricated profile for an
 * invented person, which trades a fake affordance for a real off-site exit.
 *
 * This file pins that decision so the next audit finds an assertion rather than
 * refiling it, and so nobody "fixes" it by adding the href. It also pins the two
 * things the decision actually rests on: the mock framing, and the fact that the
 * card carries no live controls at all.
 */

/* Comments stripped, and this file is the reason why. The comment recording the
   decision, added beside the pill in the same change that added these tests,
   necessarily quotes the framing it depends on: "Draft · not sent" and
   "New message · Gmail" both appear TWICE in the component now, once as
   rendered copy and once as prose. Read raw, two of the three framing
   assertions below were satisfied by that comment alone, and deleting the real
   badge element left all five tests green. A test that its own explanation
   keeps alive is not a test. Same helper and same argument as shippedCopy() in
   tests/review-highlighting.test.mjs. */
function shippedCopy(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

const source = shippedCopy(
  readFileSync(new URL("../components/OutreachDemo.tsx", import.meta.url), "utf8"),
);

/* The draft card: from the second window-chrome frame to the end of the
   component. Sliced from the `key={selected.id}` panel opener, which is unique
   to this card, rather than from a byte offset that would drift on any edit. */
function draftCard() {
  const start = source.indexOf('<div key={selected.id}');
  assert.ok(start > 0, "could not find the draft card; the slice below is meaningless without it");
  return source.slice(start);
}

test("the LinkedIn pill in the draft mockup is inert on purpose", () => {
  const card = draftCard();
  assert.match(card, /<span[^>]*>\s*Open LinkedIn profile/, "it must stay a span, not become an anchor or a button");
  assert.doesNotMatch(
    card,
    /<a[^>]*>\s*Open LinkedIn profile/,
    "an href here would send a homepage visitor off-site to a profile for a person who does not exist",
  );
});

test("nothing in the draft mockup is interactive", () => {
  /* This is the argument for the pill, so it has to hold for the whole card. If
     a real control ever lands in here the card stops reading as a picture, and
     the inert pill beside a live sibling genuinely does become a dead control. */
  const card = draftCard();
  assert.doesNotMatch(card, /onClick=/, "the draft card is a mockup; a live control changes what the inert pill means");
  assert.doesNotMatch(card, /<button/, "same: no buttons in the picture of the draft");
  assert.doesNotMatch(card, /href=/, "and no links");
});

test("the draft card still reads as a mockup", () => {
  /* What makes the pill legible as pictured rather than broken: window chrome
     above the card, a "not sent" badge, and the drafts-not-outbox footer. Lose
     these and the inert pill is no longer defensible. */
  assert.match(source, /Draft · not sent/, "the badge that says this is not a live message");
  assert.match(source, /Waiting in your drafts/, "the footer that says where it is sitting");
  assert.match(source, /New message · Gmail/, "the card is captioned as somebody else's UI");
});

test("the live controls sit in the contact list, which is a separate panel", () => {
  /* The four contact buttons are the only real controls in the component, and
     they are above the draft card, in their own framed panel. Selecting Rina is
     what reveals the no-email state; it does not make that state a control
     surface. */
  const list = source.slice(0, source.indexOf('<div key={selected.id}'));
  assert.match(list, /<button/, "the contact list is the interactive half and must stay so");
  assert.match(list, /onClick=\{\(\) => setSelectedId\(c\.id\)\}/);
  assert.match(list, /aria-pressed=\{active\}/, "and it must keep announcing which contact is chosen");
});

test("the unverified-contact path is still shown, because the homepage copy leans on it", () => {
  /* app/page.tsx deleted "and tell you when we could not" from the outreach
     pillar on the grounds that this demo shows it. That comment says in as many
     words: if OutreachDemo stops showing the unverified path, the paragraph has
     to take the honesty half back. This is that tripwire. */
  assert.match(source, /No verified email/);
  assert.match(source, /we never guess\s*\n?\s*one/, "the promise the no-email state exists to make");
  assert.match(source, /Guessed addresses: zero/);
  assert.match(source, /tier: "LinkedIn"/, "a contact with no email must remain in the fixture");
  assert.match(source, /email: null/);
});
