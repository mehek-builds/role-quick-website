import type { Metadata } from "next";
import { DashboardPacketHarness } from "./harness";

/* The DASHBOARD packet viewer, rendered against a fixture.
 *
 * The dashboard itself is behind the login wall and talks to the backend, so
 * the ported component cannot be looked at while building it without an
 * account. This route feeds ApplicationPacket a GeneratedResume and an
 * ApplicationReview typed against lib/api.ts, which means the fixture cannot
 * drift from the real payload without failing the typecheck.
 *
 * It is a harness, not a demo: /qa/ is robots-disallowed, nothing links here,
 * and the component under it is the exact one the dashboard renders. */
export const metadata: Metadata = {
  title: "Dashboard packet viewer harness",
  robots: { index: false, follow: false },
};

export default function DashboardPacketHarnessPage() {
  return <DashboardPacketHarness />;
}
