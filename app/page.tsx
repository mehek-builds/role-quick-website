import { Header } from "@/components/Header";
import { ContactListMockup, DraftMockup, ResumeMockup } from "@/components/Mockups";

const STORE_URL = "#"; // TODO: swap for the Chrome Web Store listing URL once Role Quick is published

const steps = [
  {
    n: "01",
    title: "Land on a role",
    body: "Open any job posting, or paste the link. Role Quick reads the company and title, nothing else.",
  },
  {
    n: "02",
    title: "See the right humans",
    body: "Alumni from your school, near-peers, hiring managers, recruiters, ranked by who actually replies.",
  },
  {
    n: "03",
    title: "Get a draft that sounds like you",
    body: "One sentence of real context, a hook grounded in your resume, one clear ask. 100-140 words.",
  },
  {
    n: "04",
    title: "Review, then send",
    body: "It lands as a Gmail draft in your own account. You read it, you send it.",
  },
];

const principles = [
  {
    title: "Real humans, honestly labeled",
    body: "Verified, Likely, or LinkedIn-only. We never say Verified when we mean guessed, and we never say nobody's there when someone is.",
  },
  {
    title: "Alumni first",
    body: "A shared school is the single highest-converting opener in cold outreach. Role Quick surfaces your school's alumni before anyone else.",
  },
  {
    title: "You send, always",
    body: "Every email is queued as a draft in your own Gmail. Nothing is auto-sent, nothing is bulk-blasted from a shared domain.",
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
            A Chrome extension for job hunting the way that actually works
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-6xl sm:leading-tight">
            Stop applying into the void.
            <br />
            Email the right person instead.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-muted">
            Role Quick finds the recruiters, hiring managers, and alumni behind
            any job posting, then drafts a short, personalized email grounded
            in your resume. Into your Gmail drafts in under a minute.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={STORE_URL}
              className="w-full rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
            >
              Add to Chrome — it&apos;s free
            </a>
            <a
              href="#how-it-works"
              className="w-full rounded-full border border-border px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-ink sm:w-auto"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-xs text-faint">
            No credit card. 25-40 verified contacts a month, free, forever.
          </p>
        </section>

        {/* Product mockup */}
        <section id="product" className="mx-auto max-w-lg px-6 pb-24 pt-12">
          <ContactListMockup />
        </section>

        {/* Trust strip */}
        <section className="border-y border-border bg-surface-alt">
          <div className="mx-auto max-w-4xl px-6 py-14 text-center">
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-ink sm:text-2xl">
              The average corporate role gets{" "}
              <span className="font-semibold">257 applications</span>. Over
              half of employers <span className="font-semibold">never respond</span>.
              The students who get interviews aren&apos;t applying more,
              they&apos;re reaching the right person directly.
            </p>
          </div>
        </section>

        {/* Feature row A: contacts */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid grid-cols-1 items-center gap-14 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink">
                Find the humans
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                See who actually reads applications
              </h2>
              <ul className="mt-6 space-y-3">
                <Check>School alumni surfaced first, the highest-reply persona</Check>
                <Check>A confidence tier on every contact, never a hidden guess</Check>
                <Check>Recruiters, hiring managers, and team members, ranked by reply rate</Check>
              </ul>
            </div>
            <ContactListMockup />
          </div>
        </section>

        {/* Feature row B: draft */}
        <section className="border-y border-border bg-surface-alt">
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

        {/* Feature row C: resume */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid grid-cols-1 items-center gap-14 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink">
                Tailor your resume
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                A resume tuned to the posting, in seconds
              </h2>
              <ul className="mt-6 space-y-3">
                <Check>Pulls the role&apos;s real keywords into your existing resume</Check>
                <Check>Fills the application form for you, you review before submit</Check>
                <Check>Works across Lever, Greenhouse, Ashby, LinkedIn, and Workday</Check>
              </ul>
            </div>
            <ResumeMockup />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-border bg-surface-alt">
          <div className="mx-auto max-w-5xl px-6 py-24">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
              From job posting to sent email, in four steps
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
          </div>
        </section>

        {/* Principles */}
        <section className="mx-auto max-w-5xl px-6 py-24">
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
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-border bg-surface-alt">
          <div className="mx-auto max-w-4xl px-6 py-24">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-ink">
              Free to find. Pay only if you outreach a lot.
            </h2>
            <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-[20px] border border-border bg-surface p-8">
                <h3 className="text-sm font-medium uppercase tracking-[0.08em] text-faint">
                  Free
                </h3>
                <p className="mt-3 text-4xl font-semibold text-ink">$0</p>
                <ul className="mt-6 space-y-3">
                  <Check>7 days of full access to start</Check>
                  <Check>25-40 verified contacts + drafts / month after</Check>
                  <Check>Alumni, recruiter, and hiring-manager discovery</Check>
                  <Check>Resume-grounded draft generation</Check>
                </ul>
              </div>
              <div className="rounded-[20px] border-2 border-brand bg-surface p-8">
                <h3 className="text-sm font-medium uppercase tracking-[0.08em] text-brand-ink">
                  Unlimited
                </h3>
                <p className="mt-3 text-4xl font-semibold text-ink">
                  $19.99
                  <span className="text-base font-normal text-faint"> / mo</span>
                </p>
                <ul className="mt-6 space-y-3">
                  <Check>Everything in Free, uncapped</Check>
                  <Check>Bulk outreach across roles</Check>
                  <Check>Automated follow-up drafts</Check>
                  <Check>Deeper alumni-graph targeting</Check>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-ink">
            Your next reply is one email away.
          </h2>
          <a
            href={STORE_URL}
            className="mt-8 inline-block rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add to Chrome — it&apos;s free
          </a>
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
