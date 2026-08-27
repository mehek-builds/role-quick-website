import type { Metadata } from "next";

import { requireQaAccess } from "../gate";
import { PublicStressHarness } from "./sandbox";

export const metadata: Metadata = {
  title: "Public component stress harness",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved || undefined;
}

export default async function PublicComponentStressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  await requireQaAccess(resolved);

  return (
    <PublicStressHarness
      embed={single(resolved.embed) === "shared"}
      mountRouteFrames={single(resolved.mount_routes) === "1"}
      qaKey={single(resolved.litos_qa_key)}
    />
  );
}
