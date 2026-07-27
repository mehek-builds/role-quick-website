import type { Metadata } from "next";
import { Header } from "@/components/Header";

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

        <div className="mt-12">
          <Row h="Where Simplify is better, and it is not close">
            Coverage. Simplify autofills across Workday, Lever, Greenhouse and
            thousands of other boards, and it has been doing it at scale for
            years. Litos fills forms on Greenhouse, Lever, Ashby, Workday and
            LinkedIn, and can press send on three of those. If you are applying
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

          <Row h="Where Litos is different">
            Litos rebuilds the resume rather than swapping keywords into it, and
            the rebuild is the thing it is judged on. Forty-five real resumes
            from five university career centres were run through it, chosen to be
            awkward: federal and military prose, nursing, social work,
            biochemistry, music performance. They exposed thirteen defects, which
            were fixed.
          </Row>

          <Row h="What happens at the send button">
            Litos fills the form and stops. Sending stays off until you turn it
            on, and then you get 15 seconds to stop it. Emails are never sent
            without an explicit press. That is a deliberate design choice rather
            than a missing feature, and if you want something that applies to
            hundreds of roles unattended, Litos is the wrong tool and says so.
          </Row>

          <Row h="What each one costs">
            Both are free to install and free to use at ordinary volume, and both
            have paid tiers beyond that. Litos publishes its{" "}
            <a
              href="/terms"
              className="underline decoration-border underline-offset-2 hover:text-ink"
            >
              terms, cancellation and refund policy
            </a>{" "}
            in one place before you pay. Compare that with whatever you are
            considering, whichever way it comes out.
          </Row>

          <Row h="How to choose">
            Pick Simplify if you are applying broadly across many different
            company sites and you want the widest coverage available. Pick Litos
            if the resume itself is where your applications are dying, and you
            want to see and approve everything before it goes anywhere.
          </Row>
        </div>

        <p className="mt-12 text-xs leading-6 text-faint">
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
      </main>
    </div>
  );
}
