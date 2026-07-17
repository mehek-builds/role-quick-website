import { Header } from "@/components/Header";

export const metadata = {
  title: "Privacy: RoleQuick",
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
          Last updated: July 17, 2026
        </p>
        <p className="mt-6 text-sm leading-6 text-muted">
          RoleQuick is a Chrome extension and web dashboard. When you open a
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
            Your account email. The profile we parse out of the resume you
            upload, including your experience bank. We read that upload once to
            build the profile and do not keep the file itself. The application
            details you choose to save for autofill. The contacts we resolved,
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
            Applications submit only when you click Submit, unless you turn on
            auto-submit. With auto-submit on, a 15-second countdown runs
            before the application goes out, and one click cancels it.
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
            Payments are processed by Stripe. We never see or store your card
            number. Canceling takes the same clicks as signing up, from the
            billing portal linked in your receipt email.
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
            from your account address to export or delete everything RoleQuick
            stores about you.
          </p>
          <p>
            Deletion removes your account, the profile parsed from your resume,
            your experience bank, your saved application details, your drafts,
            your autofill history, and every resume we generated for you,
            including the files. It cannot be undone.
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
          <span>&copy; {new Date().getFullYear()} RoleQuick</span>
          <a href="/" className="hover:text-muted">
            Home
          </a>
        </div>
      </footer>
    </div>
  );
}
