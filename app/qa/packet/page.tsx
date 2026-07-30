import type { Metadata } from "next";
import { PacketSandbox } from "./sandbox";

/* Design sandbox for the "revisit the application" packet viewer, sitting under
   /qa/ so robots.ts already disallows it: this is a surface for iterating on the
   design before it goes onto the dashboard's applications page, not a landing
   page. Nothing here is wired to the API, and the data is the John Doe canon. */
export const metadata: Metadata = {
  title: "Packet viewer sandbox",
  robots: { index: false, follow: false },
};

export default function PacketSandboxPage() {
  return <PacketSandbox />;
}
