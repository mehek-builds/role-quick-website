import type { Metadata } from "next";

import { suppliedQaKey } from "@/lib/qa-gate";
import { requireQaAccess } from "../gate";
import { DashboardStressHarness } from "./harness";

export const metadata: Metadata = {
  title: "Dashboard component stress harness",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardStressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  await requireQaAccess(resolved);

  return (
    <DashboardStressHarness
      panel={single(resolved.panel)}
      scenario={single(resolved.scenario)}
      qaKey={suppliedQaKey(resolved)}
    />
  );
}
