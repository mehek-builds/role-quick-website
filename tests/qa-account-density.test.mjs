import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsPage = new URL("../app/dashboard/settings/page.tsx", import.meta.url);

function automationPanel(source) {
  const start = source.indexOf('{activeTab === "automation"');
  assert.notEqual(start, -1, "Automation panel must remain available");
  const end = source.indexOf("{/* Application profile.", start);
  assert.notEqual(end, -1, "Automation panel boundary must remain detectable");
  return source.slice(start, end);
}

test("Account automation uses three scannable surfaces without dropping permissions", async () => {
  const source = await readFile(settingsPage, "utf8");
  const panel = automationPanel(source);

  assert.match(panel, /<section className="space-y-4" id="panel-automation" role="tabpanel"/);
  assert.match(panel, /className="grid items-start gap-4 xl:grid-cols-2"/);
  assert.equal(
    [...panel.matchAll(/<Card className=/g)].length,
    3,
    "Automation should render two primary cards and one full-width notification card",
  );

  const sendingStart = panel.indexOf("Sending permissions");
  const inboxStart = panel.indexOf("Application email and verification inbox");
  const notificationsStart = panel.indexOf("Email notifications");
  assert.ok(sendingStart < inboxStart && inboxStart < notificationsStart, "Surfaces should follow the task sequence");

  const sending = panel.slice(sendingStart, inboxStart);
  assert.match(sending, /Send an application without asking me again/);
  assert.match(sending, /<ConsentAcknowledgementControl/);
  assert.match(sending, /<CaptchaConsentControl/);
  assert.match(sending, /Litos stops when an answer is missing or the site needs you/);

  const inbox = panel.slice(inboxStart, notificationsStart);
  assert.match(inbox, /Use a Litos application email/);
  assert.match(inbox, /id="automatic-email-verification"/);
  assert.match(inbox, /Use my connected inbox as a fallback/);
  assert.match(inbox, /\["gmail", "outlook"\]/);

  const notifications = panel.slice(notificationsStart);
  assert.match(panel, /<Card className="p-5 sm:p-6 xl:col-span-2">\s*<h3 className="text-base font-medium text-ink">Email notifications/);
  assert.match(notifications, /className="mt-5 grid gap-4 md:grid-cols-2"/);
  assert.match(notifications, /Tell me when a strong match opens/);
  assert.match(notifications, /Tell me when an employer replies/);
  assert.match(notifications, /Every message carries an unsubscribe link/);
});

test("Account tabs expose a truthful mobile overflow cue", async () => {
  const source = await readFile(settingsPage, "utf8");

  assert.match(source, /const \[accountTabsViewport, setAccountTabsViewport\] = useState<HTMLDivElement \| null>\(null\)/);
  assert.match(source, /ref=\{setAccountTabsViewport\}/);
  assert.match(source, /viewport\.scrollWidth - viewport\.clientWidth - viewport\.scrollLeft/);
  assert.match(source, /viewport\.addEventListener\("scroll", updateOverflowCue, \{ passive: true \}\)/);
  assert.match(source, /new ResizeObserver\(updateOverflowCue\)/);
  assert.match(source, /\{showAccountTabOverflowCue && \(/);
  assert.match(source, /aria-hidden="true"[\s\S]*?sm:hidden/);
});
