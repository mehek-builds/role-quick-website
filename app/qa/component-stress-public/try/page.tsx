import type { Metadata } from "next";

import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { TrySimulator } from "@/components/try/TrySimulator";
import type { TryJobCard } from "@/lib/try-jobs";
import { requireQaAccess } from "../../gate";

export const metadata: Metadata = {
  title: "Try component stress fixture",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const JOBS: TryJobCard[] = Array.from({ length: 24 }, (_, index) => ({
  id: `stress-job-${index + 1}`,
  company: index === 0 ? "Fixture Labs" : `Fixture Company ${index + 1}`,
  title: index === 0 ? "Software Engineering Intern" : `Test Role ${index + 1}`,
  location: index === 0 ? "Los Angeles, CA" : `Test City ${index + 1}`,
  ats: "greenhouse",
  applyUrl: `https://boards.greenhouse.io/fixture/jobs/${index + 1}`,
  jd: `This fixture posting ${index + 1} needs TypeScript, React, testing, and clear communication.`,
}));

function first(value: string | string[] | undefined): string | undefined {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved || undefined;
}

export default async function TryStressFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  await requireQaAccess(resolved);
  const scenario = first(resolved.stress_scenario) ?? "try-one";
  const jobs = scenario === "try-empty" ? [] : scenario === "try-many" ? JOBS : JOBS.slice(0, 1);

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main className="flex-1 px-4 pb-24 pt-32 sm:px-6">
        <div className="mx-auto max-w-[560px] text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Try it
          </p>
          <h1 className="mt-3 text-display font-[450] leading-[1.05] tracking-[-0.03em] text-ink">
            Now you try.
          </h1>
          <p className="mx-auto mt-4 max-w-[460px] text-base leading-7 text-muted">
            This is what happens on a real job. Press the buttons. Nothing installs. Nothing gets sent.
          </p>
          <p className="mx-auto mt-3 max-w-[460px] text-[13px] leading-6 text-muted">
            Nothing you paste here is stored. When you do have an account, you can delete everything in it.{" "}
            <a
              href="/privacy"
              data-inline-link
              className="underline decoration-border underline-offset-2 hover:text-ink"
            >
              Privacy
            </a>
          </p>
        </div>
        <div className="mt-12">
          <TrySimulator jobs={jobs} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
