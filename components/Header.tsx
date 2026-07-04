import { STORE_URL } from "@/lib/config";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-white">
            R
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            RoleQuick
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted sm:flex">
          <a href="/#how-it-works" className="hover:text-ink">
            How it works
          </a>
          <a href="/#product" className="hover:text-ink">
            Product
          </a>
          <a href="/#pricing" className="hover:text-ink">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            Sign in
          </a>
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
