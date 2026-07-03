const STORE_URL = "#"; // TODO: swap for the Chrome Web Store listing URL once Role Quick is published under this name

const steps = [
  {
    n: "01",
    title: "Land on a role",
    body: "Open any job posting, or paste the link. Role Quick reads the company and title, nothing else.",
  },
  {
    n: "02",
    title: "See the right humans",
    body: "Alumni from your school, near-peers, hiring managers, recruiters, ranked by who actually replies. Each with a confidence tier, never a guess dressed up as certain.",
  },
  {
    n: "03",
    title: "Get a draft that sounds like you",
    body: "One sentence of real context, a hook grounded in your resume, one clear ask. 100-140 words, not a template.",
  },
  {
    n: "04",
    title: "Review, then send",
    body: "It lands as a Gmail draft in your own account. You read it, you send it. Nothing goes out without you.",
  },
];

const principles = [
  {
    title: "Real humans, honestly labeled",
    body: "Verified, Likely, or LinkedIn-only. We never say Verified when we mean guessed, and we never say nobody's there when someone is.",
  },
  {
    title: "Alumni first",
    body: "A shared school is the single highest-converting opener in cold outreach. Role Quick surfaces your school's alumni at the company before anyone else.",
  },
  {
    title: "You send, always",
    body: "Every email is queued as a draft in your own Gmail. Nothing is auto-sent, nothing is bulk-blasted from a shared domain.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <header className="w-full border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="text-sm font-semibold tracking-tight text-white">
            Role Quick
          </span>
          <a
            href={STORE_URL}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:border-white/30 hover:text-white"
          >
            Add to Chrome
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-24 text-center sm:pt-32">
          <p className="mx-auto mb-6 w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
            A Chrome extension for job hunting the way that actually works
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-6xl sm:leading-tight">
            Stop applying into the void.
            <br />
            Email the right person instead.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-neutral-400">
            Role Quick finds the recruiters, hiring managers, and alumni behind
            any job posting, then drafts a short, personalized email grounded
            in your resume. It lands in your Gmail drafts in under a minute.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={STORE_URL}
              className="w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-950 transition-colors hover:bg-neutral-200 sm:w-auto"
            >
              Add to Chrome — it's free
            </a>
            <a
              href="#how-it-works"
              className="w-full rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-white/30 hover:text-white sm:w-auto"
            >
              See how it works
            </a>
          </div>
          <p className="mt-5 text-xs text-neutral-500">
            No credit card. 25-40 verified contacts a month, free, forever.
          </p>
        </section>

        {/* Problem */}
        <section className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl px-6 py-16 text-center">
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-neutral-300 sm:text-2xl">
              The average corporate role gets{" "}
              <span className="text-white">257 applications</span>. Over half
              of employers <span className="text-white">never respond</span>{" "}
              at all. The students who get interviews aren&apos;t applying
              more, they&apos;re reaching the right person directly.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
            From job posting to sent email, in four steps
          </h2>
          <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step.n} className="flex gap-5">
                <span className="text-2xl font-semibold text-neutral-600">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-lg font-medium text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl px-6 py-24">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
              Built to be trusted, not just used once
            </h2>
            <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {principles.map((p) => (
                <div
                  key={p.title}
                  className="rounded-2xl border border-white/10 p-6"
                >
                  <h3 className="text-base font-medium text-white">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-400">
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
            Free to find. Pay only if you outreach a lot.
          </h2>
          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 p-8">
              <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
                Free
              </h3>
              <p className="mt-3 text-4xl font-semibold text-white">$0</p>
              <ul className="mt-6 space-y-3 text-sm text-neutral-400">
                <li>7 days of full access to start</li>
                <li>25-40 verified contacts + drafts / month after</li>
                <li>Alumni, recruiter, and hiring-manager discovery</li>
                <li>Resume-grounded draft generation</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/[0.03] p-8">
              <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-300">
                Unlimited
              </h3>
              <p className="mt-3 text-4xl font-semibold text-white">
                $19.99
                <span className="text-base font-normal text-neutral-500">
                  {" "}
                  / mo
                </span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-neutral-300">
                <li>Everything in Free, uncapped</li>
                <li>Bulk outreach across roles</li>
                <li>Automated follow-up drafts</li>
                <li>Deeper alumni-graph targeting</li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Your next reply is one email away.
            </h2>
            <a
              href={STORE_URL}
              className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-950 transition-colors hover:bg-neutral-200"
            >
              Add to Chrome — it's free
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-neutral-500 sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Role Quick</span>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-neutral-300">
              Privacy
            </a>
            <a href="mailto:mehekman@usc.edu" className="hover:text-neutral-300">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
