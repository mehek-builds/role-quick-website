"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getProductMeta, getStoredEmail, getToken, type Me } from "@/lib/api";
import { isQaRender } from "@/lib/qa-mode";
import {
  ClipboardIcon,
  GearIcon,
  HomeIcon,
  MailIcon,
  SearchIcon,
} from "@/components/app/NavIcons";

/* One noun per destination, and the two that a student kept confusing are now told apart by the
   word itself rather than by a subtitle they have to find: "Jobs" is everything we found, and
   "Tracker" is the subset you are actually working on. "Outreach" was the brand's word for
   sending an email to a human, so it says Emails. The route stays /applications: the label is
   what a student reads, and changing the URL would break every link already sent out. */
const NAV = [
  { href: "/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/dashboard/jobs", label: "Jobs", Icon: SearchIcon },
  { href: "/dashboard/applications", label: "Tracker", Icon: ClipboardIcon },
  { href: "/dashboard/outreach", label: "Emails", Icon: MailIcon },
];

/* Pinned below the work destinations because Account is visited occasionally. */
const UTILITY = [
  { href: "/dashboard/settings", label: "Account", Icon: GearIcon },
];

/* The consolidated Account destination is the fifth mobile item. */
const MOBILE_NAV = [...NAV, ...UTILITY];

function isActive(href: string, pathname: string): boolean {
  // /dashboard prefix-matches every child, so it alone is compared exactly.
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

/**
 * The dashboard chrome: the rail, the mobile bar, the auth gate, the loading skeleton.
 *
 * This is everything app/dashboard/layout.tsx used to be. It was split out so the layout could go
 * back to being a server component and declare a title, which a client component cannot do. Nothing
 * here changed in the split except the removal of a document.title effect, which no longer has a
 * route to title: see the layout for why that is now a metadata export instead of an effect.
 */
export function DashboardShell({
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
      if (isQaRender()) {
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
      <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
        <div className="hidden border-r border-border p-5 lg:block">
          <div className="rq-shimmer h-6 w-20" />
          <div className="mt-9 space-y-2">
            {NAV.map((item) => <div key={item.href} className="rq-shimmer h-10 rounded-control" />)}
          </div>
        </div>
        <div>
          <header className="border-b border-border lg:hidden">
            <div className="flex h-[65px] items-center px-4">
              <div className="rq-shimmer h-6 w-20" />
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-10">
            <div className="rq-shimmer h-9 w-40" />
            {/* Three, matching the real metric grid. A four-column skeleton meant the first thing a
                new user saw was a layout that then rearranged under them. */}
            <div className="mt-10 grid grid-cols-3 border-y border-border py-6">
              {Array.from({ length: 3 }).map((_, index) => <div key={index} className="rq-shimmer h-12 border-l border-border first:border-0" />)}
            </div>
          </main>
        </div>
      </div>
    );
  }

  const href = (to: string) => (qaMode ? `${to}?qa=1` : to);

  return (
    /* The rail is a real grid column, not a fixed overlay, so the page's own scrollbar belongs to
       the content and the two never fight over it. Below lg the column collapses and the bottom bar
       takes over: a 272px rail on a laptop is orientation, on a phone it is the whole screen. */
    <div className="dashboard-shell min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/litos-mark.svg" alt="" className="h-7 w-7" />
          {/* DESIGN.md: display weight is 450, never bold. */}
          <span className="text-[17px] font-medium tracking-tight text-ink">Litos</span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-3 pb-1 pt-3 font-mono text-label uppercase tracking-[0.08em] text-faint">Menu</p>
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <RailLink item={item} href={href(item.href)} active={isActive(item.href, pathname)} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="px-3 pb-3">
          <ul className="space-y-0.5">
            {UTILITY.map((item) => (
              <li key={item.href}>
                <RailLink item={item} href={href(item.href)} active={isActive(item.href, pathname)} />
              </li>
            ))}
          </ul>
        </div>

        <AccountFooter qaMode={qaMode} />
      </aside>

      <div className="flex min-h-screen flex-col">
        {/* The wordmark has to live somewhere below lg, where the rail is gone. */}
        <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2 px-4 py-3.5">
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/litos-mark.svg" alt="" className="h-6 w-6" />
              <span className="text-base font-medium tracking-tight text-ink">Litos</span>
            </Link>
          </div>
        </header>
        {/* Top and bottom padding are set SEPARATELY on purpose. This was `py-7 pb-24 sm:py-10`,
            where the `sm:py-10` shorthand quietly overwrote the `pb-24` that exists to keep the end
            of a page off the tab bar below. The bar is `lg:hidden`, so from 640px to 1023px it was
            still on screen with nothing reserved for it, and the last 21px of every dashboard page
            sat underneath it. On /dashboard/applications those 21px are where the primary action
            lives. Nothing here may use a `py-*` shorthand again: the bottom is the bar's to claim,
            through --dashboard-bottom-bar, which goes to 0 exactly when the bar goes away. */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-7 pb-[calc(var(--dashboard-bottom-bar)+2.5rem)] sm:px-6 sm:pt-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-bg/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={href(item.href)}
            /* 12px, not 11px, and the active item gets a surface rather than relying on a
               colour difference two shades apart at the smallest size in the product. */
            className={`min-h-11 rounded-full px-0.5 py-2 text-center text-xs ${
              isActive(item.href, pathname) ? "bg-surface-alt font-medium text-ink" : "text-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {/* No marketing footer inside the product. Linear, Notion and Stripe (the stated
          references) all drop it once you are logged in; Privacy lives in Account. */}
    </div>
  );
}

/** One row of the rail. */
function RailLink({
  item,
  href,
  active,
}: {
  item: { label: string; Icon: (props: { className?: string }) => React.ReactElement };
  href: string;
  active: boolean;
}) {
  const { Icon, label } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      /* Where you are is not an action, so it reads as a quiet surface rather than a second filled
         pill competing with the page's real blue one. The icon is the single place colour is
         allowed to mark position: it is the difference between two rows that both carry ink text.
         The rail is a pill (rounded-control), matching every other control in the product. */
      className={`relative flex min-h-10 items-center gap-3 rounded-control px-3 text-[15px] transition-colors ${
        active ? "bg-surface-alt font-medium text-ink" : "text-muted hover:bg-surface-alt hover:text-ink"
      }`}
    >
      {/* The one place in the rail colour marks position. It sits in the gutter outside the pill,
          so it reads as an edge marker against the rail's border rather than as a filled control. */}
      {active && (
        <span aria-hidden="true" className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand" />
      )}
      <Icon className={active ? "text-brand" : "text-faint"} />
      {label}
    </Link>
  );
}

/**
 * Who is signed in and what they are on. Two facts, no figures.
 *
 * This used to print the account's all-time submitted count beside the tier, and the adjacency was
 * the whole problem: "Free · 5 applications" is a fact about what someone has already done, but one
 * separator away from a plan name it reads as what the plan grants, and free grants 20 resumes a
 * month, so the rail was quietly quoting a quota four times smaller than the real one. Rewording it
 * to a verb would have fixed the misreading; removing it also settles the redundancy, because Home's
 * Momentum panel already reports that number labelled and in context. Say it once, where it means
 * something. The rail's job is identity and plan.
 */
function AccountFooter({ qaMode }: { qaMode: boolean }) {
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    /* QA renders have no session. Calling /me here anyway would 401, and api() answers a 401 by
       clearing the session and sending the browser to /login, so the footer alone was enough to
       bounce every QA render of every dashboard page off the screen it was there to show.

       Asked of window, not of the `qaMode` prop, and that is the whole point. The prop is state the
       PARENT sets in its own effect, and React runs a child's effects before its parent's, so at the
       one moment this guard has to hold it is still false: the fetch went out, 401ed, and redirected
       while the layout was still deciding it was in QA mode. The guard read as correct and did
       nothing, which is why the bounce it documents kept happening. isQaRender() reads
       window.location, which is already right on the first pass. */
    if (qaMode || isQaRender()) return;
    let cancelled = false;
    /* Deferred, not read in the effect body: getStoredEmail touches localStorage, which does not
       exist while this renders on the server, and setting state synchronously here would also
       cascade a render before the first paint. Same queueMicrotask the shell above already uses. */
    queueMicrotask(() => {
      if (cancelled) return;
      setEmail(getStoredEmail());
      void api<Me>("/me")
        .then((result) => !cancelled && setMe(result))
        .catch(() => null);
    });
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  const address = me?.email ?? email;
  const tier = me ? (me.is_guest ? "Trial" : me.tier === "pro" ? "Pro" : "Free") : null;

  return (
    <Link
      href="/dashboard/settings"
      className="flex items-center gap-3 border-t border-border px-4 py-3.5 transition-colors hover:bg-surface-alt"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-[13px] font-medium text-brand-ink"
      >
        {(address ?? "?").charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{address ?? "Your account"}</span>
        {tier && <span className="block truncate font-mono text-[11px] text-muted">{tier}</span>}
      </span>
    </Link>
  );
}
