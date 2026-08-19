"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApplicationProfile,
  type AutomationSettings,
  OnboardingState,
  OnboardingStep,
  ParsedProfile,
  RoleType,
  Targeting,
  getToken,
  getTargeting,
  putApplicationProfile,
  putTargeting,
  uploadResume,
} from "@/lib/api";
import { captchaConsentedAt, captchaConsentCompletion, captchaConsentGranted } from "@/lib/captcha-consent";
import { CaptchaConsentControl } from "@/components/app/CaptchaConsentControl";
import { ConsentAcknowledgementControl } from "@/components/app/ConsentAcknowledgementControl";
import {
  CONSENT_GRANTS,
  consentAcknowledgedAt,
  consentAcknowledgementCompletion,
  consentAcknowledgementGranted,
  type ConsentGrantField,
} from "@/lib/consent-acknowledgement";
import { STORE_URL } from "@/lib/config";
import {
  CATEGORIES,
  ROLE_TYPES,
  defaultBackup,
  defaultPrimary,
  periodsFor,
} from "@/lib/periods";
import { Chip, LaterLink, PrimaryButton, Receipt, SkipLink, STEPS, StartShell, flowSteps } from "./ui";
import { Highlights, WelcomeNote } from "./Welcome";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { JOB_TITLES } from "@/lib/job-titles";
import { FIELDS, categoriesForFields, categoriesForRoles, fieldsForFocus, focusPatch, focusSeed, inferResumeTargeting, noStageSupply, thinStages, titlesForFocus, type SavedFocus } from "@/lib/onboarding-role-inference";
import { rankOnboardingJobs, type OnboardingJob } from "@/lib/onboarding-jobs";

/* ------------------------------------------------------------------- 00 FOCUS */

/* This screen is reachable long after setup: the step is derived, and `hasFocusTargeting` wants a
 * non-empty titles array, so an account whose targeting predates that field lands here on every
 * visit to /start with a complete profile and a history of sent applications behind it.
 *
 * So saved targeting has to be READ before anything is drawn. Seeding from the resume inference
 * and committing it was one click of silent data loss on the record that aims every
 * recommendation (see lib/onboarding-role-inference.ts for the rule and why categories merge). Loading it
 * first is also why a failed read shows a retry instead of falling through to the guess: a PUT
 * built without knowing what is stored is the same overwrite by another route. */
export function FocusStep({
  onDone,
  onLater,
  profile,
}: {
  onDone: () => void;
  onLater: () => void;
  /* NULL IS THE NORMAL CASE NOW. This screen runs before the upload, so most students reach it
     with nothing parsed. A resume still arrives here for anyone walking back through setup, and
     it is used exactly as it was: to seed, never to gate. */
  profile: ParsedProfile | null;
}) {
  const guess = useMemo(() => (profile ? inferResumeTargeting(profile) : null), [profile]);
  /* undefined while the read is in flight. null means there is genuinely nothing stored, which is
     the normal state for a new account: /profile/targeting answers 200-with-nulls, never 404. */
  const [saved, setSaved] = useState<SavedFocus | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    /* No token is the localhost QA bypass (?qa=1&step=focus), not a failure: nothing is stored for
       a signed-out reviewer, so the guess is the whole truth and there is nothing to lose. It
       resolves through the same promise rather than an early setSaved so the effect body never
       sets state synchronously. */
    (getToken() ? getTargeting() : Promise.resolve<SavedFocus>(null))
      .then((targeting) => {
        if (!cancelled) setSaved(targeting);
      })
      .catch((reason) => {
        if (!cancelled) setLoadError(reason instanceof Error ? reason.message : "Could not load the jobs you want.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loadError) {
    return (
      <StartShell step="focus" title="What are you going after?">
        <ErrorNote message={loadError} />
        <button
          type="button"
          onClick={() => {
            setLoadError(null);
            setAttempt((n) => n + 1);
          }}
          className="mt-4 text-sm text-brand-ink underline underline-offset-4"
        >
          Try loading again
        </button>
      </StartShell>
    );
  }

  if (saved === undefined) {
    return (
      <StartShell step="focus" title="What are you going after?">
        <div className="rq-shimmer h-32 rounded-inner" />
      </StartShell>
    );
  }

  /* Keyed on the read so the form's lazy initial state is built from a settled `saved` rather than
     patched into place by an effect afterwards. There is no window where the student can click
     Continue against a pre-fill that has not seen their stored answer yet. */
  return (
    <FocusForm
      key={attempt}
      guess={guess}
      /* 0 is the documented "parser found no grad year" value, and periodsFor already answers it
         with a sensible two-year window from today. A student who has not uploaded yet is in
         exactly that position, so there is no new branch to write here. */
      gradYear={profile?.grad_year ?? 0}
      saved={saved}
      onDone={onDone}
      onLater={onLater}
    />
  );
}

function FocusForm({
  guess,
  gradYear,
  saved,
  onDone,
  onLater,
}: {
  guess: ReturnType<typeof inferResumeTargeting> | null;
  gradYear: number;
  saved: SavedFocus;
  onDone: () => void;
  onLater: () => void;
}) {
  const seed = useMemo(() => focusSeed(saved, guess), [saved, guess]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>(() => seed.titles);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>(() => seed.roleTypes);
  const [categories, setCategories] = useState<string[]>(() => saved?.categories?.length ? saved.categories : guess?.categories ?? []);
  /* The field selection, which is the screen's new first question.
     Seeded from SAVED CATEGORIES first and from the resume guess only where nothing is stored,
     which is the same direction focusSeed takes for titles: a stated answer outranks a guess. */
  const [fields, setFields] = useState<string[]>(() => {
    /* fieldsForFocus, not fieldsForCategories: the field list is nineteen long now and nine of
       those sit in the `other` category, so reading a returning student's fields out of their
       categories alone would light up nine chips they never picked. It reads their saved TITLES
       first and falls back to the category only when none of them matches an offer. */
    const stored = fieldsForFocus(saved);
    if (stored.length > 0) return stored;
    /* The guess gets read the same way, ROLES FIRST, and for the same reason. Handing it only its
       categories put five fields on screen pre-selected for a plain software resume - software,
       infrastructure, support (all three are software-engineering) plus whatever else it matched -
       and thirty suggested titles under them. Its roles are real title strings drawn from these
       very lists, so they name the one or two fields it actually meant. */
    return fieldsForFocus({ categories: guess?.categories ?? null, titles: guess?.roles ?? null, role_types: null });
  });
  /* A field the student TYPED rather than tapped.
     Kept apart from `fields` because it is a different kind of answer: a tapped field is an id
     with a curated, measured title list behind it, and a typed one is a word. The word is saved as
     a TITLE - the only free-text channel the backend's targeting schema accepts, and the one the
     board actually reads, as an ILIKE against the posting title - so typing "Biotech" here means
     "show me postings whose title says biotech", which is what someone typing it wants.
     It does not come back as a chip in this row on a return visit, and nothing can make it: it was
     stored as a title, so a title is what comes back. It reappears in the titles block below,
     already selected, which is the honest place for it because that is what was saved. */
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const [locations, setLocations] = useState(() => (saved?.locations ?? []).join(", "));
  const [remoteOnly, setRemoteOnly] = useState(() => saved?.remote_only ?? false);
  const availablePeriods = useMemo(() => periodsFor(gradYear), [gradYear]);
  const [primaryPeriod, setPrimaryPeriod] = useState<string | null>(() => saved?.primary_period ?? defaultPrimary(gradYear));
  const [backupPeriod, setBackupPeriod] = useState<string | null>(() => saved?.backup_period ?? defaultBackup(gradYear));
  const [newTitle, setNewTitle] = useState("");
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Both answers are required before a title is SUGGESTED. The stage does not filter the list - it
     cannot, because titles are stored stage-free and cleanTitle strips "intern" off them - but it
     is half of what makes the offer specific, so the suggestions wait for it.
     What no longer waits is the box the student types into, or the list of what they have already
     chosen. Withholding those made the screen unanswerable for anyone whose job is not one of the
     nineteen fields: they had to tap a field they did not mean in order to reach the input where
     they could say what they did. A suggestion is a convenience and is still earned; the ask
     itself is open from the first paint. */
  const ready = fields.length + customFields.length > 0 && roleTypes.length > 0;

  /* Saved categories, plus the ones the chosen fields imply. Union, never replacement: the screen
     still has no category control, so it must not be able to remove a category the student cannot
     see (the rule focusPatch states for the write, applied here to the gate so the two agree). */
  const effectiveCategories = useMemo(
    () => Array.from(new Set([
      ...categories,
      ...categoriesForFields(fields),
      // A typed field has no category of its own; `other` is the bucket the closed list keeps for
      // exactly that, and it is what focusPatch would derive for the title it becomes.
      ...(customFields.length > 0 ? ["other"] : []),
      /* The title-derived source is what keeps the gate and the write agreeing now that a student
         can reach Continue on a typed title alone. focusPatch has always run categoriesForRoles
         over the selection with an "other" fallback, so the WRITE was never going to be
         category-less; before this line the GATE thought it would be, and blocked Continue behind
         a warning that pointed at a control inside a collapsed <details>. Same call, same
         fallback, same answer on both sides. */
      ...(selectedTitles.length > 0
        ? categoriesForRoles(selectedTitles, saved?.categories?.length ? [] : ["other"])
        : []),
    ])),
    [categories, fields, customFields, selectedTitles, saved],
  );

  /* The offer, plus anything already selected that the offer does not contain.
     The union is the no-data-loss half: a returning student can carry a saved title from a field
     they are not currently showing, and a list that dropped it would leave them unable to see or
     deselect a title Continue is about to commit. */
  const offered = useMemo(() => {
    /* titlesForFocus, not titlesForFields: the same titles, ordered by how many live roles the
       board has for each AT THE CHOSEN STAGE. A quant student who says "internship" meets
       Quantitative Researcher (12 live internships) and Trader (11) first instead of Financial
       Analyst (0), and the order is the recommendation - most people take one of the first few. */
    const derived = ready ? titlesForFocus(fields, roleTypes) : [];
    const extra = selectedTitles.filter((title) => !derived.some((item) => item.toLowerCase() === title.toLowerCase()));
    return [...derived, ...extra];
  }, [ready, fields, roleTypes, selectedTitles]);

  /* The two shortages worth saying out loud, and they are not the same shortage.
     `thin` is about the whole board - some stages barely exist anywhere, and a student who picks
     one should hear that from the market rather than conclude their answer was wrong.
     `broadened` is about this combination - internship is 577 roles board-wide and close to none
     of them are in marketing, accounting, legal or writing, so "there are internships" and "there
     are internships for you" are different answers and only the second one is useful here. */
  const thin = useMemo(() => thinStages(roleTypes), [roleTypes]);
  const broadened = useMemo(
    /* Only one of the two ever renders, and `thin` wins. Both are true at once for a marketing
       student who picks Fellowship - 3 on the whole board, none of them in marketing - but two
       sentences in a row saying "there is very little of this" is one sentence and some noise, and
       the board-wide number is the one that tells them the shortage is not about their answer. */
    () => ready && thin.length === 0 && noStageSupply(fields, roleTypes),
    [ready, thin, fields, roleTypes],
  );

  const customMatches = useMemo(() => {
    const needle = newTitle.trim().toLowerCase();
    return JOB_TITLES
      .filter((title) => !offered.some((role) => role.toLowerCase() === title.toLowerCase()))
      .filter((title) => !needle || title.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [offered, newTitle]);

  function toggleField(id: string) {
    setFields((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  /* The suggestions under the field box: the fields not already chosen, narrowed by what has been
     typed. Same shape as `customMatches` below, and deliberately so - two boxes on one screen that
     behave differently are two things to learn. */
  const fieldMatches = useMemo(() => {
    const needle = newField.trim().toLowerCase();
    return FIELDS
      .filter((field) => !fields.includes(field.id))
      .filter((field) => !needle || field.label.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [fields, newField]);

  /* Typing the name of a field that already exists selects it rather than storing the word.
     Someone who types "Design" means the Design chip, and saving "Design" as a job title instead
     would search postings for the word design and quietly ignore the five measured titles sitting
     behind that chip. Matched on the label, case-insensitively, because the label is what they can
     see; ids never appear on screen. */
  function addField(value: string) {
    const clean = value.trim();
    if (!clean) return;
    const known = FIELDS.find((field) => field.label.toLowerCase() === clean.toLowerCase());
    if (known) {
      if (!fields.includes(known.id)) setFields((current) => [...current, known.id]);
    } else {
      setCustomFields((current) =>
        current.some((item) => item.toLowerCase() === clean.toLowerCase()) || current.length >= 12
          ? current
          : [...current, clean],
      );
    }
    setNewField("");
    setActiveFieldIndex(0);
    setFieldMenuOpen(false);
  }

  /* The highlighted suggestion resets where the query changes, in the handlers below, rather than
     in an effect watching the query. The effect form was here first and react-hooks flags it
     (set-state-in-effect): it renders the list once against the old index and then again against
     0, and the first of those two paints has a row highlighted that the new query may not even
     contain. Setting both together is one render and cannot disagree with itself. */

  function toggleTitle(title: string) {
    setSelectedTitles((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : current.length < 12 ? [...current, title] : current,
    );
  }

  function addTitle(title: string) {
    const clean = title.trim();
    if (!clean) return;
    setSelectedTitles((current) =>
      current.some((item) => item.toLowerCase() === clean.toLowerCase()) || current.length >= 12
        ? current
        : [...current, clean],
    );
    setNewTitle("");
    setActiveMatchIndex(0);
    setRoleMenuOpen(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      /* Partial by omission, and additive on categories. This screen shows titles and one type; it
         must not be able to remove a category the student cannot see. See lib/onboarding-role-inference.ts. */
      /* A typed field is written as a title, beside the tapped ones. It is not a second kind of
         record and there is nowhere for it to be one: `categories` and `role_types` are closed
         enums the backend validates, and `titles` is the free-text array the board reads. Deduped
         case-insensitively against what is already selected so typing a field whose name someone
         also picked as a title does not save the same word twice. */
      const titles = [...selectedTitles];
      for (const field of customFields) {
        if (!titles.some((title) => title.toLowerCase() === field.toLowerCase())) titles.push(field);
      }
      await putTargeting({
        ...focusPatch(saved, { titles, roleTypes, categories: effectiveCategories }),
        locations: locations.split(",").map((value) => value.trim()).filter(Boolean),
        remote_only: remoteOnly,
        primary_period: primaryPeriod,
        backup_period: backupPeriod,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  return (
    <StartShell
      step="focus"
      title="What are you going after?"
    >
      {/* THE WELCOME MOVED HERE WITH THE REORDER, and it had to.
          It used to open the resume screen because the resume screen was first. Roles is first as
          of flow version 3, and a welcome on screen two is not a welcome: criterion 1 of the
          onboarding audit (checklist.design/web-app/onboarding, met in #285) asks the FIRST screen
          to say what this is before it asks for anything, and tests/e2e/start-onboarding-checklist
          is what caught the regression when the screens moved and these two did not. */}
      <div className="mb-7"><WelcomeNote /></div>

      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="mb-7">
        <p className="text-sm text-ink">Field</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {FIELDS.map((field) => (
            <Chip
              key={field.id}
              label={field.label}
              on={fields.includes(field.id)}
              onClick={() => toggleField(field.id)}
            />
          ))}
          {/* Typed fields sit in the same row as the tapped ones, on, and remove on a click. They
              are not visually distinguished, because the difference between them is a storage
              detail and the sentence below already states what typing does. What matters is that
              they are here at all: a word the screen accepted and then did not draw would be a
              word Continue commits invisibly. */}
          {customFields.map((field) => (
            <Chip
              key={`custom-${field.toLowerCase()}`}
              label={field}
              on
              onClick={() => setCustomFields((current) => current.filter((item) => item !== field))}
            />
          ))}
        </div>

        <div
          className="relative mt-4 max-w-sm"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFieldMenuOpen(false);
          }}
        >
          <label htmlFor="additional-field" className="text-xs text-muted">Add another field</label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="additional-field"
              value={newField}
              onChange={(event) => {
                setNewField(event.target.value);
                setActiveFieldIndex(0);
                setFieldMenuOpen(true);
              }}
              onFocus={() => setFieldMenuOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addField(fieldMenuOpen && fieldMatches[activeFieldIndex] ? fieldMatches[activeFieldIndex].label : newField);
                }
                if (event.key === "Escape") setFieldMenuOpen(false);
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setFieldMenuOpen(true);
                  setActiveFieldIndex((current) => Math.min(current + 1, Math.max(0, fieldMatches.length - 1)));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveFieldIndex((current) => Math.max(0, current - 1));
                }
              }}
              placeholder="Type any field or industry"
              maxLength={80}
              role="combobox"
              aria-expanded={fieldMenuOpen}
              aria-controls="additional-field-options"
              aria-activedescendant={fieldMenuOpen && fieldMatches[activeFieldIndex] ? `additional-field-option-${activeFieldIndex}` : undefined}
              autoComplete="off"
              className="min-h-[44px] min-w-0 flex-1 rounded-inner border border-control-border bg-white px-4 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
            />
            <button
              type="button"
              onClick={() => addField(newField)}
              disabled={!newField.trim()}
              className="min-h-[44px] rounded-inner border border-border px-4 text-sm text-ink hover:border-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {fieldMenuOpen && fieldMatches.length > 0 && (
            <ul
              id="additional-field-options"
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-inner border border-border bg-white py-1 shadow-overlay"
            >
              {fieldMatches.map((field, index) => (
                <li
                  key={field.id}
                  id={`additional-field-option-${index}`}
                  role="option"
                  aria-selected={index === activeFieldIndex}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    addField(field.label);
                  }}
                  className={`cursor-pointer px-4 py-2 text-sm hover:text-ink ${index === activeFieldIndex ? "bg-surface-alt text-ink" : "text-muted hover:bg-surface-alt"}`}
                >
                  {field.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Said only once it can be true. A field that is one of the nineteen carries a measured
            list of titles behind it; a field nobody listed is one word, and one word is all Litos
            can search for. Promising more would be the difference between the two chips in the row
            above, which is the thing a student cannot see. */}
        {customFields.length > 0 && (
          <p className="mt-2 text-xs leading-5 text-muted">
            Litos looks for {customFields.length === 1 ? "that word" : "those words"} in job titles.
            Pick a listed field too if you want its suggested jobs.
          </p>
        )}
      </div>

      <div className="mb-7">
        <p className="text-sm text-ink">Stage</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {ROLE_TYPES.map((r) => {
            const slug = r.slug as RoleType;
            const on = roleTypes.includes(slug);
            return (
              <Chip
                key={r.slug}
                label={r.label}
                on={on}
                derived={slug === guess?.roleType}
                onClick={() => setRoleTypes(on ? [] : [slug])}
              />
            );
          })}
        </div>
        {/* Said with a number, because a number is the only version of this a student can act on.
            Four of the eight stages are genuinely rare on this board - apprenticeship 4 roles,
            fellowship 3, co-op 16, part-time 31, all measured 2026-08-19 - and a chip that offers
            a stage the board almost does not carry is the empty-page failure one level up from the
            one the title list already guards against. Not a warning and not a disabled chip: the
            student may want exactly that, and Litos widens the board rather than showing nothing
            (see relax_targeting in the backend). It just should not be a surprise. */}
        {thin.length > 0 && (
          <p className="mt-2.5 text-xs leading-5 text-muted">
            {thin.map(({ stage, live }) => `${ROLE_TYPES.find((r) => r.slug === stage)?.label ?? stage}: ${live} live`).join(", ")}
            {" "}on the board right now. Litos will show the closest matches around it.
          </p>
        )}
      </div>

      <div className="mb-7">
        <p className="text-sm text-ink">Jobs that fit</p>
        {/* THE CHIPS ARE THE SUGGESTION AND THE SUGGESTION IS WHAT WAITS.
            `offered` is the union of the derived list and the current selection, so while a field
            or a stage is still missing it holds only what the student has chosen for themselves.
            Drawing it unconditionally is what lets the input below open on arrival without
            breaking the rule that Continue never commits anything invisible: whatever is about to
            be saved is on screen, whether it was tapped from a suggestion or typed. */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {offered.map((title) => (
            <Chip
              key={title}
              label={title}
              on={selectedTitles.includes(title)}
              onClick={() => toggleTitle(title)}
            />
          ))}
        </div>

        {/* THE EXPAND-RATHER-THAN-EMPTY CASE, in one sentence.
            Nothing in the chosen fields has a live role at the chosen stage - marketing, finance,
            legal and writing carry essentially no internships, and that is the board and not the
            student. The list above is NOT emptied for it: these are the field's real roles, most
            live first, and offering them while saying what the stage costs is the honest version
            of both. Silence here would read as "these six are internships", which they are not. */}
        {broadened && (
          <p className="mt-2.5 text-xs leading-5 text-muted">
            The board has no {ROLE_TYPES.find((r) => r.slug === roleTypes[0])?.label.toLowerCase() ?? "matching"} roles
            in {fields.length === 1 ? "this field" : "these fields"} today. These are the roles it does carry, so pick
            the ones you want and Litos will watch for them.
          </p>
        )}

        {/* Not a disabled control and not an empty gap: a sentence saying which answer is still
            missing. The screen asks in an order, so it owes the student the reason the SUGGESTIONS
            are waiting - while making clear, in the same breath, that the box below is not. */}
        {!ready && (
          <p className="mt-2.5 text-sm text-muted">
            {fields.length + customFields.length === 0 && roleTypes.length === 0
              ? "Pick a field and a stage and Litos will suggest the titles that fit, or type one below."
              : fields.length + customFields.length === 0
                ? "Pick a field and Litos will suggest the titles that fit, or type one below."
                : "Pick a stage and Litos will suggest the titles that fit, or type one below."}
          </p>
        )}

        <div
          className="relative mt-4 max-w-sm"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setRoleMenuOpen(false);
          }}
        >
          <label htmlFor="additional-role" className="text-xs text-muted">Add another job</label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="additional-role"
              value={newTitle}
              onChange={(event) => {
                setNewTitle(event.target.value);
                setActiveMatchIndex(0);
                setRoleMenuOpen(true);
              }}
              onFocus={() => setRoleMenuOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTitle(roleMenuOpen && customMatches[activeMatchIndex] ? customMatches[activeMatchIndex] : newTitle);
                }
                if (event.key === "Escape") setRoleMenuOpen(false);
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setRoleMenuOpen(true);
                  setActiveMatchIndex((current) => Math.min(current + 1, Math.max(0, customMatches.length - 1)));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveMatchIndex((current) => Math.max(0, current - 1));
                }
              }}
              placeholder="Type any job title"
              maxLength={80}
              role="combobox"
              aria-expanded={roleMenuOpen}
              aria-controls="additional-role-options"
              aria-activedescendant={roleMenuOpen && customMatches[activeMatchIndex] ? `additional-role-option-${activeMatchIndex}` : undefined}
              autoComplete="off"
              className="min-h-[44px] min-w-0 flex-1 rounded-inner border border-control-border bg-white px-4 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
            />
            <button
              type="button"
              onClick={() => addTitle(newTitle)}
              disabled={!newTitle.trim()}
              className="min-h-[44px] rounded-inner border border-border px-4 text-sm text-ink hover:border-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {roleMenuOpen && customMatches.length > 0 && (
            <ul
              id="additional-role-options"
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-inner border border-border bg-white py-1 shadow-overlay"
            >
              {customMatches.map((title, index) => (
                <li
                  key={title}
                  id={`additional-role-option-${index}`}
                  role="option"
                  aria-selected={index === activeMatchIndex}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    addTitle(title);
                  }}
                  className={`cursor-pointer px-4 py-2 text-sm hover:text-ink ${index === activeMatchIndex ? "bg-surface-alt text-ink" : "text-muted hover:bg-surface-alt"}`}
                >
                  {title}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The row that used to repeat any selected title the guess did not contain is gone:
            `offered` is already the union of the derived list and the selection, so a second row
            would draw every one of them twice. */}
      </div>

      <details className="mb-7 overflow-hidden rounded-card border border-border bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 px-4 py-3 marker:text-muted sm:px-5">
          <span>
            <span className="block text-sm font-medium text-ink">More job preferences</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">Locations, remote work, categories, and recruiting periods.</span>
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Optional</span>
        </summary>
        <div className="space-y-6 border-t border-border p-4 sm:p-5">
          <div>
            <p className="text-sm text-ink">Categories</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {/* Read from `effectiveCategories`, not `categories`, and that is a correctness fix
                  rather than a cosmetic one. The field picker above now contributes categories to
                  what gets written, so a chip drawn from `categories` alone could sit visibly OFF
                  while its slug went into the PUT anyway - a control that does nothing, which is
                  the one thing this file refuses to ship. A category a chosen field implies is
                  therefore drawn ON and locked, the same way a saved one already was, and the note
                  below says which of the two reasons applies. */}
              {CATEGORIES.map((category) => {
                /* Implied by ANY of the three sources effectiveCategories reads, not only by the
                   field row. A category the titles imply goes into the PUT exactly as a field's
                   does, so drawing it unlocked would offer a control that cannot do what it says:
                   turning it off would leave the chip dark and the slug in the payload. */
                const impliedByField = effectiveCategories.includes(category.slug) && !categories.includes(category.slug);
                const savedCategory = saved?.categories?.includes(category.slug) ?? false;
                const on = effectiveCategories.includes(category.slug);
                return <Chip key={category.slug} label={category.label} on={on} disabled={savedCategory || impliedByField} onClick={() => setCategories(on ? categories.filter((value) => value !== category.slug) : [...categories, category.slug])} />;
              })}
            </div>
            {(!!saved?.categories?.length || effectiveCategories.some((slug) => !categories.includes(slug))) && (
              <p className="mt-2 text-xs leading-5 text-muted">
                {effectiveCategories.some((slug) => !categories.includes(slug) && !saved?.categories?.includes(slug))
                  ? "Categories from the fields and jobs you picked stay on. Change those above to change them."
                  : "Saved categories stay on during this review. You can remove one later in Account."}
              </p>
            )}
          </div>
          <label className="block">
            <span className="text-sm text-ink">Preferred locations</span>
            <span className="mt-1 block text-xs leading-5 text-muted">Separate cities, countries, or regions with commas. Leave blank for every location allowed by the remote setting below.</span>
            <input
              value={locations}
              onChange={(event) => setLocations(event.target.value)}
              placeholder="Dubai, London, New York"
              className="mt-2 min-h-11 w-full rounded-inner border border-control-border bg-surface px-4 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} className="accent-brand" />
            Show remote jobs only
          </label>
          <div>
            <p className="text-sm text-ink">Main recruiting period</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {availablePeriods.map((period) => <Chip key={period.slug} label={period.label} on={primaryPeriod === period.slug} onClick={() => setPrimaryPeriod(period.slug)} />)}
            </div>
          </div>
          <div>
            <p className="text-sm text-ink">Backup period</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {availablePeriods.map((period) => <Chip key={period.slug} label={period.label} on={backupPeriod === period.slug} onClick={() => setBackupPeriod(period.slug)} />)}
            </div>
          </div>
        </div>
      </details>

      {/* Reachable only through the disclosure now. categoriesForRoles gives any non-empty
          selection at least "other", so a student who has chosen a title always has a category;
          what is left is the one who opened More job preferences and turned every category off. */}
      {selectedTitles.length > 0 && effectiveCategories.length === 0 && (
        <p role="status" className="mb-4 text-xs leading-5 text-warn">Choose at least one job category to continue.</p>
      )}

      <div className="flex items-center gap-3">
        {/* `!ready` USED TO BE IN HERE, for a reason a browser found and no unit test would have:
            deselecting every field hid the title list but did NOT clear `selectedTitles`, so a
            student who changed their mind about the field could press Continue and commit titles
            the screen had stopped drawing.
            The invariant it protected is "Continue never commits anything invisible", and that is
            now held where it belongs - the chosen titles are drawn whether or not a field is
            chosen, so there is nothing left to hide. Keeping the clause as well would have been
            strictly worse than useless: it would refuse to save a title the student can see, typed
            themselves, in the one box this screen opens with. What remains is the real
            requirement, which is that every field being written has something in it. */}
        <PrimaryButton onClick={() => void save()} disabled={busy || selectedTitles.length === 0 || roleTypes.length === 0 || effectiveCategories.length === 0}>
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>

      {/* Below the ask, for the same measured reason it sat below the drop zone on the old first
          screen: at 375px the three walkthrough rows are tall enough to push the primary control
          off screen, and a setup step whose one ask is below the fold is the worse trade. */}
      <div className="mt-9"><Highlights /></div>
    </StartShell>
  );
}

/* ------------------------------------------------------------------ 01 RÉSUMÉ */

export function ResumeStep({
  onDone,
  onLater,
  savedProfile,
}: {
  onDone: () => void;
  onLater: () => void;
  savedProfile?: ParsedProfile | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Measured, not decorated. See the receipt comment below. */
  const [parseSeconds, setParseSeconds] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSaved, setShowSaved] = useState(() => !!savedProfile);

  async function upload(f: File) {
    if (busy) return;
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const isDocx =
      f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      f.name.toLowerCase().endsWith(".docx");
    if (!isPdf && !isDocx) {
      setError("Use a PDF or DOCX file.");
      return;
    }
    setError(null);
    setFile(f);
    setBusy(true);
    const startedAt = Date.now();
    try {
      const result = await uploadResume(f);
      setParseSeconds((Date.now() - startedAt) / 1000);
      setParsed(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that resume.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  /* The receipt (DESIGN.md signature motif #1): speed shown as a fact, never claimed.
   *
   * The timestamp column used to be the literals "00:00", "00:02", "00:03", "00:04" while the
   * comment here claimed they were a real measurement. They were not: they were the same eight
   * strings for every student, on the one component whose entire job is to be a receipt. A brand
   * that stakes itself on not claiming speed cannot fake the number that proves it.
   *
   * So there is now one time, and it is measured: how long this student's parse actually took.
   * Per-row timings would need per-row instrumentation the API does not expose, and inventing
   * them again is exactly the thing being fixed. */
  const rows = useMemo(() => {
    if (!parsed || !file) return [];
    const kb = Math.max(1, Math.round(file.size / 1024));
    const exp = parsed.experience?.length ?? 0;
    const proj = parsed.projects?.length ?? 0;
    const banked = parsed.bank_total ?? parsed.bank_seeded ?? 0;
    const elapsed = parseSeconds === null ? "" : `${parseSeconds.toFixed(1)}s`;
    return [
      { k: "Received", v: `${file.name} · ${kb} KB` },
      { k: "Name", v: parsed.full_name || "not found" },
      { k: "School", v: parsed.school || "not found" },
      { k: "Graduation", v: parsed.grad_year ? String(parsed.grad_year) : "not found" },
      { k: "Experience", v: `${exp} ${exp === 1 ? "entry" : "entries"}` },
      { k: "Projects", v: `${proj} ${proj === 1 ? "entry" : "entries"}` },
      { k: "Skills", v: `${parsed.skills?.length ?? 0} tagged` },
      { t: elapsed, k: "Ready in", v: `${banked} ${banked === 1 ? "entry" : "entries"} banked`, done: true },
    ];
  }, [parsed, file, parseSeconds]);

  if (savedProfile && showSaved && !parsed) {
    const savedRows = [
      { k: "Name", v: savedProfile.full_name || "not found" },
      { k: "School", v: savedProfile.school || "not found" },
      { k: "Graduation", v: savedProfile.grad_year ? String(savedProfile.grad_year) : "not found" },
      { k: "Experience", v: `${savedProfile.experience?.length ?? 0} entries` },
      { k: "Projects", v: `${savedProfile.projects?.length ?? 0} entries` },
      { k: "Skills", v: `${savedProfile.skills?.length ?? 0} tagged` },
    ];
    return (
      <StartShell step="resume" title="Your saved resume is ready.">
        <p className="mb-5 text-sm leading-6 text-muted">
          We kept everything already in your Litos profile. Review it here, or replace the file if it changed.
        </p>
        <Receipt rows={savedRows} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={onDone}>Keep this resume</PrimaryButton>
          <button
            type="button"
            onClick={() => setShowSaved(false)}
            className="min-h-11 px-1 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Replace resume
          </button>
          <LaterLink onClick={onLater} />
        </div>
      </StartShell>
    );
  }

  if (parsed) {
    const distinctRoles = new Set(
      (parsed.target_roles ?? []).map((role) => role.trim().toLowerCase()).filter(Boolean),
    ).size;
    // Mirror the server's has_resume gate. Advancing on a partial parse only returns the student
    // to this same screen, which looks like a dead button rather than a validation failure.
    const ready = !!parsed.full_name?.trim() && distinctRoles >= 5 && (parsed.bank_total ?? parsed.bank_seeded ?? 0) > 0;
    return (
      <StartShell
        step="resume"
        title="Here's what we read."
      >
        <Receipt rows={rows} />
        {!ready && (
          <p className="mt-4 rounded-inner bg-warn-soft px-4 py-3 text-[13px] leading-6 text-warn">
            We couldn&apos;t read enough from that file. Try another PDF or DOCX.
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          {ready && <PrimaryButton onClick={onDone}>See my matches</PrimaryButton>}
          <button
            type="button"
            onClick={() => {
              setParsed(null);
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="px-1 py-2.5 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Upload a different file
          </button>
        </div>
      </StartShell>
    );
  }

  return (
    <StartShell
      step="resume"
      title="Start with your resume."
    >
{/* The welcome, then the ask, then the walkthrough. This screen used to open on the ask
          alone, under a title ("Tell us what you want.") that described the roles step rather than
          this one.

          The walkthrough sits BELOW the drop zone rather than above it, and that ordering was
          measured rather than guessed: at 375px the three rows are tall enough to push "Choose a
          file" off the screen, and a setup step whose one ask is below the fold is a worse trade
          than a walkthrough that needs a scroll. The welcome line is one sentence and stays on
          top, so a student still learns what this is before being asked for anything. */}


      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div
        role="button"
        tabIndex={0}
        aria-busy={busy}
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          if (inputRef.current) inputRef.current.value = "";
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (busy) return;
            if (inputRef.current) inputRef.current.value = "";
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (busy) return;
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        className={`flex min-h-28 w-full min-w-0 cursor-pointer items-center justify-between gap-5 rounded-inner border border-dashed border-border bg-surface-alt px-5 py-5 text-left transition-colors hover:border-brand sm:px-6 ${
          busy ? "pointer-events-none" : ""
        }`}
      >
        {busy ? (
          <>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <ThinkingOrb state="composing" size={20} />
            </div>
            <p className="min-w-0 truncate font-mono text-xs text-muted">
              Reading {file?.name}
            </p>
          </>
        ) : (
          <>
            {/* Label removed 2026-07-28: the button below it said "Choose a
                file" and the step title says "Start with your resume." */}
            <p className="shrink-0 text-right font-mono text-xs text-muted">
              PDF or DOCX<br />10 MB max
            </p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />

      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={() => {
          if (inputRef.current) inputRef.current.value = "";
          inputRef.current?.click();
        }} disabled={busy}>
          {busy ? <PendingLabel onColor>Reading...</PendingLabel> : "Choose a file"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>

    </StartShell>
  );
}

/* ------------------------------------------------------ 02 INSTALL + 03 APPLY */

/** One backend step ("install" until an autofill_event proves the extension exists), two phases
 *  here: the web app has no way to see the extension, so the click is the only signal we get. */
export function InstallStep({
  phase,
  onInstalled,
  onLater,
  targetingFallback,
  allowSavedTargeting = true,
}: {
  phase: "install" | "apply";
  onInstalled: () => void;
  onLater: () => void;
  targetingFallback?: Pick<Targeting, "titles" | "role_types"> | null;
  allowSavedTargeting?: boolean;
}) {
  const [feed, setFeed] = useState<OnboardingJob[] | null>(null);
  const [savedTargeting, setSavedTargeting] = useState<Pick<Targeting, "titles" | "role_types"> | null>(null);
  const jobs = useMemo(
    () => feed === null ? null : rankOnboardingJobs(feed, savedTargeting ?? targetingFallback, 3),
    [feed, savedTargeting, targetingFallback],
  );

  useEffect(() => {
    if (phase !== "apply") return;
    let cancelled = false;
    // The same live feed /try uses: real postings, real apply URLs, refreshed daily.
    fetch("/try-jobs.json")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const feed = (d.jobs ?? []) as OnboardingJob[];
        // Render useful resume-ranked choices immediately. The saved targeting request can be
        // slow or unavailable in QA, and it should refine the list rather than hold it hostage.
        setFeed(feed);
        if (!allowSavedTargeting || !getToken()) return;
        void getTargeting()
          .then((targeting) => {
            if (!cancelled) setSavedTargeting(targeting);
          })
          .catch(() => undefined);
      })
      .catch(() => {
        if (!cancelled) setFeed([]);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, allowSavedTargeting]);

  if (phase === "install") {
    return (
      <StartShell
        step="install"
        title="Add Litos to Chrome."
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Opening the store is not installing. This used to advance the flow from its own
              onClick, so closing the store tab straight away still moved you to step 04. */}
          <a
            href={STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-action px-5 py-2.5 text-sm font-medium text-action-ink transition-colors hover:bg-brand-ink"
          >
            Add to Chrome
          </a>
          {/* The only way past this screen for anyone who already has the extension, or who
              applies on a portal Litos cannot see. It was 11px uppercase faint text below the
              button row: the least visible thing on the screen, doing the most important job on
              it. It is a real secondary control now, beside the primary. */}
          <button
            type="button"
            onClick={onInstalled}
            className="flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            I have added it
          </button>
        </div>
        <div className="mt-3"><LaterLink onClick={onLater} /></div>
      </StartShell>
    );
  }

  return (
    <StartShell
      step="apply"
      title="Apply to one job."
    >
      <p className="mb-5 text-sm leading-6 text-muted">
        Fill this one out yourself. Litos learns the answers for next time.
      </p>
      <div className="overflow-hidden rounded-inner border border-border">
        <div className="flex items-center justify-between border-b border-border bg-surface-alt px-4 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            Live postings
          </span>
          <span className="font-mono text-[11px] text-muted">Refreshed daily</span>
        </div>
        {jobs === null ? (
          <div className="space-y-2 p-4">
            <div className="rq-shimmer h-10 rounded-inner" />
            <div className="rq-shimmer h-10 rounded-inner" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted">
            The feed is empty right now. Open any posting on Lever, Greenhouse, Ashby, Workday, or
            LinkedIn and Litos will pick it up the same way.
          </p>
        ) : (
          jobs.map((j) => (
            <a
              key={j.id}
              href={j.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 transition-colors first:border-t-0 hover:bg-surface-alt"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{j.title}</span>
                <span className="block truncate text-xs text-muted">
                  {j.company} · {j.location}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                Open
              </span>
            </a>
          ))
        )}
      </div>

      <p className="mt-4 text-[13px] leading-6 text-muted">Already have a job open? Use that instead.</p>
      <div className="mt-4">
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* -------------------------------------------------------------------- 04 GAPS */

const GAP_LABEL: Record<string, { label: string; note?: string; placeholder: string }> = {
  gpa: { label: "GPA", placeholder: "3.89" },
  gpa_scale: { label: "Out of", placeholder: "4.0" },
  major: { label: "Major", placeholder: "Computer Science" },
  desired_salary: { label: "Desired salary", note: "Optional. Left blank on every form unless you set it.", placeholder: "Leave blank" },
  desired_salary_currency: { label: "Currency", placeholder: "EUR" },
  languages: { label: "Which languages are you fluent in?", placeholder: "English, Hindi, Spanish" },
  referral_source_default: {
    label: "Default referral source",
    note: "Use a source you personally choose, such as LinkedIn or a university event. Litos detects job boards for each application.",
    placeholder: "LinkedIn or university career fair",
  },
};

export function GapsStep({
  gaps,
  onDone,
  onLater,
}: {
  gaps: string[];
  /** `skipped` distinguishes "I don't have a GPA handy" from "saved" - both advance, but only one
   *  is a signal that the question is wrong for this student. */
  onDone: (skipped: boolean) => void;
  onLater: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showGpa = gaps.includes("gpa") || gaps.includes("gpa_scale");
  const showSalary = gaps.includes("desired_salary") || gaps.includes("desired_salary_currency");
  async function save() {
    setBusy(true);
    setError(null);
    const body: Partial<ApplicationProfile> = {};
    for (const [k, v] of Object.entries(values)) {
      if (!v.trim()) continue;
      if (k === "languages") {
        // The backend stores languages as a jsonb array of names, not a string.
        body.languages = v.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        (body as Record<string, string>)[k] = v.trim();
      }
    }
    const hasGpa = !!body.gpa;
    const hasGpaScale = !!body.gpa_scale;
    if (hasGpa !== hasGpaScale) {
      setError("Enter both your GPA and what it is out of.");
      setBusy(false);
      return;
    }
    const hasSalary = !!body.desired_salary;
    const hasCurrency = !!body.desired_salary_currency;
    if (hasSalary !== hasCurrency) {
      setError("Enter both a salary and its currency, or leave both blank.");
      setBusy(false);
      return;
    }
    try {
      if (Object.keys(body).length > 0) await putApplicationProfile(body);
      onDone(Object.keys(body).length === 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  /* Every visible label is tied to its first input by id. The remaining fields have concise
     accessible names so paired values such as GPA and scale stay distinct to screen readers. */
  function field(key: string) {
    const meta = GAP_LABEL[key];
    return (
      <input
        key={key}
        id={`gap-${key}`}
        value={values[key] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        placeholder={meta.placeholder}
        aria-label={meta.label}
        className="min-h-11 w-full rounded-full border border-control-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
    );
  }

  return (
    <StartShell
      step="gaps"
      title="A few details."
      /* "This is the last of the boring part." came off 2026-07-28: the flow
         narrating its own tedium, which does not make it shorter. */
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {showGpa && (
        <div className="mb-5">
          <label htmlFor="gap-gpa" className="text-[13px] text-ink">GPA</label>
          {/* R-005: store the value AND the scale, then convert through a disclosed mapping.
              A bare 3.89 tells a UK form nothing, and guessing 97% would be a lie. */}
          <div className="mt-2 grid grid-cols-2 gap-3">
            {field("gpa")}
            {field("gpa_scale")}
          </div>
        </div>
      )}

      {gaps.includes("major") && (
        <div className="mb-5">
          <label htmlFor="gap-major" className="text-[13px] text-ink">Major</label>
          <div className="mt-2">{field("major")}</div>
        </div>
      )}

      {gaps.includes("languages") && (
        <div className="mb-5">
          <label htmlFor="gap-languages" className="text-[13px] text-ink">Which languages are you fluent in?</label>
          <div className="mt-2">{field("languages")}</div>
        </div>
      )}

      {gaps.includes("referral_source_default") && (
        <div className="mb-5">
          <label htmlFor="gap-referral_source_default" className="text-[13px] text-ink">
            {GAP_LABEL.referral_source_default.label}
          </label>
          <div className="mt-2">{field("referral_source_default")}</div>
          <p className="mt-1 text-xs leading-5 text-muted">{GAP_LABEL.referral_source_default.note}</p>
        </div>
      )}

      {showSalary && (
        <div className="mb-5">
          <label htmlFor="gap-desired_salary" className="text-[13px] text-ink">Desired salary</label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {field("desired_salary")}
            {field("desired_salary_currency")}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={() => void save()} disabled={busy}>
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
        </PrimaryButton>
        <SkipLink onClick={() => onDone(true)} what="these" />
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* ------------------------------------------------------------------ 05 TARGET */

/* Job titles and type are chosen immediately after the resume. This final targeting screen only
 * asks for timing, which still depends on the graduation year read from that resume. */
export function TargetStep({
  gradYear,
  onDone,
  onLater,
}: {
  gradYear: number;
  onDone: () => void;
  onLater: () => void;
}) {
  const periods = useMemo(() => periodsFor(gradYear), [gradYear]);
  const [primary, setPrimary] = useState<string | null>(() => defaultPrimary(gradYear));
  const [backup, setBackup] = useState<string | null>(() => defaultBackup(gradYear));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    // Partial by omission: roles, categories and type were saved after the upload and must not be
    // clobbered here.
    const body: Partial<Targeting> = {
      primary_period: primary,
      backup_period: backup === primary ? null : backup,
    };
    try {
      await putTargeting(body);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  function choosePrimary(value: string) {
    setPrimary(value);
    setBackup((current) => {
      if (current !== value) return current;
      return periods.find((period) => period.slug !== value)?.slug ?? null;
    });
  }

  return (
    <StartShell
      step="targeting"
      title="When do you want to start?"
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="mb-7">
        <p className="text-sm text-ink">First choice</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {periods.map((p) => (
            <Chip
              key={p.slug}
              label={p.label}
              on={primary === p.slug}
              onClick={() => choosePrimary(p.slug)}
            />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <p className="text-sm text-ink">Backup</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {periods
            .filter((p) => p.slug !== primary)
            .map((p) => (
              <Chip
                key={p.slug}
                label={p.label}
                on={backup === p.slug}
                onClick={() => setBackup(backup === p.slug ? null : p.slug)}
              />
            ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={() => void save()} disabled={busy || !primary}>
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* -------------------------------------------------------------------- 06 DONE */

/* Two jobs on one screen, and this screen used to do neither.
 *
 * It was a title ("Your job matches are ready.") and a button, which is a handoff without a
 * receipt: nothing confirmed that setup was over, and nothing said what the student was supposed
 * to do on the other side of the button. The last screen of a flow has to close the flow before it
 * opens the product.
 *
 * So: the confirmation is the Receipt motif, which is already the product's way of stating a
 * finished machine action as fact. Every row is read from the derived onboarding state rather than
 * assumed from having arrived here, because the fallback cases in app/start/page.tsx route removed
 * steps to this screen too, and a receipt that prints "Built" over an unbuilt resume is worse than
 * no receipt. Then the first action, named in words before it is offered as a button.
 *
 * No celebration, per the Guardrails: no confetti, no streak, no score. The receipt IS the
 * acknowledgement, in the same register the rest of the product uses when it finishes something.
 */

/* What each rail step reads as once it is behind you.
 *
 * Keyed by step, and the LABELS are deliberately absent: they come from STEPS, so the rail and the
 * receipt cannot drift into calling one screen two different things. It also means a step added to
 * the flow appears in this receipt on its own, as "Not recorded" until someone gives it a row,
 * which is visible rather than silently missing.
 *
 * `of` returns `boolean | undefined`, and the third case is the whole point of it. GET
 * /onboarding/state is an unchecked cast (`api<OnboardingState>(...)`, no zod, no defaults), so
 * every field the type calls non-optional is a compile-time fiction at runtime, and the legacy
 * steps app/start/page.tsx routes here during a rolling deploy are the payloads most likely to be
 * missing one. `undefined` means "this backend did not tell us", which is neither done nor
 * pending. A receipt is the last place to guess: printing "Answered" over a work-authorization
 * question nobody was asked would be a false statement about the student's own account, on the one
 * screen whose entire job is to state facts. */
type ReceiptRowSpec = { done: string; pending: string; of: (s: OnboardingState) => boolean | undefined };

/** A field the type promises but the wire may not deliver. Anything not a boolean is unknown. */
const flag = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

const RECEIPT: Partial<Record<OnboardingStep, ReceiptRowSpec>> = {
  resume: { done: "Read", pending: "Not read", of: (s) => flag(s.has_resume) },
  impact: { done: "Reviewed", pending: "Not reviewed", of: (s) => flag(s.has_impact_review) },
  focus: { done: "Saved", pending: "Not saved", of: (s) => flag(s.has_focus) },
  sponsorship: { done: "Answered", pending: "Not answered", of: (s) => flag(s.has_sponsorship_answer) },
  base: { done: "Built", pending: "Not built", of: (s) => flag(s.has_base_resume) },
  /* `gaps` is what is STILL outstanding, so an empty list is the finished state.
   *
   * The pending value states the FACT, not the motive. "Skipped" was wrong on three reachable
   * paths: a student who filled some fields and pressed Continue, one who left through "Finish
   * later", and one routed straight here from a legacy step who was never shown the screen at all.
   * None of them chose to skip anything, and the receipt cannot tell which happened. */
  gaps: {
    done: "None missing",
    pending: "Some outstanding",
    of: (s) => (Array.isArray(s.gaps) ? s.gaps.length === 0 : undefined),
  },
};

/** Printed when the backend did not say. Uniform across rows on purpose: the reason is always the
 *  same one, and a per-row phrasing would imply we know more about the gap than we do. */
const NOT_RECORDED = "Not recorded";

export function DoneStep({
  onFinish,
  state,
}: {
  onFinish: (settings: Partial<AutomationSettings>) => Promise<void>;
  state: OnboardingState;
}) {
  const [busy, setBusy] = useState(false);
  /* SEEDED FROM THE SERVER'S VERDICT, not from false, and that seeding is the whole reason this is
     safe to send as an explicit boolean below. /start is reachable long after setup, so someone who
     granted this in Settings and then walked back through the flow would revoke it on the way out if
     this screen assumed off. Seeded, the box shown is the permission held, and unticking it is a
     revocation performed rather than one the flow performed for them. */
  const [captchaConsent, setCaptchaConsent] = useState(() => captchaConsentGranted(state));
  const initialCaptchaConsent = useRef(captchaConsentGranted(state));
  /* Seeded once, like the box beside it, and deliberately NOT recomputed from a live `state`.
     Holding the box against re-seeding is right (a background refresh must not clobber a choice
     being made), but a date that kept tracking `state` while the box did not could print "Granted
     <date>." next to an unticked box, which is the one pairing this module forbids everywhere. */
  const [captchaConsentGrantedAt] = useState(() => captchaConsentedAt(state));
  /* SEEDED FROM THE SERVER'S VERDICT, never from a constant, and this is the whole correction.
     An earlier version of this screen seeded both boxes from a hardcoded "nothing granted" and then
     sent explicit falses on finish, so an account that had granted these lost them by walking back
     through onboarding. /start has no completed-user guard, so that is one visit. See the header of
     lib/consent-acknowledgement.ts for the measurement. */
  const [consentGrants, setConsentGrants] = useState<Partial<Record<ConsentGrantField, boolean>>>(
    () => Object.fromEntries(
      CONSENT_GRANTS.map((grant) => [grant.field, consentAcknowledgementGranted(state, grant.field)]),
    ),
  );
  const initialConsentGrants = useRef<Partial<Record<ConsentGrantField, boolean>>>(
    Object.fromEntries(CONSENT_GRANTS.map((grant) => [grant.field, consentAcknowledgementGranted(state, grant.field)])),
  );
  const [consentGrantedAt] = useState<Partial<Record<ConsentGrantField, string | null>>>(
    () => Object.fromEntries(
      CONSENT_GRANTS.map((grant) => [grant.field, consentAcknowledgedAt(state, grant.grantedAtField)]),
    ),
  );
  /* The disclosure starts open when the account already holds any permission. A returning student
     must see the grants they are carrying, including their dates, without having to discover a
     collapsed panel. A new account gets the quieter default: permissions stay one named,
     keyboard-operable disclosure away and do not compete with the setup receipt or first action. */
  const heldPermissionCount =
    Number(captchaConsent) +
    CONSENT_GRANTS.filter((grant) => consentGrants[grant.field] === true).length;
  const [permissionsOpen, setPermissionsOpen] = useState(() => heldPermissionCount > 0);
  const rows = useMemo(
    () =>
      /* Every step in STEPS, minus the screen the student is standing on. Deliberately STEPS and
         NOT the rail's own `flowSteps`: the rail lists the screens this student was WALKED through,
         and the receipt reports the state of their account, which is a wider set. The details row
         is the difference. It is worth printing whether or not a screen ever asked for them,
         because "some outstanding" is a true and useful fact about the account either way.
         Numbering, on the other hand, has to come from the rail, which is what the block below
         does. */
      STEPS.filter((step) => step.key !== "done").map((step) => {
        const spec = RECEIPT[step.key];
        const value = spec?.of(state);
        /* Position in the RAIL, not in this list, and that distinction is the whole point of
           computing it here. The gutter used to be this row's own index, which lined up only while
           the rail counted all seven steps. Now that the conditional details screen is counted only
           when the flow routes to it, an index would print "06  A few details" directly under a
           rail reading "Step 6 of 6, Done" - two different sixes on one screen, one of them naming
           a screen the student never saw. A row the rail does not count gets no number rather than
           a wrong one; the gutter is a cross-reference, and a blank is honest where a digit is not. */
        const railIndex = flowSteps("done", state).findIndex((s) => s.key === step.key);
        return {
          /* The Receipt's first column is a mono gutter, and on this screen there is no timestamp
             to put in it: the steps happened over whatever span the student took, and inventing a
             duration is the exact thing the receipt motif exists NOT to do. Left empty it reads as
             a misalignment rather than as a gutter, so it carries the step number instead, in the
             two-digit form the rail already borrows from the homepage film's act labels. */
          t: railIndex >= 0 ? String(railIndex + 1).padStart(2, "0") : "",
          k: step.label,
          v: spec === undefined || value === undefined ? NOT_RECORDED : value ? spec.done : spec.pending,
          /* No `done` row, deliberately.
           *
           * Receipt renders `done` as a separator plus a brand-ink value, and it earns that on the
           * resume step because the last line there ("Ready in ... banked") SUMMARISES the rows
           * above it, categorically different from them. Here every row is the same kind of fact,
           * so marking the last one borrows an emphasis that means nothing. Blue is also the action
           * colour and never appears on anything that is not an action (DESIGN.md colour law), so
           * it must not land on a value like "Some outstanding". */
        };
      }),
    [state],
  );

  return (
    <StartShell
      step="done"
      title="Setup complete."
    >
{/* Absorbed from #286. The step changes inside the same page, with no route change and no
          focus move, so without a live region a screen reader gets no signal that setup finished
          at all. Deliberately terse and separate from the receipt: pushing six rows of mono text
          through a live region is noise, and the receipt is ordinary readable content once the
          reader arrives at it. */}
      <p role="status" className="sr-only">Setup complete.</p>

      <Receipt rows={rows} />

      {/* The first action closes the flow immediately after the receipt. It is a blue-soft document
          band, not a celebration: one sentence, one action, and no score or decorative motion. */}
      <section aria-labelledby="first-action-heading" className="mt-7 rounded-card border border-brand/20 bg-brand-soft/55 p-5 sm:p-6">
        <p id="first-action-heading" className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">
          First action
        </p>
        <p className="mt-2 text-[15px] leading-7 text-ink">
          Open a match on your dashboard and Litos builds the application for you to review.
        </p>
        <PrimaryButton
          className="mt-4"
          onClick={() => {
            setBusy(true);
            const permissionChanges: Partial<AutomationSettings> = {};
            if (captchaConsent !== initialCaptchaConsent.current) {
              Object.assign(permissionChanges, captchaConsentCompletion(state, captchaConsent));
            }
            const changedConsentGrants = Object.fromEntries(
              CONSENT_GRANTS
                .filter((grant) => consentGrants[grant.field] !== initialConsentGrants.current[grant.field])
                .map((grant) => [grant.field, consentGrants[grant.field]]),
            ) as Partial<Record<ConsentGrantField, boolean>>;
            if (Object.keys(changedConsentGrants).length > 0) {
              Object.assign(permissionChanges, consentAcknowledgementCompletion(state, changedConsentGrants));
            }
            void onFinish({
              /* A ticked box always sends true; an unticked one sends false ONLY if the server
                 reported the column, because otherwise this screen would be revoking a stored grant
                 it was never shown. See captchaConsentCompletion. */
              /* Sends a true always, and a false ONLY when the server reported the column. Absent
                 reads as not granted for display and must never be written back as a revocation of
                 something this screen was never shown. */
              ...permissionChanges,
            }).finally(() => setBusy(false));
          }}
          disabled={busy}
        >
          {busy ? <PendingLabel state="shaping" onColor>Saving...</PendingLabel> : "See my jobs"}
        </PrimaryButton>
      </section>

      {/* ASKED HERE, ONCE, because this screen is what calls POST /onboarding/complete and is
          therefore where a permission granted during setup can be recorded at all. The disclosure
          is progressive presentation only: the same controls remain mounted, and the completion
          payload above still applies their exact grant, revoke and unknown-column rules. */}
      <details
        className="mt-5 overflow-hidden rounded-card border border-border bg-surface"
        open={permissionsOpen}
        onToggle={(event) => setPermissionsOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 px-4 py-3 marker:text-muted sm:px-5">
          <span>
            <span className="block text-sm font-medium text-ink">Optional permissions</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">Not required to see your jobs. Change them here or later in Account.</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            {heldPermissionCount === 0 ? "All off" : `${heldPermissionCount} on`}
          </span>
        </summary>
        <div className="space-y-3 border-t border-border p-4 sm:p-5">
          <p className="text-xs leading-5 text-muted">
            Your saved email-verification and automatic-submission settings remain unchanged. Manage those separately in Account under Automation.
          </p>
          <ConsentAcknowledgementControl
            idPrefix="start"
            values={consentGrants}
            grantedAt={consentGrantedAt}
            disabled={busy}
            onChange={(field, enabled) => setConsentGrants((current) => ({ ...current, [field]: enabled }))}
          />

          <CaptchaConsentControl
            idPrefix="start"
            value={captchaConsent}
            grantedAt={captchaConsentGrantedAt}
            disabled={busy}
            onChange={setCaptchaConsent}
          />
        </div>
      </details>
    </StartShell>
  );
}
