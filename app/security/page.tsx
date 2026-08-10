import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Security",
  description: "What Litos can verify about its current security posture, and what it cannot yet claim.",
};

const items = [
  ["Certifications", "Litos does not currently claim SOC 2, ISO 27001, HIPAA, or any other security certification."],
  ["Encryption", "The production website is served over HTTPS. Litos does not currently publish an independently verified specification for encryption at rest, so we do not claim one here."],
  ["Data residency", "Litos does not currently offer a customer-selectable data region or publish a verified data-residency commitment."],
  ["Access controls", "Litos does not currently publish an audited access-control report. Requests to access or delete account data follow the process described in the Privacy policy."],
  ["Independent testing", "Litos has not published a third-party penetration test or independent security audit."],
  ["Incident record", "There are no public security incident disclosures listed as of 10 August 2026. This is a disclosure record, not an uptime or no-incident claim."],
] as const;

export default function SecurityPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-20 pt-32">
        <p className="text-label text-faint">Security statement</p>
        <h1 className="mt-3 text-section text-ink">What we can verify.</h1>
        <p className="mt-5 text-body text-muted">
          This page states the current limits plainly. Missing evidence is not replaced with a badge, promise, or implied control.
        </p>
        <dl className="mt-12 divide-y divide-border border-y border-border">
          {items.map(([term, detail]) => (
            <div key={term} className="py-6">
              <dt className="text-heading text-ink">{term}</dt>
              <dd className="mt-2 text-body text-muted">{detail}</dd>
            </div>
          ))}
        </dl>
        <section className="mt-10" aria-labelledby="report-security">
          <h2 id="report-security" className="text-heading text-ink">Report a vulnerability.</h2>
          <p className="mt-2 text-body text-muted">
            Litos does not operate a bug bounty. Use the <a href="/contact" className="underline underline-offset-4 hover:text-ink">contact form</a> and choose Technical problem. Do not include secrets, passwords, or private account data in the first message.
          </p>
        </section>
        <p className="mt-10 text-machine text-muted">Statement dated 10 August 2026</p>
      </main>
      <SiteFooter />
    </div>
  );
}
