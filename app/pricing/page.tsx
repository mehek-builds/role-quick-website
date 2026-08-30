import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlanCards } from "@/components/pricing/PlanCards";

export const metadata: Metadata = {
  title: "Litos+ checkout",
  description: "Choose Litos+ access for the account signed in to the Litos extension.",
  robots: { index: false, follow: false },
};

type PricingPageProps = {
  searchParams: Promise<{ surface?: string | string[] }>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const { surface } = await searchParams;

  /* The public pricing page was removed on 2026-08-30. The extension already
     installed on users' browsers still opens this URL to bind checkout to its
     signed-in account, so that exact handoff remains available and noindexed.
     Every normal visit leaves immediately instead of exposing a hidden public
     pricing destination. */
  if (surface !== "extension") redirect("/login");

  return (
    <div className="min-h-screen bg-bg">
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-12 pt-16 sm:pb-16 sm:pt-20">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/litos-mark.svg" alt="" className="h-5 w-5" />
            <span className="text-base font-medium tracking-tight text-ink">Litos</span>
          </div>
          <p className="mt-14 font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Extension checkout</p>
          <h1 className="mt-5 max-w-3xl text-display font-[450] text-ink">Choose Litos+.</h1>
          <p className="mt-6 max-w-2xl text-body text-muted">Stripe opens through the account signed in to your Litos extension.</p>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24"><PlanCards /></section>
      </main>
    </div>
  );
}
