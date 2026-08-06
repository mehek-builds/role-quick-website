import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ISSUE-012. The Application details panel renders roughly twenty controls
   through three helpers, and each helper used to put its visible <label> next to
   the control as a plain sibling: no htmlFor, no wrapping element, so nothing
   computed an accessible name and a screen reader announced every field as an
   unnamed box (WCAG 4.1.2 and 3.3.2). Sighted users saw a correct-looking form,
   which is exactly why it survived so long, so the guard has to live in a test
   rather than in review. */

const settingsPage = new URL("../app/dashboard/settings/page.tsx", import.meta.url);

/* Slice out one helper's body so a fix in a neighbouring helper cannot make this
   pass for a helper that is still broken. */
function helperBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} helper is gone; ISSUE-012 guard needs updating`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("every Application details field helper names its control programmatically", async () => {
  const source = await readFile(settingsPage, "utf8");

  for (const name of ["Input", "LanguagesInput", "Select"]) {
    const body = helperBody(source, name);
    assert.match(body, /const fieldId = useId\(\);/, `${name} must derive a stable id`);
    assert.match(body, /<label htmlFor=\{fieldId\}/, `${name} label must point at its control`);
    assert.match(body, /\n\s+id=\{fieldId\}/, `${name} control must carry the id the label points at`);
    /* aria-label would satisfy a checker while letting the spoken name drift away
       from the visible text on the next copy edit. The visible label is the name. */
    assert.doesNotMatch(body, /aria-label=/, `${name} should associate its visible label, not duplicate it`);
  }
});

test("no field label on the settings page is left as a bare sibling", async () => {
  const source = await readFile(settingsPage, "utf8");

  /* Labels that wrap their control are fine; the ones this catches are the
     self-closing-text form used by the field helpers, which must carry htmlFor. */
  for (const match of source.matchAll(/<label[^>]*>\{label\}<\/label>/g)) {
    assert.match(match[0], /htmlFor=/, `label rendering {label} without htmlFor: ${match[0]}`);
  }
});

test("settings preserves optional race and gender preferences on save", async () => {
  const source = await readFile(settingsPage, "utf8");

  assert.doesNotMatch(source, /delete body\.eeo_prefs/, "saving settings must not erase race and gender preferences");
  assert.match(source, /Optional questions about race and gender/);
  assert.match(source, /patchRaceAndGender\("gender"/);
  assert.match(source, /eeo_prefs: Object\.keys\(nextPrefs\)\.length > 0 \? nextPrefs : null/);
});
