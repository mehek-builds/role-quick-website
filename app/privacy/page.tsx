export const metadata = {
  title: "Privacy — Role Quick",
};

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Privacy Policy
      </h1>
      <p className="mt-4 text-sm text-faint">Draft, placeholder pending v0 launch.</p>

      <div className="mt-10 space-y-6 text-sm leading-6 text-muted">
        <p>
          Role Quick is a Chrome extension that helps you find contacts for a
          job posting and drafts a personalized email. This page will be
          replaced with the full policy before the extension is submitted for
          Chrome Web Store review.
        </p>
        <p>
          At a minimum, the final policy will cover: what page data the
          extension reads (only the job posting or LinkedIn profile you are
          actively viewing, never bulk or background scraping), what we store
          (your resume-derived profile, resolved contacts, and draft history),
          how contact emails are generated and verified, that we never resell
          contact data, and that sending is always initiated by you from your
          own Gmail account.
        </p>
        <p>
          Questions in the meantime:{" "}
          <a href="mailto:mehekman@usc.edu" className="text-ink underline">
            mehekman@usc.edu
          </a>
          .
        </p>
      </div>
    </div>
  );
}
