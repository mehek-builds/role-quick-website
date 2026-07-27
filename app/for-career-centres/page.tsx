import type { Metadata } from "next";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  /* No brand suffix: layout.tsx's template already appends it, and including
     one here rendered the tab as "For career centres: Litos: Litos". Caught in
     a screenshot, which is the only place a title bug is visible. */
  title: "For career centres",
  description:
    "What Litos does for students, what it costs them, and what it does with their data. Written for the people who get asked whether to recommend it.",
};

/* The career-services door (audit finding S42: five of ten competitors keep a
 * B2B entry in the nav, and Huntr's founder confirmed the consumer side feeds
 * it). Litos's version has to be honest about a thing the others can hide: there
 * is no institutional product. No seats, no advisor dashboard, no cohort
 * reporting, no contract. Saying so is the page's whole credibility, and it also
 * happens to be the fastest answer to the only question a career centre has,
 * which is whether recommending this creates work for them.
 *
 * Deliberately not in the main nav. The header carries one ask (Add to Chrome)
 * and the say-once rule is what keeps it doing that. This is a footer
 * destination for someone who came looking, not a second pitch aimed at
 * students. Promote it if the channel ever earns it.
 *
 * Nothing here is a number that is not already true and sourced: the 45 resumes
 * are from litos-onboarding-15-resume-run-2026-07-27.md, the retention terms are
 * /privacy, and the portal list is the real detectPortal allowlist. No user
 * counts, per the social-proof gate. */

function Row({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-7">
      <h2 className="text-[15px] font-medium text-ink">{q}</h2>
      <div className="mt-2 max-w-[62ch] text-base leading-7 text-muted">{children}</div>
    </div>
  );
}

export default function ForCareerCentres() {
  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-6 pb-28 pt-32">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          For career centres
        </p>
        <h1 className="mt-3 text-section font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
          Everything you would ask before recommending it.
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-7 text-muted">
          Litos is a free Chrome extension. A student opens a job posting and it
          tailors their resume to it, fills in the application, and drafts an
          email to a real person at the company. They review everything before
          anything is sent.
        </p>

        <div className="mt-12">
          <Row q="What does it cost a student?">
            Nothing to install and nothing to use at the volume most students
            apply at. There is a paid tier for heavier use. No card is needed to
            start and cancelling takes the same number of clicks as signing up.
          </Row>

          <Row q="What does it cost us?">
            Nothing, and there is nothing to set up. Litos has no institutional
            product: no seats to buy, no advisor dashboard, no cohort reporting,
            no contract, no data sharing back to a school. A student installs it
            themselves the same way they would install anything else. If you want
            one of those things, the honest answer today is that it does not
            exist, and it is worth telling us rather than assuming.
          </Row>

          <Row q="Does it write things the student did not do?">
            No. It only uses what is already in their resume. It reorders and
            rewrites their real work to match what a posting asks for, and it
            does not add a job, a skill or a number that was not there. Every
            change is visible before it goes out.
          </Row>

          <Row q="Does it apply to jobs on their behalf?">
            Only if they turn that on, and it is off by default. With it on,
            Litos still stops when an answer is missing, when two answers
            disagree, when a question is personal, or when a site asks them to
            prove they are human. When it does submit, they get 15 seconds to
            stop it. Emails are never sent without an explicit press.
          </Row>

          <Row q="What happens to their data?">
            Resume files Litos generates are deleted after 30 days. A student can
            export or delete everything by emailing us from their account
            address, and deleting removes all of it, including the resumes and
            the form history. Litos reads only the job page a student is on. It
            does not sell data.{" "}
            <a
              href="/privacy"
              className="underline decoration-border underline-offset-2 hover:text-ink"
            >
              The full policy
            </a>{" "}
            is written to be read, not to be survived.
          </Row>

          <Row q="Where does it actually work?">
            It fills forms on Greenhouse, Lever, Ashby, Workday and LinkedIn. It
            can submit on Greenhouse, Lever and Ashby. Anywhere else it fills the
            form in and the student presses send. That list is deliberately short
            and honest rather than a claim about thousands of sites.
          </Row>

          <Row q="Has it been tested on resumes like our students&rsquo;?">
            Forty-five real resumes from five university career centres were run
            through it, chosen to be awkward on purpose: federal and military
            prose, nursing, social work, criminal justice, biochemistry, music
            performance, graphic design. They found thirteen defects, which were
            fixed. Litos is not endorsed by any of those schools and does not
            claim to be.
          </Row>
        </div>

        <div className="mt-14 rounded-card border border-border bg-surface-alt px-7 py-8">
          <h2 className="text-[15px] font-medium text-ink">
            Ask something this page did not answer.
          </h2>
          <p className="mt-2 max-w-[58ch] text-base leading-7 text-muted">
            It is a small team and the reply comes from a person who built it.
          </p>
          <a
            href="mailto:mehekman@usc.edu?subject=Litos%20for%20career%20centres"
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Email us
          </a>
        </div>
      </main>
    </div>
  );
}
