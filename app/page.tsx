import { Header } from "@/components/Header";
import {
  ContactListMockup,
  ApplicationFormMockup,
  ResumeMatchDemo,
  PacketMockup,
} from "@/components/Mockups";
import { Reveal, CountUp } from "@/components/Motion";
import { STORE_URL } from "@/lib/config";

/* DESIGN.md v1.1: one idea per viewport, one line of copy where one line
   works, tonal pillar bands, motion that settles rather than loops (the
   receipt is the one looping element). */

const ATS_NAMES = ["Lever", "Greenhouse", "Ashby", "Workday", "LinkedIn"];

function PillarLabel({
  children,
  thread,
  tone,
}: {
  children: React.ReactNode;
  thread: string;
  tone: string;
}) {
  return (
    <p className={`flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${tone}`}>
      <span className={`h-0.5 w-4 rounded-full ${thread}`} />
      {children}
    </p>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <li className="text-[15px] leading-7 text-muted">{children}</li>;
}

const refusals = [
  { rule: "NO AUTO-SUBMIT", why: "Sent by you, always." },
  { rule: "NO STREAKS, NO BADGES", why: "You have enough pressure." },
  { rule: "NO FAKE DEADLINES", why: "Closing means closing." },
  { rule: "NO URGENCY COLOR", why: "Color is identity, not a push." },
  { rule: "NO GUESSED ANSWERS", why: "Blanks stay blank." },
];

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pt-24 text-center sm:pt-32">
          <Reveal>
            <h1 className="text-5xl font-[450] leading-[1.02] tracking-[-0.03em] text-ink sm:text-[76px]">
              Applying, <span className="text-brand-ink">in minutes.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-[440px] text-[17px] leading-[1.65] text-muted">
              It tailors your resume, fills the application, drafts the
              outreach. You hit submit.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={STORE_URL}
                className="w-full rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Add to Chrome, it&apos;s free
              </a>
              <a
                href="#product"
                className="w-full rounded-full border border-border px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-ink sm:w-auto"
              >
                See the product
              </a>
            </div>
            <p className="mt-4 text-xs text-faint">No credit card.</p>
            <div className="mt-14 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
              {ATS_NAMES.map((name) => (
                <span
                  key={name}
                  className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint"
                >
                  {name}
                </span>
              ))}
            </div>
          </Reveal>
        </section>

        <section id="product" className="px-6 pb-36 pt-16">
          <Reveal delay={150}>
            <PacketMockup />
          </Reveal>
        </section>

        {/* The number */}
        <section className="border-y border-border bg-surface-alt">
          <div className="mx-auto max-w-3xl px-6 py-32 text-center">
            <Reveal>
              <p className="font-mono text-7xl tracking-[-0.04em] text-ink sm:text-8xl">
                <CountUp to={257} />
              </p>
              <p className="mx-auto mt-6 max-w-sm text-base leading-7 text-muted">
                applications per corporate role. We do the repetitive part.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Documents */}
        <section className="border-t border-border bg-brand-soft/50">
          <div className="mx-auto max-w-5xl px-6 py-36">
            <Reveal>
              <div className="mx-auto max-w-[560px] text-center">
                <div className="flex justify-center">
                  <PillarLabel thread="bg-brand" tone="text-brand-ink">Documents</PillarLabel>
                </div>
                <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                  A resume tuned to this posting.
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-muted">
                  Your experience bank, matched to the JD. Editable, always.
                </p>
              </div>
              <div className="mt-16">
                <ResumeMatchDemo />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Autofill */}
        <section className="border-t border-border bg-teal-soft/50">
          <div className="mx-auto max-w-6xl px-6 py-36">
            <Reveal>
              <div className="grid grid-cols-1 items-center gap-14 sm:grid-cols-2">
                <div className="order-2 sm:order-1">
                  <ApplicationFormMockup />
                </div>
                <div className="order-1 sm:order-2">
                  <PillarLabel thread="bg-teal" tone="text-teal-ink">Autofill</PillarLabel>
                  <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                    Every field, filled.
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-muted">
                    All five platforms. Workday included.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Outreach */}
        <section className="border-t border-border bg-coral-soft/50">
          <div className="mx-auto max-w-6xl px-6 py-36">
            <Reveal>
              <div className="grid grid-cols-1 items-center gap-14 sm:grid-cols-2">
                <div>
                  <PillarLabel thread="bg-coral" tone="text-coral-ink">Outreach</PillarLabel>
                  <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                    A real person, already drafted.
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-muted">
                    Alumni first. Waiting in your Gmail drafts.
                  </p>
                </div>
                <ContactListMockup />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Guardrails */}
        <section className="border-y border-border bg-surface-alt">
          <div className="mx-auto max-w-2xl px-6 py-36">
            <Reveal>
              <h2 className="text-center text-[32px] font-[450] tracking-[-0.02em] text-ink">
                What we refuse to do.
              </h2>
              <div className="mt-12 rounded-[20px] border border-border bg-surface">
                {refusals.map((r, i) => (
                  <div
                    key={r.rule}
                    className={`flex flex-wrap items-baseline gap-x-4 px-6 py-4 ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span className="font-mono text-[13px] text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-mono text-[13px] tracking-[0.02em] text-ink">
                      {r.rule}
                    </span>
                    <span className="ml-auto text-[13px] text-muted">{r.why}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-4xl px-6 py-36">
          <Reveal>
            <h2 className="text-center text-[32px] font-[450] tracking-[-0.02em] text-ink">
              Every feature is free.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-center text-[15px] leading-7 text-muted">
              Allowances reset on the 1st.
            </p>
            <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-[20px] border border-border bg-surface p-8">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                  Free
                </p>
                <p className="mt-4 font-mono text-4xl tracking-[-0.02em] text-ink">$0</p>
                <ul className="mt-6 space-y-1">
                  <Line>30 contacts</Line>
                  <Line>60 drafts</Line>
                  <Line>20 resumes</Line>
                  <Line>Full autofill</Line>
                </ul>
                <a
                  href={STORE_URL}
                  className="mt-8 block rounded-full border border-border px-5 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-ink"
                >
                  Add to Chrome
                </a>
              </div>
              <div className="rounded-[20px] bg-brand-soft p-8">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
                    Pro
                  </p>
                  <span className="rounded-full bg-brand px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-white">
                    Removes all caps
                  </span>
                </div>
                <p className="mt-4 font-mono text-4xl tracking-[-0.02em] text-ink">
                  $49.99<span className="text-base text-muted"> / mo</span>
                </p>
                <ul className="mt-6 space-y-1">
                  <Line>500 contacts</Line>
                  <Line>1,000 drafts</Line>
                  <Line>Unlimited resumes</Line>
                  <Line>Cancel anytime, same clicks</Line>
                </ul>
                <a
                  href="/login"
                  className="mt-8 block rounded-full bg-brand px-5 py-2.5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Go Pro
                </a>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Close */}
        <section className="border-t border-border bg-brand-soft/60">
          <div className="mx-auto max-w-3xl px-6 py-36 text-center">
            <Reveal>
              <h2 className="text-[32px] font-[450] tracking-[-0.02em] text-ink">
                Open your next application.
              </h2>
              <a
                href={STORE_URL}
                className="mt-9 inline-block rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Add to Chrome
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-faint sm:flex-row">
          <span>&copy; {new Date().getFullYear()} RoleQuick</span>
          <div className="flex gap-6">
            <a href="/login" className="hover:text-muted">
              Sign in
            </a>
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
