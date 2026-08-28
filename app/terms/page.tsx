import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Terms",
};

/* Terms of service, including the refund policy.
 *
 * WHY THIS PAGE EXISTS AT ALL: Litos takes subscription payments through
 * Stripe and, until this file, published no terms anywhere. There was no
 * refund policy, no cancellation terms, and no page for a buyer to read before
 * paying. That is an exposure independent of any product decision.
 *
 * WHERE THE REFUND POLICY LIVES, AND WHY IT IS NOT HIDDEN. Mehek's ask was to
 * bury it so a subscriber barely knows a refund can be requested. It is not
 * buried, and the reason is written down here so nobody re-opens it by accident:
 *
 *   1. Subscription terms have to be disclosed before billing details are
 *      taken. US ROSCA and the FTC's negative-option rule say clearly and
 *      conspicuously; California's ARL says the same and USC students are the
 *      core audience. Hiding material terms is the thing those rules name.
 *   2. Stripe's services agreement requires accurate, available refund terms,
 *      and refunds are issued through it. Burying them risks the payment
 *      account, which costs more than any refund. This reason survived the
 *      move off Lemon Squeezy on 2026-07-29; only the processor changed, and
 *      with it the merchant of record, which is now Litos rather than the
 *      processor. See the open tax question in the vault before writing any
 *      VAT or sales-tax claim into this page.
 *   3. DESIGN.md's Guardrails are explicit: no dark patterns, and cancelling
 *      takes the same clicks as signing up. This is the same rule.
 *
 * What the policy DOES do, which is what the ask was actually for: refunds are
 * request-only rather than self-serve, they need a written reason, the window
 * is short, and dissatisfaction with generated output is excluded by name. That
 * is a strict policy, stated plainly, which is a different thing from a hidden
 * one. It is in the Terms and the footer, not on the marketing page.
 */

/* Bump BOTH on any material change, in the same PR as the change itself.
   TERMS_VERSION is what a backend should store against an account when
   acceptance is recorded, the same shape the product already uses for
   automatic_submission_consent_version. Recording it server-side is the
   remaining half of this and lives in the backend repo: the clickwrap on the
   sign-in screen forms the agreement, and storing the version is what proves
   which text a given account accepted. */
const TERMS_VERSION = "2026-08-28";
const TERMS_EFFECTIVE = "28 August 2026";

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-28">
      <h2 className="text-lg font-medium tracking-tight text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-[680px] flex-1 px-6 pb-28 pt-32">
        <h1 className="text-section font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
          Terms
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted">
          Plain terms for using Litos. If something here is unclear, ask, and it
          gets rewritten rather than explained.
        </p>
        {/* Version and date in the machine voice, because this is the part that
            has to be citable later. A contract nobody can pin to a date is hard
            to rely on in either direction. TERMS_VERSION is the string a
            backend should store against an account when acceptance is recorded;
            see the note in the Agreement section. */}
        <p className="mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          Version {TERMS_VERSION} &middot; In effect {TERMS_EFFECTIVE}
        </p>

        <Section title="Agreeing to this" id="agreement">
          <p>
            This is the agreement between you and Litos. You accept it when you
            create an account, which includes continuing with Google and
            choosing to look around without signing up. The sign-in screen says
            so next to the button that does it.
          </p>
          <p>
            If you do not accept it, do not create an account. You can still read
            everything here and try the{" "}
            <a
              href="/try"
              className="text-ink underline decoration-border underline-offset-2"
            >
              demo
            </a>
            , which needs no account and stores nothing you type.
          </p>
          <p>
            Where a term below conflicts with a right the law gives you, the law
            wins and the rest of this still stands.
          </p>
        </Section>

        <Section title="What Litos is">
          <p>
            A Chrome extension and a web dashboard. You open a job posting and
            Litos tailors your resume to it, fills in the application, and drafts
            an email to someone at the company. You review before anything is
            sent.
          </p>
          <p>
            Litos is a tool, not an agent acting for you and not a guarantee of
            anything. It does not promise interviews, offers, or that a form was
            received.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            One account per person, and the answers in it should be true. Litos
            fills applications with what you give it, and a false answer on a job
            application is your problem, not the tool&rsquo;s.
          </p>
          <p>
            Do not use Litos to apply on someone else&rsquo;s behalf, to
            mass-apply to roles you have no interest in, or in a way that
            breaches a job board&rsquo;s own terms. Accounts doing that get
            closed.
          </p>
        </Section>

        <Section title="Paying">
          <p>
            Litos Free includes unlimited factual application filling on
            supported sites and from the web dashboard. You review the filled
            form and use the employer site&apos;s final submit control. Tailored
            resumes, generated cover letters and answers, contact discovery,
            outreach drafts, and sending without being asked each time require trial or
            Litos+ access.
          </p>
          <p>
            Eligible first-time accounts may start a seven-day Litos+ trial
            after adding a supported payment method in Stripe Checkout. Before
            Checkout opens, Litos shows whether a trial applies and the amount
            due. Returning accounts may owe the selected plan price immediately.
            The trial includes five tailored resumes, five cover letters,
            generated answers for five applications, and up to two contacts and
            two outreach drafts per company across five companies. Trial
            generation starts only when you choose the relevant action.
          </p>
          <p>
            Litos+ costs $19.99 for one week, $39.99 for one month, or $89.99
            for three months. Each subscription renews for the same period at
            the same total until you cancel. The three-month option is marked
            most popular. Current prices and the full comparison are always
            available on the{" "}
            <a
              href="/pricing"
              className="text-ink underline decoration-border underline-offset-2"
            >
              Pricing page
            </a>
            .
          </p>
          <p>
            Stripe handles payments. Litos never sees or stores your card
            number.
          </p>
          <p>
            The selected price, renewal period, and cancellation terms are
            shown before you enter Stripe Checkout, again in Checkout before
            you confirm a payment method, and in Account after you subscribe.
            Unless you cancel before an eligible trial ends, the selected
            subscription begins at the regular price and renewal period shown
            before Checkout. Taxes and accepted promotions may change the final
            amount Stripe displays.
          </p>
        </Section>

        <Section title="Cancelling">
          <p>
            Cancel any time. It takes the same number of clicks as signing up,
            and the link is in Settings.
          </p>
          <p>
            Cancelling stops the next charge. It does not end the period you have
            already paid for: you keep everything until that period runs out, and
            then the account drops to the free plan. Nothing is deleted because
            you cancelled.
          </p>
        </Section>

        <Section title="Refunds" id="refunds">
          <p>
            Refunds are considered by request, within{" "}
            <strong className="text-ink">14 days</strong> of a charge. They are
            not automatic and there is no self-serve refund button.
          </p>
          <p>
            To request one, use the{" "}
            <a
              href="/contact"
              className="text-ink underline decoration-border underline-offset-2"
            >
              contact form
            </a>{" "}
            and choose &ldquo;Refund request&rdquo;. Include the email address on
            the account and the reason you are asking. A request without a reason
            cannot be assessed and will be answered with a question rather than a
            decision.
          </p>
          <p className="text-ink">What does not qualify:</p>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <strong className="text-ink">
                Not being happy with what the AI wrote.
              </strong>{" "}
              Every resume, answer and email is shown to you before it is used or
              sent, and it can be edited or thrown away. Output you reviewed and
              chose to use is not a defect. This is stated plainly because it is
              the most common request and it is easier to read it here than to be
              told later.
            </li>
            <li>Not getting interviews, replies, or an offer.</li>
            <li>Forgetting to cancel before a renewal you had notice of.</li>
            <li>
              Changing your mind after using the paid features for the period in
              question.
            </li>
          </ul>
          <p className="text-ink">What usually does qualify:</p>
          <ul className="ml-4 list-disc space-y-2">
            <li>Being charged twice for the same period.</li>
            <li>Being charged after cancelling.</li>
            <li>
              A fault on our side that stopped you using what you paid for, and
              that we could not fix.
            </li>
          </ul>
          <p>
            Where the law gives you a stronger right than this section, the law
            wins. Nothing here removes a statutory right, including the
            withdrawal period available to consumers in the UK and EU.
          </p>
        </Section>

        <Section title="Your data">
          <p>
            What Litos reads, how long it keeps it, and how to export or delete
            all of it is in the{" "}
            <a
              href="/privacy"
              className="text-ink underline decoration-border underline-offset-2"
            >
              privacy policy
            </a>
            . The short version: only the job page you are on, resume files
            deleted after 30 days, everything exportable and deletable on
            request, and nothing sold.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            These terms will change as the product does. Material changes to
            pricing, cancellation or refunds get an email to the address on your
            account before they take effect, not a silent edit to this page.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about any of this go through the{" "}
            <a
              href="/contact"
              className="text-ink underline decoration-border underline-offset-2"
            >
              contact form
            </a>
            .
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
