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
    <main className="min-h-screen bg-canvas pb-16 pt-14">
      <div className="mx-auto w-full">
        <div className="fixed bottom-3 left-3 z-50 rounded-inner border border-border bg-surface px-3 py-2 text-small text-muted shadow-raised">
          Internal preview. Not linked from anywhere and not indexed.
        </div>

        <HeroScene />

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
