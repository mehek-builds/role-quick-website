const STORE_URL = "#"; // TODO: swap for the Chrome Web Store listing URL once Role Quick is published

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-white">
            R
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Role Quick
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted sm:flex">
          <a href="#how-it-works" className="hover:text-ink">
            How it works
          </a>
          <a href="#product" className="hover:text-ink">
            Product
          </a>
          <a href="#pricing" className="hover:text-ink">
            Pricing
          </a>
        </nav>
        <a
          href={STORE_URL}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Add to Chrome
        </a>
      </div>
    </header>
  );
}
