import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

/* /dashboard was the last screen in the product still serving the marketing title on a hard load.
 *
 * Every other dashboard route fixed this by declaring a title in a small server layout beside its
 * own page. /dashboard could not: its page is the dashboard layout's direct child, so there is no
 * segment in between to hold a layout, and the layout itself was a client component and could not
 * export metadata. It titled the screen from a document.title effect instead, and that effect lost
 * a race on every hard load, because Next streams the resolved metadata as a deferred RSC chunk
 * that commits after the first hydration commit.
 *
 * The cure was to split the chrome into ./dashboard-shell.tsx and let the layout be a server
 * component again. These assertions are source-text, in the style of
 * tests/jobs-row-overflow.regression-1.test.mjs: they run with no build, no port and no DOM, and
 * they pin the parts that were individually invisible.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ROOT_LAYOUT = "app/layout.tsx";
const DASH_LAYOUT = "app/dashboard/layout.tsx";
const DASH_SHELL = "app/dashboard/dashboard-shell.tsx";

/* Comments describe the fix at length and quote the strings under test while doing it, so every
   assertion reads shipped code only. Without this the prose alone satisfies most of them. */
const code = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const templateOf = (path) => {
  const match = /template: `([^`]*)`/.exec(code(read(path)));
  assert.ok(match, `${path} declares no title template`);
  return match[1];
};

test("the dashboard layout is a server component", () => {
  /* The whole defect was this file being a client component: that is what made metadata
     impossible and left an effect racing the stream. A "use client" back at the top of this file
     silently returns the bug, and nothing else in the suite would notice. */
  assert.doesNotMatch(code(read(DASH_LAYOUT)), /"use client"/);
});

test("the chrome still exists, and still carries the rail", () => {
  // The split is only safe if the shell really took the chrome with it.
  assert.ok(existsSync(new URL(`../${DASH_SHELL}`, import.meta.url)), `${DASH_SHELL} is missing`);
  const shell = code(read(DASH_SHELL));
  assert.match(shell, /"use client"/);
  assert.match(shell, /const NAV = \[/);
  assert.match(shell, /export function DashboardShell/);
});

test("the dashboard layout declares Home as its own title", () => {
  assert.match(code(read(DASH_LAYOUT)), /default: "Home"/);
});

test("the dashboard template is the root template, character for character", () => {
  /* This is the assertion that earns its keep. A plain string title on this layout renders
     /dashboard correctly AND strips the product name off every child route, because a plain title
     hands no template down and Next does not keep looking further up. So the layout has to restate
     the root's template, and a restated string is one edit away from drifting: change the root's
     shape and every dashboard tab keeps the old one, silently and only on the logged-in screens.
     Compared as values rather than asserted as a literal, so the pair is what is pinned. */
  assert.equal(templateOf(DASH_LAYOUT), templateOf(ROOT_LAYOUT));
});

test("the tab renders Home then the product name, once", () => {
  /* The composition, not either file alone. Asserting the title and the template side by side
     accepts a pair that reads fine line by line and still renders wrong. */
  const productName = /export const PRODUCT_NAME = "([^"]*)"/.exec(read("lib/product.ts"));
  assert.ok(productName, "PRODUCT_NAME is no longer declared in lib/product.ts");

  const rendered = templateOf(ROOT_LAYOUT)
    .replace("${PRODUCT_NAME}", productName[1])
    .replace("%s", "Home");
  assert.equal(rendered, `Home: ${productName[1]}`);
});

test("no dashboard file assigns document.title", () => {
  /* The effect is gone and must not come back. It is not a harmless second opinion: on a
     client-side nav it runs after the declared title has landed, so whatever it writes wins, and
     that is exactly how it wiped "Resume" off /dashboard/resume every time a student reached the
     page from inside the app. */
  const walk = (dir) =>
    readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(`${dir}/${entry.name}`)
        : entry.name.endsWith(".tsx")
          ? [`${dir}/${entry.name}`]
          : [],
    );

  for (const file of walk("app/dashboard")) {
    assert.doesNotMatch(code(read(file)), /document\.title/, `${file} assigns document.title`);
  }
});

test("every dashboard route owns a title, so none can inherit Home by accident", () => {
  /* The one trap the fix introduces. A title on this layout is what a child INHERITS when it
     declares none, so a new route added without its own layout does not fall back to something
     obviously wrong: it quietly reads "Home" while showing another screen. Cheaper to fail here
     than to notice it in a tab. */
  const segments = readdirSync(new URL("../app/dashboard/", import.meta.url), {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory());

  for (const segment of segments) {
    const layout = `app/dashboard/${segment.name}/layout.tsx`;
    assert.ok(
      existsSync(new URL(`../${layout}`, import.meta.url)),
      `${layout} is missing, so /dashboard/${segment.name} inherits the title "Home"`,
    );
    assert.match(
      code(read(layout)),
      /title:/,
      `${layout} declares no title, so /dashboard/${segment.name} inherits "Home"`,
    );
  }
});
