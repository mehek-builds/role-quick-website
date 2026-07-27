import { Header } from "@/components/Header";

export const metadata = {
  title: "Terms",
};

/* Terms of service, including the refund policy.
 *
 * WHY THIS PAGE EXISTS AT ALL: Litos takes subscription payments through Lemon
 * Squeezy and, until this file, published no terms anywhere. There was no
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
 *   2. Lemon Squeezy is the merchant of record. Its seller terms require
 *      accurate, available refund terms, and it processes the refunds. Burying
 *      them risks the payment account, which costs more than any refund.
 *   3. DESIGN.md's Guardrails are explicit: no dark patterns, and cancelling
 *      takes the same clicks as signing up. This is the same rule.
 *
 * What the policy DOES do, which is what the ask was actually for: refunds are
 * request-only rather than self-serve, they need a written reason, the window
 * is short, and dissatisfaction with generated output is excluded by name. That
 * is a strict policy, stated plainly, which is a different thing from a hidden
 * one. It is in the Terms and the footer, not on the marketing page.
 */

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
            Litos is free to install and free to use at the volume most people
            apply at. Beyond that it is a paid subscription, billed on a
            recurring basis until you cancel.
          </p>
          <p>
            Lemon Squeezy handles payments and is the merchant of record. Litos
            never sees or stores your card number.
          </p>
          <p>
            Prices, what each plan includes, and the renewal period are shown on
            the checkout page before you pay, and in Settings once you have
            subscribed.
          </p>
        </Section>

        <Section title="Cancelling">
          <p>
            Cancel any time. It takes the same number of clicks as signing up,
            and the link is in your receipt email and in Settings.
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
    </div>
  );
}
