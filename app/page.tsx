import { Header } from "@/components/Header";
import {
  ApplicationFormMockup,
  ResumeFormatDemo,
  ResumeMatchDemo,
} from "@/components/Mockups";
import { OutreachDemo } from "@/components/OutreachDemo";
import { ApplicantField } from "@/components/ApplicantField";
import { Reveal, CountUp } from "@/components/Motion";
import { CinematicHero } from "@/components/cinema/CinematicHero";
import { CinematicPage } from "@/components/cinema/CinematicPage";
import { Wash } from "@/components/cinema/Wash";
import { SmoothScroll } from "@/components/cinema/SmoothScroll";
import { PacketDemo } from "@/components/PacketDemo";
import { PricingCards } from "@/components/PricingCards";
import { STORE_URL } from "@/lib/config";

/* DESIGN.md v1.1: one idea per viewport, one line of copy where one line
   works, tonal pillar bands, motion that settles rather than loops (the
   receipt is the one looping element). */

/* Written from the real objections (data, spam, caps, why free), stated
   plainly and only claiming what the product does today (Guardrails). */
const FAQ_ITEMS = [
  {
    q: "Will it make up things I haven't done?",
    a: "No. RoleQuick only uses what is already in your resume and experience bank. It reorders and rewords your real work to match the posting, and it never invents a job, a skill, or a number. Every line is yours, and you can see exactly what changed before it goes anywhere.",
  },
  {
    q: "Does it apply to jobs for me automatically?",
    a: "Never. It gets everything ready, the tailored resume, the filled fields, the outreach draft, then stops and waits for you. Nothing is submitted and no email is sent until you read it and click. You apply to one job at a time, on purpose.",
  },
  {
    q: "Will a recruiter be able to tell I used AI?",
    a: "It reads like an application you wrote carefully, because the words are yours. RoleQuick fills real fields with your real answers and drafts your short responses and outreach in your own voice, then stops for you to read every line. Nothing is mass-blasted, so there is no template smell to catch.",
  },
  {
    q: "Will this actually help me get interviews?",
    a: "It fixes the two places applications quietly die. Your resume gets rebuilt in the layout and keywords the ATS actually reads, so it stops getting filtered out, and instead of vanishing into the pile, you reach a real person at the company, alumni first. It cannot promise offers, but it gets you seen.",
  },
  {
    q: "Are my resume and personal information safe?",
    a: "Yes. Your resume and answers are used only to fill your own applications. The extension reads only the posting you are viewing, and your data is never sold or shared. RoleQuick makes money from Pro subscriptions, not from you; that is also why Free stays free.",
  },
];

/* The one icon set on the site: the brand deck's three pillar pictograms
   (section 06), line-only, 1.6px stroke, currentColor. Reused in the hero
   bridge and at the top of every pillar section — one primitive, repeated. */
const PILLAR_ICONS: Record<string, React.ReactNode> = {
  resume: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3.5V8h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12.5h6M9 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  autofill: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9.5h8M8 13h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m8 17 1.6 1.6L13 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  outreach: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <rect x="3.5" y="6" width="17" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 7 12 13l7.5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function PillarChip({
  children,
  icon,
  bg,
  tone,
}: {
  children: React.ReactNode;
  icon: string;
  bg: string;
  tone: string;
}) {
  return (
    <p className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${bg} ${tone}`}>
      {PILLAR_ICONS[icon]}
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <Header />

      <main className="flex-1">
        {/* The scroll film: pinned canvas scrub of the generated film,
            glass chapter cards, grain, dust, vignette, chapter tints.
            Lenis paces the whole page. */}
        <SmoothScroll />
        <CinematicPage />
        <CinematicHero storeUrl={STORE_URL} />

        {/* Chapter: the receipt. The film hands off to the live demo — the
            chips bridge and the packet assembling in real time. */}
        <section id="product" className="relative scroll-mt-24">
          <Wash soft />
          <div className="relative px-6 pt-20">
          <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            19:42:07 → 19:42:16
          </p>
          {/* Hero-to-body bridge: the three pillars as a table of contents,
              one small first click before the big ask. Pillar color marks
              the feature it links to, nothing else. */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="#documents"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-transparent hover:bg-brand-soft hover:text-brand-ink"
            >
              <span className="text-brand-ink">{PILLAR_ICONS.resume}</span>
              Resume
            </a>
            <a
              href="#autofill"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-transparent hover:bg-teal-soft hover:text-teal-ink"
            >
              <span className="text-teal-ink">{PILLAR_ICONS.autofill}</span>
              Autofill
            </a>
            <a
              href="#outreach"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-transparent hover:bg-coral-soft hover:text-coral-ink"
            >
              <span className="text-coral-ink">{PILLAR_ICONS.outreach}</span>
              Outreach
            </a>
          </div>
          <div className="pt-16">
            <PacketDemo />
          </div>
          <p className="pb-36 pt-6 text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            <a href="/try" className="transition-colors hover:text-ink">
              Or drive it yourself →
            </a>
          </p>
          </div>
        </section>

        {/* The number. Background changes mark section boundaries from here
            down (deep-dive pacing rule) — no hairline dividers between bands. */}
        <section id="odds" className="relative">
          <Wash tint="warm" soft />
          <div className="relative mx-auto max-w-3xl px-6 py-32 text-center">
            <Reveal>
              <p className="font-mono text-7xl tracking-[-0.04em] text-ink sm:text-8xl">
                <CountUp to={250} />
              </p>
              <p className="mx-auto mt-6 max-w-sm text-base leading-7 text-muted">
                apply to the average corporate role. Six get interviews. One
                gets the job. We make yours the tailored one.
              </p>
              <ApplicantField />
            </Reveal>
          </div>
        </section>

        {/* ATS formatting: mess in, machine-readable out */}
        <section id="formats" className="relative">
          <Wash soft />
          <div className="relative mx-auto max-w-5xl px-6 py-36">
          <Reveal>
            <div className="mx-auto max-w-[560px] text-center">
              <h2 className="text-[32px] font-[450] tracking-[-0.02em] text-ink">
                Messy in. ATS-ready out.
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted">
                Recruiting software skips what it can&apos;t parse. RoleQuick
                outputs the layout the parser wants: single column, real
                headings, no tables.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="mt-14" data-parallax="24">
              <ResumeFormatDemo />
            </div>
          </Reveal>
          </div>
        </section>

        {/* Documents — pinned act: the real rebuild held over the live film */}
        <section id="documents" className="relative scroll-mt-24">
          <Wash tint="brand" soft />
          <div className="relative sm:h-[188svh]">
            <div className="flex min-h-svh flex-col items-center justify-center gap-5 px-6 py-24 sm:sticky sm:top-0 sm:py-0">
              <Reveal>
                <div className="mx-auto max-w-[600px] text-center">
                  <div className="flex justify-center">
                    <PillarChip icon="resume" bg="bg-brand-soft" tone="text-brand-ink">01 · Documents</PillarChip>
                  </div>
                  <h2 className="mt-3 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                    Tuned means rebuilt, not reworded.
                  </h2>
                  <p className="mt-2.5 text-[14px] leading-6 text-muted">
                    RoleQuick pulls the requirements from the posting and reorders
                    your story to answer them, in its own language.
                  </p>
                </div>
              </Reveal>
              <div className="w-full max-w-5xl origin-center sm:scale-[0.84]">
                <ResumeMatchDemo />
              </div>
            </div>
          </div>
        </section>

        {/* Autofill — pinned act: the real fill held over the live film */}
        <section id="autofill" className="relative scroll-mt-24">
          <Wash tint="teal" soft />
          <div className="relative sm:h-[185svh]">
            <div className="flex min-h-svh items-center px-6 py-24 sm:sticky sm:top-0 sm:py-0">
            <Reveal>
              <div className="mx-auto grid w-full max-w-6xl origin-center grid-cols-1 items-center gap-14 sm:scale-[0.92] sm:grid-cols-2">
                <div className="order-2 sm:order-1" data-parallax="20">
                  <ApplicationFormMockup />
                </div>
                <div className="rq-glass order-1 px-7 py-8 sm:order-2">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    19:42:14
                  </p>
                  <div className="mt-3" />
                  <PillarChip icon="autofill" bg="bg-teal-soft" tone="text-teal-ink">02 · Autofill</PillarChip>
                  <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                    You never type your phone number again.
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-muted">
                    Twenty-seven fields on the average portal, the same answers
                    every time. RoleQuick answers once, everywhere, then waits
                    for your review.
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
                  <p className="mt-5 text-[13px] text-muted">
                    Every default is yours to change in Settings.
                  </p>
                </div>
              </div>
            </Reveal>
            </div>
          </div>
        </section>

        {/* Outreach — pinned act: the real draft held over the live film */}
        <section id="outreach" className="relative scroll-mt-24">
          <Wash tint="coral" soft />
          <div className="relative sm:h-[185svh]">
            <div className="flex min-h-svh items-center px-6 py-24 sm:sticky sm:top-0 sm:py-0">
            <Reveal>
              <div className="mx-auto grid w-full max-w-6xl origin-center grid-cols-1 items-center gap-14 sm:scale-[0.92] sm:grid-cols-2">
                <div className="rq-glass px-7 py-8">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    19:42:16
                  </p>
                  <div className="mt-3" />
                  <PillarChip icon="outreach" bg="bg-coral-soft" tone="text-coral-ink">03 · Outreach</PillarChip>
                  <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                    Applications get filed. Emails get read.
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-muted">
                    While the form fills, RoleQuick finds your people at the
                    company and leaves a draft in Gmail. Alumni answer most, so
                    alumni come first.
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
                <div>
                  <OutreachDemo />
                </div>
              </div>
            </Reveal>
            </div>
          </div>
        </section>

        {/* Try it: the reel is the trailer, /try is the demo booth. One settled
            section, no scrub choreography - the film stage runs behind it. */}
        <section id="try" className="relative scroll-mt-24">
          <Wash tint="brand" soft />
          <div className="relative mx-auto max-w-2xl px-6 py-32 text-center">
            <Reveal>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                19:42:16 · Application ready
              </p>
              <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                Now you drive.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-muted">
                You&apos;ve watched the application come together. Drive the
                extension yourself on a simulated posting, or paste your own
                resume and see your application, before installing anything.
              </p>
              <a
                href="/try"
                className="mt-8 inline-block rounded-full border border-border bg-surface px-7 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
              >
                Open the demo booth
              </a>
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="relative">
          <Wash soft />
          <div className="relative mx-auto max-w-4xl px-6 py-36">
          <Reveal>
            <h2 className="text-center text-[32px] font-[450] tracking-[-0.02em] text-ink">
              Every feature, free, every month.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-center text-[15px] leading-7 text-muted">
              Free covers 20 jobs a month, resetting on the 1st. Pro covers 500.
            </p>
            <PricingCards />
          </Reveal>
          </div>
        </section>

        {/* FAQ: the objections a skeptic actually has, answered plainly. */}
        <section id="faq" className="relative scroll-mt-24">
          <Wash tint="warm" soft />
          <div className="relative mx-auto max-w-2xl px-6 py-36">
            <Reveal>
              <h2 className="text-center text-[32px] font-[450] tracking-[-0.02em] text-ink">
                Questions, answered.
              </h2>
              <div className="rq-glass mt-12 px-6">
                {FAQ_ITEMS.map(({ q, a }) => (
                  <details key={q} className="group border-b border-border">
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 text-left text-[17px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                      {q}
                      <span
                        aria-hidden
                        className="font-mono text-sm text-faint transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="pb-6 pr-10 text-[15px] leading-7 text-muted">{a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Close: the finale — by here the live film has collated the book */}
        <section id="close" className="relative">
          <Wash soft />
          <div className="relative mx-auto max-w-3xl px-6 py-40 text-center">
            <Reveal>
              <div className="flex items-center justify-center gap-1.5">
                <span className="h-0.5 w-6 rounded-full bg-brand" />
                <span className="h-0.5 w-6 rounded-full bg-teal" />
                <span className="h-0.5 w-6 rounded-full bg-coral" />
              </div>
            </Reveal>
            <Reveal>
              <h2 className="mt-8 text-4xl font-[450] leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">
                Open your next application.
              </h2>
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
              {/* Proof at arm's length from the ask: the one real number,
                  directly beneath the button it supports. */}
              <p className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Posting detected → application ready · 9 seconds
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="relative">
        <Wash />
        <div className="relative mx-auto max-w-6xl px-6 py-14">
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/rolequick-mark.svg" alt="" className="h-5 w-5" />
                <span className="text-sm font-semibold tracking-tight text-ink">
                  RoleQuick
                </span>
              </div>
            </div>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
                <li><a href="/#product" className="hover:text-ink">Product</a></li>
                <li><a href="/#pricing" className="hover:text-ink">Pricing</a></li>
                <li><a href="/#faq" className="hover:text-ink">FAQ</a></li>
                <li><a href={STORE_URL} className="hover:text-ink">Add to Chrome</a></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Company
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
                <li>
                  <a href="https://x.com/MehekBuilds" className="hover:text-ink">
                    X
                  </a>
                </li>
                <li>
                  <a href="https://github.com/mehek-builds" className="hover:text-ink">
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Legal
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
                <li><a href="/privacy" className="hover:text-ink">Privacy</a></li>
                <li><a href="/login" className="hover:text-ink">Sign in</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-faint sm:flex-row">
            <span>&copy; {new Date().getFullYear()} RoleQuick</span>
            <span>Built to be keyboard-navigable, end to end.</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
              Updated{" "}
              {new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
