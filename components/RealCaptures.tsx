/* Real captures of the shipped product, as opposed to the DOM re-creations
   the chapter sections use.

   Provenance, because it is the whole point of this section existing:
   - extension-job.png and extension-contacts.png are the actual extension
     components, rendered by the repo's own preview harness
     (student-outreach-extension, `vite` + preview.html), captured
     2026-07-27. The harness runs the shipped components, not a mockup of
     them. The auth-error banners visible when it runs without a backend
     session were hidden before capture; nothing else was altered.
   - dashboard-emails.png is app/dashboard/outreach rendered in the
     localhost QA mode (?qa=1) with its fixture data, same date.

   The data inside is fixture data (Figma, Marcus Lee, Acme). The
   *interface* is real, and that is what the caption claims and no more.
   If you swap these images, keep the caption honest about which is
   which. */
const SHOTS = [
  {
    src: "/product/extension-job.png",
    w: 598,
    h: 900,
    alt: "The Litos extension popup on a job posting, showing the detected role, a Fill this form button, and a Find people button.",
    cap: "On a job page",
  },
  {
    src: "/product/extension-contacts.png",
    w: 598,
    h: 900,
    alt: "The Litos contacts panel listing four people at the company, ranked by likelihood of a reply, each marked either Email checked or Email is a guess.",
    cap: "People to email",
  },
  {
    src: "/product/dashboard-emails.png",
    w: 1400,
    h: 933,
    alt: "The Litos dashboard Emails page, listing drafts that were written, sent, and replied to.",
    cap: "After you send",
  },
];

function Shot({
  src,
  w,
  h,
  alt,
  cap,
}: {
  src: string;
  w: number;
  h: number;
  alt: string;
  cap: string;
}) {
  return (
    <figure className="flex flex-col">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={w}
          height={h}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full"
        />
      </div>
      <figcaption className="mt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        {cap}
      </figcaption>
    </figure>
  );
}

export function RealCaptures() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mx-auto max-w-[560px] text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
          Real photos
        </p>
        <h2 className="mt-3 text-[32px] font-[450] tracking-[-0.02em] text-ink">
          This is the real thing.
        </h2>
        <p className="mt-4 text-[15px] leading-7 text-muted">
          The pictures above are drawings, so they can move. These three are
          real photos of the app. The names in them are made up.
        </p>
      </div>

      {/* Two portrait popups on one row, the landscape dashboard on its own
          below. Three-up made the wide shot a stamp next to two tall ones. */}
      <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {SHOTS.filter((s) => s.w < s.h).map(({ src, w, h, alt, cap }) => (
          <Shot key={src} {...{ src, w, h, alt, cap }} />
        ))}
      </div>
      <div className="mt-6">
        {SHOTS.filter((s) => s.w >= s.h).map(({ src, w, h, alt, cap }) => (
          <Shot key={src} {...{ src, w, h, alt, cap }} />
        ))}
      </div>
    </div>
  );
}
