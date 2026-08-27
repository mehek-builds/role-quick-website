import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

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
      {/* Header is a fixed floating pill now, clear it before content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-20 pt-32">
        <h1 className="text-section font-[450] tracking-tight text-ink">
          What we do with your data.
        </h1>
        <p className="mt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          Last updated: August 14, 2026
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          This update explains the optional LinkedIn connections import, the
          seven-day no-card trial, and which plans may use opt-in automatic
          submission.
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

        <Section title="Policy history">
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="font-medium text-ink">August 14, 2026:</strong> added LinkedIn connections import, trial and Litos+ billing behavior, and paid automatic-submission access.</li>
            <li><strong className="font-medium text-ink">August 11, 2026:</strong> disclosed the filled-form and confirmation-page pictures, and set a 7-day window for the filled-form one.</li>
            <li><strong className="font-medium text-ink">August 10, 2026:</strong> added the cookie inventory and control path.</li>
            <li><strong className="font-medium text-ink">July 31, 2026:</strong> clarified analytics identity, deletion, and connection-code handling.</li>
          </ul>
        </Section>

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
            We also take two pictures of the company&apos;s own page. One is of
            the form after Litos fills it in, so you can check every answer
            before you send it, and so you can see what happened if it stops
            partway. The other is of the confirmation page after you send, so
            you have proof it arrived. Both are pictures of a whole page with
            your details already on it, so treat them as you would the
            application itself. &ldquo;How long we keep it&rdquo;, below, says
            how long each one lasts.
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
            The extension identifier changes when you sign out.
          </p>
          <p>
            When you are signed in on the website, we send PostHog your Litos
            account identifier so that the pages you visit before signing in and
            the actions you take afterwards can be read as one journey. That
            identifier is the random internal ID your account already has in our
            database. We do not send your email address, your name, or anything
            you have typed. Our backend also reports the single fact that an
            account was created, against the same identifier, because ad and
            privacy blockers stop that report reaching us from the browser and we
            would otherwise be unable to count sign-ups accurately. If you delete
            your account, we delete the linked PostHog profile as part of the same
            request.
          </p>
          <p>
            Automatic click and form tracking and automatic error capture are
            turned off. Session recording is on: PostHog stores a recording of
            what happens on your screen during a visit, with typed input
            values masked. It does not mask rendered page text or images, so
            content already on screen, such as a resume or application
            details, can appear in a recording. We do not send resume text,
            job descriptions, application answers, contact messages,
            passwords, codes, or other form contents as analytics events.
            PostHog acts as our analytics service provider and may process
            network information needed to receive these events.
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
            active trial or paid Litos+ access and have turned on the separate
            setting that lets Litos send without asking you each time. Free filling
            never requires this setting: Litos fills the form, then waits for
            you to use the employer site&apos;s final submit control. With the
            setting on, Litos may send an application you started once it has
            checked that every answer is backed up and that the page puts
            nothing in the way. In the extension you get a 15-second countdown,
            and one click cancels it. From the dashboard it can go as soon as
            those checks pass. Missing or
            conflicting facts, anything you have to swear to, a check that
            you are human, a page Litos cannot drive, and any confirmation it
            is unsure of all stop it and wait for you.
          </p>
        </Section>

        <Section title="LinkedIn connections import">
          <p>
            Network import is optional and starts only after you open Network,
            read the consent screen, and choose a LinkedIn connections CSV file
            yourself. Uploading the file does not send a LinkedIn message,
            change your LinkedIn account, or connect Litos to your LinkedIn
            password.
          </p>
          <p>
            Litos validates the export before importing it and shows you an
            accepted and rejected row preview before anything is committed. We
            use imported names, public profile links, companies, roles, and
            connection facts to show people you already know, connected
            companies, and possible referral paths. Premium network insights
            require active trial or Litos+ access. Network management and
            deletion remain available if that access ends.
          </p>
          <p>
            The raw CSV is deleted after parsing and no later than 24 hours.
            Disconnect stops future use. Imported data stays retained after
            disconnect so you can delete it later. Delete removes imported
            network data, including people, relationship edges, company
            matches, and derived indexes, within 24 hours.
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
            number. A new account&apos;s seven-day Litos+ trial does not require a
            card and does not schedule a charge. Paid Litos+ renews for the
            selected one-week, one-month, or three-month period until you
            cancel. Cancelling takes the same number of clicks as signing up.
            The link is in Account.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We delete each original rendered resume file after 30 days. The
            immutable generated content stays with its application. If you
            later choose Download, Litos creates a fresh, short-lived rendering
            from that content. Old capability links still expire and stop
            working.
          </p>
          <p>
            We delete the picture of the filled-in form after 7 days. You only
            need it while you are checking the form, or working out why it
            stopped, and it holds everything that was on the page at once, so
            it goes sooner than anything else.
          </p>
          <p>
            We keep the picture of the confirmation page for as long as your
            account is open. It is your proof the application arrived, and that
            is worth having long after you sent it. Deleting your account
            deletes it with everything else.
          </p>
          <p>
            A link to a resume file stops working after about an hour. If a
            link ends up somewhere it should not, it is already dead.
          </p>
          <p>
            The resume you upload is read once to build your profile and is not
            kept as a file. Account-linked product data described above is kept
            for as long as your account is open. Product analytics is retained
            separately by PostHog. Events recorded before you sign in are not
            linked to your account; events recorded while you are signed in on
            the website carry your account identifier, and that profile is
            deleted when you delete your account.
          </p>
          {/* This paragraph ships ahead of the code it describes, on purpose.
              The page has to say we keep an attached file before the endpoint
              can store the first byte of one, so no file is ever held under a
              policy that did not mention it. Two clauses are load-bearing and
              neither is decoration. "We encrypt it" is why the upload path
              seals the bytes before writing them: a Vercel Blob object is
              public-read forever to anyone who has its URL, so the stored
              object is ciphertext, not a readable PDF. "until you remove it"
              is why the attached-file card carries a remove action; with no
              delete a user can actually reach, this line is a promise the
              product cannot keep. The resume sentence above stays exactly as
              it is: uploaded resumes are still read once and thrown away, and
              this is a different kind of file with a different answer. */}
          <p>
            A file you attach to an application yourself, like a transcript, is
            different. We encrypt it and keep it until you remove it or delete
            your account, so a later application can use the same file without
            us asking you for it again.
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
            history. Every resume we made, files and all. The files you attached
            yourself. Your PostHog analytics profile goes too, along with the
            events recorded against it while you were signed in. Events recorded
            before you ever signed in carry no account identifier, so there is
            nothing there to find or remove. You cannot undo this.
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
      {/* Was a one-line bar carrying a copyright and a single "Home" link.
          Replaced 2026-08-04 by the shared footer, because leaving the stub
          would have made /privacy the one marketing page whose footer disagreed
          with every other one.

          Not a superset, which is what this comment first claimed and is worth
          correcting rather than rounding off. The stub had an explicit
          href="/"; the shared footer has ten hrefs and none of them is "/".
          Nothing is unreachable, since the header wordmark on this page goes
          home and renders at every width, but it is one more click than it was,
          and "strictly supersedes" was the kind of sentence that stops anyone
          checking.

          The stub also carried `border-t border-border`, which the shared
          footer does not, so /privacy and /terms now run into the footer with
          no rule above it. Deliberately not restored. The footer is one
          component with one appearance: adding the border only here fragments
          the chrome, adding it everywhere changes the homepage, and making it
          conditional invents a variant for a problem nobody has seen. Checked
          at phone, tablet and desktop and it reads fine. It is a one-line
          change on this line if that judgement turns out wrong. */}
      <SiteFooter />
    </div>
  );
}
