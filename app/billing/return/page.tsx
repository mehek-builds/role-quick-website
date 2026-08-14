"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/app/Button";
import { ErrorNote, LoadingOrb } from "@/components/app/ui";
import { api, createBillingPortal, type Me } from "@/lib/api";
import { isStripePortalUrl } from "@/lib/billing";

type Result = { kind: "active"; me: Me } | { kind: "cancelled" } | { kind: "timeout" };

export default function BillingReturnPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("status") === "cancelled") { queueMicrotask(() => setResult({ kind: "cancelled" })); return; }
    let stopped = false;
    void (async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const me = await api<Me>("/me").catch(() => null);
        if (stopped) return;
        if (me?.tier === "pro" && ["active", "trialing"].includes((me.billing_status ?? "active").toLowerCase())) { setResult({ kind: "active", me }); return; }
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

  return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border p-7">{result === null ? <><LoadingOrb label="Confirming payment with Litos" /><p className="mt-3 text-sm text-muted">Keep this page open while the account refreshes.</p></> : result.kind === "active" ? <><p className="text-label text-positive">Payment confirmed</p><h1 className="mt-3 text-section text-ink">Pro is active.</h1><p className="mt-4 text-body text-muted">Your plan was verified from the Litos account record. The Stripe billing portal shows the charged amount, receipt, payment method, and next billing date.</p>{portalError && <ErrorNote message={portalError} />}<div className="mt-6 flex flex-wrap gap-3"><Button type="button" disabled={portalBusy || !result.me.billing_portal_available} onClick={() => void openPortal()}>{portalBusy ? "Opening..." : "Open billing portal"}</Button><ButtonLink href="/dashboard" variant="secondary">Continue to dashboard</ButtonLink></div></> : result.kind === "cancelled" ? <><p className="text-label text-muted">Checkout closed</p><h1 className="mt-3 text-section text-ink">No payment was confirmed.</h1><p className="mt-4 text-body text-muted">Your existing plan remains unchanged.</p><ButtonLink href="/dashboard/settings#plan" variant="secondary" className="mt-6">Return to plan</ButtonLink></> : <><ErrorNote message="Payment could not be confirmed yet. Do not pay again until you check your plan or billing portal." /><div className="mt-6 flex gap-3"><ButtonLink href="/dashboard/settings#plan">Check plan</ButtonLink><ButtonLink href="/contact" variant="secondary">Contact support</ButtonLink></div></>}</div></main>;
}
