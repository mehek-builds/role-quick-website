import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Litos vs Simplify",
  description:
    "An honest comparison, including where Simplify is the better choice. Both autofill job applications; they are not built to do the same thing.",
};

/* Comparison content, audit finding F48.
 *
 * Teal and LoopCV both publish these and rank for them. Litos published none,
 * so every "Litos vs X" search was answered by somebody else, usually a
 * competitor with an affiliate link.
 *
 * SOURCING RULE, and it is the whole reason this page can exist safely: every
 * claim about Simplify below was verified FIRST-HAND on 2026-07-27, on their own
 * surfaces, during the ten-product audit (vault:
 * competitor-flow-audit-2026-07-27/01-simplify-YES.md and -NO.md). Their store
 * listing and their homepage, read directly.
 *
 * Deliberately NOT stated here, despite being in the audit: their pricing and
 * their refund terms. Both came from third-party review sites rather than from
 * Simplify's own pages, which I could not reach. Publishing a competitor's
 * commercial terms on second-hand sourcing is how a comparison page becomes a
 * legal problem, and the argument does not need them.
 *
 * The page names where Simplify WINS, first and without hedging. A comparison
 * that only says "we are better" is the pattern the audit found in every
 * competitor's version of this page, and readers discount it on sight. It also
 * has to survive Litos being the smaller product, which it currently is.
 *
 * No user counts for Litos, per the social-proof gate. Simplify's are quoted
 * because they publish them. */

function Row({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-7">
      <h2 className="text-[15px] font-medium text-ink">{h}</h2>
      <div className="mt-2 max-w-[62ch] text-base leading-7 text-muted">{children}</div>
    </div>
  );
}

export default function LitosVsSimplify() {
  const comparison = [
    ["Application form coverage", "Greenhouse, Lever, Ashby, Workday, and LinkedIn", "Workday, Lever, Greenhouse, and thousands of other boards"],
    ["Tailored resume", "Rebuilds a resume for the posting", "Offers resume customization tools"],
    ["Application sending", "Off by default; opt-in sending includes a 15-second stop window in the extension", "Designed for broad application autofill"],
    ["Outreach", "Drafts outreach for the user to send", "Not the deciding capability documented in the sources used for this page"],
    ["Published install base", "Not published", "Publishes extension and job-seeker counts"],
  ] as const;
  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-6 pb-28 pt-32">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Comparison
        </p>
        <h1 className="mt-3 text-section font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
          Litos vs Simplify.
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-7 text-muted">
          Both fill in job applications for you. They are not trying to do the
          same thing, and for a lot of people Simplify is the right answer.
          Here is how to tell which one you are.
        </p>

        <section className="mt-12" aria-labelledby="comparison-table-title">
          <h2 id="comparison-table-title" className="text-heading text-ink">The decision points.</h2>
          <div className="mt-5 overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[680px] border-collapse text-left text-small">
              <caption className="sr-only">Feature comparison between Litos and Simplify, sourced 27 July 2026</caption>
              <thead className="bg-surface-alt text-ink"><tr><th scope="col" className="px-4 py-3 font-medium">Capability</th><th scope="col" className="px-4 py-3 font-medium">Litos</th><th scope="col" className="px-4 py-3 font-medium">Simplify</th></tr></thead>
              <tbody className="divide-y divide-border text-muted">{comparison.map(([capability, litos, simplify]) => <tr key={capability}><th scope="row" className="px-4 py-4 align-top font-medium text-ink">{capability}</th><td className="px-4 py-4 align-top leading-6">{litos}</td><td className="px-4 py-4 align-top leading-6">{simplify}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 text-machine text-muted">Source check: 27 July 2026</p>
        </section>

        <div className="mt-12">
          <Row h="Where Simplify is better, and it is not close">
            Coverage. Simplify autofills across Workday, Lever, Greenhouse and
            thousands of other boards, and it has been doing it at scale for
            years. Litos fills forms on Greenhouse, Lever, Ashby, Workday and
            LinkedIn, and can press send on Greenhouse, Lever, Ashby and SmartRecruiters. If you are applying
            across a wide spread of company career sites, Simplify will fill in
            more of them than Litos will.
          </Row>

          <Row h="They are also much bigger">
            Simplify publishes 500,000 extension users and says over a million
            job seekers use it. Litos does not publish a user count, because it
            does not have one worth publishing yet. If a large install base is
            what makes you trust a tool with your resume, that is a reasonable
            thing to weigh, and it points at them.
          </Row>

          {/* The "forty-five real resumes from five university career centres"
              sentence came out 2026-07-28, with the same line on the homepage
              and for the same reason (Mehek's call): it is our QA process, not
              the reader's decision. On a comparison page it is worse than on the
              homepage, because the question here is which tool to pick and how
              many fixtures we regression-tested against does not answer it.

              It stays on /for-career-centres, deliberately and not by
              oversight. That page exists to answer "has this been tested on
              resumes like our students'?", which is the one audience for whom
              the number IS the answer. */}
          <Row h="Where Litos is different">
            Litos rebuilds the resume rather than swapping keywords into it, and
            the rebuild is the thing it is judged on.
          </Row>

          <Row h="What happens at the send button">
            Litos fills the form and stops. Sending stays off until you turn it
            on, and then you get 15 seconds to stop it. Emails are never sent
            without an explicit press. That is a deliberate design choice rather
            than a missing feature, and if you want something that applies to
            hundreds of roles unattended, Litos is the wrong tool and says so.
          </Row>

          <Row h="How to choose">
            Pick Simplify if you are applying broadly across many different
            company sites and you want the widest coverage available. Pick Litos
            if the resume itself is where your applications are dying, and you
            want to see and approve everything before it goes anywhere.
          </Row>
        </div>

        <p className="mt-12 text-xs leading-6 text-muted">
          Everything stated here about Simplify was read on their own website and
          Chrome Web Store listing on 27 July 2026, and may have changed since.
          Litos has no affiliation with Simplify. If something here is wrong or
          out of date,{" "}
          <a
            href="/contact"
            className="underline decoration-border underline-offset-2 hover:text-muted"
          >
            tell us
          </a>{" "}
          and it gets corrected.
        </p>
        <section className="mt-12 rounded-card bg-brand-soft px-6 py-8" aria-labelledby="compare-next-step">
          <h2 id="compare-next-step" className="text-heading text-ink">See whether Litos fits your search.</h2>
          <p className="mt-2 text-body text-muted">Try the workflow with a job posting, or browse the roles Litos has already found.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/try" className="rounded-full bg-action px-6 py-3 text-sm font-medium text-action-ink transition-colors hover:bg-brand-ink">Try Litos</a>
            <a href="/browse-jobs" className="rounded-full border border-border bg-white px-6 py-3 text-sm font-medium text-ink hover:bg-surface-alt">Browse jobs</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
