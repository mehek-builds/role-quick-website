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
          Last updated: July 4, 2026
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
            Your account email. The resume PDF you upload and the profile
            parsed from it, including your experience bank. The application
            details you choose to save for autofill. The contacts we resolved,
            the drafts we wrote, and the tailored resumes we generated, so your
            dashboard can show them back to you.
          </p>
          <p>
            Application details that are sensitive (phone, location,
            citizenship, work authorization, availability, salary) are
            encrypted at rest.
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
            auto-submit. With auto-submit on, a nine-second countdown runs
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

        <Section title="Export and deletion">
          <p>
            Email{" "}
            <a href="mailto:mehekman@usc.edu" className="text-ink underline">
              mehekman@usc.edu
            </a>{" "}
            from your account address to export or delete everything RoleQuick
            stores about you. Deletion removes your profile, experience bank,
            contacts, drafts, and generated resumes.
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
