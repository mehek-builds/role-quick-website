"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/app/Button";
import { ErrorNote, LoadingOrb } from "@/components/app/ui";
import { api, ApiError, createBillingPortal, type Me } from "@/lib/api";
import { isSafeBillingPortalUrl } from "@/lib/billing";
import { retryPremiumActionThroughExtension, verifyExtensionCheckoutReturn } from "@/lib/extension-bridge";
import {
  billingReturnContext,
  billingReturnVerdict,
  consumePendingBillingAction,
  forgetBillingReturnContext,
  getBillingState,
  getBillingOffer,
  readPendingBillingAction,
} from "@/features/billing";

type Result =
  | { kind: "active"; me: Me }
  | { kind: "extension_active"; actionReady: boolean }
  | { kind: "extension_pending" }
  | { kind: "cancelled" }
  | { kind: "mismatch" }
  | { kind: "timeout" };

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
          setResult({ kind: "active", me });
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

  return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border p-7">{result === null ? <><LoadingOrb label="Confirming payment with Litos" /><p className="mt-3 text-sm text-muted">Keep this page open while the account refreshes.</p></> : result.kind === "active" ? <><p className="text-label text-positive">Payment confirmed</p><h1 className="mt-3 text-section text-ink">Litos+ is active.</h1><p className="mt-4 text-body text-muted">Your access was verified from the exact paid offer and Litos account record. Stripe keeps the charged amount, receipt, payment method, and next billing date.</p>{(portalError || resumeError) && <ErrorNote message={resumeError ?? portalError!} />}<div className="mt-6 flex flex-wrap gap-3"><Button type="button" disabled={resumeBusy} aria-busy={resumeBusy} onClick={() => void resumeOriginalAction()}>{resumeBusy ? "Opening..." : "Resume your action"}</Button><Button type="button" variant="secondary" disabled={portalBusy || !result.me.billing_portal_available} onClick={() => void openPortal()}>{portalBusy ? "Opening..." : "Open billing portal"}</Button></div></> : result.kind === "extension_active" ? <><p className="text-label text-positive">Payment confirmed</p><h1 className="mt-3 text-section text-ink">Litos+ is active in the extension.</h1><p className="mt-4 text-body text-muted">The purchase was verified with the account signed in to the Litos extension. Return to your application tab and open the extension to continue.</p>{resumeError && <div className="mt-4"><ErrorNote message={resumeError} /></div>}{result.actionReady && <div className="mt-6"><Button type="button" disabled={extensionRetryBusy || extensionRetryComplete} aria-busy={extensionRetryBusy} onClick={() => void retryExtensionAction()}>{extensionRetryBusy ? "Opening..." : extensionRetryComplete ? "Action opened" : "Retry last action"}</Button><p className="mt-3 text-small text-muted">Litos will reopen the saved action only after this click. It will not run automatically.</p></div>}</> : result.kind === "extension_pending" ? <><ErrorNote message="We could not confirm the extension account yet. Open Litos and refresh Plan." /><p className="mt-4 text-small text-muted">The website did not use a different browser account as confirmation. Do not purchase again.</p><div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={() => window.location.reload()}>Check again</Button><ButtonLink href="/install" variant="secondary">Extension help</ButtonLink></div></> : result.kind === "cancelled" ? <><p className="text-label text-muted">Checkout closed</p><h1 className="mt-3 text-section text-ink">Nothing was charged.</h1><p className="mt-4 text-body text-muted">Your plan is unchanged and your work is saved.</p><ButtonLink href={resumeHref} variant="secondary" className="mt-6">Return to your work</ButtonLink></> : result.kind === "mismatch" ? <><ErrorNote message="This checkout belongs to a different Litos account or could not be matched to the saved offer." /><p className="mt-4 text-small text-muted">Sign in with the account that opened checkout, then return here. No saved action was consumed.</p><div className="mt-6"><ButtonLink href="/login?intent=billing-return">Switch account</ButtonLink></div></> : <><ErrorNote message="Payment could not be confirmed yet. Do not pay again until you check your plan or billing portal." /><div className="mt-6 flex gap-3"><ButtonLink href="/dashboard/settings#plan">Check plan</ButtonLink><ButtonLink href="/contact" variant="secondary">Contact support</ButtonLink></div></>}</div></main>;
}
