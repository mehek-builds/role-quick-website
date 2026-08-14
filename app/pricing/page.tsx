import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { PlanCards } from "@/components/pricing/PlanCards";
import { FeatureMatrix } from "@/components/pricing/FeatureMatrix";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Application filling stays free. Compare the 7-day Litos+ trial and weekly, monthly, or three-month Litos+ access.",
};

const FAQ = [
  ["What stays free?", "Application filling in the dashboard and on supported sites is unlimited. Job search, tracking, receipts, your profile, and access to work you already created also stay free."],
  ["What happens after my 7-day trial?", "Your account moves to Free. You can keep filling applications and using your existing work. New tailored resumes, cover letters, generated answers, contacts, drafts, insights, and sending without being asked each time require Litos+."],
  ["What is included in the trial?", "You can create 5 tailored resumes, 5 cover letters, and generated answers for 5 applications. Independently, for each of up to 5 represented companies, you can find up to 2 contacts and create up to 2 outreach drafts. Each trial generation requires an explicit click."],
  ["Do the paid terms include different features?", "No. One week, one month, and three months include the same Litos+ tools. Only the access period and price change."],
  ["Does hovering generate anything?", "Only an active paid plan may start tailoring when you hover over an eligible job card. Free and trial accounts must choose Tailor resume, so hovering never consumes trial usage. Sending without being asked each time is a separate opt-in setting."],
  ["Can I cancel?", "Yes. Manage or cancel from Account. Your paid access continues through the end of the current term."],
  ["What happens to my documents if I do not upgrade?", "They stay in your account. You can view, edit, download, copy, or delete work you already created."],
  ["What happens to an existing account?", "Existing Free accounts keep their original recurring allowance of 20 tailored resumes, 30 contacts, and 60 drafts, plus unlimited filling. Existing paid access is preserved. An existing active trial keeps its current expiry and allowances, then moves to the original Free plan."],
] as const;

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <Header />
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-36 sm:pb-20 sm:pt-44">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_0.62fr]">
            <div>
              <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Simple terms for an active search.</p>
              <h1 className="mt-5 max-w-3xl text-display font-[450] text-ink">Choose the length of your search.</h1>
              <p className="mt-6 max-w-2xl text-body text-muted">Every Litos+ plan includes the same tools. Pay only for the time you need.</p>
              <p className="mt-3 text-small font-medium text-teal-ink">Application filling stays free.</p>
            </div>
            <div className="rounded-card border border-border bg-surface p-5 shadow-rest" aria-label="Application packet workflow">
              <div className="flex items-center justify-between border-b border-border pb-3 font-mono text-label uppercase tracking-[0.08em] text-muted">
                <span>Application packet</span><span>Ready when you are</span>
              </div>
              <ol className="mt-4 space-y-3 text-small">
                <li className="flex items-center gap-3"><span className="h-px w-7 bg-teal" /><span className="text-teal-ink">Fill the employer form</span><span className="ml-auto font-mono text-label text-muted">Free</span></li>
                <li className="flex items-center gap-3"><span className="h-px w-7 bg-brand" /><span className="text-brand-ink">Tailor the documents</span><span className="ml-auto font-mono text-label text-muted">Litos+</span></li>
                <li className="flex items-center gap-3"><span className="h-px w-7 bg-coral" /><span className="text-coral-ink">Reach the right people</span><span className="ml-auto font-mono text-label text-muted">Litos+</span></li>
              </ol>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24"><PlanCards /></section>

        <section className="border-y border-border bg-surface-alt/55 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Every feature</p>
            <h2 className="mt-4 text-section font-[450] text-ink">Free, trial, and Litos+.</h2>
            <p className="mt-3 max-w-2xl text-body text-muted">The same comparison powers pricing, Account, and every contextual Litos+ prompt.</p>
            <div className="mt-10"><FeatureMatrix /></div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-24">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Questions</p>
          <h2 className="mt-4 text-section font-[450] text-ink">The terms, plainly.</h2>
          <div className="mt-8 rounded-card border border-border px-6">
            {FAQ.map(([question, answer], index) => (
              <details key={question} open={index === 0} className="group border-b border-border last:border-0">
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 text-heading font-[450] text-ink [&::-webkit-details-marker]:hidden">
                  {question}<span aria-hidden="true" className="font-mono text-small text-faint group-open:rotate-45">+</span>
                </summary>
                <p className="pb-6 pr-8 text-body text-muted">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
