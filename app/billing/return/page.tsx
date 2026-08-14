"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/app/Button";
import { ErrorNote, LoadingOrb } from "@/components/app/ui";
import {
  api,
  createBillingPortal,
  getBillingReceipt,
  type BillingReceipt,
  type Me,
} from "@/lib/api";
import { isStripePortalUrl } from "@/lib/billing";
import styles from "./receipt.module.css";

type Result =
  | { kind: "active"; me: Me; receipt: BillingReceipt | null }
  | { kind: "cancelled" }
  | { kind: "timeout" };

function money(receipt: BillingReceipt) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: receipt.currency,
  }).format(receipt.amount_cents / 100);
}

function receiptDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function PrintedReceipt({ receipt }: { receipt: BillingReceipt }) {
  const amount = money(receipt);
  const cadence = receipt.interval === "weekly" ? "Every week" : "Every month";
  return (
    <div className={styles.stage} aria-label={`Litos Pro payment receipt for ${amount}`}>
      <div className={styles.halo} aria-hidden="true" />
      <div className={styles.printer}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-white">
              <Image src="/brand/litos-mark.svg" width={18} height={18} alt="" />
            </span>
            <span className="text-sm font-medium">Litos</span>
          </div>
          <span className="rounded-full border border-white/25 px-2.5 py-1 font-mono text-label uppercase tracking-[0.08em] text-white/85">Paid</span>
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-label uppercase tracking-[0.08em] text-white/65">Pro plan</p>
            <p className="mt-1 text-sm text-white/80">{cadence}</p>
          </div>
          <p className="font-mono text-heading tabular-nums">{amount}</p>
        </div>
        <div className={styles.slot} aria-hidden="true" />
      </div>

      <div className={styles.paperWindow}>
        <div className={styles.paper}>
          <div className="flex items-center justify-between border-b border-dashed border-border pb-5">
            <Image src="/brand/litos-logo.svg" width={76} height={24} alt="Litos" />
            <span className="font-mono text-label uppercase tracking-[0.08em] text-positive">Confirmed</span>
          </div>

          <div className="space-y-3 py-5 font-mono text-machine">
            <div className="flex justify-between gap-4"><span className="text-muted">Plan</span><span>Litos Pro</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted">Billing</span><span>{cadence}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted">Paid</span><span className="text-right">{receiptDate(receipt.paid_at)}</span></div>
            {receipt.reference && <div className="flex justify-between gap-4"><span className="text-muted">Reference</span><span>{receipt.reference}</span></div>}
          </div>

          <div className="flex items-center justify-between border-y border-dashed border-border py-4">
            <span className="font-mono text-label uppercase tracking-[0.08em] text-muted">Total paid</span>
            <span className="font-mono text-heading tabular-nums">{amount}</span>
          </div>

          <div className="pt-6 text-center">
            <div className={styles.barcode} aria-hidden="true" />
            <p className="mt-3 font-mono text-label uppercase tracking-[0.08em] text-muted">Your job search, moving.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingReturnPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("status") === "cancelled") {
      queueMicrotask(() => setResult({ kind: "cancelled" }));
      return;
    }
    let stopped = false;
    void (async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const me = await api<Me>("/me").catch(() => null);
        if (stopped) return;
        if (me?.tier === "pro" && ["active", "trialing"].includes((me.billing_status ?? "active").toLowerCase())) {
          const receipt = await getBillingReceipt().catch(() => null);
          if (!stopped) setResult({ kind: "active", me, receipt });
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
      if (!stopped) setResult({ kind: "timeout" });
    })();
    return () => { stopped = true; };
  }, []);

  async function openPortal() {
    setPortalBusy(true);
    setPortalError(null);
    try {
      const portal = await createBillingPortal();
      if (!isStripePortalUrl(portal.url)) throw new Error("Billing portal returned an unsafe URL.");
      window.location.assign(portal.url);
    } catch (reason) {
      setPortalError(reason instanceof Error ? reason.message : "Billing portal is temporarily unavailable.");
      setPortalBusy(false);
    }
  }

  if (result === null) {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><LoadingOrb label="Confirming payment with Litos" /><p className="mt-3 text-small text-muted">Keep this page open while your plan updates.</p></div></main>;
  }

  if (result.kind === "cancelled") {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><p className="text-label text-muted">Checkout closed</p><h1 className="mt-3 text-section text-ink">No payment was confirmed.</h1><p className="mt-4 text-body text-muted">Your existing plan remains unchanged.</p><ButtonLink href="/dashboard/settings#plan" variant="secondary" className="mt-6">Return to plan</ButtonLink></div></main>;
  }

  if (result.kind === "timeout") {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><ErrorNote message="Payment could not be confirmed yet. Do not pay again until you check your plan or billing portal." /><div className="mt-6 flex flex-wrap gap-3"><ButtonLink href="/dashboard/settings#plan">Check plan</ButtonLink><ButtonLink href="/contact" variant="secondary">Contact support</ButtonLink></div></div></main>;
  }

  return (
    <main className="min-h-svh bg-surface-alt px-6 py-12 sm:py-20">
      <div className="mx-auto grid w-full max-w-[66rem] items-center gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
        <section className="max-w-lg">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-positive">Payment confirmed</p>
          <h1 className="mt-4 text-section font-[450] text-ink">You&apos;re on Litos Pro.</h1>
          <p className="mt-5 text-body text-muted">Your plan is active and ready to use. The receipt records the exact amount Stripe confirmed for this subscription.</p>
          {!result.receipt && <div className="mt-5"><ErrorNote message="Your plan is active, but the receipt details are still syncing. The secure billing portal has the confirmed amount." /></div>}
          {portalError && <div className="mt-5"><ErrorNote message={portalError} /></div>}
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/dashboard">Continue to dashboard</ButtonLink>
            <Button type="button" variant="secondary" disabled={portalBusy || !result.me.billing_portal_available} onClick={() => void openPortal()}>{portalBusy ? "Opening..." : "Open billing portal"}</Button>
          </div>
          {result.receipt?.renews_at && <p className="mt-5 font-mono text-machine text-muted">Next billing date: {new Date(result.receipt.renews_at).toLocaleDateString()}.</p>}
        </section>
        <section aria-live="polite">
          {result.receipt ? <PrintedReceipt receipt={result.receipt} /> : <div className="mx-auto flex min-h-80 max-w-sm items-center justify-center rounded-card border border-border bg-surface p-8 shadow-rest"><p className="text-center text-small text-muted">Receipt details are syncing.</p></div>}
        </section>
      </div>
    </main>
  );
}
