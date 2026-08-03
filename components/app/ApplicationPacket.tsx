"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApplicationReview, GeneratedResume, ResumeSpec } from "@/lib/api";
import { sectionHeading, startsNewSection, statusLabel, stripMetadata } from "@/features/applications";

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
function contactName(spec: GeneratedResume["spec"]): string {
  return (spec._contact?.full_name ?? "").trim();
}

function contactLine(spec: GeneratedResume["spec"]): string {
  const contact = spec._contact ?? {};
  /* An explicit key order, not Object.values: the record is loosely typed, so
     iteration order is whatever the backend happened to serialise, and a resume
     header that reorders itself between packets looks like a rendering bug. */
  return ["email", "phone", "linkedin_url", "github_url", "portfolio_url"]
    .map((key) => contact[key])
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" · ");
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
   another. */
function ResumePaper({
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
    <div className="rounded-inner border border-border bg-white px-6 py-6 text-[10.5px] leading-[1.5] text-black">
      {name && <p className="text-center text-[14px] font-semibold tracking-tight">{name}</p>}
      {spec.target_role && (
        <p className="mt-0.5 text-center text-[9px] font-semibold">{spec.target_role}</p>
      )}
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
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[11px] font-semibold">
                {entry.title} · {entry.org}
              </p>
              <p className="shrink-0 text-[9px] text-neutral-600">{entry.date_range}</p>
            </div>
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
          <p className="mt-2">{spec.skills.join(" · ")}</p>
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
      <div className="mt-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[11px] font-semibold">{spec.school}</p>
          <p className="shrink-0 text-[9px] text-neutral-600">{spec.grad_date}</p>
        </div>
        {spec.degree && <p className="mt-0.5 italic text-neutral-600">{spec.degree}</p>}
        {spec.coursework && <p className="mt-0.5">Relevant coursework: {spec.coursework}</p>}
      </div>
    </>
  );
}

function SectionHeading({ id, eyebrow, title, note }: { id: string; eyebrow: string; title: string; note?: string }) {
  return (
    <div id={id} className="scroll-mt-4">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{eyebrow}</p>
      <h3 className="mt-1.5 text-[15px] font-medium tracking-tight text-ink">{title}</h3>
      {note && <p className="mt-1 text-[12px] leading-5 text-muted">{note}</p>}
    </div>
  );
}

/* filled_fields arrives as a flat list of names, with answers to discovered
   questions prefixed "question:" (the same convention the review screen already
   un-prefixes for its chips). */
function fieldLabel(field: string): string {
  return field.startsWith("question:") ? field.slice("question:".length).trim() : field;
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
  /* onClose read through a ref so the effect below can hold [] deps and run exactly once. Keying
     the effect on onClose meant any caller passing an inline arrow rebuilt the focus trap on every
     parent render, and the cleanup threw focus out of the dialog each time. A ref survives a caller
     that forgets to memoise; the parent memoises too, but only one of those is enforceable here. */
  const onCloseRef = useRef(onClose);
  /* Assigned in an effect, not during render: writing a ref during render is a React rule
     violation (react-hooks/refs) because it mutates state the renderer may discard. An effect with
     no dep array runs after every commit, which is exactly the freshness this needs. */
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  /* Seeded to the resume, which is what the scroller actually shows on open. It said "packet-jd",
     so the rail asserted Job description while the reader was looking at section 01, and stayed
     wrong for any packet short enough never to scroll. */
  const [active, setActive] = useState("packet-resume");

  const sent = review.status === "submitted";
  const role = packet.job_context.role || "This application";
  const company = packet.job_context.company || "the company";
  const questions = review.questions ?? [];
  const filledFields = review.filled_fields ?? [];
  const receipt = review.receipt;
  const sentAt = formatMoment(review.submitted_at ?? review.updated_at);
  const builtAt = formatMoment(packet.created_at);
  const when = sent
    ? sentAt ? `Sent ${sentAt}` : "Sent"
    : builtAt ? `Built ${builtAt}, not sent` : "Not sent";
  const jdParagraphs = (review.jd_text ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
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
      previous?.focus?.();
    };
  }, []);

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
  const onScroll = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const box = scroller.current;
      const root = dialog.current;
      if (!box || !root) return;
      const top = box.getBoundingClientRect().top;
      const ids = ["packet-resume", "packet-jd", "packet-questions", "packet-proof"];
      let current = ids[0];
      for (const id of ids) {
        const node = root.querySelector(`#${id}`);
        if (node && node.getBoundingClientRect().top - top <= 24) current = id;
      }
      setActive(current);
    });
  }, []);

  function jump(id: string) {
    /* packet-resume routes to the top anchor; see the comment on #packet-top. */
    const target = id === "packet-resume" ? "packet-top" : id;
    dialog.current?.querySelector(`#${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Application packet: ${role} at ${company}`}
        className="relative flex h-full max-h-[92svh] w-full max-w-6xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-overlay"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{company}</p>
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
            onClick={onClose}
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
                active === mark.id ? "bg-brand-soft text-brand-ink" : "text-faint hover:bg-surface-alt hover:text-muted"
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
                {/* stripMetadata, not the raw spec. This is the first surface that renders
                    ARBITRARY historical packets rather than the freshly generated one, and the
                    types are a compile-time claim about stored JSON, not a runtime guarantee. The
                    page beside this has defended these same fields for as long as it has existed;
                    reading them raw here meant one packet predating a field threw during render and
                    unmounted the whole Applications tree, submission poller included. */}
                {/* name and contact come off the raw packet, not off stripMetadata's result:
                    they live on `_contact`, which is exactly what that helper strips. */}
                <ResumePaper
                  spec={stripMetadata(packet.spec)}
                  name={contactName(packet.spec)}
                  contact={contactLine(packet.spec)}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                  Written for this posting · not reused
                </p>
                {/* The rendered PDF is the file the employer actually gets, and
                    it is not the same artifact as this spec render. Anyone
                    checking a packet should be able to reach it. */}
                {packet.download_url && packet.download_url !== "#" && (
                  <a
                    href={packet.download_url}
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
                  </div>
                ) : (
                  <p className="mt-3 rounded-inner border border-dashed border-border px-5 py-4 text-[12px] text-faint">
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

                {questions.length === 0 ? (
                  <p className="mt-3 rounded-inner border border-dashed border-border px-5 py-4 text-[12px] text-faint">
                    This form asked no questions beyond the resume.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-border overflow-hidden rounded-inner border border-border">
                    {questions.map((question) => (
                      <div key={question.id} className="bg-surface px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 text-[12px] font-medium leading-5 text-ink">{question.question}</p>
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
                                  : "border-border bg-surface-alt text-faint"
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
                              question.required ? "text-warn" : "text-faint"
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
                    <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
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

                {review.skipped_reasons?.length > 0 && (
                  /* Skipped is not a gap to hide. Litos declines demographic and
                     EEO questions by default, and that decline is a product
                     guarantee, so it is stated on the record of the submission. */
                  <div className="mt-4">
                    <p className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                      Left blank on purpose
                    </p>
                    <ul className="mt-2 space-y-1">
                      {review.skipped_reasons.map((reason) => (
                        <li key={reason} className="text-[12px] leading-6 text-faint">
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
