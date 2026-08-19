"use client";

/* 03 THE MATCH: the first screen that gives rather than asks.
 *
 * Everything before this took something: a field, a stage, some titles, a file. This screen hands
 * back one real posting, from the live board, that Litos can actually submit to, and asks a single
 * question about it. It is the Cal AI personalization beat done with a real object instead of a
 * computed plan, and it is the screen the whole reorder exists to reach.
 *
 * THE ONE THING IT MUST NEVER DO is overclaim. Three separate rules keep it honest, and all three
 * live in lib/onboarding-match.ts rather than here so they can be tested without a browser:
 *
 *   - freshness is the OUTER key, so a strong old posting never appears under a headline about
 *     having just detected something;
 *   - recency reads first_seen_at and the copy says "Found", because posted_at is nullable and
 *     absent for most of the board;
 *   - a row found by widening past the student's own filters is MARKED, and gets a headline that
 *     says so rather than one claiming it is what they asked for.
 *
 * What this file owns is the fetch, the three render states, and the reshuffle.
 */

import { useEffect, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { ErrorNote } from "@/components/app/ui";
import { getOnboardingJobs } from "@/lib/api";
import {
  fetchOnboardingMatch,
  foundLabel,
  matchHeadline,
  type OnboardingMatch,
} from "@/lib/onboarding-match";
import { track } from "@/lib/analytics";
import { LaterLink, PrimaryButton, StartShell } from "./ui";

/** How many rows to pull per pass. Enough that the freshness ladder has something to choose from
 *  on each rung, small enough that the screen is not paying for a page nobody reads. */
const POOL = 20;

export function MatchStep({
  onBuild,
  onLater,
}: {
  /** The student said yes to this posting. The build screen takes it from here. */
  onBuild: (match: OnboardingMatch) => void;
  onLater: () => void;
}) {
  const [match, setMatch] = useState<OnboardingMatch | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  /* Rows already declined this session, so "Show me a different one" actually differs.
     Held in state rather than persisted: it is a reshuffle within one sitting, not a preference,
     and a posting declined today is a perfectly good match tomorrow. */
  const [skipped, setSkipped] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);

  /* The read, written as a promise chain inside the effect rather than as a callback the effect
     invokes, which is the idiom the rest of /start uses (see FocusStep).
     Two reasons, and the second is the one that matters. It keeps every setState inside a `.then`
     or `.catch` rather than in the effect body, which is what react-hooks/set-state-in-effect
     actually asks for. And it gives the read a CANCELLED flag: `skipped` changes on every
     reshuffle, so two reads can legitimately be in flight at once, and without this the slower one
     could land last and put a posting the student already declined back on the screen. */
  useEffect(() => {
    let cancelled = false;
    fetchOnboardingMatch(async (params) => {
      const page = await getOnboardingJobs(params);
      /* Declines are filtered HERE rather than inside the picker, so the ladder still walks its
         rungs over the full page. Filtering earlier would let three declines on the freshest rung
         push the student down to "open now" while today's board still had rows. */
      return { jobs: (page.jobs ?? []).filter((job) => !skipped.includes(job.id)) };
    }, { limit: POOL })
      .then((found) => {
        if (cancelled) return;
        setMatch(found);
        if (found) {
          track("onboarding_match_shown", {
            freshness: found.freshness,
            widened: found.widened,
            /* A number or absent, never null: the payload takes primitives, and "unscored" is
               honestly a missing property rather than a zero. */
            ...(typeof found.job.match_score === "number" ? { match_score: found.job.match_score } : {}),
          });
        }
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Could not read the job board.");
        setMatch(null);
      });
    return () => { cancelled = true; };
  }, [skipped, attempt]);

  /* ── Could not read the board ───────────────────────────────────────────────
     Distinct from "the board is empty", and it has to be: one is a fault worth retrying and the
     other is a fact about the world. Conflating them would offer a retry that can never help. */
  if (error) {
    return (
      <StartShell step="match" title="Finding your first match.">
        <ErrorNote message={error} />
        <button
          type="button"
          onClick={() => { setError(null); setMatch(undefined); setAttempt((n) => n + 1); }}
          className="mt-4 text-sm text-brand-ink underline underline-offset-4"
        >
          Try again
        </button>
        <div className="mt-6"><LaterLink onClick={onLater} /></div>
      </StartShell>
    );
  }

  /* ── Loading ────────────────────────────────────────────────────────────────
     The orb, because this is the product thinking and the product has one loading language.
     `searching` is the state whose whole animation is a scan sweeping a globe, which is what is
     literally happening: the board is being read for this student. */
  if (match === undefined) {
    return (
      <StartShell step="match" title="Finding your first match.">
        <div className="flex items-center gap-3 text-[13px] text-muted">
          <ThinkingOrb state="searching" size={20} />
          <span className="font-mono text-[11.5px]">Reading the board for your roles</span>
        </div>
      </StartShell>
    );
  }

  /* ── The board genuinely had nothing ────────────────────────────────────────
     Reached only after the widened pass also came back empty, which means the live board holds no
     sendable posting at all right now. Rare, and stated plainly rather than dressed up: there is
     no honest match to show, so the screen does not invent one. */
  if (match === null) {
    return (
      <StartShell step="match" title="Nothing on the board right now.">
        <p className="text-[15px] leading-7 text-ink">
          Litos watches the boards through the day and will have matches for you shortly. Your
          resume and roles are saved, so there is nothing to redo.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <PrimaryButton onClick={onLater}>Go to my dashboard</PrimaryButton>
          <button
            type="button"
            onClick={() => { setMatch(undefined); setSkipped([]); setAttempt((n) => n + 1); }}
            className="text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            Look again
          </button>
        </div>
      </StartShell>
    );
  }

  const { job } = match;

  return (
    <StartShell step="match" title={matchHeadline(match)}>
      <div className="overflow-hidden rounded-inner border border-border">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-alt px-4 py-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            {foundLabel(match)}
          </span>
          {/* Only printed when there is a real number. The scorer returns null for postings that
              list too few requirements to score, and a "0" there would be a claim about the
              student's resume that the input never supported. */}
          {typeof job.match_score === "number" && (
            <span className="font-mono text-[11px] text-teal-ink">Match {job.match_score}</span>
          )}
        </div>

        <div className="border-b border-border px-4 py-3">
          <p className="text-base leading-snug text-ink">{job.title}</p>
          <p className="mt-0.5 font-mono text-[11.5px] text-muted">
            {[job.company_name, job.location].filter(Boolean).join(" · ")}
          </p>
        </div>

        <Row k="Where it came from">
          {job.ats_name}, watched by Litos and refreshed through the day.
        </Row>
        {/* The claim the whole screen rests on, and it is true by construction rather than by
            hope: GET /jobs only ever returns rows on the portal families portalCanAutoSubmit
            allows, and the widened pass does not relax that. */}
        <Row k="Litos can submit here">Yes. This is one Litos fills and sends end to end.</Row>
        {match.widened && (
          <Row k="Worth knowing">
            This one sits outside the filters you picked. Your filters are unchanged.
          </Row>
        )}
      </div>

      <p className="mt-6 text-[15px] leading-7 text-ink">Would you like us to build your application?</p>
      <p className="mt-2 text-sm leading-6 text-muted">
        Litos will write a one-page resume for this exact posting and fill the form in. You will see
        all of it before anything is sent.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <PrimaryButton onClick={() => { track("onboarding_match_accepted", { widened: match.widened }); onBuild(match); }}>
          Build my application
        </PrimaryButton>
        {/* Not a skip, and it must not read as one: it reshuffles. The declined id is remembered
            for this sitting so the next draw genuinely differs. */}
        <button
          type="button"
          onClick={() => {
            track("onboarding_match_reshuffled", {});
            setMatch(undefined);
            setSkipped((current) => [...current, job.id]);
          }}
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          Show me a different one
        </button>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border px-4 py-3 text-[13px] last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
      <span className="text-ink">{k}</span>
      <span className="leading-6 text-muted">{children}</span>
    </div>
  );
}
