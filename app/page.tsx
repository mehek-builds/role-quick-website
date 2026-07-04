import { Header } from "@/components/Header";
import {
  ApplicationFormMockup,
  ResumeFormatDemo,
  ResumeMatchDemo,
} from "@/components/Mockups";
import { OutreachDemo } from "@/components/OutreachDemo";
import { ApplicantField } from "@/components/ApplicantField";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { Reveal, CountUp } from "@/components/Motion";
import { PacketDemo } from "@/components/PacketDemo";
import { PricingCards } from "@/components/PricingCards";
import { STORE_URL } from "@/lib/config";

/* DESIGN.md v1.1: one idea per viewport, one line of copy where one line
   works, tonal pillar bands, motion that settles rather than loops (the
   receipt is the one looping element). */

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

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <Header />

      <main className="flex-1">
        {/* Hero + demo share the reactive backdrop */}
        <div className="relative isolate">
        <HeroBackdrop />
        <section className="mx-auto max-w-3xl px-6 pt-28 text-center sm:pt-40">
          <Reveal>
            <h1 className="text-5xl font-[450] leading-[1.02] tracking-[-0.03em] text-ink sm:text-[76px]">
              Apply <span className="text-brand-ink">in seconds.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-[440px] text-[17px] leading-[1.65] text-muted">
              It tailors your resume, fills the application, drafts the
              outreach. You get the final say.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row">
              <a
                href={STORE_URL}
                className="w-full rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Add to Chrome, it&apos;s free
              </a>
              <a
                href="#product"
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                See the product ↓
              </a>
            </div>
          </Reveal>
        </section>

        <section id="product" className="px-6 pb-36 pt-16">
          <Reveal delay={150}>
            <PacketDemo />
          </Reveal>
        </section>
        </div>

        {/* The number */}
        <section className="border-y border-border bg-surface-alt">
          <div className="mx-auto max-w-3xl px-6 py-32 text-center">
            <Reveal>
              <p className="font-mono text-7xl tracking-[-0.04em] text-ink sm:text-8xl">
                <CountUp to={250} />
              </p>
              <p className="mx-auto mt-6 max-w-sm text-base leading-7 text-muted">
                apply to the average corporate role. Six get interviews. One
                gets the job. We make yours the tailored one.
              </p>
              <ApplicantField />
              <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                Source: Glassdoor
              </p>
            </Reveal>
          </div>
        </section>

        {/* ATS formatting: mess in, machine-readable out */}
        <section className="mx-auto max-w-5xl px-6 py-36">
          <Reveal>
            <div className="mx-auto max-w-[560px] text-center">
              <h2 className="text-[32px] font-[450] tracking-[-0.02em] text-ink">
                Messy in. ATS-ready out.
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted">
                One messy page in, one machine-readable page out.
              </p>
            </div>
            <div className="mt-16">
              <ResumeFormatDemo />
            </div>
          </Reveal>
        </section>

        {/* Documents */}
        <section id="documents" className="scroll-mt-16 border-t border-border bg-brand-soft/50">
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
                  Your best-fit bullets, rewritten in the JD&apos;s language.
                </p>
              </div>
              <div className="mt-16">
                <ResumeMatchDemo />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Autofill */}
        <section id="autofill" className="scroll-mt-16 border-t border-border bg-teal-soft/50">
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
                    You never type your phone number again.
                  </p>
                  {/* Machine voice: what the fill actually does, as data. */}
                  <div className="mt-8 space-y-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
                    <p>
                      <span className="text-teal-ink">Fills</span>
                      <span className="text-muted"> · contact, links, work auth, screening</span>
                    </p>
                    <p>
                      <span className="text-teal-ink">Attaches</span>
                      <span className="text-muted"> · the tailored resume PDF</span>
                    </p>
                    <p>
                      <span className="text-teal-ink">Defaults</span>
                      <span className="text-muted"> · EEO to decline-to-identify</span>
                    </p>
                    <p>
                      <span className="text-teal-ink">Leaves</span>
                      <span className="text-muted"> · essays and the final say to you</span>
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Outreach */}
        <section id="outreach" className="scroll-mt-16 border-t border-border bg-coral-soft/50">
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
                  {/* Machine voice: what outreach actually does, as data. */}
                  <div className="mt-8 space-y-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
                    <p>
                      <span className="text-coral-ink">Finds</span>
                      <span className="text-muted"> · recruiters, managers, your alumni</span>
                    </p>
                    <p>
                      <span className="text-coral-ink">Verifies</span>
                      <span className="text-muted"> · every address, tiered honestly</span>
                    </p>
                    <p>
                      <span className="text-coral-ink">Drafts</span>
                      <span className="text-muted"> · ~120 words in your voice</span>
                    </p>
                    <p>
                      <span className="text-coral-ink">Leaves</span>
                      <span className="text-muted"> · send to you</span>
                    </p>
                  </div>
                </div>
                <OutreachDemo />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-border">
          <div className="mx-auto max-w-4xl px-6 py-36">
          <Reveal>
            <h2 className="text-center text-[32px] font-[450] tracking-[-0.02em] text-ink">
              Every feature, free every month.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-center text-[15px] leading-7 text-muted">
              Free covers 20 jobs a month, resetting on the 1st. Pro covers 500.
            </p>
            <PricingCards />
          </Reveal>
          </div>
        </section>

        {/* Close: the finale — signature threads, display type, receipt echo */}
        <section className="border-t border-border bg-brand-soft/60">
          <div className="mx-auto max-w-3xl px-6 py-40 text-center">
            <Reveal>
              <div className="flex items-center justify-center gap-1.5">
                <span className="h-0.5 w-6 rounded-full bg-brand" />
                <span className="h-0.5 w-6 rounded-full bg-teal" />
                <span className="h-0.5 w-6 rounded-full bg-coral" />
              </div>
              <h2 className="mt-8 text-4xl font-[450] leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">
                Open your next application.
              </h2>
              <p className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Posting detected → packet ready · 9 seconds
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href={STORE_URL}
                  className="w-full rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
                >
                  Add to Chrome, it&apos;s free
                </a>
                <a
                  href="/login"
                  className="w-full rounded-full border border-border bg-surface px-7 py-3 text-sm font-medium text-ink transition-colors hover:border-ink sm:w-auto"
                >
                  Sign in
                </a>
              </div>
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
