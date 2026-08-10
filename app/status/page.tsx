import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "System status", description: "Where to check Litos service status and report a problem." };

const components = ["Website", "API", "Managed application runs", "Application email", "Billing"];

export default function StatusPage() {
  const independent = process.env.NEXT_PUBLIC_STATUS_PAGE_URL;
  return (
    <div className="flex min-h-screen flex-col"><Header /><main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-20 pt-32">
      <p className="text-label text-faint">System status</p><h1 className="mt-3 text-section text-ink">Check before retrying.</h1>
      {independent ? <p className="mt-5 text-body text-muted">Live updates, incident history, maintenance notices, uptime measurements, and subscriptions are published on the <a href={independent} className="font-medium text-brand-ink underline underline-offset-4">independent Litos status page</a>.</p> : <div className="mt-5 rounded-inner bg-warn-soft px-4 py-3 text-sm leading-6 text-warn"><strong className="font-medium">Independent status reporting is not configured.</strong> This page does not claim live health or uptime. If a product surface is failing, use Contact rather than treating this list as an all-clear.</div>}
      <h2 className="mt-10 text-heading text-ink">Components covered.</h2><ul className="mt-4 divide-y divide-border border-y border-border">{components.map((item) => <li key={item} className="flex items-center justify-between gap-4 py-4"><span className="text-sm text-ink">{item}</span><span className="text-machine text-faint">See status host</span></li>)}</ul>
      <div className="mt-8 flex gap-4"><a href="/contact" className="font-medium text-brand-ink underline underline-offset-4">Report a problem</a><a href="mailto:support@trylitos.com" className="text-muted underline underline-offset-4">Email support</a></div>
    </main><SiteFooter /></div>
  );
}
