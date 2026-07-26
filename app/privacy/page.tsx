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
            Only the page you are actively viewing, and only when it is a job
            posting on a supported platform (Greenhouse, Lever, Ashby, Workday,
            LinkedIn) or a LinkedIn profile you opened. There is no bulk
            collection and no background scraping. If you are not on a posting,
            it reads nothing.
          </p>
        </Section>

        <Section title="What we store">
          <p>
            Your account email and, if you use Google to sign in, the stable
            Google account identifier used to recognize that login. We do not
            receive your Google password or access to your Google files or
            inbox from sign-in. The profile we parse out of the resume you
            upload, including your experience bank. We read that upload once to
            build the profile and do not keep the file itself. Your application
            details, which reach us two ways: values you enter in Settings, and
            values the extension learns while it watches you fill your first
            application during onboarding (the next section says exactly how
            that works and what it will never learn). The contacts we resolved,
            the drafts we wrote, and the tailored resumes we generated, so your
            dashboard can show them back to you.
          </p>
          <p>
            Application details that are sensitive (phone, location,
            citizenship, date of birth, availability, salary) are encrypted at
            rest. Your work authorization and sponsorship answers are stored as
            plain yes/no values, not encrypted.
          </p>
        </Section>

        <Section title="Learning your profile from your first application">
          <p>
            Starting with extension version 0.4.0, onboarding works by
            watching, not asking. The first job application you fill in by
            hand, on the employer&apos;s own form, teaches Litos your
            answers: while onboarding is open and you are on a recognized
            application page, the extension reads what you type into that form
            and saves it to your profile, so you never type it again. Versions
            before 0.4.0 do not do this; they only store what you enter in
            Settings.
          </p>
          <p>
            This learning is passive. It never fills, clicks, or submits
            anything by itself, and it only records what you yourself typed:
            values the extension wrote, or a script wrote, are ignored. It can
            learn at most these seventeen fields: phone, city, state, zip,
            country, LinkedIn URL, GitHub URL, portfolio URL, citizenship,
            date of birth, availability date, availability term, desired
            salary, GPA, GPA scale, major, and how you heard about the role.
            Anything that is not one of those fields, including anything that
            looks like an essay, is not recorded.
          </p>
          <p>
            Three promises about it. First, it never learns your work
            authorization, sponsorship, or self-identification answers. Those
            questions are refused in the extension, refused again by the
            server, and there is no place in the learned profile they could
            even be stored. Second, it never overwrites: a value you entered
            in Settings always wins over one we watched you type. Third, it
            ends. Learning stops for good the moment your onboarding
            completes, and it does not restart.
          </p>
        </Section>

        <Section title="Contacts and outreach">
          <p>
            Contact emails are found and verified against public professional
            sources, and every contact is labeled with how confident we are.
            If we cannot verify an address, we say so and never guess one. We
            never resell contact data.
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

        <Section title="Application verification">
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
            Automatic submission and automatic verification are separate,
            optional permissions. You can turn either one off in Settings.
          </p>
        </Section>

        <Section title="Application verification">
          <p>
            If you turn on automatic verification, Litos can use a Gmail or
            Outlook account you already connected to look for a verification
            code while an application is actively waiting for one. Litos only
            accepts a recent code from a sender domain associated with the job
            portal you are using. The code is used for that application and is
            not saved to your Litos profile or application record.
          </p>
          <p>
            This permission is optional and can be turned off in Settings.
            Turning it off makes Litos pause for you whenever an application
            needs an email verification code. Litos also pauses for CAPTCHA,
            MFA that requires your device or identity, and any verification
            step it cannot complete with high confidence. Litos does not bypass
            those portal security controls.
          </p>
          <p>
            Gmail and Outlook authentication is handled through Composio&apos;s
            hosted connection page. Your provider password does not pass
            through Litos. Composio stores and refreshes the OAuth connection
            for your Litos account. Disconnecting an account in Settings asks
            Composio to revoke supported provider tokens and removes the
            connection from Litos&apos;s Composio project.
          </p>
        </Section>

        <Section title="EEO and demographic questions">
          <p>
            Voluntary self-identification questions default to
            decline-to-answer everywhere. They are only ever filled with a
            value if you explicitly opt in inside the extension.
          </p>
        </Section>

        <Section title="Billing">
          <p>
            Payments are processed by Lemon Squeezy. We never see or store your
            card number. We use your request country, your network-derived
            country, and the billing country Lemon Squeezy returns to apply and
            verify regional pricing. We keep the price, country, pricing policy,
            and experiment group attached to a checkout so renewals and billing
            support can be handled consistently.
          </p>
          <p>
            Litos may test different prices within a regional price band to
            understand willingness to pay. Assignment is pseudonymous and
            stable, and does not use your resume, applications, school,
            ethnicity, gender, or other sensitive profile details. Canceling
            takes the same clicks as signing up, from the billing portal linked
            in your receipt email.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Generated resume PDFs are deleted 30 days after we make them. The
            record of what we tailored for which job stays in your dashboard,
            but the file itself is gone and any link to it stops working.
          </p>
          <p>
            Links to a resume file expire about an hour after they are issued,
            so a link that ends up somewhere it should not be does not stay a
            working key to your resume.
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
            Deletion removes your account, the profile parsed from your resume,
            your experience bank, your application details, both the ones you
            saved and the ones learned during onboarding, your drafts, your
            autofill history, and every resume we generated for you, including
            the files. It cannot be undone.
          </p>
          <p>
            Contacts are the one exception, and not because we keep them for
            you. A contact record is a real person at a company. We store it
            once per company and everyone who looks up that company sees the
            same record, so it is not yours to delete and removing your account
            does not remove it. Which contacts you were shown, and what you
            drafted to them, is yours and does get deleted.
          </p>
          <p>
            We also keep anonymous outcome rows, meaning which kind of intro
            tends to get a reply, with the link to your account removed so they
            cannot be traced back to you.
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
