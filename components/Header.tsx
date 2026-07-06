import { STORE_URL } from "@/lib/config";

/* Floating glass pill, not a white bar: the film shows around and through
   it, so the page reads as one surface from the first pixel. */
export function Header() {
  return (
    <header className="fixed inset-x-0 top-3 z-30 px-3 sm:top-4 sm:px-6">
      <div className="rq-glass mx-auto flex max-w-5xl items-center justify-between rounded-full py-2 pl-4 pr-2">
        <a href="/" className="flex items-center gap-2">
          {/* The official mark (public/brand/rolequick-mark.svg), not a CSS
              circle: one drawing of the R everywhere the brand appears. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/rolequick-mark.svg" alt="" className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            RoleQuick
          </span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="/#product" className="transition-colors hover:text-ink">
            Product
          </a>
          <a href="/#pricing" className="transition-colors hover:text-ink">
            Pricing
          </a>
          <a href="/#faq" className="transition-colors hover:text-ink">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-white/70"
          >
            Sign in
          </a>
          {/* Color v1.1: action blue repeats on every true CTA, so the primary
              action reads as primary at a glance next to the quiet Sign in. */}
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
