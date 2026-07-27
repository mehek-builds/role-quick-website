import { Header } from "@/components/Header";
import { CalibrateCard } from "@/components/CalibrateCard";
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
import { InstallLink } from "@/components/InstallLink";
import { StickyCTA } from "@/components/StickyCTA";
import { RealCaptures } from "@/components/RealCaptures";
import { ScrollProgress } from "@/components/ScrollProgress";
import { StructuredData } from "@/components/StructuredData";
import { Voices } from "@/components/Voices";
import { STORE_URL } from "@/lib/config";
import { ROLES } from "@/lib/rolesFeed";

/* DESIGN.md v1.1: one idea per viewport, one line of copy where one line
   works, tonal pillar bands, motion that settles rather than loops (the
   receipt is the one looping element). */

/* Written from the real objections (data, spam, caps, why free), stated
   plainly and only claiming what the product does today (Guardrails). */
const FAQ_ITEMS = [
  {
    q: "Will it make things up about me?",
    a: "No. Litos only uses what is already in your resume. It moves your real work around and rewrites it to fit the job. It never adds a job, a skill, or a number you did not do. You can see every change before it goes out.",
  },
  {
    q: "Will it apply to jobs without me?",
    a: "Only if you turn that on. Even then it stops and asks you when something is missing, when two answers do not match, when a question is about you personally, or when the site asks you to prove you are human. You can turn it off in Settings.",
  },
  {
    q: "Can a recruiter tell I used AI?",
    a: "It reads like you wrote it carefully, because the facts are yours. We fill the boxes from answers you gave us, and we write from your real work. Nothing goes out until you send it.",
  },
  {
    q: "Will this help me get interviews?",
    a: "It fixes the two places job applications die. First, a robot reads your resume, and ours is built so it can. Second, most people apply and wait. You also email a real person, starting with people from your school.",
  },
  {
    q: "Is my resume safe?",
    a: "Yes. We use your resume and answers only to fill in your own job applications. We only read the job page you are on. We never sell or share your data, and we never will.",
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

/* Counted, never typed: if the feed changes, this changes with it. */
const HARD_DEADLINE_COUNT = ROLES.filter((r) => r.deadline).length;

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <StructuredData faq={FAQ_ITEMS} />
      <ScrollProgress />
      {/* The footer claims the site is keyboard-navigable end to end, and
          the focus rings back that up, but a page with fixed chrome and a
          long film needs the standard escape: one skip link, visible only
          when focused. */}
      <a
        href="#product"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <Header />
      <CalibrateCard />
      <StickyCTA />

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
          {/* sr-only: the big number and the assembling packet ARE the
              visible headings here. This is for the document outline, so
              screen readers and crawlers get a complete one. */}
          <h2 className="sr-only">Watch one application assemble</h2>
          <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Nine seconds, start to finish
          </p>
          {/* Hero-to-body bridge: the three pillars as a table of contents,
              one small first click before the big ask. Pillar color marks
              the feature it links to, nothing else. */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="#documents"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-transparent hover:bg-brand-soft hover:text-brand-ink"
            >
              <span className="text-brand-ink">{PILLAR_ICONS.resume}</span>
              Resume
            </a>
            <a
              href="#autofill"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-transparent hover:bg-teal-soft hover:text-teal-ink"
            >
              <span className="text-teal-ink">{PILLAR_ICONS.autofill}</span>
              Forms
            </a>
            <a
              href="#outreach"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-transparent hover:bg-coral-soft hover:text-coral-ink"
            >
              <span className="text-coral-ink">{PILLAR_ICONS.outreach}</span>
              Emails
            </a>
          </div>
          <div className="pt-16">
            <div data-demo><PacketDemo /></div>
          </div>
          <p className="pb-36 pt-6 text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            <a
              href="/try"
              className="inline-flex min-h-[44px] items-center px-3 transition-colors hover:text-ink"
            >
              Or try it free →
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
              <h2 className="sr-only">How many people you are up against</h2>
              <p className="font-mono text-7xl tracking-[-0.04em] text-ink sm:text-8xl">
                <CountUp to={250} />
              </p>
              <p className="mx-auto mt-6 max-w-sm text-base leading-7 text-muted">
                people apply for one job. Six of them get an interview. One
                gets the job. We help yours stand out.
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
                A robot reads it first.
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted">
                Job sites scan your resume with software. If it cannot read
                yours, no person ever sees it. We build one it can read.
              </p>
              {/* Alex Rivera is a sample applicant, and the numbers inside
                  that resume ("80 students", "800 student users") are his,
                  not ours. Unlabelled, a skimmer reads them as Litos proof. */}
              <p className="mt-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Not a real student. Just an example.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="mt-14" data-parallax="24">
              <div data-demo><ResumeFormatDemo /></div>
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
                    <PillarChip icon="resume" bg="bg-brand-soft" tone="text-brand-ink">01 · Resume</PillarChip>
                  </div>
                  <h2 className="mt-3 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                    We rebuild it. We do not just swap words.
                  </h2>
                  <p className="mt-2.5 text-[14px] leading-6 text-muted">
                    We read what the job asks for. Then we put your best
                    work first, in their words.
                  </p>
                </div>
              </Reveal>
              <div className="w-full max-w-5xl origin-center sm:scale-[0.84]">
                <div data-demo><ResumeMatchDemo /></div>
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
                  <div data-demo><ApplicationFormMockup /></div>
                </div>
                <div className="rq-glass order-1 px-7 py-8 sm:order-2">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    While you read this
                  </p>
                  <div className="mt-3" />
                  <PillarChip icon="autofill" bg="bg-teal-soft" tone="text-teal-ink">02 · Forms</PillarChip>
                  <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                    You never type your phone number again.
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-muted">
                    Most forms ask 27 questions. It is the same answers
                    every time. We fill them in, then wait for you to
                    check.
                  </p>
                  {/* Machine voice: what the fill actually does, as data. */}
                  <div className="mt-8 space-y-2.5 text-[14px] leading-6">
                    <p className="text-muted">We fill in your name, your links, and the yes or no questions.</p>
                    <p className="text-muted">We attach your new resume.</p>
                    <p className="text-muted">We skip the questions about race and gender.</p>
                    <p className="text-muted">We leave the writing, and the send button, to you.</p>
                  </div>
                  {/* The supported list was only ever in the meta
                      description, so the page itself never said where this
                      works. Fill and submit differ: submission is gated to
                      the three boards the extension can drive end to end
                      (lib/api.ts ats_name), so say both, plainly. */}
                  <p className="mt-5 text-[13px] leading-6 text-muted">
                    We fill in forms on Greenhouse, Lever, Ashby, Workday and
                    LinkedIn. We can press send for you on Greenhouse,
                    Lever and Ashby. Anywhere else we fill it in and you
                    press send.
                  </p>
                  <p className="mt-3 text-[13px] text-muted">
                    You can change any of this in Settings.
                  </p>
                  {/* These panels are built in the DOM, not captured from a
                      live session. They reproduce the extension's real
                      output, but a reader is entitled to know which one
                      they are looking at before treating it as evidence. */}
                  <p className="mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    This is a picture we made. Real screenshots are below.
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
                    Two seconds later
                  </p>
                  <div className="mt-3" />
                  <PillarChip icon="outreach" bg="bg-coral-soft" tone="text-coral-ink">03 · Emails</PillarChip>
                  <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                    Nobody reads applications. People read emails.
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-muted">
                    While the form fills, we find people who work there. We
                    write the email and leave it in your Gmail. People from
                    your school answer most, so they come first.
                  </p>
                  {/* Machine voice: what outreach actually does, as data. */}
                  <div className="mt-8 space-y-2.5 text-[14px] leading-6">
                    <p className="text-muted">We find people who work there.</p>
                    <p className="text-muted">We check every email address, and tell you when we could not.</p>
                    <p className="text-muted">We write a short note that sounds like you.</p>
                    <p className="text-muted">We leave the send button to you.</p>
                  </div>
                  <p className="mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    This is a picture we made. Real screenshots are below.
                  </p>
                </div>
                <div>
                  <div data-demo><OutreachDemo /></div>
                </div>
              </div>
            </Reveal>
            </div>
          </div>
        </section>

        {/* Captures: the chapters above are drawn in the DOM so they can
            move, which is right for a film and wrong as evidence. This is
            the shipped product, screenshotted. */}
        <section id="captures" className="relative scroll-mt-24">
          <Wash soft />
          <div className="relative px-6 py-32">
            <Reveal>
              <RealCaptures />
            </Reveal>
          </div>
        </section>

        {/* Voices: the film has just finished proving the mechanism, which is
            the exact moment the honest question becomes "does it work for
            anyone other than the demo?". The same five beta quotes that ship
            on the store listing answer it, in the same anonymized form. */}
        <section id="voices" className="relative scroll-mt-24">
          <Wash soft />
          <div className="relative px-6 py-32">
            <Reveal>
              <Voices />
            </Reveal>
          </div>
        </section>

        {/* Try it: the reel is the trailer, /try is the demo booth. One settled
            section, no scrub choreography - the film stage runs behind it. */}
        <section id="try" className="relative scroll-mt-24">
          <Wash tint="brand" soft />
          <div className="relative mx-auto max-w-2xl px-6 py-32 text-center">
            <Reveal>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Your application is ready
              </p>
              <h2 className="mt-4 text-[32px] font-[450] tracking-[-0.02em] text-ink">
                Now you try.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-muted">
                Try it on a pretend job. Or paste your own resume and watch
                it work. You do not have to install anything.
              </p>
              <a
                href="/try"
                className="mt-8 inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface px-7 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
              >
                Try it free
              </a>
              {/* The page gave nobody a reason to act today. This is the
                  only honest one available: it is counted from the role
                  feed at render, so it cannot drift into a claim the data
                  does not support, and it names no date that could quietly
                  expire. Feed honesty rules live in lib/rolesFeed.ts. */}
              <p className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                {HARD_DEADLINE_COUNT} of the {ROLES.length} jobs we track have a closing date
              </p>
            </Reveal>
          </div>
        </section>

        {/* FAQ: the objections a skeptic actually has, answered plainly. */}
        <section id="faq" className="relative scroll-mt-24">
          <Wash tint="warm" soft />
          <div className="relative mx-auto max-w-2xl px-6 py-36">
            <Reveal>
              <h2 className="text-center text-[32px] font-[450] tracking-[-0.02em] text-ink">
                Questions.
              </h2>
              {/* The three answers that decide whether a skeptic installs were
                  locked inside collapsed <details>, so they were never read.
                  State them once, open, above the accordion. */}
              <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ["Never invented", "We move and rewrite your real work. We never add a job, a skill, or a number."],
                  ["Never auto-sent", "Nothing is sent until you say so. The writing stays yours."],
                  ["Never sold", "We only read the job page you are on. We never sell your data."],
                ].map(([label, body]) => (
                  <div key={label} className="rq-glass px-5 py-5">
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
                      {label}
                    </p>
                    <p className="mt-2.5 text-[14px] leading-6 text-muted">{body}</p>
                  </div>
                ))}
              </div>
              <div className="rq-glass mt-6 px-6">
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
                <InstallLink
                  source="close"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
                >
                  Add to Chrome, it&apos;s free
                </InstallLink>
                <a
                  href="/login"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border bg-surface px-7 py-3 text-sm font-medium text-ink transition-colors hover:border-ink sm:w-auto"
                >
                  Sign in
                </a>
              </div>
              {/* Proof at arm's length from the ask: the one real number,
                  directly beneath the button it supports. */}
              <p className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Job found → ready to send · 9 seconds
              </p>
              {/* A person, not a company voice. The strongest asset here is
                  that a student on the same job hunt is building it. */}
              <p className="mt-8 text-[14px] leading-7 text-muted">
                Made by{" "}
                {/* inline in a sentence: WCAG 2.5.8 exempts these, and a
                    44px box here would break the line. */}
                <a
                  href="https://x.com/MehekBuilds"
                  data-inline-link
                  className="font-medium text-ink underline decoration-border underline-offset-2 hover:decoration-ink"
                >
                  Mehek
                </a>
                , a student at USC. She is looking for a job too.
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
                <img src="/brand/litos-mark.svg" alt="" className="h-5 w-5" />
                <span className="text-sm font-semibold tracking-tight text-ink">
                  Litos
                </span>
              </div>
            </div>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
                <li><a href="/#product" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">Product</a></li>
                <li><a href="/#faq" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">FAQ</a></li>
                <li><a href={STORE_URL} className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">Add to Chrome</a></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Company
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
                <li>
                  <a href="https://x.com/MehekBuilds" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">
                    X
                  </a>
                </li>
                <li>
                  <a href="https://github.com/mehek-builds" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">
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
                <li><a href="/privacy" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">Privacy</a></li>
                <li><a href="/login" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">Sign in</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-faint sm:flex-row">
            <span>&copy; {new Date().getFullYear()} Litos</span>
            <span>You do not need a mouse to use this site.</span>
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
