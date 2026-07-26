"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getProductMeta, getToken } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/jobs", label: "Jobs" },
  { href: "/dashboard/applications", label: "Applications" },
  { href: "/dashboard/outreach", label: "Outreach" },
  { href: "/dashboard/profile", label: "Profile" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [qaMode, setQaMode] = useState(false);

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
          <div className="mt-10 grid grid-cols-4 border-y border-border py-6">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="rq-shimmer h-12 border-l border-border first:border-0" />)}
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
            <span className="text-[15px] font-semibold tracking-tight text-ink">
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
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "text-muted hover:bg-surface-alt hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          </nav>
          <Link href="/dashboard/settings" aria-label="Account settings" className="ml-auto flex min-h-10 items-center rounded-full border border-border px-3.5 text-xs font-medium text-ink transition-colors hover:border-ink">Account</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 pb-24 sm:px-6 sm:py-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-bg/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden">
        {NAV.map((item) => {
          const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={qaMode ? `${item.href}?qa=1` : item.href}
              className={`min-h-11 px-0.5 py-2 text-center text-[11px] font-medium ${active ? "text-ink" : "text-muted"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-faint">
          <span>&copy; {new Date().getFullYear()} Litos</span>
          <a href="/privacy" className="hover:text-muted">
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}
