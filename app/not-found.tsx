import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Page not found: Litos",
  description: "That Litos page could not be found. Continue to jobs, sign in, or contact support.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          404
        </p>
        <h1 className="mt-4 text-section font-[450] tracking-[-0.02em] text-ink">
          This page does not exist.
        </h1>
        <p className="mt-4 max-w-md text-body text-muted">The address may be mistyped, or the page may have moved. Your account and saved work are not affected.</p>
        <div aria-hidden="true" className="mt-8 flex w-40 items-center gap-3 rounded-inner border border-border bg-surface-alt px-4 py-3">
          <span className="h-px flex-1 bg-faint" /><span className="font-mono text-xs text-faint">NO MATCH</span><span className="h-px flex-1 bg-faint" />
        </div>
        <nav aria-label="Page recovery" className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="/browse-jobs" className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-white hover:opacity-90">Browse jobs</a>
          <a href="/login" className="rounded-full border border-border px-6 py-3 text-sm font-medium text-ink hover:bg-surface-alt">Sign in</a>
          <a href="/contact" className="rounded-full border border-border px-6 py-3 text-sm font-medium text-ink hover:bg-surface-alt">Contact</a>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
