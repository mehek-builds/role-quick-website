import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { TrySimulator } from "@/components/try/TrySimulator";
import { getJobCards } from "@/lib/try-jobs";

export const metadata: Metadata = {
  title: "Try Litos without installing it",
  description:
    "Try Litos on a pretend job. Watch it make your resume, fill in the form, and write the email. Nothing gets sent.",
};

/* Standalone try-it surface (design doc 2026-07-08). Deliberately quiet:
   no film stage here - the reel is the trailer, this is the demo booth. */
export default async function TryPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const jobs = await getJobCards();
  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main className="flex-1 px-4 pb-24 pt-32 sm:px-6">
        <div className="mx-auto max-w-[560px] text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Try it
          </p>
          <h1 className="mt-3 text-4xl font-[450] leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">
            Now you try.
          </h1>
          <p className="mx-auto mt-4 max-w-[460px] text-[15px] leading-7 text-muted">
            This is what happens on a real job. Press the buttons.
            Nothing installs. Nothing gets sent.
          </p>
        </div>
        <div className="mt-12">
          <TrySimulator initialStep={step} jobs={jobs} />
        </div>
      </main>
    </div>
  );
}
