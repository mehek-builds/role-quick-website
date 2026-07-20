"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getStoredEmail, getToken } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/applications", label: "Applications" },
  { href: "/dashboard/outreach", label: "Outreach" },
  { href: "/dashboard/resume", label: "Resume" },
  { href: "/dashboard/settings", label: "Settings" },
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

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setEmail(getStoredEmail());
    setReady(true);
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
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-white">
              R
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              Litos
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden font-mono text-xs text-muted sm:block">{email}</span>
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
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6 pb-3">
          {NAV.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
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
