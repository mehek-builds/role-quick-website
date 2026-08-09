import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { QA_GATE_HEADER, QA_GATE_PARAM, qaAccessAllowed, suppliedQaKey } from "@/lib/qa-gate";

/* The Next-facing half of lib/qa-gate.ts. Kept apart from the decision itself so the decision can
   be unit tested without a request, and so there is exactly one place that turns "not allowed"
   into a 404. Every page and route handler under app/qa/ calls one of these two as its first
   statement; tests/route-integrity.test.mjs fails the build if one of them stops doing so. */

/**
 * For pages. A server component cannot see its own URL, so the resolved searchParams object has to
 * be handed in; the header is read here.
 *
 * notFound() rather than a 403 on purpose. A 403 confirms the route exists and that there is a
 * secret worth guessing. A 404 is the same answer a stranger gets for any path that was never
 * built, which is what these pages should look like to anyone who is not the harness.
 *
 * Reading headers() also opts every caller out of static prerendering, which a gate needs: a page
 * rendered once at build time would answer from that build's environment forever. The pages carry
 * an explicit `export const dynamic = "force-dynamic"` as well, so the guarantee does not rest on
 * a side effect of this function.
 */
export async function requireQaAccess(searchParams?: Record<string, unknown>): Promise<void> {
  const supplied = suppliedQaKey(searchParams) ?? (await headers()).get(QA_GATE_HEADER);
  if (!qaAccessAllowed(supplied)) notFound();
}

/** For route handlers, which unlike pages can read their own request. */
export function qaRequestAllowed(request: Request): boolean {
  const supplied =
    new URL(request.url).searchParams.get(QA_GATE_PARAM) ?? request.headers.get(QA_GATE_HEADER);
  return qaAccessAllowed(supplied);
}
