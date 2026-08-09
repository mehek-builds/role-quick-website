import type { Metadata } from "next";
import { requireQaAccess } from "../gate";
import { PacketSandbox } from "./sandbox";

/* Design sandbox for the "revisit the application" packet viewer. This used to say that sitting
   under /qa/ was enough because robots.ts disallows it, which was the belief that left the whole
   directory answering 200 to the open internet. A robots rule is not access control, so the page
   now answers 404 without the shared secret; see lib/qa-gate.ts.

   It is a surface for iterating on the design before it goes onto the dashboard's applications
   page, not a landing page. Nothing here is wired to the API, and the data is the John Doe canon. */
export const metadata: Metadata = {
  title: "Packet viewer sandbox",
  robots: { index: false, follow: false },
};

/* A gate that a build could prerender past is not a gate. See app/qa/gate.ts. */
export const dynamic = "force-dynamic";

export default async function PacketSandboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireQaAccess(await searchParams);
  return <PacketSandbox />;
}
