import { Header } from "@/components/Header";
import Link from "next/link";

export const metadata = {
  title: "Privacy",
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
      <h2 className="text-lg font-medium tracking-tight text-ink">{title}</h2>
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
        <h1 className="text-section font-[450] tracking-tight text-ink">
          What we do with your data.
        </h1>
        <p className="mt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Last updated: July 31, 2026
        </p>
        <p className="mt-6 text-sm leading-6 text-muted">
          Litos is a Chrome extension and web dashboard. Open a job posting
          yourself, or pick one Litos found for you, and it builds a resume
          tailored to that posting, fills out the application form, and drafts
          an outreach email to a real person at the company. This policy says
          exactly what that requires us to read and store, in plain language.
          Some of it happens in your browser and some of it happens on our
          servers, and the sections below say which is which. It will grow as
          the product does, and the date above changes every time it does.
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
            that tells us it is you. Signing in never gives us your Google
            password, your files, or your inbox. (Connecting your email so
            Litos can find a sign-in code is a separate thing you switch on
            yourself. &ldquo;Codes sent to your email&rdquo;, below, says
            exactly what that lets us see.) We store the facts we read out of your
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

        <Section title="Product analytics">
          <p>
            We use PostHog to understand which Litos website pages and Chrome
            extension actions are useful, such as opening the extension,
            completing sign-in, generating or filling an application, recording
            a submission outcome, drafting outreach, or starting checkout. When
            a page fails to load and shows you a recovery screen, we send the
            name of that screen and a reference code for the failure, without
            the error text. When a
            job-title search returns no matches, we
            also send the normalized job title and selected location, remote,
            and visa-sponsorship filters so we know which job sources to add.
            Entries that resemble an email address, phone number, or website
            are discarded instead. PostHog receives a random browser or extension
            installation identifier, the website page path, basic browser and
            device information, and the named action with limited context. For
            extension fills, that context can include the application platform,
            field counts, and whether an opt-in submission completed. It does not
            include the job URL, company or role name, resume, or form answers.
            The extension queues up to 50 sanitized events on your device while
            delivery is unavailable and removes each one after PostHog accepts it.
            The extension identifier changes when you sign out. We do
            not send your email address or account identity to PostHog.
          </p>
          <p>
            Automatic click and form tracking, session recording, and automatic
            error capture are turned off. We do not send resume text, job
            descriptions, application answers, contact messages, passwords,
            codes, or other form contents as analytics events. PostHog acts as our
            analytics service provider and may process network information
            needed to receive these events.
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
            its own. It only saves what you typed yourself. There are
            seventeen things it can learn, and nothing else:
          </p>
          {/* Seventeen items were a single sentence, which is a list wearing
              a disguise. A reader checking whether their own answer is on it
              had to parse the whole thing. */}
          <ul className="ml-5 list-disc space-y-1">
            <li>Phone, city, state, zip, country</li>
            <li>LinkedIn link, GitHub link, portfolio link</li>
            <li>Citizenship and birthday</li>
            <li>Start date, and how long you can work</li>
            <li>The pay you want</li>
            <li>GPA, GPA scale, major</li>
            <li>How you heard about the job</li>
          </ul>
          <p>
            Anything else, including anything that looks like an essay, is not
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
            Applications are sent only when you click Submit, unless you have
            turned on the setting that lets Litos send without asking you each
            time. With that setting on, Litos may send an application you
            started, once it has checked that every answer is backed up and
            that the page puts nothing in the way. In the extension you get a
            15-second countdown, and one click cancels it. From the dashboard
            it can go as soon as those checks pass. Missing or
            conflicting facts, anything you have to swear to, a check that
            you are human, a page Litos cannot drive, and any confirmation it
            is unsure of all stop it and wait for you.
          </p>
        </Section>

        <Section title="Codes sent to your email">
          <p>
            Some job sites email you a code before they will take your
            application. If you turn this on, Litos can look in the Gmail or
            Outlook you connected and find that code while the form is waiting
            for it. It only takes a code that just arrived, and only from the
            site you are applying to. It uses the code once. It never saves
            it, and it never uses this to read or send any other mail.
          </p>
          <p>
            You choose this, and you can turn it off in Settings. If it is
            off, Litos stops and waits for you whenever a code is needed. It
            also stops for the puzzles that check you are human, for a code
            sent to your phone or your authenticator app, and for any step it
            is not sure about. Litos never sneaks past those checks.
          </p>
          <p>
            Sending applications without asking, and finding codes, are two
            separate choices. You can turn either one off in Settings.
          </p>
          <p>
            You connect Gmail or Outlook on a page run by Composio, a company
            we use to hold that connection for your account. Your password
            never goes through Litos. If you disconnect in Settings, we ask
            Composio to cut the connection and we remove it from our side.
          </p>
        </Section>

        <Section title="Questions about race and gender">
          <p>
            The extension&apos;s setup screen asks for these, and they are
            optional. Whatever you enter is stored and used to answer the same
            questions on application forms, so you never type them twice.
            Leave them blank, which is what happens if you skip that section,
            and Litos picks &ldquo;I would rather not say&rdquo; every time. It never
            works an answer out from anything else about you.
          </p>
        </Section>

        <Section title="Billing">
          <p>
            Stripe handles payments. We never see or keep your card
            number.
            Cancelling takes the same number of clicks as signing up. The link
            is in Settings.
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
            kept as a file. Account-linked product data described above is kept
            for as long as your account is open. Anonymous product analytics is
            retained separately and is not linked to your Litos account.
          </p>
        </Section>

        {/* support@trylitos.com is the ONE address users are given. Mehek's
            call 2026-07-28 made it mehekbuilds@gmail.com to collapse four
            different support contacts into one; 2026-08-03 moved that one onto
            the domain, once Google Workspace was set up on trylitos.com. It is
            an alias of admin@trylitos.com, so mail to it lands in the same
            inbox. The other surfaces now read the same address from env rather
            than hardcoding it: /v1/meta via PRODUCT_SUPPORT_EMAIL and the
            /contact form via CONTACT_INBOX. The address that fulfils the
            deletion promise is the one that matters most to get right, and it
            should be on the product's own domain, not a personal mailbox. Do
            not reintroduce another one here. */}
        <Section title="Export and deletion">
          <p>
            Email{" "}
            <a href="mailto:support@trylitos.com" className="text-ink underline">
              support@trylitos.com
            </a>{" "}
            from your account address to export or delete your account-linked
            Litos data.
          </p>
          <p>
            Deleting removes all account-linked product data. Your account. The
            facts we read from your resume. Your answers, both the ones you
            typed and the ones we watched you type. Your emails. Your form
            history. Every resume we made, files and all. Anonymous product
            analytics is not linked to the account deletion request. You cannot
            undo this.
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
            <a href="mailto:support@trylitos.com" className="text-ink underline">
              support@trylitos.com
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
