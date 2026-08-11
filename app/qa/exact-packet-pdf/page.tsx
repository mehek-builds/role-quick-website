import type { Metadata } from "next";
import { requireQaAccess } from "../gate";
import { ExactPacketPdfHarness } from "./harness";

/* Test mount for the send gate's exact PDF viewer. Nothing links here and it answers 404 without
   the shared secret, exactly like the packet and waiting-on-you harnesses beside it; see
   lib/qa-gate.ts. It is wired to no API and reads one committed fixture PDF. */
export const metadata: Metadata = {
  title: "Exact packet PDF harness",
  robots: { index: false, follow: false },
};

/* A gate that a build could prerender past is not a gate. See app/qa/gate.ts. */
export const dynamic = "force-dynamic";

function positiveInt(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function single(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw || undefined;
}

export default async function ExactPacketPdfHarnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  await requireQaAccess(resolved);
  return (
    <ExactPacketPdfHarness
      timeoutMs={positiveInt(resolved.timeout)}
      sha256={single(resolved.sha256)}
      sizeBytes={positiveInt(resolved.size)}
    />
  );
}
