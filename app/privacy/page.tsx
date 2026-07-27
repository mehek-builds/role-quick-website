import { Header } from "@/components/Header";
import Link from "next/link";

export const metadata = {
  title: "Privacy: Litos",
};

/* The real interim policy. Every statement here matches shipped product
   behavior; update this page in the same PR as any change that touches
   what we read, store, or send. */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {/* Header is a fixed floating pill now — clear it before content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-20 pt-32">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Privacy Policy
        </h1>
        <p className="mt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Last updated: July 26, 2026
        </p>
        <p className="mt-6 text-sm leading-6 text-muted">
          Litos is a Chrome extension and web dashboard. When you open a
          job posting, it builds a resume tailored to that posting, fills out
          the application form, and drafts an outreach email to a real person
          at the company. This policy says exactly what that requires us to
          read and store, in plain language. It will grow as the product does,
          and the date above changes every time it does.
        </p>

        <Section title="What the extension reads">
          <p>
            Only the page you are looking at, and only when it is a job on
            Greenhouse, Lever, Ashby, Workday or LinkedIn, or a LinkedIn
            profile you opened. We do not read anything in the background. If
            you are not on a job page, we read nothing.
          </p>
        </Section>

        <Section title="What we store">
          <p>
            We store your email. If you sign in with Google, we store an ID
            that tells us it is you. We never get your Google password, your
            files, or your inbox. We store the facts we read out of your
            resume. We read the file once to get them, then we throw the file
            away. We store your answers, which reach us two ways: what you
            type in Settings, and what Litos watches you type into your first
            form. The next part explains that. We also store the people we
            found, the emails we wrote, and the resumes we made, so your
            dashboard can show them to you.
          </p>
          <p>
            Private answers are locked up: your phone, where you live, your
            citizenship, your birthday, when you can start, and the pay you
            want. Your yes or no answers about being allowed to work are
            stored as plain yes or no, not locked.
          </p>
        </Section>

        <Section title="Learning your profile from your first application">
          <p>
            From version 0.4.0, Litos learns by watching instead of asking.
            The first job form you fill in by hand teaches Litos your answers.
            While setup is open and you are on a real form, Litos reads what
            you type and saves it, so you never type it again. Older versions
            do not do this. They only save what you type in Settings.
          </p>
          <p>
            Litos only watches. It never types, clicks, or sends anything on
            its own. It only saves what you typed yourself. It can learn these
            seventeen things and nothing else: phone, city, state, zip,
            country, LinkedIn link, GitHub link, portfolio link, citizenship,
            birthday, start date, how long you can work, the pay you want,
            GPA, GPA scale, major, and how you heard about the job. Anything
            else, including anything that looks like an essay, is not
            saved.
          </p>
          <p>
            Three promises. One: it never learns your answers about being
            allowed to work, needing sponsorship, or your race and gender. The
            extension says no, the server says no again, and there is nowhere
            to put them even if it tried. Two: it never writes over you. What
            you type in Settings always wins. Three: it stops. Learning ends
            when setup ends, and it never starts again.
          </p>
        </Section>

        <Section title="Contacts and outreach">
          <p>
            We find work emails on public work profiles and check them. Every
            person is labeled with how sure we are. If we cannot check an
            email, we say so. We never make one up, and we never sell this
            data.
          </p>
          <p>
            Outreach emails are sent by you, from your own Gmail account.
            Drafts wait in your drafts folder and never send themselves.
          </p>
          <p>
            Applications submit only when you click Submit, unless you grant
            standing automatic-submission permission. With that permission,
            Litos may submit an application you start after checking that its
            answers are supported and the portal has no safety blocker. The
            extension shows a cancelable 15-second countdown. A dashboard
            submission can proceed as soon as those checks pass. Missing or
            conflicting facts, sensitive attestations, CAPTCHA, unsupported
            portal behavior, and uncertain confirmation always pause the flow.
          </p>
        </Section>

        <Section title="Codes sent to your email">
          <p>
            If you separately turn on automatic verification, Litos can use a
            Gmail or Outlook account you already connected to look for a
            verification code tied to an application that is actively open.
            It checks the sender and timing before using a code, does not save
            the code, and does not use this permission to read or send other
            mail. CAPTCHA, device-based MFA, and unsupported verification
            steps still pause for you.
          </p>
          <p>
            Sending forms by itself and finding codes are two separate
            choices. You can turn either one off in Settings.
          </p>
        </Section>

        <Section title="Application verification">
          <p>
            Some job sites email you a code. If you turn this on, Litos can
            look in the Gmail or Outlook you connected and find that code
            while the form is waiting for it. It only takes a new code, and
            only from the job site you are on. It uses the code once. It never
            saves it.
          </p>
          <p>
            You choose this, and you can turn it off in Settings. If it is
            off, Litos stops and waits for you whenever a code is needed. It
            also stops for the puzzles that check you are human, for anything
            that needs your phone, and for any step it is not sure about.
            Litos never sneaks past those checks.
          </p>
          <p>
            You connect Gmail or Outlook on a page run by Composio. Your
            password never goes through Litos. Composio holds that connection
            for your account. If you disconnect in Settings, we ask Composio
            to cut the connection and we remove it from our side.
          </p>
        </Section>

        <Section title="Questions about race and gender">
          <p>
            Litos always picks "I would rather not say" on these. It only
            answers them if you tell it to, inside the extension.
          </p>
        </Section>

        <Section title="Billing">
          <p>
            Stripe handles payments. We never see or keep your card number.
            Cancelling takes the same number of clicks as signing up. The link
            is in your receipt email.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We delete the resume files we make after 30 days. Your dashboard
            still shows which resume went to which job, but the file is gone
            and old links stop working.
          </p>
          <p>
            A link to a resume file stops working after about an hour. If a
            link ends up somewhere it should not, it is already dead.
          </p>
          <p>
            The resume you upload is read once to build your profile and is not
            kept as a file. Everything else described above is kept for as long
            as your account is open.
          </p>
        </Section>

        <Section title="Export and deletion">
          <p>
            Email{" "}
            <a href="mailto:mehekman@usc.edu" className="text-ink underline">
              mehekman@usc.edu
            </a>{" "}
            from your account address to export or delete everything Litos
            stores about you.
          </p>
          <p>
            Deleting removes all of it. Your account. The facts we read from
            your resume. Your answers, both the ones you typed and the ones we
            watched you type. Your emails. Your form history. Every resume we
            made, files and all. You cannot undo this.
          </p>
          <p>
            People are the one thing that stays. A person at a company is a
            real person. We save them once, and everyone who looks up that
            company sees the same one, so it is not yours to delete. Which
            people you saw, and what you wrote to them, is yours. That does
            get deleted.
          </p>
          <p>
            We also keep notes on which kinds of emails get replies. Your
            name is stripped off, so they cannot lead back to you.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            Same address:{" "}
            <a href="mailto:mehekman@usc.edu" className="text-ink underline">
              mehekman@usc.edu
            </a>
            . You will get an answer from a person.
          </p>
        </Section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-xs text-faint">
          <span>&copy; {new Date().getFullYear()} Litos</span>
          <Link href="/" className="hover:text-muted">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
