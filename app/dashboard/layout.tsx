"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getProductMeta, getStoredEmail, getToken } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/jobs", label: "Jobs" },
  { href: "/dashboard/applications", label: "Applications" },
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
  const [email, setEmail] = useState<string | null>(null);
  const [qaMode, setQaMode] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      if (window.location.hostname === "localhost" && new URLSearchParams(window.location.search).has("qa")) {
        setQaMode(true);
        setEmail("qa@trylitos.com");
        setReady(true);
        return;
      }
      if (!getToken()) {
        router.replace("/login");
        return;
      }
      setEmail(getStoredEmail());
      setReady(true);
      void getProductMeta().catch(() => null);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="rq-shimmer h-8 w-48 rounded-full" />
        <div className="rq-shimmer mt-8 h-40 rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/litos-mark.svg" alt="" className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              Litos
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted sm:block">{email}</span>
            <Link
              href="/dashboard/settings"
              aria-label="Account settings"
              className="hidden rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink sm:block"
            >
              Account
            </Link>
            <button
              onClick={() => {
                clearSession();
                router.replace("/");
              }}
              className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl gap-1 px-6 pb-3 sm:flex">
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
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 pb-24 sm:px-6 sm:py-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-bg/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden">
        {NAV.map((item) => {
          const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={qaMode ? `${item.href}?qa=1` : item.href}
              className={`rounded-[12px] px-1 py-2 text-center text-xs font-medium ${active ? "bg-ink text-white" : "text-muted"}`}
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
