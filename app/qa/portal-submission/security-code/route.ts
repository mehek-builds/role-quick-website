import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { qaRequestAllowed } from "../../gate";
import { normalizeCaseId, securityCodeFor } from "../shapes";

/* THE HARNESS'S STAND-IN FOR THE MAILBOX.
 *
 * Greenhouse's real gate mails an 8-character code and refuses the application until it comes back
 * with a second submit. Three production runs on 2026-08-08 (16:22, 16:34, 16:46) hit that gate,
 * matched three emails in the applicant's inbox to the minute, and all three were recorded
 * ready_for_final_approval with submitted_at null.
 *
 * An automated trial cannot read a mailbox, so the harness serves the same code here. THE CONTRACT:
 *
 *   GET /qa/portal-submission/security-code?case=<caseId>
 *   200 application/json
 *   { "case": "<caseId>", "code": "<8 chars A-Z0-9>", "shape": "security-code" }
 *
 * The code is a pure function of the case id (shapes.ts, securityCodeFor) and is NEVER printed on
 * the form page. Deriving it rather than fixing one constant is the whole point: a runner that
 * hardcodes a value passes one case and fails the next, so the only way through is to read the code
 * at run time, which is the behaviour the product side has to have against a real inbox.
 *
 * THE SECRET IN THE CODE IS NOT WHAT IS BEING PROTECTED. The value is derived from a string that
 * is already in the URL, it grants nothing, and the page it unlocks cannot contact an employer.
 * This route is nonetheless behind the same gate as the rest of /qa/, because what is being kept
 * off the public internet is the FIXTURE SURFACE: an anonymous caller getting a plausible employer
 * "security code" back from trylitos.com is the same credibility problem as the fake application
 * form it belongs to, and a directory where five of six routes are gated is a directory that will
 * grow a sixth ungated one. It is served no-store so a trial never reads a cached answer for the
 * wrong case.
 *
 * CALLERS MUST NOW APPEND litos_qa_key. In the backend repo that is securityCodeMailboxUrl() in
 * scripts/qa-guest-submissions-lib.mjs.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!qaRequestAllowed(request)) notFound();
  const url = new URL(request.url);
  const caseId = normalizeCaseId(url.searchParams.get("case"), "security-code");
  return NextResponse.json(
    { case: caseId, code: securityCodeFor(caseId), shape: "security-code" },
    { headers: { "cache-control": "no-store" } },
  );
}
