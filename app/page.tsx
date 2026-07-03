import { Header } from "@/components/Header";
import {
  ContactListMockup,
  DraftMockup,
  ApplicationFormMockup,
  AtsChips,
  InboxMockup,
  ResumeFormatDemo,
  ResumeMatchDemo,
} from "@/components/Mockups";

const STORE_URL = "#"; // TODO: swap for the Chrome Web Store listing URL once Role Quick is published

const steps = [
  {
    n: "01",
    title: "Open the application",
    body: "On Lever, Greenhouse, Ashby, Workday, or LinkedIn. Role Quick detects the real application form, not just the job listing.",
  },
  {
    n: "02",
    title: "Get a tailored resume",
    body: "Built from your full experience bank, every role and bullet variant, matched to this posting's actual keywords.",
  },
  {
    n: "03",
    title: "Watch the form fill itself",
    body: "Name, contact info, links, work authorization, screening questions, the resume file. Every field, every platform.",
  },
  {
    n: "04",
    title: "Review, submit, and send",
    body: "You hit Submit yourself, always. Meanwhile a personalized outreach email to a real contact is already in your Gmail drafts.",
  },
];

const principles = [
  {
    title: "You always hit submit",
    body: "Role Quick fills every field and stops. It never clicks Submit, never auto-applies, and never touches an SSN, driver's license, or background-check field.",
  },
  {
    title: "Real humans, honestly labeled",
    body: "Verified, Likely, or LinkedIn-only. We never say Verified when we mean guessed, and we never say nobody's there when someone is.",
  },
  {
    title: "Legally sensitive fields stay yours",
    body: "Voluntary EEO disclosures default to decline-to-answer. Work authorization and citizenship are always asked, never inferred from your name or resume.",
  },
];

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm text-muted">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
        ✓
      </span>
      {children}
    </li>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pb-4 pt-20 text-center sm:pt-28">
          <p className="mx-auto mb-6 w-fit rounded-full border border-border bg-surface-alt px-3 py-1 text-xs text-muted">
            A Chrome extension that applies with you, not for you
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-6xl sm:leading-tight">
            Applying, in minutes.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-muted">
            Role Quick tailors your resume to the posting, fills out the
            entire application, and drafts a personalized email to a real
            recruiter or alum, the moment you open a job. You review, you
            submit, you send.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={STORE_URL}
              className="w-full rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
            >
              Add to Chrome, it&apos;s free
            </a>
            <a
              href="#how-it-works"
              className="w-full rounded-full border border-border px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-ink sm:w-auto"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-xs text-faint">
            No credit card. Every feature free, capped monthly, uncapped on Pro.
          </p>
          <div className="mt-8">
            <AtsChips />
          </div>
        </section>

        {/* Product mockup: the inbox this fills up */}
        <section id="product" className="px-6 pb-24 pt-12">
          <p className="mb-6 text-center text-sm font-medium text-muted">
            What starts showing up in your inbox
          </p>
          <InboxMockup />
        </section>

        {/* Trust strip */}
        <section className="border-y border-border bg-surface-alt">
          <div className="mx-auto max-w-4xl px-6 py-14 text-center">
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-ink sm:text-2xl">
              The average corporate role gets{" "}
              <span className="font-semibold">257 applications</span>, each
              one asking for a freshly tailored resume and forty fields
              re-typed from scratch. Role Quick does the repetitive part so
              you can spend your time on the one thing it never does for
              you: deciding to hit submit.
            </p>
          </div>
        </section>

        {/* Feature row A: resume */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink">
              Tailor your resume
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
              A resume tuned to this exact posting
            </h2>
            <ul className="mt-6 space-y-3 text-left">
              <Check>Built from your full experience bank, every role, project, and bullet variant you've ever written</Check>
              <Check>Claude selects and lightly rewrites the best-fit subset for this JD's real keywords</Check>
              <Check>Editable PDF, never locked, review it before it goes anywhere</Check>
            </ul>
          </div>

          <div className="mt-16">
            <p className="mb-6 text-center text-sm font-medium text-muted">
              From a messy pasted resume to Role Quick&apos;s format
            </p>
            <ResumeFormatDemo />
          </div>

          <div className="mt-16">
            <p className="mb-6 text-center text-sm font-medium text-muted">
              Optimized and ATS-matched to every job description you open
            </p>
            <ResumeMatchDemo />
          </div>
        </section>

        {/* Feature row B: autofill */}
        <section className="border-y border-border bg-surface-alt">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="grid grid-cols-1 items-center gap-14 sm:grid-cols-2">
              <div className="order-2 sm:order-1">
                <ApplicationFormMockup />
              </div>
              <div className="order-1 sm:order-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink">
                  Fill the whole application
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                  Every field, across five ATS platforms
                </h2>
                <ul className="mt-6 space-y-3">
                  <Check>Lever, Greenhouse, Ashby, Workday, and LinkedIn Easy Apply</Check>
                  <Check>Contact info, links, work authorization, and the resume file itself</Check>
                  <Check>Open-ended questions left blank, never guessed. It stops at Submit, always</Check>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Feature row C: outreach */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid grid-cols-1 items-center gap-14 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink">
                Reach a real human
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                While you're filling the form, an email is already drafting
              </h2>
              <ul className="mt-6 space-y-3">
                <Check>School alumni surfaced first, the highest-reply persona</Check>
                <Check>A confidence tier on every contact, never a hidden guess</Check>
                <Check>Ready to review and send from your own Gmail, nothing sent for you</Check>
              </ul>
            </div>
            <ContactListMockup />
          </div>
        </section>

        {/* Draft detail */}
        <section className="border-t border-border bg-surface-alt">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="grid grid-cols-1 items-center gap-14 sm:grid-cols-2">
              <div className="order-2 sm:order-1">
                <DraftMockup />
              </div>
              <div className="order-1 sm:order-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink">
                  Draft it for you
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                  A draft that sounds like you, not a template
                </h2>
                <ul className="mt-6 space-y-3">
                  <Check>Grounded in your actual resume, not generic filler</Check>
                  <Check>100-140 words, one clear ask, no AI throat-clearing</Check>
                  <Check>Ready to review and send from your own Gmail</Check>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
            From open tab to submitted application, in four steps
          </h2>
          <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step.n} className="flex gap-5">
                <span className="text-2xl font-semibold text-faint">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-lg font-medium text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-border bg-surface-alt">
          <div className="mx-auto max-w-5xl px-6 py-24">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
              Built to be trusted, not just used once
            </h2>
            <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {principles.map((p) => (
                <div
                  key={p.title}
                  className="rounded-[20px] border border-border bg-surface p-6"
                >
                  <h3 className="text-base font-medium text-ink">{p.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-4xl px-6 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
            Every feature is free. Pro just removes the caps.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted">
            No feature is paywalled, ever. Resume tailoring, application
            autofill, and outreach are all on the free tier, with monthly
            allowances that reset on the 1st.
          </p>
          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-[20px] border border-border bg-surface p-8">
              <h3 className="text-sm font-medium uppercase tracking-[0.08em] text-faint">
                Free
              </h3>
              <p className="mt-3 text-4xl font-semibold text-ink">$0</p>
              <ul className="mt-6 space-y-3">
                <Check>30 verified contacts / month</Check>
                <Check>60 outreach drafts / month</Check>
                <Check>20 tailored resumes / month</Check>
                <Check>Full application autofill, all five ATS platforms</Check>
              </ul>
            </div>
            <div className="rounded-[20px] border-2 border-brand bg-surface p-8">
              <h3 className="text-sm font-medium uppercase tracking-[0.08em] text-brand-ink">
                Pro
              </h3>
              <p className="mt-3 text-4xl font-semibold text-ink">
                $49.99
                <span className="text-base font-normal text-faint"> / mo</span>
              </p>
              <ul className="mt-6 space-y-3">
                <Check>500 verified contacts / month</Check>
                <Check>1,000 outreach drafts / month</Check>
                <Check>Unlimited tailored resumes</Check>
                <Check>Everything in Free, uncapped</Check>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border bg-surface-alt">
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink">
              Open your next application. Let it do the rest.
            </h2>
            <a
              href={STORE_URL}
              className="mt-8 inline-block rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Add to Chrome, it&apos;s free
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-faint sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Role Quick</span>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-muted">
              Privacy
            </a>
            <a href="mailto:mehekman@usc.edu" className="hover:text-muted">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
