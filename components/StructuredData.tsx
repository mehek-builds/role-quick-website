import { SITE_URL, STORE_URL } from "@/lib/config";

/* Structured data. The page had none, which cost it two things it had
   already earned: the FAQ is genuinely well written and is exactly what
   FAQPage rich results are for, and a Chrome extension is a
   SoftwareApplication with an install target.

   Deliberately absent: aggregateRating and any user/install count. Google
   requires those to be real and visible on the page, and Litos is holding
   all traction numbers until 50 users (see the vault's social-proof open
   item). Adding a rating here before then would be both a lie and a
   structured-data violation. */
export function StructuredData({
  faq,
}: {
  faq: { q: string; a: string }[];
}) {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Litos",
        url: SITE_URL,
        applicationCategory: "BrowserApplication",
        operatingSystem: "Chrome",
        installUrl: STORE_URL,
        description:
          "Litos tailors your resume to the posting, fills out the application, and drafts personalized outreach to a real person at the company. You get the final say.",
        featureList: [
          "Tailors your resume to the posting you are viewing",
          "Fills the application form from answers you approved",
          "Finds and verifies contacts, alumni first",
          "Drafts outreach in your voice and leaves it in Gmail",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
