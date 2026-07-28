import { Header } from "@/components/Header";
import { CalibrateCard } from "@/components/CalibrateCard";
import {
  ApplicationFormMockup,
  ResumeFormatDemo,
  ResumeMatchDemo,
} from "@/components/Mockups";
import { OutreachDemo } from "@/components/OutreachDemo";
import { Reveal } from "@/components/Motion";
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

/* Stamped once at build time, not per render. */
const BUILD_DATE = new Date(process.env.BUILD_TIME ?? Date.now()).toLocaleString("en-US", {
  month: "long",
  year: "numeric",
});
import { ROLES } from "@/lib/rolesFeed";
import {
  FREE_LIMITS,
  PRO_LIMITS,
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_MONTHLY_PRICE,
  TRIAL_DAYS,
} from "@/lib/pricing";

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
    a: "Yes. We use your resume and answers only to fill in your own job applications. In your browser, the extension reads only the job page you are on. On our side, Litos looks at job boards to find you roles, and it opens the company's form itself if you ask it to send. We never sell or share your data, and we never will. The privacy page lists every part of this.",
  },
  /* The support question. Until now the site had no answer to "it broke", and
     no contact route at all outside the data-request address buried in
     /privacy: a stuck installer had nowhere to go, which is audit finding S25.
     Deliberately about getting HELP rather than about coverage. Where it works
     is already answered once, in the autofill section, and say-once means this
     must not become a second copy of that list. It also sets an expectation it
     can keep rather than promising a response time nobody staffs. */
  {
    q: "Something is not working. Who do I ask?",
    a: "Use the contact form and tell us the job link you were on. A person built this and a person answers, so it is not instant, but it is a real reply. If Litos could not fill a form, that link is the single most useful thing you can send: it is how the site gets added.",
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

/* The one pillar chip.
 *
 * The hero used to rebuild this by hand as three anchors, with the pillar tint
 * demoted to :hover, so the same primitive read one way in the hero and another
 * on the feature sections (audit finding 37). A chip carries its pillar's tint
 * because that IS what identifies the pillar; being a link is a separate fact,
 * so `href` is a prop rather than a second copy of the markup. */
const PILLAR_CHIP =
  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]";

function PillarChip({
  children,
  icon,
  bg,
  tone,
  href,
}: {
  children: React.ReactNode;
  icon: string;
  bg: string;
  tone: string;
  /** When present the chip is a jump link, and takes the 44px target every control gets. */
  href?: string;
}) {
  const inner = (
    <>
      {PILLAR_ICONS[icon]}
      {children}
    </>
  );
  if (href) {
    return (
      <a href={href} className={`${PILLAR_CHIP} min-h-[44px] px-4 transition-opacity hover:opacity-80 ${bg} ${tone}`}>
        {inner}
      </a>
    );
  }
  return <p className={`${PILLAR_CHIP} ${bg} ${tone}`}>{inner}</p>;
}

/* One CTA per pillar, each going somewhere DIFFERENT.
 *
 * The 2026-07-05 pass rejected per-section CTA buttons under one-ask-per-page,
 * and the audit that reopened it is also the reason to be careful: Jobright
 * ships five first-person feature CTAs ("Find My Matches", "Ask Orion") that
 * all land on the same signup wall, which is logged as a failure, not a win.
 * Three buttons to one destination is one ask wearing three hats.
 *
 * What makes this worth doing is that /try already deep-links to resume,
 * autofill and outreach (TrySimulator's Step union), so each pillar can hand
 * the reader the live demo of the exact thing they just read about.
 *
 * A link, not a solid button: blue solid is reserved for a true CTA and the
 * page keeps exactly one of those (Add to Chrome). "See it" rather than "Fix
 * my resume" because /try runs a canned job, not the reader's, and a
 * first-person promise there would be a small lie. */
function PillarLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      {children}
      <span aria-hidden className="ml-1.5">
        &rarr;
      </span>
    </a>
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
      {/* Was #product, whose whole value here was "skip the film, land on real
          content". #product is now the film wrapper itself, so that link would
          have skipped to the thing it exists to skip. #formats is the first
          section past the hero with an id at every breakpoint. */}
      <a
        href="#formats"
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

        {/* The receipt chapter used to be a full section here: mono eyebrow,
            three PillarChips, the packet demo, and an "Or try it free" link.
            The demo moved INTO the hero frame (CinematicHero) so the claim and
            the proof share one viewport, and the rest went with it or was cut:
            the eyebrow travelled up with the demo it describes, the chips were
            dropped as a second table of contents for targets the demo's own
            rows already link to, and "Or try it free" was a third copy of a
            link the hero and the header both already carry.

            What is left is everything too narrow for two columns. The hero
            runs copy-left / demo-right, which needs about 1140px of width to
            keep both halves legible; below that the grid collapses and the
            demo would be back to stacking under the copy, where it does not
            fit (stacked, it is 700px against a 618px hero card in an 812px
            viewport). So phones, tablets and small laptops get the next-best
            thing: the same demo immediately below, with no band, no Wash
            change and no section heading, so it reads as the hero continuing
            rather than as a new section starting. xl:hidden, matching the
            breakpoint where the hero itself stops rendering it. */}
        <section className="relative xl:hidden">
          <Wash soft />
          <div className="relative px-6 pb-28 pt-10">
            {/* sr-only: the assembling packet IS the visible heading here.
                This is for the document outline, so screen readers and
                crawlers get a complete one. */}
            <h2 className="sr-only">Watch one application assemble</h2>
            <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              Nine seconds, start to finish
            </p>
            <div className="pt-8">
              <div data-demo><PacketDemo /></div>
            </div>
          </div>
        </section>

        {/* ATS formatting: mess in, machine-readable out. Background changes
            mark section boundaries from here down (deep-dive pacing rule),
            no hairline dividers between bands. */}
        <section id="formats" className="relative">
          <Wash soft />
          <div className="relative mx-auto max-w-5xl px-6 py-36">
          <Reveal>
            <div className="mx-auto max-w-[560px] text-center">
              <h2 className="text-section font-[450] tracking-[-0.02em] text-ink">
                A robot reads it first.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted">
                Job sites scan your resume with software. If it cannot read
                yours, no person ever sees it. We build one it can read.
              </p>
              {/* John Doe is a sample applicant, and the numbers inside
                  that resume ("80 students", "800 student users") are his,
                  not ours. Unlabelled, a skimmer reads them as Litos proof.
                  Says "applicant", not "student": this label is the one line
                  that names who the example IS, so calling him a student
                  told every non-student the tool was not for them. */}
              <p className="mt-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Not a real applicant. Just an example.
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
                  <h2 className="mt-3 text-section font-[450] tracking-[-0.02em] text-ink">
                    We rebuild it. We do not just swap words.
                  </h2>
                  <p className="mt-2.5 text-sm leading-6 text-muted">
                    We read what the job asks for. Then we put your best
                    work first, in their words. A robot reads it before a
                    person does, so we build one it can read.
                  </p>
                  {/* John Doe is a sample applicant, and the numbers inside
                      that resume are his, not ours. Unlabelled, a skimmer reads
                      them as Litos proof. Says "applicant", not "student": this
                      label is the one line that names who the example IS, so
                      calling him a student told every non-student the tool was
                      not for them. Moved here from #formats when that section
                      was cut; the demo below still shows his name. */}
                  <p className="mt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    Not a real applicant. Just an example.
                  </p>
                  {/* The rigour claim, and the ONLY form of it that is true.
                      The approved change was an institution proof row, the
                      Simplify move ("Recommended by Harvard, Stanford, and top
                      career centers"). Litos has no such relationship. What it
                      has is that 45 public sample resumes from five career
                      centres were driven through this builder, which found and
                      fixed 13 defects. Putting the universities' names or marks
                      on the page would convert "we tested against their
                      coursework" into "they endorse us", which is a fabricated
                      endorsement and misrepresents five real institutions.

                      So the number ships and the names do not. It is a claim
                      about our own work rather than borrowed authority, which
                      makes it both honest and, for a builder, more relevant:
                      the question a student has is whether it handles a resume
                      like theirs. Mono because it is a measurement.
                      Source: vault litos-onboarding-15-resume-run-2026-07-27. */}
                  <p className="mt-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    Tested on 45 real resumes from five university career centres
                  </p>
                  <PillarLink href="/try?step=resume">See it rebuild a resume</PillarLink>
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
                  <h2 className="mt-4 text-section font-[450] tracking-[-0.02em] text-ink">
                    You never type your phone number again.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-muted">
                    Most forms ask 27 questions. It is the same answers
                    every time. We fill them in, then wait for you to
                    check.
                  </p>
                  {/* Machine voice: what the fill actually does, as data. */}
                  <div className="mt-8 space-y-2.5 text-sm leading-6">
                    <p className="text-muted">We fill in your name, your links, and the yes or no questions.</p>
                    <p className="text-muted">We attach your new resume.</p>
                    {/* The race-and-gender line was REMOVED from this list on
                        2026-07-28 (Mehek's call: too specified for the
                        homepage). It had been wrong twice in one day in
                        opposite directions, first "we skip them", then a
                        version that made the decline the headline and the
                        student's own answer the exception, and the accurate
                        version needed two sentences in a list of one-line
                        beats. That length is the tell: it is documentation,
                        and it belongs where documentation goes.

                        Do not re-add it here. It is stated in full in
                        /privacy under "Questions about race and gender", in
                        /dashboard/settings, and in the extension's own setup
                        screen at the moment it asks. What the code does:
                        the setup screen asks (optional gender/race/disability
                        plus veteran status, saved to eeo_prefs), the adapters
                        answer with what you gave, and blank fields fall back
                        to a decline. */}
                    {/* "and the send button" came out of this line because it was
                        not true. Opt-in automatic submission ships, so a flat claim
                        that the send button is always yours is the same absolute the
                        2026-07-04 pass already softened everywhere else, and it had
                        survived here.

                        The replacement is stronger BECAUSE it is exact. Jobscan's
                        human gate is the most-praised thing in its review corpus and
                        LazyApply's absence of one is why its users report banned
                        accounts, so this is the claim worth making loudly. Naming the
                        one exception is what makes it believable.

                        The duration was left out of the first version of this line
                        because DESIGN.md said 9 seconds and /privacy said 15, and
                        marketing must not pick a side in a contradiction between two
                        of our own surfaces. The extension settles it: COUNTDOWN_SECONDS
                        is 15 in src/entrypoints/content.ts. /privacy was right, the
                        ledger was wrong and is now corrected, and the number goes in,
                        because a hedge reads as one once the real figure exists.

                        Phrased as "sending stays off" rather than "we do not press
                        send", because the line four rows down says we CAN press send on
                        Greenhouse, Lever, Ashby and SmartRecruiters. Both were true with their implicit
                        qualifiers and flatly contradictory read together, in the same
                        card. This version states the default and the control, which is
                        the part the reader is actually deciding about, and leaves the
                        where-it-works nuance to the line that already owns it. */}
                    <p className="text-muted">We leave the writing to you.</p>
                    <p className="text-muted">
                      Sending stays off until you turn it on. Then you get 15
                      seconds to stop it.
                    </p>
                  </div>
                  {/* The supported list was only ever in the meta
                      description, so the page itself never said where this
                      works. Fill and submit differ, and they differ because
                      they run in different places: filling is the extension
                      in your browser, sending is the backend driving the
                      portal itself. The send list is whatever detectPortal
                      accepts in the backend's portalSubmission.ts, which
                      gained SmartRecruiters after this line was written. If
                      that list changes again, this sentence changes with it. */}
                  <p className="mt-5 text-[13px] leading-6 text-muted">
                    We fill in forms on Greenhouse, Lever, Ashby, Workday and
                    LinkedIn. We can press send for you on Greenhouse, Lever,
                    Ashby and SmartRecruiters. Anywhere else we fill it in and
                    you press send.
                  </p>
                  <p className="mt-3 text-[13px] text-muted">
                    You can change any of this in Settings.
                  </p>
                  <PillarLink href="/try?step=autofill">See it fill a form</PillarLink>
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
                  <h2 className="mt-4 text-section font-[450] tracking-[-0.02em] text-ink">
                    Nobody reads applications. People read emails.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-muted">
                    {/* Gmail, and only Gmail, is correct here: the draft is
                        handed off through a Gmail compose URL (extension
                        src/lib/gmail.ts). Outlook exists in the product only
                        for reading a sign-in code, never for drafting, so
                        naming it here would be a new false claim. */}
                    While the form fills, we find people who work there. We
                    write the email and leave it in your Gmail. People from
                    your school answer most, so they come first.
                  </p>
                  {/* Machine voice: what outreach actually does, as data. */}
                  <div className="mt-8 space-y-2.5 text-sm leading-6">
                    <p className="text-muted">We find people who work there.</p>
                    <p className="text-muted">We check every email address, and tell you when we could not.</p>
                    <p className="text-muted">We write a short note that sounds like you.</p>
                    <p className="text-muted">We leave the send button to you.</p>
                  </div>
                  <p className="mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    This is a picture we made. Real screenshots are below.
                  </p>
                  <PillarLink href="/try?step=outreach">See it write an email</PillarLink>
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

        {/* The dashboard. The three pillars describe the extension, which was
            the whole product when they were written. It is now half of it: the
            backend finds jobs, scores them against the resume, submits to the
            portal itself, tracks what was sent, and drafts interview questions
            from the posting. None of that was named anywhere on the marketing
            site, while the page's own meta description already ended "submit
            from your dashboard".

            Deliberately a list and not a fourth pillar: the pillars are the
            act the film performs, and inflating them to four would break the
            RESUME / FORMS / EMAILS rhythm the whole reel is cut to. Every line
            here is a shipped route, named in the same words the dashboard nav
            uses, so a visitor who signs up recognises what they were shown.
            Nothing aspirational goes in this list. */}
        <section id="dashboard" className="relative scroll-mt-24">
          <Wash soft />
          <div className="relative mx-auto max-w-3xl px-6 py-32">
            <Reveal>
              <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                And when you are not on a job page
              </p>
              <h2 className="mt-4 text-center text-section font-[450] tracking-[-0.02em] text-ink">
                The rest of it lives in your dashboard.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-center text-base leading-7 text-muted">
                The extension works on a posting you opened. Everything below
                happens whether your browser is open or not.
              </p>
              <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ["Jobs", "We watch for roles that fit and put them in one list. You did not have to find them."],
                  ["Applications", "Every application in one place, with what is ready, what needs you, and what was sent."],
                  ["Sending", "Ask Litos to send, and it fills in the company's form itself and waits for their confirmation."],
                  ["Interviews", "When a job is ready, we pull the questions the posting is really asking, out of the posting."],
                ].map(([label, body]) => (
                  <div key={label} className="rq-glass px-6 py-5">
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
                      {label}
                    </p>
                    <p className="mt-2.5 text-sm leading-6 text-muted">{body}</p>
                  </div>
                ))}
              </div>
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
              <h2 className="mt-4 text-section font-[450] tracking-[-0.02em] text-ink">
                Now you try.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base leading-7 text-muted">
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
                {/* "jobs we track" also names the per-user job monitor inside
                    the product ("Every job Litos has found for you"), so this
                    marketing feed needed its own words. */}
                {HARD_DEADLINE_COUNT} of the {ROLES.length} roles in our open list have a closing date
              </p>
            </Reveal>
          </div>
        </section>

        {/* FAQ: the objections a skeptic actually has, answered plainly. */}
        <section id="faq" className="relative scroll-mt-24">
          <Wash tint="warm" soft />
          <div className="relative mx-auto max-w-2xl px-6 py-36">
            <Reveal>
              <h2 className="text-center text-section font-[450] tracking-[-0.02em] text-ink">
                Questions.
              </h2>
              {/* The three answers that decide whether a skeptic installs were
                  locked inside collapsed <details>, so they were never read.
                  State them once, open, above the accordion. */}
              <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ["Never invented", "We move and rewrite your real work. We never add a job, a skill, or a number."],
                  ["Never auto-sent", "Nothing is sent until you say so. The writing stays yours."],
                  // The deletion promise came off the hero on 2026-07-28 and
                  // lives here now. It is the half no competitor has: 10 of 10
                  // products audited say nothing about what happens to a resume
                  // on account deletion. Worded "you can delete everything"
                  // rather than "one click", because the mechanism is an email
                  // to support, and a promised button would be a small lie on
                  // the one subject where it costs the most.
                  //
                  // "We only read the job page you are on" was true when Litos
                  // was only an extension. It is not the whole product any
                  // more: the backend watches job boards to find you roles, it
                  // drives the employer's portal itself when you ask it to
                  // send, and if you connect your email it looks for a sign-in
                  // code. The extension half of the claim is still exactly
                  // true and still worth saying, so it is scoped rather than
                  // dropped, and the rest points at /privacy instead of
                  // pretending it does not exist.
                  ["Never sold", "In your browser, Litos reads only the job page you are on. On our side it finds jobs for you and, if you ask, sends the application. We never sell your data, and you can delete everything whenever you want."],
                ].map(([label, body]) => (
                  <div key={label} className="rq-glass px-5 py-5">
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
                      {label}
                    </p>
                    <p className="mt-2.5 text-sm leading-6 text-muted">{body}</p>
                  </div>
                ))}
              </div>
              <div className="rq-glass mt-6 px-6">
                {FAQ_ITEMS.map(({ q, a }) => (
                  <details key={q} className="group border-b border-border">
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 text-left text-lg font-medium text-ink [&::-webkit-details-marker]:hidden">
                      {q}
                      <span
                        aria-hidden
                        className="font-mono text-sm text-faint transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="pb-6 pr-10 text-base leading-7 text-muted">{a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing. The site called itself free four times and never said what
            free stops at, while the Chrome Web Store listing published the
            caps and both prices and the backend enforced them
            (middleware/quota.ts LIMITS + TRIAL_DAYS). Two public surfaces,
            two different stories, on the one axis the competitor audit said
            Litos wins: nine of ten rivals hide or obfuscate price, and this
            was Litos quietly doing the same.

            Every number here is READ FROM the enforced values, not typed
            beside them, so the page cannot drift from the server. If the caps
            move, this section moves with them. */}
        <section id="pricing" className="relative scroll-mt-24">
          <Wash soft />
          <div className="relative mx-auto max-w-3xl px-6 py-32">
            <Reveal>
              <h2 className="text-center text-section font-[450] tracking-[-0.02em] text-ink">
                What it costs.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-center text-base leading-7 text-muted">
                Your first {TRIAL_DAYS} days have everything switched on, and
                we do not ask for a card. After that you stay on free unless
                you choose otherwise.
              </p>
              <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rq-glass px-6 py-6">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
                    Free
                  </p>
                  <p className="mt-2.5 text-heading font-medium text-ink">$0</p>
                  <p className="mt-1 text-sm text-muted">Every month, forever.</p>
                  <ul className="mt-5 space-y-2 text-sm leading-6 text-muted">
                    <li>{FREE_LIMITS.resumes} tailored resumes a month, one for each application.</li>
                    <li>{FREE_LIMITS.contacts} checked contacts a month.</li>
                    <li>{FREE_LIMITS.drafts} written emails a month.</li>
                  </ul>
                </div>
                <div className="rq-glass px-6 py-6">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
                    Pro
                  </p>
                  <p className="mt-2.5 text-heading font-medium text-ink">
                    ${PRO_MONTHLY_PRICE}
                    <span className="text-sm font-normal text-muted"> a month</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Or ${PRO_YEARLY_MONTHLY_PRICE} a month if you pay for the year.
                  </p>
                  <ul className="mt-5 space-y-2 text-sm leading-6 text-muted">
                    <li>{PRO_LIMITS.resumes.toLocaleString()} tailored resumes a month.</li>
                    <li>{PRO_LIMITS.contacts} checked contacts a month.</li>
                    <li>{PRO_LIMITS.drafts.toLocaleString()} written emails a month.</li>
                  </ul>
                </div>
              </div>
              <p className="mt-6 text-center text-[13px] leading-6 text-muted">
                Cancelling takes the same number of clicks as signing up. The{" "}
                <a href="/terms" className="underline decoration-border underline-offset-2 hover:text-ink">
                  terms, cancellation and refund policy
                </a>{" "}
                are written down before you pay, not after.
              </p>
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
              <h2 className="mt-8 text-display font-[450] leading-[1.05] tracking-[-0.03em] text-ink">
                Open your next application.
              </h2>
              {/* The consolidation line, allowed to restate what the three
                  pillars already said (override 5 of 10, superseding say-once
                  for this idea only).
                  Placed here because the three dashes directly above it are
                  the brand, teal and coral pillars, and until now that motif
                  was wordless: a reader who had not decoded the colours got a
                  decoration. This names them in the order the page introduced
                  them, so the close reads as the sum of the page rather than
                  a fourth new thing. Kept to one line, in the strongest spot,
                  which is what say-once was protecting in the first place. */}
              <p className="mx-auto mt-5 max-w-[420px] text-base leading-7 text-muted">
                The resume, the form and the email. One place.
              </p>
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
              {/* The founder line ("Made by Mehek, a student at USC...") was
                  removed 2026-07-28 on Mehek's call. The close section now ends
                  on the receipt line above. The X link in the footer is the only
                  remaining signal that a person is behind this. */}
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
                <span className="text-base font-medium tracking-tight text-ink">
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
                <li><a href="/#pricing" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">Pricing</a></li>
                <li><a href="/#faq" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">FAQ</a></li>
                <li><a href="/litos-vs-simplify" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">Litos vs Simplify</a></li>
                <li><a href={STORE_URL} className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">Add to Chrome</a></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Company
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px] text-muted">
                {/* Footer, not the header. Five of ten competitors keep a B2B
                    entry in the main nav, but the header here carries one ask
                    and the say-once rule is what keeps it doing that. This is a
                    destination for someone who came looking, not a second pitch
                    aimed at students. Promote it if the channel earns it. */}
                {/* The site had no contact route at all. The only address was
                    inside /privacy, for data requests, which is not where
                    someone whose autofill just failed will look. */}
                <li>
                  <a
                    href="/contact"
                    className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <a href="/for-career-centres" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">
                    For career centres
                  </a>
                </li>
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
                <li><a href="/terms" className="inline-flex min-h-[44px] items-center hover:text-ink sm:min-h-0">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-faint sm:flex-row">
            <span>&copy; {new Date().getFullYear()} Litos</span>
            <span>You do not need a mouse to use this site.</span>
            {/* Was new Date() at render, so it always read "updated this month"
                whether or not anything had changed. Manufactured freshness is
                exactly what the Guardrails ban. This is the real build date. */}
            <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
              Built {BUILD_DATE}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
