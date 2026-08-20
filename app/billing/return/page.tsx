"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/app/Button";
import { ErrorNote, LoadingOrb } from "@/components/app/ui";
import {
  api,
  ApiError,
  createBillingPortal,
  getBillingReceipt,
  type BillingReceipt,
  type Me,
} from "@/lib/api";
import { isSafeBillingPortalUrl } from "@/lib/billing";
import { retryPremiumActionThroughExtension, verifyExtensionCheckoutReturn } from "@/lib/extension-bridge";
import {
  billingReturnContext,
  billingReturnVerdict,
  consumePendingBillingAction,
  forgetBillingReturnContext,
  getBillingState,
  reconcileBillingCheckout,
  getBillingOffer,
  readPendingBillingAction,
} from "@/features/billing";
import styles from "./receipt.module.css";

declare global {
  interface Window {
    ttq?: { track: (event: string, params?: Record<string, unknown>) => void };
  }
}

type Result =
  | { kind: "active"; me: Me; receipt: BillingReceipt | null }
  | { kind: "extension_active"; actionReady: boolean }
  | { kind: "extension_pending" }
  | { kind: "cancelled" }
  | { kind: "mismatch" }
  | { kind: "timeout" };

type ReceiptStage = "processing" | "printing" | "complete";

const receiptToothCount = 40;
const receiptToothDepth = 4;
const receiptToothPoints = Array.from(
  { length: receiptToothCount * 2 },
  (_, index) => {
    const x = 100 - ((index + 1) * 100) / (receiptToothCount * 2);
    const y = index % 2 === 0 ? "100%" : `calc(100% - ${receiptToothDepth}px)`;
    return `${x}% ${y}`;
  },
).join(", ");
const receiptClipPath = `polygon(0 0, 100% 0, 100% calc(100% - ${receiptToothDepth}px), ${receiptToothPoints})`;

const receiptStatus: Record<ReceiptStage, string> = {
  processing: "Processing your payment",
  printing: "Printing your receipt",
  complete: "Payment complete",
};

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
  const cadence = receipt.interval === "weekly" || receipt.interval === "week"
    ? "Every week"
    : receipt.interval === "quarter"
      ? "Every three months"
      : "Every month";
  const [stage, setStage] = useState<ReceiptStage>("processing");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      queueMicrotask(() => setStage("complete"));
      return;
    }

    let finishPrinting: number | undefined;
    const startPrinting = window.setTimeout(() => {
      setStage("printing");
      finishPrinting = window.setTimeout(() => setStage("complete"), 1750);
    }, 650);
    return () => {
      window.clearTimeout(startPrinting);
      if (finishPrinting !== undefined) window.clearTimeout(finishPrinting);
    };
  }, []);

  return (
    <div
      className={styles.stage}
      aria-label={`Litos+ payment receipt for ${amount}`}
      data-receipt-stage={stage}
    >
      <div className={styles.halo} aria-hidden="true" />
      <div className={styles.printer}>
        <div className={styles.printerHeader}>
          <div className={styles.status} role="status" aria-live="polite">
            <span className={stage === "complete" ? styles.statusComplete : styles.statusSpinner} aria-hidden="true">
              {stage === "complete" && (
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="10" cy="10" r="8" fill="currentColor" />
                  <path d="m6.5 10.2 2.1 2.1 4.9-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span key={stage} className={styles.statusLabel}>{receiptStatus[stage]}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-white">
              <Image src="/brand/litos-mark.svg" width={18} height={18} alt="" />
            </span>
            <span className="text-sm font-medium">Litos</span>
          </div>
        </div>
        <div className={styles.screen}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-label uppercase tracking-[0.08em] text-white/55">Litos+</p>
              <p className="mt-1 text-sm text-white/80">{cadence}</p>
            </div>
            <p className="font-mono text-heading tabular-nums">{amount}</p>
          </div>
        </div>
        <div className={styles.slot} aria-hidden="true" />
      </div>

      <div className={styles.paperWindow}>
        <article
          className={`${styles.paper} ${stage === "printing" ? styles.paperPrinting : ""} ${stage === "complete" ? styles.paperComplete : ""}`}
          style={{ clipPath: receiptClipPath }}
          aria-hidden={stage !== "complete"}
        >
          <div className="flex items-center justify-between border-b border-dashed border-border pb-5">
            <Image src="/brand/litos-logo.svg" width={76} height={24} alt="Litos" />
            <span className="font-mono text-label uppercase tracking-[0.08em] text-positive">Confirmed</span>
          </div>

          <div className="space-y-3 py-5 font-mono text-machine">
            <div className="flex justify-between gap-4"><span className="text-muted">Plan</span><span>Litos+</span></div>
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
        </article>
      </div>
    </div>
  );
}

export default function BillingReturnPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [resumeHref, setResumeHref] = useState("/dashboard");
  const [actionNonce, setActionNonce] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [extensionRetryBusy, setExtensionRetryBusy] = useState(false);
  const [extensionRetryComplete, setExtensionRetryComplete] = useState(false);
  const conversionFired = useRef(false);
  useEffect(() => {
    if (conversionFired.current) return;
    if (result?.kind !== "active" && result?.kind !== "extension_active") return;
    conversionFired.current = true;
    const receipt = result.kind === "active" ? result.receipt : null;
    window.ttq?.track("CompletePayment", receipt
      ? { value: receipt.amount_cents / 100, currency: receipt.currency.toUpperCase(), content_id: receipt.plan, content_type: "product" }
      : {});
  }, [result]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const context = params.get("context");
    const status = params.get("status") ?? "returned";
    const extensionReturn = params.get("surface") === "extension";
    let stopped = false;
    const storedContext = extensionReturn ? null : billingReturnContext(context);
    const nonceFromUrl = params.get("action_nonce") ?? params.get("action");
    const nonce = nonceFromUrl || storedContext?.actionNonce || null;
    const fallbackRoute = context === "tailor_resume"
      ? "/dashboard/applications?new=1"
      : context === "outreach_draft"
        ? "/dashboard/outreach"
        : context === "automatic_submission"
          ? "/dashboard/settings#automation"
          : storedContext?.returnRoute ?? "/dashboard";
    queueMicrotask(() => {
      setOfferId(context);
      setActionNonce(nonce);
      setResumeHref(fallbackRoute);
    });
    if (nonce && !extensionReturn) {
      void readPendingBillingAction(nonce)
        .then((action) => {
          if (!stopped && !storedContext) setResumeHref(action.return_route);
        })
        .catch(() => null);
    }
    if (["cancelled", "canceled", "cancel"].includes(status)) {
      if (extensionReturn) void verifyExtensionCheckoutReturn({ status, context, actionNonce: nonce });
      queueMicrotask(() => setResult({ kind: "cancelled" }));
      return;
    }
    if (extensionReturn) {
      void (async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const reply = await verifyExtensionCheckoutReturn({ status, context, actionNonce: nonce });
          if (stopped) return;
          if (reply?.ok === true
            && reply.active === true
            && (reply.access_class === "plus_paid" || reply.access_class === "legacy_paid")) {
            setResult({ kind: "extension_active", actionReady: reply.action_ready === true });
            return;
          }
          if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 1200));
        }
        if (!stopped) setResult({ kind: "extension_pending" });
      })();
      return () => { stopped = true; };
    }
    void (async () => {
      if (!context || !storedContext) {
        setResult({ kind: "mismatch" });
        return;
      }
      /* ASK STRIPE BEFORE WAITING TO BE TOLD.
         The loop below polls OUR database, which only learns about a purchase when
         the webhook lands. That assumed the webhook would arrive inside seven
         seconds. It can lag the redirect, be retried for minutes after a 5xx, or
         never arrive at all if its signing secret is wrong -- and the student is
         already here, having just handed over a card. One reconcile turns the
         common case into a first-attempt hit and the broken-webhook case from a
         permanent dead end into a resolved purchase.
         Deliberately not awaited into a branch: it never throws, and the poll
         below remains the fallback for anything it could not settle. */
      await reconcileBillingCheckout(context);
      if (stopped) return;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const [offerResult, state, me] = await Promise.all([
          getBillingOffer(context).catch((reason) => reason),
          getBillingState().catch(() => null),
          api<Me>("/me").catch(() => null),
        ]);
        if (stopped) return;
        const verdict = billingReturnVerdict({
          expectedAccountId: storedContext.accountId,
          offerStatus: offerResult instanceof Error ? null : offerResult.status,
          state,
        });
        if (verdict === "mismatch") {
          setResult({ kind: "mismatch" });
          return;
        }
        if (offerResult instanceof ApiError && offerResult.status === 404) {
          setResult({ kind: "mismatch" });
          return;
        }
        if (
          verdict === "active"
          && me
        ) {
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

  async function resumeOriginalAction() {
    if (!actionNonce) {
      window.location.assign(resumeHref);
      return;
    }
    setResumeBusy(true);
    setResumeError(null);
    try {
      const action = await consumePendingBillingAction(actionNonce);
      forgetBillingReturnContext(offerId);
      window.location.assign(resumeHref === "/dashboard" ? action.return_route : resumeHref);
    } catch (reason) {
      setResumeError(reason instanceof Error ? reason.message : "Your plan is active, but this saved action could not be reopened.");
      setResumeBusy(false);
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    setPortalError(null);
    try {
      const portal = await createBillingPortal();
      if (!isSafeBillingPortalUrl(portal.url, portal.provider)) throw new Error("Billing portal returned an unsafe URL.");
      window.location.assign(portal.url);
    } catch (reason) {
      setPortalError(reason instanceof Error ? reason.message : "Billing portal is temporarily unavailable.");
      setPortalBusy(false);
    }
  }

  async function retryExtensionAction() {
    if (!actionNonce) {
      setResumeError("The extension could not match this checkout to a saved action. Return to the application tab and start it again.");
      return;
    }
    setExtensionRetryBusy(true);
    setResumeError(null);
    try {
      await retryPremiumActionThroughExtension(actionNonce);
      setExtensionRetryComplete(true);
    } catch (reason) {
      setResumeError(reason instanceof Error ? reason.message : "The extension could not reopen that action. Try again from the application tab.");
    } finally {
      setExtensionRetryBusy(false);
    }
  }

  if (result === null) {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><LoadingOrb label="Confirming payment with Litos" /><p className="mt-3 text-small text-muted">Keep this page open while your plan updates.</p></div></main>;
  }

  if (result.kind === "cancelled") {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><p className="text-label text-muted">Checkout closed</p><h1 className="mt-3 text-section text-ink">Nothing was charged.</h1><p className="mt-4 text-body text-muted">Your plan is unchanged and your work is saved.</p><ButtonLink href={resumeHref} variant="secondary" className="mt-6">Return to your work</ButtonLink></div></main>;
  }

  if (result.kind === "timeout") {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><ErrorNote message="Payment could not be confirmed yet. Do not pay again until you check your plan or billing portal." /><div className="mt-6 flex flex-wrap gap-3"><ButtonLink href="/dashboard/settings#plan">Check plan</ButtonLink><ButtonLink href="/contact" variant="secondary">Contact support</ButtonLink></div></div></main>;
  }

  if (result.kind === "mismatch") {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><ErrorNote message="This checkout belongs to a different Litos account or could not be matched to the saved offer." /><p className="mt-4 text-small text-muted">Sign in with the account that opened checkout, then return here. No saved action was consumed.</p><div className="mt-6"><ButtonLink href="/login?intent=billing-return">Switch account</ButtonLink></div></div></main>;
  }

  if (result.kind === "extension_pending") {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><ErrorNote message="We could not confirm the extension account yet. Open Litos and refresh Plan." /><p className="mt-4 text-small text-muted">The website did not use a different browser account as confirmation. Do not purchase again.</p><div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={() => window.location.reload()}>Check again</Button><ButtonLink href="/install" variant="secondary">Extension help</ButtonLink></div></div></main>;
  }

  if (result.kind === "extension_active") {
    return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border bg-surface p-7 shadow-rest"><p className="text-label text-positive">Payment confirmed</p><h1 className="mt-3 text-section text-ink">Litos+ is active in the extension.</h1><p className="mt-4 text-body text-muted">The purchase was verified with the account signed in to the Litos extension. Return to your application tab and open the extension to continue.</p>{resumeError && <div className="mt-4"><ErrorNote message={resumeError} /></div>}{result.actionReady && <div className="mt-6"><Button type="button" disabled={extensionRetryBusy || extensionRetryComplete} aria-busy={extensionRetryBusy} onClick={() => void retryExtensionAction()}>{extensionRetryBusy ? "Opening..." : extensionRetryComplete ? "Action opened" : "Retry last action"}</Button><p className="mt-3 text-small text-muted">Litos will reopen the saved action only after this click. It will not run automatically.</p></div>}</div></main>;
  }

  return (
    <main className="min-h-svh bg-surface-alt px-6 py-12 sm:py-20">
      <div className="mx-auto grid w-full max-w-[66rem] items-center gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
        <section className="max-w-lg">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-positive">Payment confirmed</p>
          <h1 className="mt-4 text-section font-[450] text-ink">You&apos;re on Litos+.</h1>
          <p className="mt-5 text-body text-muted">Your access was verified from the exact paid offer and Litos account record. The receipt records the exact amount Stripe confirmed for this subscription.</p>
          {!result.receipt && <div className="mt-5"><ErrorNote message="Your plan is active, but the receipt details are still syncing. The secure billing portal has the confirmed amount." /></div>}
          {(portalError || resumeError) && <div className="mt-5"><ErrorNote message={resumeError ?? portalError!} /></div>}
          <div className="mt-7 flex flex-wrap gap-3">
            <Button type="button" disabled={resumeBusy} aria-busy={resumeBusy} onClick={() => void resumeOriginalAction()}>{resumeBusy ? "Opening..." : "Resume your action"}</Button>
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
