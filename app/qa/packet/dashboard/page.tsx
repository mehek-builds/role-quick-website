import type { Metadata } from "next";
import { requireQaAccess } from "../../gate";
import { DashboardPacketHarness } from "./harness";

/* The DASHBOARD packet viewer, rendered against a fixture.
 *
 * The dashboard itself is behind the login wall and talks to the backend, so
 * the ported component cannot be looked at while building it without an
 * account. This route feeds ApplicationPacket a GeneratedResume and an
 * ApplicationReview typed against lib/api.ts, which means the fixture cannot
 * drift from the real payload without failing the typecheck.
 *
 * It is a harness, not a demo: nothing links here, and the component under it
 * is the exact one the dashboard renders. Being robots-disallowed used to be
 * the whole of the protection, which was not protection at all; it now answers
 * 404 without the shared secret. See lib/qa-gate.ts. */
export const metadata: Metadata = {
  title: "Dashboard packet viewer harness",
  robots: { index: false, follow: false },
};

/* A gate that a build could prerender past is not a gate. See app/qa/gate.ts. */
export const dynamic = "force-dynamic";

export default async function DashboardPacketHarnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireQaAccess(await searchParams);
  return <DashboardPacketHarness />;
}
