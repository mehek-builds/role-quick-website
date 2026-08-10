import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Cookies and browser storage",
  description: "The cookies and browser storage Litos uses, why they exist, and how to control them.",
};

const rows = [
  ["Litos session values", "Local storage", "Keeps you signed in and remembers whether the session is verified or a guest session.", "Until sign-out, account deletion, or browser-site data is cleared.", "Litos"],
  ["Guest and setup values", "Local or session storage", "Keeps a guest identifier, setup choices, and short-lived connection intent on this browser.", "Until the related flow ends, sign-out, or browser-site data is cleared.", "Litos"],
  ["Recent job-title searches", "Local storage", "Keeps up to five job-title searches on this browser so you can run them again. It does not store location or sponsorship filters.", "Until you clear the list or browser-site data.", "Litos"],
  ["rq_try", "Cookie", "Keeps the public Try flow attached to one browser session.", "Up to 24 hours.", "Litos"],
  ["PostHog identifiers", "Cookie or local storage", "Counts page visits and the limited product actions described in the Privacy policy. Automatic form capture and session recording are off.", "Set by PostHog according to its browser SDK defaults, or until browser-site data is cleared.", "PostHog"],
] as const;

export default function CookiesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-32">
        <p className="text-label text-faint">Legal</p>
        <h1 className="mt-3 text-section text-ink">Cookies and browser storage.</h1>
        <p className="mt-5 max-w-2xl text-body text-muted">
          Litos uses browser storage for sign-in and product continuity. Analytics runs only when its deployment configuration is present. There is no advertising-cookie program.
        </p>
        <div className="mt-10 overflow-x-auto rounded-card border border-border">
          <table className="min-w-[760px] w-full border-collapse text-left text-small">
            <caption className="sr-only">Litos cookie and browser-storage inventory</caption>
            <thead className="bg-surface-alt text-ink"><tr>{["Item", "Type", "Purpose", "Lifetime", "Provider"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border text-muted">{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell} className="px-4 py-4 align-top leading-6">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <section className="mt-10" aria-labelledby="cookie-control">
          <h2 id="cookie-control" className="text-heading text-ink">Your controls.</h2>
          <div className="mt-3 space-y-3 text-body text-muted">
            <p>You can block or clear cookies and site data in your browser settings. Blocking required local storage can prevent sign-in, setup, and saved browser preferences from working.</p>
            <p>Litos does not currently provide an in-product analytics switch. Browser privacy controls and content blockers can prevent PostHog requests. To ask for linked analytics data to be deleted, use <a className="underline underline-offset-4 hover:text-ink" href="/contact">Contact</a> or delete your Litos account.</p>
          </div>
        </section>
        <p className="mt-10 text-machine text-faint">Effective 10 August 2026</p>
      </main>
      <SiteFooter />
    </div>
  );
}
