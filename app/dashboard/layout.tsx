"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getProductMeta, getToken } from "@/lib/api";

/* One noun per destination, and the two that a student kept confusing are now told apart by the
   word itself rather than by a subtitle they have to find: "Jobs" is everything we found, and
   "Applications" is the subset you are actually working on. "Outreach" was the brand's word for
   sending an email to a human, so it says Emails. */
const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/jobs", label: "Jobs" },
  { href: "/dashboard/applications", label: "Applications" },
  { href: "/dashboard/outreach", label: "Emails" },
];

const ACCOUNT = { href: "/dashboard/settings", label: "Account" };
const MOBILE_NAV = [...NAV, ACCOUNT];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [qaMode, setQaMode] = useState(false);

  /* One name per screen in the tab, matching the nav. A client layout cannot
     export metadata, so all six pages inherited the marketing title (finding 41). */
  useEffect(() => {
    const here = NAV.find((n) =>
      n.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(n.href),
    );
    const name = pathname.startsWith("/dashboard/settings") ? "Account" : here?.label;
    document.title = name ? `${name}: Litos` : "Litos";
  }, [pathname]);

  useEffect(() => {
    queueMicrotask(() => {
      if (window.location.hostname === "localhost" && new URLSearchParams(window.location.search).has("qa")) {
        setQaMode(true);
        setReady(true);
        return;
      }
      if (!getToken()) {
        router.replace("/login");
        return;
      }
      setReady(true);
      void getProductMeta().catch(() => null);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-border">
          <div className="mx-auto flex h-[73px] max-w-6xl items-center gap-8 px-6">
            <div className="rq-shimmer h-6 w-20" />
            <div className="hidden flex-1 gap-5 sm:flex">
              {NAV.map((item) => <div key={item.href} className="rq-shimmer h-4 w-16" />)}
            </div>
            <div className="rq-shimmer h-9 w-20 rounded-full" />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">
          <div className="rq-shimmer h-9 w-40" />
          {/* Three, matching the real metric grid. A four-column skeleton meant the first thing a
              new user saw was a layout that then rearranged under them. */}
          <div className="mt-10 grid grid-cols-3 border-y border-border py-6">
            {Array.from({ length: 3 }).map((_, index) => <div key={index} className="rq-shimmer h-12 border-l border-border first:border-0" />)}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-shell flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-7 px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/litos-mark.svg" alt="" className="h-6 w-6" />
            {/* DESIGN.md: display weight is 450, never bold. This was 600. */}
            <span className="text-base font-medium tracking-tight text-ink">
              Litos
            </span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 sm:flex">
          {NAV.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={qaMode ? `${item.href}?qa=1` : item.href}
                /* A filled pill is how this page says "do this" (the blue CTA). Where you are is
                   not an action, so it reads as a quiet surface instead of a second filled pill
                   competing with the real one. */
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-surface-alt font-medium text-ink"
                    : "text-muted hover:bg-surface-alt hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          </nav>
          {/* One control, one name. This link said "Account", announced "Account settings", and
              landed on a page headed "Settings". It is Account in all three places now. */}
          <Link
            href={ACCOUNT.href}
            aria-current={pathname.startsWith(ACCOUNT.href) ? "page" : undefined}
            className={`ml-auto flex min-h-10 items-center rounded-full border px-3.5 text-xs font-medium text-ink transition-colors ${
              pathname.startsWith(ACCOUNT.href)
                ? "border-ink bg-surface-alt"
                : "border-border hover:border-ink"
            }`}
          >
            Account
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 pb-24 sm:px-6 sm:py-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-bg/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden">
        {MOBILE_NAV.map((item) => {
          const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={qaMode ? `${item.href}?qa=1` : item.href}
              /* 12px, not 11px, and the active item gets a surface rather than relying on a
                 colour difference two shades apart at the smallest size in the product. */
              className={`min-h-11 rounded-full px-0.5 py-2 text-center text-xs ${active ? "bg-surface-alt font-medium text-ink" : "text-muted"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* No marketing footer inside the product. Linear, Notion and Stripe (the stated
          references) all drop it once you are logged in; Privacy lives in Account. */}
    </div>
  );
}
