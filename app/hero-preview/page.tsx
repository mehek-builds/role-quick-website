import { HeroProof } from "@/components/HeroProof";
import { HeroScene } from "@/components/HeroScene";
import { InstallLink } from "@/components/InstallLink";

/* PROPOSAL, not shipped. A standalone look at the Cal-AI-style proof hero so
   it can be judged on its own before it displaces anything on the homepage.
   The copy here is lifted verbatim from the film's hero card so the only
   variable under review is the proof stage.
 *
 * If this is approved, this route goes away and HeroProof moves into
 * app/page.tsx above CinematicHero. If it is rejected, delete this directory
 * and components/HeroProof.tsx; the capture script stands on its own and keeps
 * earning its keep through the store assets. */

export const metadata = {
  title: "Hero proposal · Litos",
  robots: { index: false, follow: false },
};

export default function HeroPreviewPage() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded-inner border border-border bg-surface px-4 py-3 text-[13px] text-muted">
          Internal preview. Not linked from anywhere and not indexed.
        </div>

        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Free Chrome extension for job seekers
          </p>
          <h1 className="text-display font-[450] leading-[1.02] tracking-[-0.03em] text-ink">
            Apply <span className="text-brand-ink">in seconds.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[460px] text-base leading-[1.65] text-muted">
            Nothing is reused. Every job gets its own resume, form, and email.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <InstallLink
              source="hero-preview"
              className="hidden min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:inline-flex sm:w-auto"
            >
              Add to Chrome, it&apos;s free
            </InstallLink>
            <a
              href="/try"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto sm:bg-transparent sm:px-2 sm:py-0 sm:text-muted sm:hover:bg-transparent sm:hover:text-ink"
            >
              Try it free
            </a>
          </div>
        </div>

        <div className="mt-14">
          <HeroScene />
        </div>

        {/* The previous draft, kept directly below so the two can be judged
            against each other rather than from memory. */}
        <div className="mt-40 border-t border-border pt-12">
          <p className="mb-10 text-center font-mono text-label uppercase tracking-[0.08em] text-faint">
            Previous draft
          </p>
          <HeroProof />
        </div>
      </div>
    </main>
  );
}
