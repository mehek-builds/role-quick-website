"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/app/Button";
import { ErrorNote, LoadingOrb } from "@/components/app/ui";
import { api, type Me } from "@/lib/api";

type Result = { kind: "active"; me: Me } | { kind: "cancelled" } | { kind: "timeout" };

export default function BillingReturnPage() {
  const [result, setResult] = useState<Result | null>(null);
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
  return <main className="mx-auto flex min-h-svh w-full max-w-xl items-center px-6 py-20"><div className="w-full rounded-card border border-border p-7">{result === null ? <><LoadingOrb label="Confirming payment with Litos" /><p className="mt-3 text-sm text-muted">Keep this page open while the account refreshes.</p></> : result.kind === "active" ? <><p className="text-label text-positive">Payment confirmed</p><h1 className="mt-3 text-section text-ink">Pro is active.</h1><p className="mt-4 text-body text-muted">Your plan was verified from the Litos account record. {result.me.billing_portal_url ? <a href={result.me.billing_portal_url} className="underline underline-offset-4">Open the billing portal for the charged amount, receipt, payment method, and next billing date.</a> : "Contact support for a receipt or billing detail."}</p><ButtonLink href="/dashboard" className="mt-6">Continue to dashboard</ButtonLink></> : result.kind === "cancelled" ? <><p className="text-label text-muted">Checkout closed</p><h1 className="mt-3 text-section text-ink">No payment was confirmed.</h1><p className="mt-4 text-body text-muted">Your existing plan remains unchanged.</p><ButtonLink href="/dashboard/settings#plan" variant="secondary" className="mt-6">Return to plan</ButtonLink></> : <><ErrorNote message="Payment could not be confirmed yet. Do not pay again until you check your plan or billing portal." /><div className="mt-6 flex gap-3"><ButtonLink href="/dashboard/settings#plan">Check plan</ButtonLink><ButtonLink href="/contact" variant="secondary">Contact support</ButtonLink></div></>}</div></main>;
}
