"use client";

import { useCallback, useEffect, useRef, useState, ViewTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getOnboardingState, getProductMeta, getStoredEmail, getToken, type Me } from "@/lib/api";
import { onboardingDeferredForSession } from "@/lib/onboarding-flow";
import { isQaRender } from "@/lib/qa-mode";
import { currentKeyboardInset } from "@/lib/keyboard-inset";
import {
  ChatIcon,
  ClipboardIcon,
  DocumentIcon,
  GearIcon,
  HomeIcon,
  MailIcon,
  PersonIcon,
  SearchIcon,
} from "@/components/app/NavIcons";
import { BillingProvider } from "@/components/billing/BillingProvider";

/* One familiar noun per destination. Route paths stay stable while the labels match the page
   titles, so the rail and the content never ask the student to translate between two names. */
const NAV = [
  { href: "/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/dashboard/jobs", label: "Jobs", Icon: SearchIcon },
  { href: "/dashboard/applications", label: "Applications", Icon: ClipboardIcon },
  { href: "/dashboard/documents", label: "Documents", Icon: DocumentIcon },
  { href: "/dashboard/network", label: "Network", Icon: PersonIcon },
  { href: "/dashboard/outreach", label: "Outreach", Icon: MailIcon },
];

const MOBILE_NAV = NAV.slice(0, 4);
const MORE_EXIT_MS = 130;

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreClosing, setMoreClosing] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreBackdropRef = useRef<HTMLDivElement>(null);
  const moreDialogRef = useRef<HTMLElement>(null);
  const moreCloseTimer = useRef<number | null>(null);

  const closeMore = useCallback((restoreFocus = false) => {
    const finish = () => {
      moreCloseTimer.current = null;
      setMoreOpen(false);
      setMoreClosing(false);
      if (restoreFocus) window.requestAnimationFrame(() => moreButtonRef.current?.focus());
    };
    if (moreCloseTimer.current !== null) window.clearTimeout(moreCloseTimer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    const dialog = moreDialogRef.current;
    if (dialog) {
      const transform = window.getComputedStyle(dialog).transform;
      dialog.style.setProperty("--rq-dashboard-dialog-exit-from", transform);
    }
    const backdrop = moreBackdropRef.current;
    if (backdrop) {
      const opacity = window.getComputedStyle(backdrop).opacity;
      backdrop.style.setProperty("--rq-dashboard-backdrop-exit-from", opacity);
    }
    setMoreClosing(true);
    moreCloseTimer.current = window.setTimeout(finish, MORE_EXIT_MS);
  }, []);

  const openMore = useCallback(() => {
    if (moreCloseTimer.current !== null) window.clearTimeout(moreCloseTimer.current);
    moreCloseTimer.current = null;
    setMoreClosing(false);
    setMoreOpen(true);
  }, []);

  useEffect(() => () => {
    if (moreCloseTimer.current !== null) window.clearTimeout(moreCloseTimer.current);
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeAtDesktop = () => {
      if (!desktop.matches || !moreDialogRef.current) return;
      const focusWasInside = moreDialogRef.current.contains(document.activeElement);
      if (moreCloseTimer.current !== null) window.clearTimeout(moreCloseTimer.current);
      moreCloseTimer.current = null;
      setMoreOpen(false);
      setMoreClosing(false);
      if (focusWasInside) {
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLElement>('.dashboard-shell aside [aria-current="page"]')?.focus();
        });
      }
    };
    desktop.addEventListener("change", closeAtDesktop);
    closeAtDesktop();
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const dialog = moreDialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href]"));
    if (!moreClosing) focusable()[0]?.focus();
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (moreClosing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeMore(true);
        return;
      }
      if (event.key !== "Tab") return;
      const stops = focusable();
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = priorOverflow;
    };
  }, [closeMore, moreClosing, moreOpen]);

  /**
   * Publish the software keyboard's height as a CSS variable.
   *
   * A bottom-sticky element is positioned against the LAYOUT viewport, and iOS Safari does not
   * shrink the layout viewport for the keyboard. So without this the terminal action bar sits
   * behind the keyboard for exactly as long as a text field is focused, which on the two screens
   * that use it (an editable resume, and a page of textareas) is most of the time they are open.
   *
   * Listens to `scroll` as well as `resize`: iOS scrolls the visual viewport to keep the focused
   * field above the keyboard, and that changes how much is covered without changing any height.
   *
   * Nothing here runs where `visualViewport` is absent, and the value stays 0 on every browser
   * that resizes the layout viewport instead, so this is inert outside the case it fixes.
   */
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let last = -1;
    const apply = () => {
      const inset = currentKeyboardInset();
      // Only touch the DOM when the value actually changed: these events fire per frame during a
      // scroll, and a style write per frame on a phone is a jank source for no benefit.
      if (inset === last) return;
      last = inset;
      root.style.setProperty("--keyboard-inset", `${inset}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      // Back to the stylesheet's own 0px rather than a stale inline value from a torn-down shell.
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);

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
      void getOnboardingState()
        .then((state) => {
          /* THE CARD GATE IS NOT DEFERRABLE, and that is the whole difference between
             it and the line below it. "Finish later" exists so an unfinished PROFILE
             never traps someone on a setup screen; letting it also wave through an
             account with no card on file would make the gate a suggestion, since
             deferring is a single click and the flag lives in this browser's own
             sessionStorage. So this branch is checked first and reads only the
             server's answer. */
          if (state.requires_payment_method) {
            router.replace("/start");
            return;
          }
          if (state.requires_onboarding && !onboardingDeferredForSession()) {
            router.replace("/start");
            return;
          }
          setReady(true);
        })
        /* A failed read opens the dashboard rather than sealing it. The gate is
           enforced on the server, and the alternative is that one flaky request locks
           a paying student out of their own account. */
        .catch(() => setReady(true));
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
  const moreActive = ["/dashboard/network", "/dashboard/outreach", "/dashboard/settings"]
    .some((destination) => isActive(destination, pathname));

  return (
    <BillingProvider>
    {/* The rail is a real grid column, not a fixed overlay, so the page's own scrollbar belongs to
        the content and the two never fight over it. Below lg the column collapses and the bottom bar
        takes over: a 272px rail on a laptop is orientation, on a phone it is the whole screen. */}
    <div className="dashboard-shell min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/litos-mark.svg" alt="" className="h-7 w-7" />
          {/* DESIGN.md: display weight is 450, never bold. */}
          <span className="text-[17px] font-medium tracking-tight text-ink">Litos</span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-3 pb-1 pt-3 font-mono text-label uppercase tracking-[0.08em] text-muted">Menu</p>
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <RailLink item={item} href={href(item.href)} active={isActive(item.href, pathname)} />
              </li>
            ))}
          </ul>
        </nav>

        <AccountFooter qaMode={qaMode} active={isActive("/dashboard/settings", pathname)} />
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
            through --dashboard-action-offset, whose bar term goes to 0 exactly when the bar does. */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-7 pb-[var(--dashboard-action-offset)] sm:px-6 sm:pt-10">{children}</main>
      </div>

      <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-[0.8fr_0.8fr_1.35fr_1.2fr_0.85fr] border-t border-border bg-bg/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={href(item.href)}
            aria-current={isActive(item.href, pathname) ? "page" : undefined}
            /* 12px, not 11px, and the active item gets a surface rather than relying on a
               colour difference two shades apart at the smallest size in the product. */
            className={`relative min-h-11 rounded-full px-0.5 py-2 text-center text-xs ${
              isActive(item.href, pathname) ? "font-medium text-ink" : "text-muted"
            }`}
          >
            {isActive(item.href, pathname) && (
              <ViewTransition name="dashboard-mobile-route-trace" share="rq-dashboard-route-trace" default="none">
                <span aria-hidden="true" className="absolute inset-0 rounded-full bg-surface-alt" />
              </ViewTransition>
            )}
            <span className="relative whitespace-nowrap">{item.label}</span>
          </Link>
        ))}
        <button
          id="dashboard-more-button"
          ref={moreButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen && !moreClosing}
          aria-controls={moreOpen ? "dashboard-more-dialog" : undefined}
          aria-current={moreActive ? "page" : undefined}
          aria-label={moreActive ? "More, current section" : "More"}
          onClick={openMore}
          className={`relative min-h-11 rounded-full px-0.5 py-2 text-center text-xs ${moreActive ? "font-medium text-ink" : "text-muted"}`}
        >
          {moreActive && (
            <ViewTransition name="dashboard-mobile-route-trace" share="rq-dashboard-route-trace" default="none">
              <span aria-hidden="true" className="absolute inset-0 rounded-full bg-surface-alt" />
            </ViewTransition>
          )}
          <span className="relative">More</span>
        </button>
      </nav>
      {moreOpen && (
        <div
          ref={moreBackdropRef}
          aria-hidden="true"
          className={`rq-dashboard-backdrop fixed inset-0 z-40 bg-ink/35 lg:hidden ${moreClosing ? "rq-dashboard-backdrop-exit" : ""}`}
          onClick={() => closeMore(true)}
        />
      )}
      {moreOpen && (
          <section
            ref={moreDialogRef}
            id="dashboard-more-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-more-title"
            aria-hidden={moreClosing || undefined}
            inert={moreClosing || undefined}
            className={`rq-dashboard-dialog fixed inset-x-0 bottom-0 z-50 rounded-t-card border border-border bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-overlay lg:hidden ${moreClosing ? "rq-dashboard-dialog-exit" : ""}`}
          >
            <div className="flex items-center justify-between">
              <h2 id="dashboard-more-title" className="text-heading font-[450] text-ink">More</h2>
              <button type="button" onClick={() => closeMore(true)} className="min-h-11 px-3 text-small text-muted">Close</button>
            </div>
            <nav aria-label="More dashboard destinations" className="mt-3 grid gap-2">
              {[
                { href: "/dashboard/network", label: "Network", Icon: PersonIcon },
                { href: "/dashboard/outreach", label: "Outreach", Icon: ChatIcon },
                { href: "/dashboard/settings", label: "Account", Icon: GearIcon },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={href(item.href)}
                  aria-current={isActive(item.href, pathname) ? "page" : undefined}
                  onClick={() => closeMore()}
                  className="flex min-h-12 items-center gap-3 rounded-control border border-border px-4 text-small font-medium text-ink transition-colors hover:border-control-border hover:bg-surface-alt"
                >
                  <item.Icon className="text-brand-ink" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </section>
      )}
      {/* No marketing footer inside the product. Linear, Notion and Stripe (the stated
          references) all drop it once you are logged in; Privacy lives in Account. */}
    </div>
    </BillingProvider>
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
        <ViewTransition name="dashboard-route-trace" share="rq-dashboard-route-trace" default="none">
          <span aria-hidden="true" className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand" />
        </ViewTransition>
      )}
      <Icon className={active ? "text-brand-ink" : "text-muted"} />
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
function AccountFooter({ qaMode, active }: { qaMode: boolean; active: boolean }) {
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
  const tier = me ? (me.is_guest ? "Litos+ trial" : me.tier === "pro" || me.tier === "plus" ? "Litos+" : "Free") : null;

  return (
    <Link
      href={qaMode ? "/dashboard/settings?qa=1" : "/dashboard/settings"}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 border-t border-border px-4 py-3.5 transition-colors hover:bg-surface-alt ${active ? "bg-surface-alt" : ""}`}
    >
      {active && (
        <ViewTransition name="dashboard-route-trace" share="rq-dashboard-route-trace" default="none">
          <span aria-hidden="true" className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-brand" />
        </ViewTransition>
      )}
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
