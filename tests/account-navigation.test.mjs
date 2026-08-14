import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* Comments are prose, not shipped markup. Every assertion that greps this page reads it with
   comments stripped, so a card that only claims to be inside a tabpanel cannot satisfy them. */
function shippedCopy(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

test("job search and account settings share one tabbed account destination", async () => {
  const [layout, settings, oldProfileRoute] = await Promise.all([
    /* NAV, UTILITY and MOBILE_NAV live in dashboard-shell.tsx: the chrome was split out of the
       layout so the layout could go back to being a server component and declare a tab title. The
       doesNotMatch below would pass against the layout while checking nothing. */
    readFile(new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/profile/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(layout, /href: "\/dashboard\/profile"/);
  assert.match(layout, /const MOBILE_NAV = NAV\.slice\(0, 4\)/);
  assert.match(layout, /aria-controls="dashboard-more-dialog"/);
  assert.match(layout, /role="dialog"/);
  assert.match(layout, /href: "\/dashboard\/network", label: "Network"/);
  assert.match(layout, /href: "\/dashboard\/outreach", label: "Outreach"/);
  assert.match(layout, /href: "\/dashboard\/settings", label: "Account"/);
  assert.match(layout, /event\.key === "Escape"/);
  assert.match(layout, /moreButtonRef\.current\?\.focus\(\)/);
  assert.match(settings, /id: "job-search", label: "Job search"/);
  assert.match(settings, /id: "application-details", label: "Application details"/);
  assert.match(settings, /id: "automation", label: "Automation"/);
  assert.match(settings, /id: "plan", label: "Plan & usage"/);
  assert.match(settings, /id: "sign-in", label: "Sign-in & data"/);
  assert.match(settings, /<TargetingCard \/>/);
  assert.match(settings, /role="tablist"/);
  assert.match(shippedCopy(settings), /role="tabpanel"/);
  assert.match(settings, /"ArrowLeft", "ArrowRight", "Home", "End"/);
  assert.match(oldProfileRoute, /redirect\("\/dashboard\/settings#job-search"\)/);
});

const ACCOUNT_TAB_IDS = ["job-search", "application-details", "automation", "plan", "sign-in"];

/** Every `{activeTab === "x" &&` render block in the settings page, in source order. */
function tabBlocks(settings) {
  const starts = [...settings.matchAll(/\{activeTab === "([a-z-]+)"/g)];
  return starts.map((match, index) => ({
    tab: match[1],
    body: settings.slice(match.index, starts[index + 1]?.index ?? settings.length),
  }));
}

test("ISSUE-013b: each account tab renders one region, and its destructive controls are inside it", async () => {
  // Export data and Delete account used to render from a SECOND top-level `activeTab === "sign-in"`
  // block with no id, no role and no aria-labelledby, and the visa filter did the same on the
  // job-search tab. Both sat outside the element the tab's aria-controls names, so a screen reader
  // user moving panel to panel never reached the two most destructive controls in the product.
  const settings = shippedCopy(
    await readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8"),
  );
  const blocks = tabBlocks(settings);

  for (const tab of ACCOUNT_TAB_IDS) {
    const forTab = blocks.filter((block) => block.tab === tab);
    assert.equal(
      forTab.length,
      1,
      `"${tab}" must render as exactly one region, not ${forTab.length} sibling blocks`,
    );
    const [{ body }] = forTab;
    // The opening element of the block, i.e. the thing the tab points at.
    const opening = body.slice(0, body.indexOf(">") + 1);
    assert.match(opening, /role="tabpanel"/, `"${tab}" must open with role="tabpanel"`);
    assert.match(
      opening,
      new RegExp(`aria-labelledby="tab-${tab}"`),
      `"${tab}" must be named by its own tab button`,
    );
    // aria-labelledby has to point at an id that exists: the tab strip renders id={`tab-${tab.id}`}.
    assert.match(settings, /id=\{`tab-\$\{tab\.id\}`\}/);
  }

  const signIn = blocks.find((block) => block.tab === "sign-in");
  assert.match(signIn.body, />Export data<|"Export data"/);
  assert.match(signIn.body, />Delete account<|"Delete account"/);

  // Deep links that other screens depend on, and that this restructure must not move:
  // /dashboard/jobs links to #visa-sponsorship, which is not a tab id, so tabFromHash falls back to
  // the job-search tab and the browser scrolls to the card. It therefore has to keep its bare id AND
  // render inside the job-search region.
  const jobSearch = blocks.find((block) => block.tab === "job-search");
  assert.match(jobSearch.body, /id="visa-sponsorship"/);
  assert.match(jobSearch.body.slice(0, jobSearch.body.indexOf(">") + 1), /id="job-search"/);
  assert.match(settings, /aria-controls=\{tab\.id === "job-search" \? "job-search" : `panel-\$\{tab\.id\}`\}/);
  assert.match(settings, /id="panel-sign-in"/);
});
