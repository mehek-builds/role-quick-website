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
  assert.match(layout, /id="dashboard-more-button"/);
  assert.match(layout, /aria-controls=\{moreOpen \? "dashboard-more-dialog" : undefined\}/);
  assert.match(layout, /matchMedia\("\(min-width: 64rem\)"\)/);
  assert.match(layout, /moreDialogRef\.current\.contains\(document\.activeElement\)/);
  assert.match(layout, /const shouldRestoreFocus = moreCloseTimer\.current !== null\s*\|\| moreDialogRef\.current\.contains\(document\.activeElement\)/);
  assert.match(layout, /\.dashboard-shell aside \[aria-current="page"\], \.dashboard-shell aside nav a\[href\^="\/dashboard"\]/);
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
  assert.match(settings, /aria-controls="account-panel"/);
  assert.match(settings, /"ArrowLeft", "ArrowRight", "Home", "End"/);
  assert.match(settings, /querySelector<HTMLElement>\(`#tab-\$\{activeTab\}`\)/);
  assert.match(settings, /selected\.scrollIntoView\(\{[\s\S]{0,180}?inline: "nearest"/);
  assert.match(settings, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/);
  assert.match(settings, /const safeRight = viewportRect\.right - \(showAccountTabOverflowCue \? 48 : 0\)/);
  assert.match(settings, /\[scroll-padding-inline-end:3rem\]/);
  assert.match(settings, /setAccountTabsViewportWidth\(viewport\.clientWidth\)/);
  assert.match(settings, /\[accountTabsViewport, accountTabsViewportWidth, activeTab, showAccountTabOverflowCue\]/);
  assert.match(oldProfileRoute, /redirect\("\/dashboard\/settings#job-search"\)/);
});

test("Account history waits for an open native dialog to finish exiting before changing tabs", async () => {
  const [settings, documents, overlayExit] = await Promise.all([
    readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/app/DocumentsCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/app/useDashboardOverlayExit.ts", import.meta.url), "utf8"),
  ]);

  assert.match(
    settings,
    /if \(closingDialog !== null\) \{\s*pendingHistoryTabRef\.current = nextTab;\s*return;\s*\}\s*const openDialog = document\.querySelector<HTMLDialogElement>/,
    "a duplicate history event must stay owned by the close listener even after reduced motion closes the dialog",
  );
  assert.match(settings, /querySelector<HTMLDialogElement>\("#account-panel dialog\[open\]"\)/);
  assert.match(settings, /pendingHistoryTabRef\.current = nextTab;/);
  assert.match(
    settings,
    /onDialogClose = \(\) => \{[\s\S]{0,500}commitHistoryTab\(pendingTab, true\);[\s\S]{0,180}openDialog\.addEventListener\("close", onDialogClose, \{ once: true \}\);\s*openDialog\.dispatchEvent\(new Event\("cancel", \{ cancelable: true \}\)\);/,
    "the close listener must exist before cancel starts a synchronous reduced-motion close",
  );
  assert.match(
    settings,
    /if \(pendingHistoryTabFocusRef\.current !== activeTab\) return;[\s\S]{0,300}getElementById\(`tab-\$\{activeTab\}`\)\?\.focus\(\{ preventScroll: true \}\)/,
    "a history-selected tab must receive focus after the outgoing dialog closes",
  );
  assert.match(
    settings,
    /onCancel=\{\(event\) => \{\s*event\.preventDefault\(\);\s*if \(dataBusy !== "delete"\) requestDeleteDialogClose\(\);/,
  );
  assert.match(
    documents,
    /onCancel=\{\(event\) => \{\s*event\.preventDefault\(\);\s*if \(!deleting\) requestDocumentDialogClose\(\);/,
  );
  assert.match(
    overlayExit,
    /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) \{\s*finish\(\);\s*return true;/,
    "reduced motion must emit the same native close event without waiting on a timer",
  );
});

test("Account callback-selected tabs keep the synchronous tab guard current", async () => {
  const settings = await readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8");

  assert.match(
    settings,
    /if \(billingReturn === "success"[\s\S]{0,360}activeTabRef\.current = "plan";\s*pendingHistoryTabFocusRef\.current = null;\s*setActiveTab\("plan"\);/,
    "a billing return must publish Plan to the click guard before React commits it",
  );
  assert.match(
    settings,
    /if \(callbackProvider && callbackStatus\)[\s\S]{0,1700}activeTabRef\.current = "automation";\s*pendingHistoryTabFocusRef\.current = null;\s*setActiveTab\("automation"\);/,
    "an inbox callback must publish Automation to the click guard before React commits it",
  );
  assert.match(
    settings,
    /function selectTab\(tab: AccountTab\) \{\s*if \(tab === activeTabRef\.current\) return;\s*activeTabRef\.current = tab;[\s\S]{0,180}setActiveTab\(tab\);/,
    "clicking Job search after either callback must compare with the callback-selected tab, then commit the click",
  );
});

test("canonical billing access overrides a stale legacy account tier", async () => {
  const settings = await readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8");

  assert.match(settings, /import \{ accessLabel, isPaidAccess \} from "@\/features\/billing"/);
  assert.match(
    settings,
    /const paidPlan = access\s*\? isPaidAccess\(access\)\s*:\s*me\.tier === "pro" \|\| me\.tier === "plus"/,
    "legacy tier is a fallback only while canonical access is unavailable",
  );
  assert.match(settings, /label=\{access \? accessLabel\(access\) : paidPlan \? "Litos\+"/);
  assert.match(settings, /kind=\{paidPlan \? "ready" : "draft"\}/);
  assert.match(settings, /\{paidPlan \? \(\s*<div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">/);
  assert.doesNotMatch(
    settings,
    /access\?\.access_class === "plus_paid" \|\| access\?\.access_class === "legacy_paid" \|\| me\.tier === "pro"/,
  );
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

test("ISSUE-013b: every account tab controls one mounted panel, with its content inside", async () => {
  // Export data and Delete account used to render from a SECOND top-level `activeTab === "sign-in"`
  // block with no id, no role and no aria-labelledby, and the visa filter did the same on the
  // job-search tab. Both sat outside the element the tab's aria-controls names, so a screen reader
  // user moving panel to panel never reached the two most destructive controls in the product.
  const settings = shippedCopy(
    await readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8"),
  );
  const blocks = tabBlocks(settings);
  const panelStart = settings.indexOf('<div id="account-panel" role="tabpanel"');
  const panelEnd = settings.indexOf("</MotionPanel>", panelStart);

  assert.notEqual(panelStart, -1, "the shared account panel must be mounted");
  assert.notEqual(panelEnd, -1, "the shared account panel must close inside MotionPanel");
  assert.match(
    settings.slice(panelStart, panelEnd),
    /aria-labelledby=\{`tab-\$\{activeTab\}`\}/,
    "the shared panel must be named by the active tab",
  );
  assert.equal(
    [...settings.matchAll(/role="tabpanel"/g)].length,
    1,
    "Account must expose one tabpanel instead of nested panels",
  );
  assert.match(settings, /id=\{`tab-\$\{tab\.id\}`\}/);
  assert.match(settings, /aria-controls="account-panel"/);

  for (const tab of ACCOUNT_TAB_IDS) {
    const forTab = blocks.filter((block) => block.tab === tab);
    assert.equal(
      forTab.length,
      1,
      `"${tab}" must render as exactly one content block, not ${forTab.length} sibling blocks`,
    );
    const [{ body }] = forTab;
    const blockStart = settings.indexOf(body, panelStart);
    assert.ok(
      blockStart >= panelStart && blockStart < panelEnd,
      `"${tab}" content must stay inside the shared account panel`,
    );
    assert.doesNotMatch(body.slice(0, body.indexOf(">") + 1), /role="tabpanel"|aria-labelledby=/);
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
  assert.match(settings, /id="panel-sign-in"/);
  assert.match(settings, /id="panel-application-details"/);
  assert.match(settings, /id="panel-automation"/);
  assert.match(settings, /id="panel-plan"/);
});
