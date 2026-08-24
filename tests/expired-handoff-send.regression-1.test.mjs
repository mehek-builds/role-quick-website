import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* R: THE 409 NOBODY SAW, ON A BUTTON THAT SHOULD NOT HAVE BEEN OFFERED.
 *
 * Cresta packet 8142004c-3358-4538-8778-16df5e31c5bb, production, 2026-08-09.
 *
 *     03:06:19  POST /applications/8142004c.../submission/approve   409
 *
 * A complete Greenhouse application, no screener questions, status ready_for_final_approval, and a
 * fully enabled green "Send it". Pressing it produced no error, no toast and no visible change. The
 * button stayed enabled and stayed clickable. The refusal existed only in the server log.
 *
 * Stored review: handoff_expires_at 2026-08-08T23:05:10.431Z, updated_at 22:10:10.431Z,
 * browser_session_id NULL. Ten of the eleven packets then sitting at ready_for_final_approval were
 * in the same condition, and none of the eleven had a session id.
 *
 * THREE DEFECTS, and they are three, not one:
 *
 *   1. OFFERED. `finalApprovalBlocked` computed six terms. An expired handoff was a seventh and was
 *      not among them, so the dashboard offered an action the server had a standing rule against.
 *   2. SWALLOWED. The catch DID set the server's sentence. `refreshSubmission` then ran on the
 *      2.5s poll and ended with an unconditional `setError(null)`, so the message survived under
 *      two and a half seconds. The poll could not tell a self-healing 502 from a refusal to
 *      something the student had just pressed, because both landed in the same `error`.
 *   3. NO EXIT. The sentence says "Start the application again" and no control did that.
 *      POST /submit-request has taken `restart: true` since PR #375; nothing on this screen sent it.
 *
 * This is the same family as the cover-letter defect (a real control disabled by a client state the
 * server disagreed with) and as the <span> pills before it (a control-shaped thing with nothing
 * bound to it). Here the button was neither: it was live, correct-looking, and pointed at a route
 * that had already decided to say no.
 *
 * Every assertion below fails against the pre-fix dashboard.
 */

function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const dashboardUrl = new URL("../app/dashboard/applications/page.tsx", import.meta.url);
const domainUrl = new URL("../features/applications/domain/submission-state.ts", import.meta.url);

test("the seventh blocking term exists, and greys the button the server would refuse", async () => {
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  assert.match(dashboard, /const handoffExpired = handoffWindowExpired\(review, nowMs\)/);
  assert.match(dashboard, /const finalApprovalBlocked = [^;]*\|\| handoffExpired \|\|/);
  // Still one gate on one button. A second send path would route around the term entirely.
  assert.match(dashboard, /disabled=\{finalApprovalBlocked\}/);
});

test("the term is derived from the review, not from a load that can hang", async () => {
  const domain = await readFile(domainUrl, "utf8");
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  /* The ranking that came out of the cover-letter fix put `previewReady` next in line to strand:
     an <img> load with no timeout and no retry, captioned "Loading preview." even after a 404. A
     seventh term must not repeat that. This one reads two fields that are already in every
     submission response and has no pending state to get stuck in. */
  assert.match(domain, /export function handoffWindowExpired\(/);
  assert.match(domain, /if \(!review\.browser_session_id\) return false;/);
  assert.match(domain, /if \(!review\.handoff_expires_at\) return false;/);
  assert.match(domain, /Number\.isFinite\(expiresAt\) && expiresAt < now/);

  // And it needs its own clock, because a deadline passing fires no event. setInterval stays banned.
  assert.match(dashboard, /const \[nowMs, setNowMs\] = useState\(\(\) => Date\.now\(\)\)/);
  assert.match(dashboard, /window\.setTimeout\(tick, HANDOFF_CLOCK_TICK_MS\)/);
  assert.doesNotMatch(dashboard, /setInterval\(/);
});

test("a refusal to a press cannot be erased by the poll that follows it", async () => {
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  /* The exact line that swallowed the 409. `refreshSubmission` ends by clearing a banner; it may
     only clear the POLL's banner. If this ever reads setError(null) again, the server's answer to
     a Send is once more gone within 2.5 seconds. */
  const refresh = dashboard.slice(
    dashboard.indexOf("const refreshSubmission = useCallback"),
    dashboard.indexOf("const [coverLetterReloading"),
  );
  assert.ok(refresh.length > 0, "refreshSubmission must still be findable");
  assert.doesNotMatch(refresh, /setError\(null\)/);
  assert.match(refresh, /setPollError\(null\)/);

  // Two channels, and the one the student caused wins the render.
  assert.match(dashboard, /const \[pollError, setPollError\] = useState<string \| null>\(null\)/);
  assert.match(dashboard, /const visiblePageError = historicalPacketAuditStaleMessage\(error\) \? null : error;/);
  assert.match(dashboard, /const visiblePollError = historicalPacketAuditStaleMessage\(pollError\) \? null : pollError;/);
  assert.match(dashboard, /\(visiblePageError \?\? visiblePollError\) && <ErrorNote message=\{visiblePageError \?\? visiblePollError!\} \/>/);
});

test("the server's own sentence reaches the screen, next to the button that caused it", async () => {
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  // apiErrorMessage already lifts `error` and `issues` off the body; the approve catch has to keep
  // them rather than replacing them with a generic line.
  assert.match(dashboard, /refuseSend\(\s*requestedId,\s*reason instanceof Error \? reason\.message : "Could not approve the final portal submission\.",\s*reason instanceof ApiError \? reason\.issues : \[\],\s*\)/);
  // ApiError carries the 422's `issues` array off FINAL_APPROVAL_VERIFICATION_FAILED. Dropping it
  // would reduce a list of named, fixable blockers to one folded-up sentence.
  assert.match(await readFile(new URL("../lib/api.ts", import.meta.url), "utf8"), /throw new ApiError\(res\.status, message, issues, data\)/);
  assert.match(dashboard, /const \[sendRefusal, setSendRefusal\] = useState/);
  // Keyed to the packet, so a refusal about one application never sits under another's Send button.
  assert.match(dashboard, /sendRefusal=\{sendRefusal\?\.applicationId === selected\.id \? sendRefusal : null\}/);
  // Rendered inside the action card, and the 422's issue list rendered AS a list.
  assert.match(dashboard, /\{sendRefusal && \([\s\S]{0,400}role="alert"[\s\S]{0,400}\{sendRefusal\.message\}/);
  assert.match(dashboard, /sendRefusal\.issues\.map\(\(issue\) => <li key=\{issue\}>\{issue\}<\/li>\)/);
});

test("the way out the sentence promises is a real control bound to the restart flag", async () => {
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  assert.match(dashboard, /async function restartPreparedRun\(\)/);
  /* PR #375's flag, by name, through the ONE existing send path rather than a new one. There are
     two callers of submit-request on this screen and ask-at-apply.test.mjs counts them; a restart
     that opened a third would be a second route around every gate in prepareApplication. */
  assert.match(dashboard, /options: \{[\s\S]{0,240}allowServerAnswerRefresh\?: boolean;[\s\S]{0,120}restart\?: boolean;[\s\S]{0,240}\} = \{\}/);
  assert.match(dashboard, /body: JSON\.stringify\(\{ questions: finalQuestions, \.\.\.\(options\.restart \? \{ restart: true \} : \{\}\) \}\)/);
  assert.match(dashboard, /await prepareApplication\(submission\.review\.questions, \{ allowServerAnswerRefresh: true, restart: true \}\)/);
  // A blank required answer must not block the run that is the only thing which can answer it.
  assert.match(dashboard, /allowServerAnswerRefresh: true, restart: true/);

  /* A REAL CONTROL. Seventy-nine prepared resumes and zero sent applications came from pills
     rendered as <span>: something that looks pressable with nothing bound to it fails silently and
     is indistinguishable from a working control. `Button` renders <button type="button"> and takes
     onClick and disabled directly. Asserted as the shared component AND as a bound handler, so
     neither a hand-rolled <span> nor a Button with no onClick can pass. */
  const restartControl = dashboard.match(/<Button onClick=\{onRestart\} disabled=\{restarting\}[^>]*>[^<]*<\/Button>/);
  assert.ok(restartControl, "the restart must render as the shared Button with a bound handler");
  assert.match(dashboard, /handoffExpired && \(\s*<Button onClick=\{onRestart\}/);
  assert.match(dashboard, /onRestart=\{\(\) => void restartPreparedRun\(\)\}/);
  assert.match(dashboard, /restarting=\{restartingId === selected\.id\}/);

  // The Button component itself. If this ever stops being an element with a handler, so does this.
  const button = await readFile(new URL("../components/app/Button.tsx", import.meta.url), "utf8");
  assert.match(button, /export function Button\(\{[\s\S]{0,400}<button type=\{type\}/);
});

test("the greyed-out Send names this reason the way it names the other six", async () => {
  const dashboard = shippedCode(await readFile(dashboardUrl, "utf8"));

  const lines = [
    /Save the resume first\./,
    /Checking profile\./,
    /Loading preview\./,
    /Loading cover letter\./,
    /No cover letter to show you\./,
    /Required answer missing\./,
    /A sensitive demographic, identity, or legal question is present/,
    // The seventh. Says what the 409 says, before the press rather than after it.
    /Too much time has passed for Litos to finish this filled form/,
    /* The eighth, added when employers' forms started asking for a file. Same rule as the seventh:
       a term in finalApprovalBlocked with no sentence here is a greyed Send that names every reason
       except the one actually blocking it, which is what the cover letter did for a fortnight. */
    /asks for a \{ask\.kind\} and Litos has none attached/,
  ];
  for (const line of lines) assert.match(dashboard, line);
  assert.match(dashboard, /handoffExpired && \(\s*<p className="mt-3 text-xs leading-5 text-warn">/);
  /* And the way out of it, in the control row, because a reason with nothing on screen that
     resolves it is a wall. Every other term here has one.

     One control per outstanding ask, and one sentence per outstanding ask, because two kinds are
     two pieces of work: a screen carrying two Add buttons and one sentence explains only one of
     them, and a screen carrying one button for two asks cannot open the second at all. */
  assert.match(dashboard, /outstandingDocumentAsks\.map\(\(ask\) => \(\s*<Button key=\{ask\.kind\} onClick=\{\(\) => onAddDocument\(ask\.kind\)\}/);
  assert.match(dashboard, /transcriptPending && outstandingDocumentAsks\.map\(\(ask\) => \(/);
});
