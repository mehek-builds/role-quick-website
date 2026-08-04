import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { TrySimulator } from "@/components/try/TrySimulator";
import { getJobCards } from "@/lib/try-jobs";

export const metadata: Metadata = {
  title: "Try it without installing",
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
          <h1 className="mt-3 text-display font-[450] leading-[1.05] tracking-[-0.03em] text-ink">
            Now you try.
          </h1>
          <p className="mx-auto mt-4 max-w-[460px] text-base leading-7 text-muted">
            This is what happens on a real job. Press the buttons.
            Nothing installs. Nothing gets sent.
          </p>
          {/* /try had no privacy link at all, on the one page where a visitor is
              actively deciding whether to trust this with a resume. The homepage
              hero and the footer both carried one; the demo booth did not.

              That premise expired on 2026-08-04: the footer is site chrome now
              (components/SiteFooter.tsx) and /try renders it, so there IS a
              /privacy link at the bottom of this page. This one stays anyway,
              and not out of inertia. The decision it serves is made at the
              paste box, several screens above the footer, and a trust question
              answered a full page-scroll away from where it is asked is not
              answered. Delete this only if the paste box itself grows one.

              Kept to the two facts that matter at this moment rather than
              restating the hero.

              "Nothing you paste here is stored" and not "this demo stores
              nothing", which is what the first draft said. api/try/route.ts does
              keep one thing: a per-session and per-IP rate-limit counter. The
              resume text is never persisted, which is the fact a visitor
              actually cares about, so say that one exactly instead of a rounder
              claim that is not quite true. */}
          <p className="mx-auto mt-3 max-w-[460px] text-[13px] leading-6 text-faint">
            Nothing you paste here is stored. When you do have an account, you
            can delete everything in it.{" "}
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
          <TrySimulator initialStep={step} jobs={jobs} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
