"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ApplicationReview, type GeneratedResume, type ResumeSpec } from "@/lib/api";
import { canonicalApplicationFromPacket, isStubPacketSpec, sectionHeading, startsNewSection, statusLabel, stripMetadata, withoutHistoricalPacketAuditStaleAttention } from "@/features/applications";
import { cleanJdCapture, cleanScrapedLabel, cleanScrapedPrompt, completedSubmissionGroups, displayQuestionLabel, humanInputItems, unconfirmedDocumentItems, type SubmissionChecklistItem } from "@/features/applications";
import { resumeContactLine } from "@/lib/resumeContact";
import { userFacingError } from "@/lib/user-facing-error";
import { useDashboardOverlayExit } from "@/components/app/useDashboardOverlayExit";

/* REVISITING AN APPLICATION, against real packet data.
 *
 * Designed in the sandbox at /qa/packet and ported here. The shape is the same,
 * the content is not: everything below comes off the packet the backend already
 * returns, and where the backend has nothing, this shows nothing rather than
 * inventing something that reads true.
 *
 * WHAT THE SANDBOX HAD THAT THIS DOES NOT, and why:
 *
 *   - A provenance line under every answer ("Profile", "Written from your resume
 *     and this posting"). ApplicationQuestion carries id, question, answer, kind
 *     and required, and nothing about where the answer came from. Printing a
 *     source we do not store would be a fabricated audit trail on the one screen
 *     whose entire job is to be checkable. `kind` and `required` are real and are
 *     shown instead. Restoring the line means a backend field, not a guess here.
 *
 *   - The outreach email. The applications API has no outreach on the packet
 *     (GeneratedResume has no such field), so there is no fourth section.
 *
 * WHAT THIS HAS THAT THE SANDBOX DID NOT: the fields the portal actually filled
 * (review.filled_fields), and the company's own confirmation (review.receipt),
 * both of which are the strongest evidence on the screen and both of which only
 * exist for a real submission.
 */

/* THESE KEY NAMES ARE THE BACKEND'S, and they are the whole point of this function.
   The list used to read ["location", "email", "phone", "linkedin", "website"], of which
   three matched nothing: `_contact` is stored verbatim from the resume request body
   (routes/resume.ts `_contact: body.contact`), whose schema is full_name, email, phone,
   linkedin_url, github_url, portfolio_url. There is no `location` and the URL fields carry
   the `_url` suffix, so a student with a LinkedIn on their rendered PDF saw no LinkedIn here
   and had no way to tell the field was missing from the file or just from this pane.

   It failed silently because a missing key is indistinguishable from an empty one after the
   filter. If these ever drift again they will drift the same quiet way, so the order below is
   the renderer's order (engine/resumeRender.ts contactLine) rather than a fresh opinion. */
export function contactName(spec: GeneratedResume["spec"]): string {
  return (spec._contact?.full_name ?? "").trim();
}

export function contactLine(spec: GeneratedResume["spec"]): string {
  return resumeContactLine(spec._contact ?? {});
}

/* The resume, read-only, from the same spec the editor renders. Black and white
   only, which is the standing rule on every surface that shows a resume.

   THE HEADER IS THE APPLICANT, NOT THE SCHOOL. This pane used to open with `spec.school` in the
   name slot, centred and heaviest on the page, with degree and dates beneath it: a student
   checking the document they were about to send read their university where their own name
   belongs. The cause is that `ResumeSpec` has no name field at all - the applicant lives on
   `_contact.full_name`, a sibling that `stripMetadata` deliberately drops - so education simply
   floated up into the empty first slot and took the EDUCATION heading down with it.

   The renderer (engine/resumeRender.ts, drawHeader + drawEducation) is the artifact this claims
   to depict, so the order here is its order: name, target role, rule, contact details, and then
   education as a section like any other. A preview that composes differently from the file is
   worse than no preview, because the student approves one document and the employer receives
   another.

   EXPORTED, AND THE ONLY RESUME PAPER IN THE APP. The dashboard's review pane used to carry its
   own private copy of this component, which was never given the fix above: it opened with
   `job_context.role` over `job_context.company`, so the "Check before you send" screen showed the
   posting's job title where the applicant's name belongs and named neither the student nor their
   contact details. Two renderers of one document is the defect, not the styling of either, because
   only one of them was ever going to receive the next correction. Anything that shows a spec as a
   document imports this. */
export function ResumePaper({
  spec,
  name,
  contact,
}: {
  spec: ResumeSpec;
  name: string;
  contact: string;
}) {
  const types = spec.experience.map((entry) => entry.type);
  const education = <Education spec={spec} />;
  /* Mirrors resumeContentBlocks(): education leads unless the spec says it sits after the
     experience sections, which is what a graduate's resume does. */
  const educationAfterExperience = spec.education_position === "after_experience";
  return (
    <div className="ph-no-capture rounded-inner border border-border bg-white px-6 py-6 text-[10.5px] leading-[1.5] text-black">
      {/* ph-no-capture: PostHog's default block class. This renders the applicant's name, contact
          details, and GPA, same as components/start/ResumePaper.tsx - session recording shows an
          opaque box here instead of the real content (Mehek, 2026-08-27). */}
      {/* THE TARGET ROLE IS NOT PART OF THE HEADER. The renderer stopped printing it (backend
          "the header is the applicant, not the posting's job title"), so printing it here would put
          a line in the preview that is not on the file the employer receives, which is the exact
          class of drift this pane keeps being fixed for. `spec.target_role` is still on the packet
          and still drives targeting; it is just not something the document says.

          The header is now the name, a rule, and the contact line. On packets predating `_contact`
          there is no name, so education leads under a real EDUCATION heading. */}
      {name && <p className="text-center text-[14px] font-semibold tracking-tight">{name}</p>}
      {/* Identity above the rule, ways to reach that person below it: two different kinds of
          fact, so the eye gets a divider rather than a paragraph. Same rule the PDF draws. */}
      {contact && (
        <>
          <div className="mt-1.5 h-px w-full bg-neutral-300" />
          <p className="mt-1.5 text-center text-[9px] text-neutral-600">{contact}</p>
        </>
      )}

      {!educationAfterExperience && education}

      {spec.experience.map((entry, index) => (
        <div key={`${entry.org}-${entry.title}-${index}`}>
          {startsNewSection(types, index) && (
            <p className="mt-4 border-b border-neutral-300 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
              {sectionHeading(entry.type)}
            </p>
          )}
          {/* ORG ON THE SPLIT LINE, TITLE ITALIC BENEATH, matching drawEntrySection() +
              drawSplitLine(). This printed `{entry.title} · {entry.org}` as one bold line, which
              is not a line the PDF has anywhere: the renderer puts the organisation alone on the
              split line with the date pushed right, then the role in italic underneath. Same two
              facts, different hierarchy, and the hierarchy is the point. A resume is read by
              scanning the left edge for where someone worked; folding the role into that line
              makes the employer the second thing on it and gives the scan nothing to land on.

              No `truncate` on the organisation. The renderer wraps it inside 72% of the usable
              width, so truncating here shows LESS than the file does, and hiding content is the
              one thing a preview of a document must never do. It wraps now, same as the PDF. */}
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 flex-1 text-[11px] font-semibold">{entry.org}</p>
              <p className="shrink-0 text-[9px] text-neutral-600">{entry.location}</p>
            </div>
            {(entry.title || entry.date_range) && (
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <p className="min-w-0 flex-1 italic text-neutral-600">{entry.title}</p>
                <p className="shrink-0 text-[9px] text-neutral-600">{entry.date_range}</p>
              </div>
            )}
            <ul className="mt-1 space-y-1">
              {entry.bullets.map((bullet, bulletIndex) => (
                <li key={bulletIndex} className="grid grid-cols-[10px_1fr] gap-1">
                  <span aria-hidden="true">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      {educationAfterExperience && education}

      {spec.skills.length > 0 && (
        <>
          <p className="mt-4 border-b border-neutral-300 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
            Skills
          </p>
          {/* The renderer joins skills with `•`, not `·`. A different separator is a small thing
              until the student compares the two documents side by side, which is the entire
              purpose of this pane. */}
          <p className="mt-2">{spec.skills.join(" • ")}</p>
        </>
      )}
    </div>
  );
}

/* Education as a real section, matching drawEducation(): school on the left with the grad date
   pushed right on the same line, degree in italic beneath, and coursework carrying the renderer's
   own "Relevant coursework:" lead-in. It was previously two centred lines under the top of the
   page and a separate "Coursework" section further down, neither of which the PDF has. */
function Education({ spec }: { spec: ResumeSpec }) {
  if (!spec.school && !spec.degree && !spec.grad_date && !spec.coursework) return null;
  return (
    <>
      <p className="mt-4 border-b border-neutral-300 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
        Education
      </p>
      {/* Two split lines, matching drawEducation(): school with the place, then degree with the
          date. The date used to sit beside the school and the degree line had no right column, so
          the eye had nowhere consistent to read dates from. */}
      <div className="mt-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 flex-1 text-[11px] font-semibold">{spec.school}</p>
          <p className="shrink-0 text-[9px] text-neutral-600">{spec.school_location}</p>
        </div>
        {(spec.degree || spec.grad_date) && (
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <p className="min-w-0 flex-1 italic text-neutral-600">{spec.degree}</p>
            <p className="shrink-0 text-[9px] text-neutral-600">{spec.grad_date}</p>
          </div>
        )}
        {/* Between the degree and the coursework, the order drawEducation() prints them in. Absent
            is the normal case and shows nothing: a resume that never stated a GPA is not missing
            one. */}
        {spec.gpa && <p className="mt-0.5">GPA: {spec.gpa}</p>}
        {spec.coursework && <p className="mt-0.5">Relevant coursework: {spec.coursework}</p>}
      </div>
    </>
  );
}

function SectionHeading({ id, eyebrow, title, note }: { id: string; eyebrow: string; title: string; note?: string }) {
  return (
    <div id={id} className="scroll-mt-4">
      {/* text-muted, not text-faint. The eyebrow is not a decorative repeat of the title: it carries
          "01 · Resume" against a prose title ("The resume they received"), so the ordinal and the
          section's real name live here and nowhere else, and the jump nav above scrolls people
          straight to it. That makes it the landing confirmation for a wayfinding control, the same
          job the /start rail's step count does, and the same reason that one is muted. Faint is
          #a3a19a, 2.6:1 on this surface, which fails AA for 10px regular text; muted is 5.4:1 and
          still sits well behind the title. */}
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{eyebrow}</p>
      <h3 className="mt-1.5 text-[15px] font-medium tracking-tight text-ink">{title}</h3>
      {note && <p className="mt-1 text-[12px] leading-5 text-muted">{note}</p>}
    </div>
  );
}

/* filled_fields arrives as a flat list of names, with answers to discovered
   questions prefixed "question:" (the same convention the review screen already
   un-prefixes for its chips).

   AND IT IS A DOM CAPTURE, so one field can arrive as several captures of itself concatenated:
   "Preferred first name* preferred first name preferred_name" - the visible label, the accessible
   name and the raw form key - measured live 2026-08-29. This is the record of what was submitted on
   the applicant's behalf, and printing the employer's form internals into it reads as a bug in the
   record itself. cleanScrapedLabel is conservative and never returns empty (see scraped-text.ts),
   so a label with nothing duplicate in it arrives here unchanged. */
function fieldLabel(field: string): string {
  const unprefixed = field.startsWith("question:") ? field.slice("question:".length).trim() : field;
  /* Cased as well as de-duplicated, which the first pass at this missed. Verified live on the
     Verkada packet 2026-08-29: the stored fields are a lowercased DOM read, so stripping the
     duplicate captures out of "question:preferred first name preferred first name preferred_name"
     left "preferred first name", and the chips beside it still read "when do you graduate?" and
     "what is your gpa?". Removing the junk and leaving the result in the employer's DOM casing only
     half-answers the point of doing it at all. Same composition displayQuestionLabel uses, so a
     field chip and a question row cannot present the same label two ways. */
  return cleanScrapedPrompt(cleanScrapedLabel(unprefixed));
}

function CheckRow({ item, checked }: { item: SubmissionChecklistItem; checked: boolean }) {
  return (
    <li className="grid grid-cols-[18px_1fr] gap-2 text-[12px] leading-5 text-muted">
      <span
        aria-hidden
        className={`mt-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border ${
          checked ? "border-teal/40 bg-teal-soft text-teal-ink" : "border-warn/40 bg-warn-soft text-warn"
        }`}
      >
        {checked ? (
          <svg viewBox="0 0 16 16" className="h-3 w-3">
            <path d="M4 8.5l2.5 2.5L12 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span>
        <span className={checked ? "text-ink" : "text-warn"}>{item.label}</span>
        {item.detail && <span className="block text-[11px] text-muted">{item.detail}</span>}
      </span>
    </li>
  );
}

function formatMoment(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function ApplicationPacket({
  packet,
  review,
  onClose,
}: {
  packet: GeneratedResume;
  review: ApplicationReview;
  onClose: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);
  /* onClose is read through a ref so the focus trap can depend only on the overlay lifecycle's
     stable requestClose function. Keying the effect on onClose meant any caller passing an inline
     arrow rebuilt the trap on every parent render, and the cleanup threw focus out of the dialog
     each time. A ref survives a caller that forgets to memoise; the parent memoises too, but only
     one of those is enforceable here. */
  const onCloseRef = useRef(onClose);
  /* Assigned in an effect, not during render: writing a ref during render is a React rule
     violation (react-hooks/refs) because it mutates state the renderer may discard. An effect with
     no dep array runs after every commit, which is exactly the freshness this needs. */
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const { closing, requestClose } = useDashboardOverlayExit({
    dialogRef: dialog,
    backdropRef: backdrop,
    onExitComplete: () => onCloseRef.current(),
  });
  /* Seeded to the resume, which is what the scroller actually shows on open. It said "packet-jd",
     so the rail asserted Job description while the reader was looking at section 01, and stayed
     wrong for any packet short enough never to scroll. */
  const [active, setActive] = useState("packet-resume");

  /* STUB HYDRATION.
   *
   * `packet` is resolved from `packets` every render (see the comment on the call site below), and
   * `packets` can hold the placeholder `canonicalTrackerPacket` writes for a Tracker row whose linked
   * legacy packet was not among the 50 full specs `/resume/history` returned: `{ _review: review }`,
   * no `_contact`, no `experience`. Rendering that straight into `ResumePaper` used to produce a
   * silently blank resume - no error, no console warning, nothing - because `stripMetadata` defaults
   * a missing `experience` to `[]` rather than throwing. `isStubPacketSpec` names that shape.
   *
   * The fetch below is the same one `page.tsx` already makes for a direct link that names an older
   * packet (`linkedHistory`, keyed off `requestedCanonicalApplication?.legacy_generated_resume_id`).
   * The id to ask for is that same field when this packet carries a canonical envelope, falling back
   * to the packet's own id: for every pre-canonical application the two are the same UUID (see
   * canonical-tracker.ts), which is why asking for `packet.id` alone already recovers the common
   * case, and asking for `legacy_generated_resume_id` first covers the rest. */
  const stub = isStubPacketSpec(packet.spec);
  /* Keyed by packet id rather than reset imperatively at the top of the effect below: every setState
     call here happens inside the fetch's own then/catch, which is what an effect that subscribes to
     an external system (the network) is supposed to do. Comparing `outcome.id` to `packet.id` at read
     time is what makes switching straight from one stub to another (no unmount in between, since the
     dialog carries no key) show that packet's own fetch rather than the previous one's leftover
     result while the new one is still in flight. */
  const [hydrationOutcome, setHydrationOutcome] = useState<
    { id: string; packet: GeneratedResume } | { id: string; failed: true } | null
  >(null);
  const hydratedPacket = hydrationOutcome && hydrationOutcome.id === packet.id && "packet" in hydrationOutcome
    ? hydrationOutcome.packet
    : null;
  const hydrationFailed = hydrationOutcome !== null && hydrationOutcome.id === packet.id && "failed" in hydrationOutcome;
  useEffect(() => {
    if (!stub) return;
    let cancelled = false;
    const hydrationId = canonicalApplicationFromPacket(packet)?.legacy_generated_resume_id || packet.id;
    api<{ resumes: GeneratedResume[] }>(`/resume/history?application=${encodeURIComponent(hydrationId)}`)
      .then((result) => {
        if (cancelled) return;
        const full = result.resumes.find((resume) => resume.id === hydrationId) ?? null;
        setHydrationOutcome(full && !isStubPacketSpec(full.spec)
          ? { id: packet.id, packet: full }
          : { id: packet.id, failed: true });
      })
      .catch(() => {
        if (!cancelled) setHydrationOutcome({ id: packet.id, failed: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packet.id, stub]);

  const sent = review.status === "submitted";
  const role = packet.job_context.role || "This application";
  const company = packet.job_context.company || "the company";
  /* The resume, the posting text, the answered questions and the receipt all live on whichever
     packet actually carries them - the hydrated one once it lands, the original before and if
     hydration never finds anything. Status and the submission timeline stay pinned to the ORIGINAL
     `review` on purpose: canonicalTrackerPacket already resolved the canonical row's status as
     authoritative over a linked packet's own (canonical-tracker.ts, canonicalStatus), and letting a
     hydrated packet's older review override that here would undo that resolution for exactly the
     packets it exists to protect. */
  const contentPacket = hydratedPacket ?? packet;
  const contentReview: ApplicationReview = hydratedPacket?.spec._review
    ? {
      ...hydratedPacket.spec._review,
      status: review.status,
      updated_at: review.updated_at,
      submitted_at: review.submitted_at,
      attention_reason: review.attention_reason,
      attention_categories: review.attention_categories,
      /* WITH the report they annotate, never split from it. The ticks are keyed by the sentence
         they were made against; taking a fresh attention_reason from `review` while keeping an
         older packet's tick map would let a stale tick settle a re-emitted, genuinely outstanding
         blocker and hide it from this list. */
      attention_acknowledgements: review.attention_acknowledgements,
      portal_url: review.portal_url,
      ats_name: review.ats_name,
    }
    : review;
  const safeContentReview = withoutHistoricalPacketAuditStaleAttention(contentReview);
  const questions = safeContentReview.questions ?? [];
  const filledFields = safeContentReview.filled_fields ?? [];
  const safeAttentionReason = safeContentReview.attention_reason
    ? userFacingError(safeContentReview.attention_reason, "Litos could not finish the company's form. Try again in a minute.")
    : undefined;
  const attentionReview = { ...safeContentReview, attention_reason: safeAttentionReason };
  /* The company, the role and what the packet already carries. Without the third of those, a
     revisited application that went out WITH its transcript would still be listed here as needing
     one, which is the same class of error as the Done column claiming a box was filled that the run
     reported empty: a record of a finished application asserting outstanding work.
     `_documents` is the packet's own stored record rather than the submission envelope, because this
     viewer resolves from `packets` and deliberately never holds a submission. */
  /* Settled rows dropped, and only here - EXCEPT the ones she ticked herself. A server-settled row
     is a confirmation that carries a control back to the thing it confirms, and this viewer is
     read-only: it has no upload handler to hand a row, and by a rule of its own it prints no action
     words at all. So one would arrive under a heading that reads "Needs your input" as a bare line
     of text with nothing to press, which is the dead pill wearing the opposite face. The review
     screen is where those rows have somewhere to go.

     An acknowledged row is the opposite case: its content IS her tick, it needs no control, and
     dropping it erased the only record of what she handled by hand - three blockers vanishing from
     the packet record with no trace, while the heading went on saying input was needed. It stays,
     rendered as done, with its detail saying whose word the tick is. */
  const inputItems = humanInputItems(attentionReview, {
    company: packet.job_context.company,
    role: packet.job_context.role,
    documents: contentPacket.spec._documents,
  });
  const needsInput = inputItems.filter((item) => !item.settled);
  const acknowledgedItems = inputItems.filter((item) => item.acknowledged === true);
  const completedItems = completedSubmissionGroups(safeContentReview);
  /* The same honesty the review screen applies, in the record of the same application. A packet
     viewer that listed a file under "Done by Litos" while the review screen said it was unconfirmed
     would be the two halves of the product disagreeing about what the employer received. */
  const unconfirmedDocuments = unconfirmedDocumentItems(safeContentReview);
  const receipt = safeContentReview.receipt;
  const sentAt = formatMoment(review.submitted_at ?? review.updated_at);
  const builtAt = formatMoment(contentPacket.created_at);
  const when = sent
    ? sentAt ? `Sent ${sentAt}` : "Sent"
    : builtAt ? `Built ${builtAt}, not sent` : "Not sent";
  /* Display only: this modal never binds audit offsets to the text, so it can drop the captured
     form chrome ("SUBMIT YOUR APPLICATION", bare field labels, "Loading") that made the pane read
     as a broken scrape. The removal is announced below rather than silent. */
  const cleanedJd = useMemo(() => cleanJdCapture(contentReview.jd_text), [contentReview.jd_text]);
  const jdParagraphs = cleanedJd.text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (dialog.current?.hasAttribute("inert")) {
        if (event.key === "Tab") event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      window.requestAnimationFrame(() => {
        previous?.focus?.();
        if (previous?.isConnected && document.activeElement === previous) return;
        const candidates = [
          document.getElementById("application-ledger-heading"),
          document.querySelector<HTMLElement>("[data-dashboard-job-focus-id]"),
          document.querySelector<HTMLElement>("main h1"),
        ];
        for (const candidate of candidates) {
          if (!(candidate instanceof HTMLElement) || !candidate.isConnected) continue;
          if (candidate.matches("h1") && !candidate.hasAttribute("tabindex")) candidate.tabIndex = -1;
          candidate.focus({ preventScroll: true });
          if (document.activeElement === candidate) return;
        }
      });
    };
  }, [requestClose]);

  const rail = [
    { id: "packet-resume", label: "Resume" },
    { id: "packet-jd", label: "Job description" },
    { id: "packet-questions", label: `Questions · ${questions.length}` },
    ...(receipt ? [{ id: "packet-proof", label: "Proof" }] : []),
  ];

  /* Coalesced to one measurement per frame, and the scroller's own rect is read once instead of
     once per section. It measured four sections and re-read the container inside the loop on every
     scroll event, so a momentum scroll forced five synchronous layouts per tick.

     Lookups are scoped to the dialog rather than document.getElementById: the ids are not unique to
     an instance, so a global lookup lets one viewer measure another one's sections. */
  const rafPending = useRef(false);
  /* WHAT THE READER CLICKED OUTRANKS WHAT THE SCROLLER MEASURES, until the scroll settles.
     A click starts a smooth scroll; the spy below fires throughout it and would repaint the rail
     with every intermediate position, so the pill the reader just pressed appeared not to take. */
  const jumpTarget = useRef<string | null>(null);
  const jumpSettle = useRef(0);
  const onScroll = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const box = scroller.current;
      const root = dialog.current;
      if (!box || !root) return;
      const rect = box.getBoundingClientRect();
      const ids = ["packet-resume", "packet-jd", "packet-questions", "packet-proof"];
      /* THE SCROLLER BOTTOMS OUT BEFORE THE LAST SECTION REACHES THE TOP, and the rule below could
         only ever name a section that had crossed the top. So on this dialog - where the questions
         section is the tail of a two-column layout - "Questions · 14" was unreachable: the pane
         scrolled to its end with the FORMS heading plainly on screen while the rail still read JOB
         DESCRIPTION, which is what made the pill take two presses to appear to work. Measured
         2026-08-29. At the end of the scroll the answer is simply the last section that exists. */
      /* GENUINE OVERFLOW ONLY. `atBottom` is trivially true on a pane that barely scrolls, and
         acting on it there would mark the LAST section active while the reader is still looking at
         the first - the same defect the seeding comment above records for a packet short enough
         never to scroll. The rule below only makes sense once there is more scrollable height than
         the 24px threshold it is standing in for. */
      const scrollable = box.scrollHeight - box.clientHeight > 24;
      const atBottom = scrollable && box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
      const present = ids.filter((id) => root.querySelector(`#${id}`) !== null);
      if (atBottom && present.length > 0) {
        setActive(jumpTarget.current ?? present[present.length - 1]);
        return;
      }
      let current = present[0] ?? ids[0];
      for (const id of present) {
        const node = root.querySelector(`#${id}`);
        if (node && node.getBoundingClientRect().top - rect.top <= 24) current = id;
      }
      setActive(jumpTarget.current ?? current);
    });
  }, []);

  function jump(id: string) {
    /* packet-resume routes to the top anchor; see the comment on #packet-top. */
    const target = id === "packet-resume" ? "packet-top" : id;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    /* Marked active immediately, and held there until the scroll stops moving. Both halves matter:
       without the immediate set the pill lags a smooth scroll, and without the hold the spy
       overwrites it mid-flight with whatever is passing under the threshold. */
    setActive(id);
    jumpTarget.current = id;
    window.clearTimeout(jumpSettle.current);
    jumpSettle.current = window.setTimeout(() => {
      jumpTarget.current = null;
    }, 600);
    dialog.current?.querySelector(`#${target}`)?.scrollIntoView({ behavior, block: "start" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        ref={backdrop}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => requestClose()}
        className={`rq-dashboard-backdrop absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px] ${closing ? "rq-dashboard-backdrop-exit" : ""}`}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Application packet: ${role} at ${company}`}
        aria-hidden={closing || undefined}
        inert={closing || undefined}
        className={`rq-dashboard-dialog relative flex h-full max-h-[92svh] w-full max-w-6xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-overlay ${closing ? "rq-dashboard-dialog-exit" : ""}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{company}</p>
            <h2 className="mt-1 truncate text-lg font-medium tracking-tight text-ink">{role}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
              {/* Teal reads as done, and a packet still waiting on the person is
                  not done. Same split the sandbox settled on. */}
              <span
                className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${
                  sent ? "border-teal/30 bg-teal-soft/60 text-teal-ink" : "border-warn/30 bg-warn-soft text-warn"
                }`}
              >
                {statusLabel(false, review.status)}
              </span>
              {/* created_at is `string | null` and submitted_at is optional, so these can both come
                  back empty. Interpolating an empty string produced the literal "Built , not sent".
                  Compute first, then choose a sentence that works without the date. */}
              <span>{when}</span>
              {review.portal_url && (
                <>
                  <span className="text-faint">·</span>
                  <a
                    href={review.portal_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-mono text-[10px] text-brand-ink underline-offset-2 hover:underline"
                  >
                    {review.ats_name || "The application page"}
                  </a>
                </>
              )}
            </p>
          </div>
          <button
            ref={closeButton}
            onClick={() => requestClose()}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Close
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 sm:px-5">
          {rail.map((mark) => (
            <button
              key={mark.id}
              onClick={() => jump(mark.id)}
              aria-current={active === mark.id}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active === mark.id ? "bg-brand-soft text-brand-ink" : "text-muted hover:bg-surface-alt hover:text-ink"
              }`}
            >
              {mark.label}
            </button>
          ))}
        </div>

        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          {/* A zero-height anchor at the top of the scrolled content, so the Resume rail pill has
              something reachable to scroll to. The pill used to target the resume heading itself,
              which lives in a lg:sticky column and is therefore already at the top of the scroller
              at exactly the breakpoint where the rail matters, so scrollIntoView on it was a no-op.

              It sits OUTSIDE the grid, and that is load-bearing. Placed inside, it became the
              grid's FIRST CELL: the resume was pushed into the right column and the questions
              column wrapped onto a second row, so the whole two-column layout came apart. A
              zero-height element still takes a grid track. */}
          <div id="packet-top" aria-hidden="true" className="h-0" />
          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] sm:p-6">
          
            <div className="lg:sticky lg:top-0 lg:self-start">
              <SectionHeading
                id="packet-resume"
                eyebrow="01 · Resume"
                title={sent ? "The resume they received" : "The resume that will go out"}
              />
              <div className="mt-3">
                {/* stub && !hydratedPacket && !hydrationFailed: the fetch above is in flight. Say so
                    rather than rendering `stripMetadata`'s defaults, which is a real resume shape -
                    zero experience entries, no name - indistinguishable from the empty box this
                    whole path exists to stop showing. */}
                {stub && !hydratedPacket && !hydrationFailed ? (
                  <div
                    role="status"
                    className="flex h-40 items-center justify-center rounded-inner border border-border bg-white text-[11px] text-muted"
                  >
                    Loading the resume this application was built with...
                  </div>
                ) : stub && !hydratedPacket && hydrationFailed ? (
                  /* The fetch ran and found nothing at `hydrationId`, or refused. Genuinely rare - it
                     means this Tracker row was never given a tailored resume - but it must say so
                     rather than fall through to the same blank box the loading state above replaced. */
                  <div className="rounded-inner border border-dashed border-border bg-surface-alt/50 px-5 py-6 text-center text-[12px] leading-6 text-muted">
                    Litos could not load the resume for this application. It may be missing from an older record.
                  </div>
                ) : (
                  /* stripMetadata, not the raw spec. This is the first surface that renders
                      ARBITRARY historical packets rather than the freshly generated one, and the
                      types are a compile-time claim about stored JSON, not a runtime guarantee. The
                      page beside this has defended these same fields for as long as it has existed;
                      reading them raw here meant one packet predating a field threw during render and
                      unmounted the whole Applications tree, submission poller included. */
                  /* name and contact come off the raw packet, not off stripMetadata's result:
                      they live on `_contact`, which is exactly what that helper strips. */
                  <ResumePaper
                    spec={stripMetadata(contentPacket.spec)}
                    name={contactName(contentPacket.spec)}
                    contact={contactLine(contentPacket.spec)}
                  />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                  Written for this posting · not reused
                </p>
                {/* The rendered PDF is the file the employer actually gets, and
                    it is not the same artifact as this spec render. Anyone
                    checking a packet should be able to reach it. */}
                {contentPacket.download_url && contentPacket.download_url !== "#" && (
                  <a
                    href={contentPacket.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-brand-ink underline-offset-2 hover:underline"
                  >
                    Open the PDF
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <SectionHeading
                  id="packet-jd"
                  eyebrow="02 · Job description"
                  title="The posting it was written against"
                />
                {jdParagraphs.length > 0 ? (
                  <div className="mt-3 space-y-3 rounded-inner border border-border bg-surface-alt/50 px-5 py-5">
                    {jdParagraphs.map((paragraph, index) => (
                      <p key={index} className="whitespace-pre-line text-[12px] leading-6 text-muted">
                        {paragraph}
                      </p>
                    ))}
                    {cleanedJd.removedLines.length > 0 && (
                      <details className="pt-1">
                        <summary className="cursor-pointer text-[11px] text-muted underline underline-offset-2">
                          {cleanedJd.removedLines.length} form line{cleanedJd.removedLines.length === 1 ? "" : "s"} from the page capture hidden. Show the raw capture
                        </summary>
                        <p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-muted">{contentReview.jd_text}</p>
                      </details>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 rounded-inner border border-dashed border-border px-5 py-4 text-[12px] text-muted">
                    The posting text was not saved with this application.
                  </p>
                )}
              </div>

              <div>
                <SectionHeading
                  id="packet-questions"
                  eyebrow="03 · Forms"
                  title="Every question, and what was answered"
                  note={
                    sent
                      ? "Read-only. This is the record of what the employer received."
                      : "Nothing here has gone to the employer. This is what is waiting to."
                  }
                />

                {(needsInput.length > 0 || acknowledgedItems.length > 0 || unconfirmedDocuments.length > 0 || completedItems.length > 0) && (
                  <div className="mt-3 overflow-hidden rounded-inner border border-border bg-surface">
                    {needsInput.length > 0 && (
                      <div className="border-b border-border bg-warn-soft/40 px-4 py-3">
                        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-warn">
                          Needs your input
                        </p>
                        <ul className="mt-2 space-y-2">
                          {needsInput.map((item) => (
                            <CheckRow key={item.id} item={item} checked={false} />
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Her own ticks, kept in the record and out of the amber ask: each row's
                        detail already says "Ticked off by you", so this list is her word about the
                        work, not Litos claiming it measured anything. */}
                    {acknowledgedItems.length > 0 && (
                      <div className="border-b border-border px-4 py-3">
                        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-teal-ink">
                          Handled by you
                        </p>
                        <ul className="mt-2 space-y-2">
                          {acknowledgedItems.map((item) => (
                            <CheckRow key={item.id} item={item} checked />
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Above "Done by Litos" and outside it, because it is the opposite claim: the
                        run said it attached these and no record here says the employer got them.
                        checked={false} draws the amber marker CheckRow already has for work that is
                        not settled, and these rows carry no action word, which this read-only viewer
                        does not print anyway. */}
                    {unconfirmedDocuments.length > 0 && (
                      <div className="border-b border-border px-4 py-3">
                        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-warn">
                          Not confirmed on their form
                        </p>
                        <ul className="mt-2 space-y-2">
                          {unconfirmedDocuments.map((item) => (
                            <CheckRow key={item.id} item={item} checked={false} />
                          ))}
                        </ul>
                      </div>
                    )}
                    {completedItems.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-teal-ink">
                          Done by Litos
                        </p>
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                          {completedItems.slice(0, 12).map((item) => (
                            <CheckRow key={item.id} item={item} checked />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {questions.length === 0 ? (
                  <p className="mt-3 rounded-inner border border-dashed border-border px-5 py-4 text-[12px] text-muted">
                    This form asked no questions beyond the resume.
                  </p>
                ) : (
                  // ph-no-capture: answers here can carry EEO self-identification, visa status, and
                  // other free-text personal answers (Mehek, 2026-08-27) - blocked from recording.
                  <div className="ph-no-capture mt-3 divide-y divide-border overflow-hidden rounded-inner border border-border">
                    {questions.map((question) => (
                      <div key={question.id} className="bg-surface px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 text-[12px] font-medium leading-5 text-ink">{displayQuestionLabel(question.question)}</p>
                          {/* The chip is a claim about this answer, so it has to be derived from
                              whether there IS one. It used to render unconditionally, so a required
                              question that was left blank got a teal "Answered" badge with "Left
                              blank, and this one is required" printed directly underneath it. On a
                              screen whose whole purpose is to be checkable, a badge that contradicts
                              the line below it is worse than no badge. */}
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${
                              (question.answer ?? "").trim()
                                ? "border-teal/30 bg-teal-soft/60 text-teal-ink"
                                : question.required
                                  ? "border-warn/30 bg-warn-soft text-warn"
                                  : "border-border bg-surface-alt text-muted"
                            }`}
                          >
                            {(question.answer ?? "").trim()
                              ? question.kind === "essay" ? "Written" : "Answered"
                              : "Blank"}
                          </span>
                        </div>
                        {(question.answer ?? "").trim() ? (
                          <p className="mt-1.5 whitespace-pre-line text-[12px] leading-6 text-muted">
                            {question.answer}
                          </p>
                        ) : (
                          /* An unanswered required question is the single most
                             useful thing this screen can surface, so it is
                             called out rather than rendered as an empty line. */
                          <p
                            className={`mt-1.5 text-[12px] leading-6 ${
                              question.required ? "text-warn" : "text-muted"
                            }`}
                          >
                            {question.required ? "Left blank, and this one is required" : "Left blank"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {filledFields.length > 0 && (
                  <div className="mt-4">
                    <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-muted">
                      Fields filled on the form
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {filledFields.map((field) => (
                        <span
                          key={field}
                          className="rounded-full border border-border bg-surface-alt px-2.5 py-1 text-[11px] text-muted"
                        >
                          {fieldLabel(field)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {contentReview.skipped_reasons?.length > 0 && (
                  /* Skipped is not a gap to hide. Litos declines demographic and
                     EEO questions by default, and that decline is a product
                     guarantee, so it is stated on the record of the submission. */
                  <div className="mt-4">
                    <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-muted">
                      Left blank on purpose
                    </p>
                    <ul className="mt-2 space-y-1">
                      {contentReview.skipped_reasons.map((reason) => (
                        <li key={reason} className="text-[12px] leading-6 text-muted">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {receipt && (
                <div>
                  <SectionHeading
                    id="packet-proof"
                    eyebrow="04 · Proof"
                    title="The company's own confirmation"
                    note={formatMoment(receipt.captured_at)}
                  />
                  <div className="mt-3 overflow-hidden rounded-inner border border-positive/30 bg-positive-soft/40">
                    <div className="px-5 py-4">
                      <p className="text-[12px] leading-6 text-ink">{receipt.confirmation_text}</p>
                      {receipt.reference_id && (
                        <p className="mt-2 font-mono text-[10px] text-muted">Reference {receipt.reference_id}</p>
                      )}
                      <a
                        href={receipt.final_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-brand-ink underline-offset-2 hover:underline"
                      >
                        Open the confirmation
                      </a>
                    </div>
                    {/* Lazy + async decode: a receipt screenshot is a full-page capture sitting
                        below the fold, and CSS width does not bound the decoded bitmap. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={receipt.screenshot_url}
                      alt="The company's confirmation that the application arrived"
                      loading="lazy"
                      decoding="async"
                      className="h-auto w-full border-t border-border"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
