import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ISSUE-016. The header's four marketing links were `hidden sm:flex` with no
 * mobile equivalent, because the hamburger was deleted on 2026-07-28 on the
 * argument that the footer carried the same links. It did not: the footer lived
 * inside app/page.tsx, so it rendered on the homepage and nowhere else, which
 * left a phone on /browse-jobs, /try, /litos-vs-simplify or /for-career-centres
 * with no link to anywhere at all. Most of the site's traffic arrives from
 * TikTok and Instagram, so most of the site's traffic hit that dead end.
 *
 * The footer moved to components/SiteFooter.tsx on 2026-08-04 and now renders
 * on those routes, so that specific sentence is history rather than current
 * state. It is kept in the past tense rather than deleted because it is the
 * reason these assertions exist, and none of them depend on it: they pin the
 * mobile door itself, which is still the only navigation above the fold.
 *
 * Static, in the style of tests/route-integrity.test.mjs: these assertions run
 * in milliseconds on every `npm test` and need no build, no port and no DOM.
 * They cannot prove the sheet feels right on a phone. They can prove the four
 * things that made the regression invisible, which is that a mobile door exists
 * at all, that it opens with a keyboard, that it closes, and that phone and
 * desktop are reading from the same list of destinations. */

const header = await readFile(new URL("../components/Header.tsx", import.meta.url), "utf8");

test("the header ships one nav list, so phone and desktop cannot drift apart", () => {
  /* The regression was two hardcoded copies of the nav, one of which was
     deleted. A single source rendered twice is what stops that recurring. */
  const declared = [...header.matchAll(/\{\s*href:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/g)];
  assert.equal(declared.length, 4, "expected the four marketing destinations declared once");
  assert.deepEqual(
    declared.map((m) => m[1]),
    ["/#product", "/browse-jobs", "/try", "/#faq"],
  );
  assert.equal(
    (header.match(/NAV\.map\(/g) ?? []).length,
    2,
    "expected the nav list rendered twice: the desktop pill and the phone sheet",
  );
});

test("a phone has a control that reaches the marketing nav", () => {
  /* `sm:hidden` on the toggle is the mirror of `hidden sm:flex` on the pill
     nav: exactly one of the two is reachable at any width, and neither width
     has none. */
  assert.match(header, /className="hidden items-center[^"]*sm:flex"/);
  const toggle = header.slice(header.indexOf("<button"), header.indexOf("</button>"));
  assert.match(toggle, /sm:hidden/, "the toggle must be the phone-only half of that pair");
  assert.match(toggle, /aria-expanded=\{menuOpen\}/);
  assert.match(toggle, /aria-controls=\{MENU_ID\}/);
  assert.match(toggle, /aria-label=\{menuOpen \? "Close menu" : "Open menu"\}/);
  /* 44px minimum touch target, per the rule encoded in components/app/Button.tsx. */
  assert.match(toggle, /h-11 w-11/);
});

test("the sheet manages focus, closes on Escape, and closes on a route change", () => {
  assert.match(header, /Escape/, "Escape must close the sheet");
  assert.match(header, /buttonRef\.current\?\.focus\(\)/, "closing returns focus to the toggle");
  assert.match(header, /focusable\(\)\[0\]\?\.focus\(\)/, "opening moves focus into the sheet");
  assert.match(header, /event\.key !== "Tab"/, "Tab must be trapped inside the open sheet");
  /* The trap's stop list must be in DOM order, toggle first. Written the other
     way round it type-checks, lints clean and does nothing: `last` is then a
     node the visitor never tabs to, so the wrap never fires and Tab off the
     final link lands in the page behind the sheet. Caught in a browser at
     375px, not by any assertion, which is why there is one now. */
  assert.match(header, /\[buttonRef\.current, \.\.\.focusable\(\)\]/);
  assert.match(header, /addEventListener\("hashchange", onRouteChange\)/);
  assert.match(header, /addEventListener\("popstate", onRouteChange\)/);
  assert.match(header, /addEventListener\("pointerdown", onPointerDown\)/);
});

test("the sheet carries navigation and login, and never a second copy of the CTA", () => {
  /* Half the case for deleting the original hamburger was that it duplicated
     the header's install ask. The pill keeps "Get started" visible at every
     width, so the sheet must stay four quiet destinations. */
  const sheet = header.slice(header.indexOf("{menuOpen && ("));
  assert.ok(sheet.length > 0, "expected a conditionally rendered sheet");
  assert.doesNotMatch(sheet, /SignInLink|InstallLink|bg-brand/);
  assert.match(sheet, />Log in<\/a>/);
});

test("the CTA pill is unchanged: one Get started, identical signed in or out", () => {
  /* Refuted audit finding, documented in components/Header.tsx. Pinned so a
     later pass at the header does not quietly "fix" it. */
  assert.equal((header.match(/<SignInLink/g) ?? []).length, 1);
  assert.match(header, /Get started/);
  assert.doesNotMatch(header, /signedIn|isSignedIn/);
});
