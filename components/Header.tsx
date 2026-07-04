import { STORE_URL } from "@/lib/config";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          {/* The official mark (public/brand/rolequick-mark.svg), not a CSS
              circle: one drawing of the R everywhere the brand appears. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/rolequick-mark.svg" alt="" className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            RoleQuick
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted sm:flex">
          <a href="/#product" className="hover:text-ink">
            Product
          </a>
          <a href="/#pricing" className="hover:text-ink">
            Pricing
          </a>
          <a href="/#faq" className="hover:text-ink">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            Sign in
          </a>
          {/* Color v1.1: action blue repeats on every true CTA, so the primary
              action reads as primary at a glance next to the outlined Sign in. */}
          <a
            href={STORE_URL}
            className="hidden rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:block"
          >
            Add to Chrome
          </a>
        </div>
      </div>
    </header>
  );
}
