import { Header } from "@/components/Header";
import {
  ApplicationFormMockup,
  ResumeMatchDemo,
} from "@/components/Mockups";
import { OutreachDemo } from "@/components/OutreachDemo";
import { PacketDemo } from "@/components/PacketDemo";
import { Reveal } from "@/components/Motion";
import { CinematicHero } from "@/components/cinema/CinematicHero";
import { CinematicPage } from "@/components/cinema/CinematicPage";
import { Wash } from "@/components/cinema/Wash";
import { SmoothScroll } from "@/components/cinema/SmoothScroll";
import { FlowDemoFit } from "@/components/FlowDemo";
import { InstallLink } from "@/components/InstallLink";
import { SignInLink } from "@/components/SignInLink";
import { ScrollProgress } from "@/components/ScrollProgress";
import { SiteFooter } from "@/components/SiteFooter";
import { StructuredData } from "@/components/StructuredData";
import { Voices } from "@/components/Voices";

/* BUILD_DATE moved to components/SiteFooter.tsx on 2026-08-04 with the footer
   that was the only thing reading it. Still stamped once at build time, not
   per render. */
/* The lib/pricing.ts imports (FREE_LIMITS, PRO_LIMITS, PRO_MONTHLY_PRICE,
   PRO_YEARLY_MONTHLY_PRICE, TRIAL_DAYS) were dropped 2026-07-30 with the
   #pricing section. lib/pricing.ts itself is untouched. */

/* DESIGN.md v1.1: one idea per viewport, one line of copy where one line
   works, tonal pillar bands, motion that settles rather than loops (the
   receipt is the one looping element). */

/* Written from the real objections (data, spam, caps, why free), stated
   plainly and only claiming what the product does today (Guardrails).
 *
 * `a` STAYS A PLAIN STRING. StructuredData hands the same value to FAQPage as
 * acceptedAnswer.text, which has to be text, so an answer cannot be JSX.
 *
 * That is why, until 2026-07-30, two answers named a page and neither was
 * clickable: the support answer said "Use the contact form" and the privacy
 * answer said "The privacy page lists every part of this", and there was no
 * mechanism for a link in an answer at all. On the support answer that was the
 * actual bug, since the whole point of the entry (audit finding S25) is giving
 * a stuck person somewhere to go, and it named the destination without
 * offering it.
 *
 * `links` fixes it without touching the schema: the phrase is declared here
 * with its href, and LinkedAnswer splices the anchor into the rendered copy
 * only. The schema still gets the flat string.
 *
 * If you reword an answer, check its `links` phrases still appear in it. The
 * faq-links test fails the build if they do not, because a phrase that no
 * longer matches would silently render as plain text again, which is exactly
 * the bug this replaced. */
const FAQ_ITEMS: {
  q: string;
  a: string;
  links?: { text: string; href: string }[];
}[] = [
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
    /* The deletion promise on the end of this answer arrived here when the
       refusal trio above the accordion was deleted. It was the one clause in
       that block that was not already said somewhere else, and 10 of 10
       audited competitors say nothing about what happens to a resume on
       account deletion. "You can delete everything" rather than "one click",
       because the mechanism is an email to support. */
    a: "Yes. We use your resume and answers only to fill in your own job applications. In your browser, the extension reads only the job page you are on. On our side, Litos looks at job boards to find you roles, and it opens the company's form itself if you ask it to send. We never sell or share your data, and we never will. You can delete everything we hold whenever you want. The privacy page lists every part of this.",
    links: [{ text: "The privacy page", href: "/privacy" }],
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
    links: [{ text: "the contact form", href: "/contact" }],
  },
];

/* The one icon set on the site: the brand deck's three pillar pictograms
   (section 06), line-only, 1.6px stroke, currentColor. Reused in the hero
   bridge and at the top of every pillar section: one primitive, repeated. */
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

/* Renders an FAQ answer, turning each declared phrase into a link.
 *
 * The answer stays one flat string in FAQ_ITEMS so the FAQPage schema can use
 * it verbatim; the anchors exist only in the rendered copy. Phrases are matched
 * left to right, and each is searched only in the text after the previous
 * match, so a phrase appearing twice links its first occurrence and not both.
 *
 * A phrase that does not appear is skipped rather than throwing, because a
 * missing link is not worth a blank page in front of a reader. The faq-links
 * test is what stops that reaching production. */
function LinkedAnswer({
  text,
  links,
}: {
  text: string;
  links?: { text: string; href: string }[];
}) {
  if (!links?.length) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let rest = text;
  for (const { text: phrase, href } of links) {
    const at = rest.indexOf(phrase);
    if (at === -1) continue;
    parts.push(rest.slice(0, at));
    parts.push(
      <a
        key={href}
        href={href}
        className="underline decoration-border underline-offset-2 hover:text-ink"
      >
        {phrase}
      </a>
    );
    rest = rest.slice(at + phrase.length);
  }
  parts.push(rest);
  return <>{parts}</>;
}

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

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <StructuredData faq={FAQ_ITEMS} />
      <ScrollProgress />
      {/* The fixed header and the long scroll film below sit between the top
          of the page and the first real content, so the page needs the
          standard escape: one skip link, visible only when focused.
          Anchored to layout, never to user-facing copy: the footer used to
          carry a "keyboard-navigable end to end" line, it was reworded and
          then cut, and this comment outlived it by a week still citing it.
          Whatever the copy says, this reason has to stand on its own. */}
      {/* Was #product, whose whole value here was "skip the film, land on
          real content". #product is now the film wrapper itself, so that link
          would have skipped to the thing it exists to skip. #documents is the
          first real section past the hero (#odds and #formats were both cut
          in the 2026-07-28 deletion pass). */}
      <a
        href="#documents"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <Header />

      <main className="flex-1">
        {/* The scroll film: pinned canvas scrub of the generated film,
            glass chapter cards, grain, dust, vignette, chapter tints.
            Lenis paces the whole page. */}
        <SmoothScroll />
        <CinematicPage />
        <CinematicHero />

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
            {/* sr-only: the demo IS the visible heading here. This is for the
                document outline, so screen readers and crawlers get a
                complete one. */}
            <h2 className="sr-only">Watch Litos apply to a job, start to finish</h2>
            {/* No duration claim. This is the same demo the hero runs, and it
                is a 25-second loop rather than the 9-second one that stood
                here, so the old "Nine seconds, start to finish" would have
                been measurably false. What it lists instead is what the loop
                actually shows, in the order it shows it. */}
            <p className="text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              Resume, application, email, tracked
            </p>
            <div className="pt-8">
              {/* Centred, and w-full so the wrapper's width comes from the
                  section rather than from the demo. FlowDemoFit reads its
                  parent's width to choose a variant, so a content-sized
                  wrapper would feed it its own answer. */}
              <div data-demo className="flex w-full justify-center"><FlowDemoFit /></div>
            </div>
          </div>
        </section>

        {/* The "250 people apply for one job" section stood here and is gone.
            It was a statistic about the job market, not about Litos: it spent
            a full viewport telling the reader the odds are bad without saying
            anything the product does about them. Background changes still mark
            section boundaries from here down (deep-dive pacing rule), no
            hairline dividers between bands. */}

        {/* Documents, pinned act: the real rebuild held over the live film.
            The separate #formats band ("A robot reads it first", with its own
            mess-in / clean-out demo) was REMOVED 2026-07-28 in the deletion
            pass. It made the same argument as this section, directly above
            this section, and the FAQ makes it a third time. Machine
            readability was the one claim it owned that this section did not,
            and that sentence was folded into the body copy below. It came
            back out 2026-07-30, on Mehek's call: the heading and body now say
            plainly that the resume is customized to the role, and nothing on
            this band talks about a robot reading it. The FAQ still carries
            the machine-readability claim. Do not re-add it as its own band,
            and do not put "robot" back in this copy.

            Note for whoever restores it: ResumeFormatDemo in Mockups.tsx (and
            MessyResumeMockup / CleanResumeMockup, which only it composes) is
            now unreferenced. It was left in place rather than deleted, since
            it is a library file the /try surface also draws from. */}
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
                    A resume customized to every role.
                  </h2>
                  <p className="mt-2.5 text-sm leading-6 text-muted">
                    We read the job post. Then we rebuild your resume around
                    what it asks for, leading with your best work, in their
                    words.
                  </p>
                  {/* Two mono lines were REMOVED here 2026-07-28, on Mehek's
                      call, under the same rule as the rest of the deletion
                      pass: if it can go without hurting the message, it goes.

                      "Not a real applicant. Just an example." labelled the
                      resume in the demo below. The demo is a resume with a
                      name, a university email and a phone number on it. It
                      reads as an example because it is one, and the label was
                      the page explaining itself to itself. It had also just
                      been re-added and wrapped in a test guard on the argument
                      that a skimmer would read the sample's numbers as ours;
                      that argument did not survive looking at the thing.

                      "Tested on 45 real resumes from five university career
                      centres" was QA process, not the product. The message of
                      this section is that we rebuild the resume for the job.
                      How many fixtures the builder was regression-tested
                      against is not that, and the number is small enough to
                      read as a limit rather than as rigour.

                      Both are recoverable from git if the case for either ever
                      gets stronger than "it felt safer to say it". */}
                  <PillarLink href="/try?step=resume">See it rebuild a resume</PillarLink>
                </div>
              </Reveal>
              <div className="w-full max-w-5xl origin-center sm:scale-[0.84]">
                <div data-demo><ResumeMatchDemo /></div>
              </div>
            </div>
          </div>
        </section>

        {/* Autofill, pinned act: the real fill held over the live film */}
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
                  {/* The "While you read this" eyebrow was removed 2026-07-28:
                      invented timing, and it argued with the nine-seconds
                      receipt the page states elsewhere. Do not re-add it. */}
                  <PillarChip icon="autofill" bg="bg-teal-soft" tone="text-teal-ink">02 · Forms</PillarChip>
                  <h2 className="mt-4 text-section font-[450] tracking-[-0.02em] text-ink">
                    Autofill the reusable parts of every application.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-muted">
                    Most forms ask the same questions. We fill reusable facts and
                    leave personal decisions for you. By default, we wait for you to check.
                  </p>
                  {/* SIMPLIFIED 2026-07-30, on Mehek's call: this band was a
                      lead paragraph, a five-line machine-voice list and a
                      where-it-works paragraph. It is now the same shape as
                      #documents above it, chip + heading + a two-line
                      subheading, because the list had gone stale and the card
                      was doing documentation's job.

                      What came out, and where it still lives. Do not restore
                      any of it here without deciding it belongs on a homepage:

                      - Work authorization and sponsorship are left for you:
                        /privacy, /dashboard/settings ("Work authorization is
                        always asked, never inferred"), and the extension's
                        setup screen. WORK_ELIGIBILITY_QUESTION in the extension
                        adapters is the behaviour behind it.
                      - Race and gender are declined by default: /privacy under
                        "Questions about race and gender", /dashboard/settings,
                        and the extension setup screen. It was pulled from this
                        card on 2026-07-28 as too specified for a homepage, and
                        that still holds.
                      - Sending is off until you turn it on, then 15 seconds to
                        stop it: /litos-vs-simplify, /for-career-centres and
                        /privacy. COUNTDOWN_SECONDS in the extension's
                        src/entrypoints/content.ts is 15, not the 9 the old
                        ledger claimed.
                      - The fill list and the send list: /litos-vs-simplify
                        carries both. They differ because they run in different
                        places, filling is the extension in your browser and
                        sending is the backend driving the portal. Neither list
                        belongs in hand-written marketing copy again, since the
                        send list is whatever detectPortal accepts in the
                        backend's portalSubmission.ts and it keeps changing.

                      NOTE on what this cut actually loses. The consent claim
                      itself is NOT lost: the FAQ's "Will it apply to jobs
                      without me?" answers "Only if you turn that on ... You can
                      turn it off in Settings", and states the four cases where
                      it stops and asks. The homepage still tells a reader that
                      submission is opt-in.

                      The one thing now missing from this page is the 15-second
                      stop window. It survives on /litos-vs-simplify,
                      /for-career-centres and /privacy. Decide whether the
                      homepage needs the number at all: the FAQ makes the
                      promise, and the figure is the receipt for it. If it goes
                      back, it goes in the FAQ answer that already owns this
                      subject, NOT as a second statement in this card. */}

                  {/* "This is a picture we made. Real screenshots are below."
                      stood here and in #outreach, and #captures states the same
                      distinction a third time in its own intro. Removed
                      2026-07-28: two of the three were the page explaining its
                      own illustrations. #captures still draws the line once,
                      where it belongs, next to the real screenshots. */}
                  <PillarLink href="/try?step=autofill">See it fill a form</PillarLink>
                </div>
              </div>
            </Reveal>
            </div>
          </div>
        </section>

        {/* Outreach, pinned act: the real draft held over the live film */}
        <section id="outreach" className="relative scroll-mt-24">
          <Wash tint="coral" soft />
          <div className="relative sm:h-[185svh]">
            <div className="flex min-h-svh items-center px-6 py-24 sm:sticky sm:top-0 sm:py-0">
            <Reveal>
              <div className="mx-auto grid w-full max-w-6xl origin-center grid-cols-1 items-center gap-14 sm:scale-[0.92] sm:grid-cols-2">
                <div className="rq-glass px-7 py-8">
                  {/* The "Two seconds later" eyebrow was removed 2026-07-28,
                      with its opposite number in #autofill. Same reason. */}
                  <PillarChip icon="outreach" bg="bg-coral-soft" tone="text-coral-ink">03 · Emails</PillarChip>
                  <h2 className="mt-4 text-section font-[450] tracking-[-0.02em] text-ink">
                    An email to a real person at the company.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-muted">
                    {/* Gmail, and only Gmail, is correct here: the draft is
                        handed off through a Gmail compose URL (extension
                        src/lib/gmail.ts). Outlook exists in the product only
                        for reading a sign-in code, never for drafting, so
                        naming it here would be a new false claim. */}
                    We find people who work there, check their email
                    addresses, and leave a short note in your Gmail that
                    sounds like you.
                  </p>
                  {/* SIMPLIFIED 2026-07-30, with #documents and #autofill, to
                      chip + heading + a two-line subheading.

                      The four-line list that stood here restated the lead
                      paragraph rather than adding to it. "We find people who
                      work there." was a word-for-word repeat of the paragraph's
                      own first clause, and "We write a short note that sounds
                      like you" repeated "we write the email". Only two lines in
                      it were load-bearing, and both are folded into the
                      paragraph above: address checking, and the draft landing
                      in your Gmail rather than being sent.

                      What came out, and where it stands now:

                      - "We leave the send button to you" is gone as its own
                        line. It survives as meaning, not as a promise: a note
                        LEFT in your Gmail is one you have to send yourself.
                        /litos-vs-simplify states it outright, under "What
                        happens at the send button". Emails are never sent
                        automatically, unlike portal submission, so if this band
                        ever needs the guarantee back it is a true one.
                      - "and tell you when we could not" is gone as copy, and
                        does not need to be copy. OutreachDemo beside this card
                        IS that claim: it badges contacts VERIFIED / LIKELY,
                        then shows a NO VERIFIED EMAIL card reading "We couldn't
                        verify an address for Rina, and we never guess one", and
                        footers it "GUESSED ADDRESSES: ZERO". The demo also
                        carries the alumni-first ordering, as an ALUM badge on
                        the first contact. Shown beats stated, which is why the
                        paragraph keeps only "check their email addresses" and
                        lets the demo do the rest. If OutreachDemo is ever
                        replaced with something that does not show the
                        unverified path, this paragraph has to take the honesty
                        half back.

                      REMOVED and not replaced: "People from your school answer
                      most, so they come first." Alumni-first ordering is real
                      (personaOrder in the backend's resolve.ts, and
                      StructuredData.tsx says "alumni first"), but "answer most"
                      is a response-rate claim and nothing on this site sources
                      it. It was the last unsourced outcome number in the three
                      pillars. Do not put it back without the data. */}
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

        {/* The packet. The three pillars above each show ONE act in
            isolation, which is the right way to explain them and the wrong
            way to convey that they are a single job. This is the recap: the
            same three artifacts, made against one real posting, in one pass,
            with the employer's form filling on the left as the evidence for
            the panel's claims on the right.

            It sits here rather than in the hero (where it ran until PR #119)
            because it now depends on the pillars: its three phases are
            Resume, Forms and Emails in that order, and its finished rows
            scroll BACK to #documents, #autofill and #outreach. As a teaser
            those links pointed forward at sections the viewer had not read.
            As a recap they point back at ones they have, which is the
            direction that actually helps.

            No duration claim on the section. The panel states its own
            "Ready · 9 seconds" inside the fiction of the demo, which is a
            claim about the product finishing a packet, not about how long
            this loop runs. Do not add a second one out here. */}
        <section id="packet" className="relative scroll-mt-24">
          <Wash soft />
          <div className="relative px-6 py-32">
            <Reveal>
              <h2 className="text-center text-section font-[450] tracking-[-0.02em] text-ink">
                One posting. All three, at once.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-base leading-7 text-muted">
                Resume, application and email are not three chores you do in
                turn. They are one job, and this is it happening.
              </p>
              <div className="pt-12">
                <div data-demo><PacketDemo /></div>
              </div>
              {/* The only "Add to Chrome" left on the site (Mehek, 2026-07-31).
                  It used to be the ask in the header, the hero, the mid-film
                  card, the close, /browse-jobs and the end of /try: six asks for
                  a store listing, most of them next to no evidence and two of
                  them on screens a phone was reading. All of those now point at
                  /login, which is the door that opens everywhere and leads to
                  the half of the product that runs without the browser.

                  The install ask survives here because here is the one place the
                  extension is visibly doing the work: the demo directly above is
                  the sidebar filling a real posting. Ask for the thing at the
                  moment its proof is on screen, not before it and not five
                  sections after it.

                  No supporting caption under it. The ATS list and the
                  nothing-sends-without-you promise are both already made in
                  #autofill, and the demo above is better proof than either
                  sentence. Button only. */}
              <div className="mt-10 flex justify-center">
                <InstallLink
                  source="packet"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Add to Chrome, it&apos;s free
                </InstallLink>
              </div>
            </Reveal>
          </div>
        </section>

        {/* REMOVED 2026-07-30, on Mehek's call: two whole sections, #captures
            and #dashboard.

            #captures was "This is the real thing." plus three real product
            screenshots (extension on a job page, the contacts panel, the
            dashboard Emails page), and it drew the made-it / shot-it line for
            the whole page. It was the homepage's only real-screenshot
            evidence. RealCaptures in components/RealCaptures.tsx is now
            unreferenced and was LEFT IN PLACE, not deleted, so restoring this
            is a two-line change. The three PNGs under public/product/ stay
            regardless: /login and CinematicHero.tsx still use them.

            #dashboard was "The rest of it lives in your dashboard." plus the
            Jobs / Applications / Interviews cards. It was the only place the
            homepage described the backend half of the product, the half that
            runs whether the browser is open or not. Note for whoever comes
            back to this: dashboard auto-apply is the PRIMARY flow, not the
            extension, so the page now sells the secondary half only. Its own
            comment already warned that inflating the pillars to four would
            break the RESUME / FORMS / EMAILS rhythm, so if the dashboard needs
            saying again it is not as a fourth pillar and not as these cards.

            The reel now runs: three pillars, the packet recap, then voices,
            FAQ and pricing. */}

        {/* Voices: the film has just finished proving the mechanism, which is
            the exact moment the honest question becomes "does it work for
            anyone other than the demo?". The lead beta quote that ships on the
            store listing answers it, in the same anonymized form. */}
        <section id="voices" className="relative scroll-mt-24">
          <Wash soft />
          <div className="relative px-6 py-32">
            <Reveal>
              <Voices />
            </Reveal>
          </div>
        </section>

        {/* The #try band ("Now you try", one outline button to /try, plus the
            counted open-roles line) was REMOVED 2026-07-28 in the deletion
            pass. /try was already reachable from the header nav, the hero, the
            #product chapter and all three pillar links, so this was the
            seventh door to one room and it cost a full viewport at the point
            the page should be closing.

            The one thing that died with it is the counted deadline line, which
            was the page's only reason-to-act-today. If that urgency is wanted
            back, it belongs next to the install button in #close, not in a
            section of its own. lib/rolesFeed.ts still exports ROLES and is
            still used by /start, so the count is a two-line restore. */}

        {/* FAQ: the objections a skeptic actually has, answered plainly. */}
        <section id="faq" className="relative scroll-mt-24">
          <Wash tint="warm" soft />
          <div className="relative mx-auto max-w-2xl px-6 py-36">
            <Reveal>
              <h2 className="text-center text-section font-[450] tracking-[-0.02em] text-ink">
                Questions.
              </h2>
              {/* The "Never invented / Never auto-sent / Never sold" trio was
                  REMOVED 2026-07-28. It sat directly on top of the accordion
                  and compressed FAQ items 1, 2 and 5, which are printed
                  underneath it: the same three refusals, twice, a hundred
                  pixels apart.

                  It was added because the answers were hidden in collapsed
                  <details> and never read. That reason is handled instead by
                  opening the first item, which costs a boolean rather than a
                  second copy of the copy.

                  One clause in it was NOT a duplicate: the deletion promise,
                  which 10 of 10 audited competitors say nothing about. That has
                  been folded into FAQ item 5 rather than lost with the block. */}
              <div className="rq-glass mt-10 px-6">
                {FAQ_ITEMS.map(({ q, a, links }, i) => (
                  /* First one open. This is what the deleted trio was really
                     for: the objection that decides an install should not be
                     behind a click. One boolean, not a second block of copy. */
                  <details key={q} open={i === 0} className="group border-b border-border">
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 text-left text-lg font-medium text-ink [&::-webkit-details-marker]:hidden">
                      {q}
                      <span
                        aria-hidden
                        className="font-mono text-sm text-faint transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="pb-6 pr-10 text-base leading-7 text-muted">
                      <LinkedAnswer text={a} links={links} />
                    </p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* REMOVED 2026-07-30, on Mehek's call: the whole #pricing section
            ("What it costs.", the Free and Pro cards, and the cancellation
            line). The "Pricing" links in Header.tsx and in the footer went with
            it, because tests/route-integrity.test.mjs fails an anchor that
            points at no id. The footer was inline in this file when that was
            written; it moved to components/SiteFooter.tsx on 2026-08-04, so
            "this page's own footer" no longer points anywhere. Look there.

            There is no separate /pricing route and there never was. This
            section, reached by those two nav links, was the whole of pricing on
            the website.

            Read the deleted section's own rationale before restoring or
            re-deleting this, because it was written against exactly this state:
            the site called itself free four times and never said what free
            stops at, while the Chrome Web Store listing published the caps and
            both prices, and the backend enforced them. Nine of ten rivals hide
            or obfuscate price and the competitor audit called transparent
            pricing the axis Litos wins on. Deleting this puts the site back to
            being the quieter of the two surfaces.

            STILL PUBLISHING PRICES, and now unmatched by any page: the Chrome
            Web Store listing, and /terms which states the cancellation and
            refund policy this section linked to. lib/pricing.ts is now
            unreferenced by the site (it was read here so the page could not
            drift from middleware/quota.ts LIMITS and TRIAL_DAYS) and was LEFT
            IN PLACE, values intact, so restoring is an import and a paste. */}

        {/* Close: the finale: by here the live film has collated the book */}
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
              {/* "The resume, the form and the email. One place." was removed
                  2026-07-28. Its own comment recorded it as a deliberate
                  say-once override, restating the three pillars twelve
                  viewports after the page made them. The three coloured
                  dashes above carry the motif without narrating it. */}
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {/* Was "Add to Chrome, it's free" primary + "Sign in"
                    secondary. The store ask moved up to #packet, next to the
                    demo, and the account took the primary. The secondary could
                    not simply stay as it was: two buttons to /login is one
                    button wearing a costume. /try is the honest second option,
                    and it is the one the film has been earning for the reader
                    who is still not ready. */}
                <SignInLink
                  source="close"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
                >
                  Get started, it&apos;s free
                </SignInLink>
                <a
                  href="/try"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border bg-surface px-7 py-3 text-sm font-medium text-ink transition-colors hover:border-ink sm:w-auto"
                >
                  Try it free
                </a>
              </div>
              {/* The "Job found -> ready to send - 9 seconds" receipt was
                  removed here 2026-07-28. CinematicHero's film card states
                  it verbatim, and "nine seconds" is said elsewhere on the
                  page besides. This was the duplicate, not the original. */}
              {/* The founder line ("Made by Mehek, a student at USC...") was
                  removed 2026-07-28 on Mehek's call. The close section now ends
                  on the receipt line above. The X link in the footer is the only
                  remaining signal that a person is behind this. */}
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter wash />
    </div>
  );
}
