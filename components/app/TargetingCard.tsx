"use client";

import { Button } from "@/components/app/Button";
import { useEffect, useRef, useState } from "react";
import { RoleType, Targeting, api, getTargeting, putTargeting } from "@/lib/api";
import { CATEGORIES, ROLE_TYPES, periodLabel, periodsFor } from "@/lib/periods";
import { REMOTE_LOCATION, isRemoteLocation, locationSuggestions } from "@/lib/locations";
import { Card, ErrorNote, PendingLabel } from "./ui";
import { Chip } from "@/components/start/ui";

/* Targeting, editable after onboarding.
 *
 * /start collects all five (categories + type at step 00, titles + periods at step 05) and, until
 * this existed, none of it could be changed afterwards: a student finished onboarding and their
 * answers were frozen forever. That is worse than not asking. A job hunt shifts - the summer term
 * you were chasing closes, you decide you'll take a co-op after all - and the whole point of
 * targeting is that it aims every future application.
 *
 * Nothing here is capped any more (2026-08-02). Categories and types were 3 and 2, on the argument
 * that "interested in everything" reads the same as "hasn't chosen"; in practice it told a student
 * who wants software AND data AND product that they were not allowed to say so, and they picked
 * three and never came back. Ranking sorts a broad feed. A hard stop at three does not.
 */
export default function TargetingCard() {
  const [t, setT] = useState<Targeting | null>(null);
  const [gradYear, setGradYear] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Kept apart from `error`, which blanks the card. That was tolerable when a save only happened
  // because the student pressed a button; now that saves fire on their own, a flaky network would
  // wipe out the chips they were in the middle of clicking.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  // Autosave bookkeeping. `revision` counts edits the student has made in this session, so the
  // save effect fires on every change but never on the initial load; `latest` hands the effect
  // the current targeting without making the effect depend on it and re-arm the timer twice.
  const [revision, setRevision] = useState(0);
  const latest = useRef<Targeting | null>(null);
  latest.current = t;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const targeting = await getTargeting();
        /* THE ONE-WAY MIGRATION OFF remote_only, done on read rather than waiting for an edit.
           Every other write on this card is triggered by the student touching something, and an
           account carrying remote_only: true has nothing left to touch - the box that set it is
           gone. Left alone the column keeps filtering out every on-site posting for good, which is
           the worst version of this: a filter with no control. So the preference is converted to
           the Remote chip, which says the same thing to the jobs query, and the revision bump
           lets the existing autosave clear the column. */
        if (!cancelled) {
          const stored = targeting?.locations ?? [];
          const needsRemoteChip = !!targeting?.remote_only && !stored.some(isRemoteLocation);
          setT(needsRemoteChip ? { ...targeting, locations: [...stored, REMOTE_LOCATION] } : targeting);
          /* The bump is what makes the existing autosave clear the column, and it is needed even
             when Remote was already a place: the chip being right does not make the column right. */
          if (targeting?.remote_only) setRevision((r) => r + 1);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the jobs you want.");
      }
      void api<{ locations?: string[] }>("/jobs/facets")
        .then((result) => {
          if (!cancelled) setLocationOptions(result.locations ?? []);
        })
        .catch(() => null);
      // grad_year lives on the parsed resume and only feeds the period options. Fetched separately
      // and allowed to fail: a student who skipped the upload has no profile, and periodsFor(0)
      // already falls back to a sensible two-year window. Losing it must not break the card.
      try {
        const p = await api<{ grad_year?: number }>("/profile");
        if (!cancelled) setGradYear(p.grad_year ?? 0);
      } catch {
        /* no resume yet; the fallback window stands */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Every edit saves itself. There used to be a "Save changes" button, and the failure it caused
   * was silent: a student toggled a chip, saw it turn blue, and left. The chip had already changed
   * colour, so nothing on screen said the change was still sitting unsaved in the browser. The
   * short debounce is so that clicking through four chips is one PUT, not four. */
  useEffect(() => {
    if (revision === 0) return;
    const id = setTimeout(() => void save(), 500);
    return () => clearTimeout(id);
  }, [revision]);

  if (error) return <ErrorNote message={error} />;
  if (!t) {
    return (
      <Card className="p-6">
        <div className="rq-shimmer h-5 w-40 rounded-full" />
        <div className="rq-shimmer mt-5 h-8 rounded-full" />
      </Card>
    );
  }

  const categories = t.categories ?? [];
  const roleTypes = t.role_types ?? [];
  const titles = t.titles ?? [];
  const locations = t.locations ?? [];
  const periods = periodsFor(gradYear);
  const remoteChosen = locations.some(isRemoteLocation);
  const suggestions = locationSuggestions(locationOptions);

  function addLocation(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (locations.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) return;
    patch({ locations: [...locations, trimmed] });
  }

  function patch(p: Partial<Targeting>) {
    setT((prev) => ({ ...(prev as Targeting), ...p }));
    setRevision((r) => r + 1);
  }

  async function save() {
    const current = latest.current;
    if (!current) return;
    setSaving(true);
    setSaveError(null);
    try {
      await putTargeting({
        categories: current.categories,
        titles: current.titles,
        role_types: current.role_types,
        locations: current.locations,
        /* Always false now. The "Show remote jobs only" box is gone from this card and from
           onboarding; Remote is a place in the list above instead, and with Remote as the only
           location the jobs query builds `WHERE remote = true` - the same clause this column
           built. Written rather than omitted because omission would leave a stored true in place,
           and that is a hard filter hiding every on-site posting with no control left to untick
           it. The seed in the effect below is what carries the old preference across. */
        remote_only: false,
        primary_period: current.primary_period,
        backup_period: current.backup_period,
      });
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-ink">What you&apos;re going after</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-muted">
            This aims every application Litos fills. Change it whenever the hunt changes.
          </p>
        </div>
        {/* Status, not a control. It only appears once the student has actually changed something,
            so a card they are only reading stays quiet. */}
        <div className="flex min-h-6 items-center gap-3 text-xs">
          {saving ? (
            <PendingLabel>Saving...</PendingLabel>
          ) : saveError ? (
            <>
              <span className="text-warn">{saveError}</span>
              <Button variant="secondary" size="sm" onClick={() => void save()}>
                Try again
              </Button>
            </>
          ) : (
            savedAt && <span className="text-positive">Saved</span>
          )}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink">Locations</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Jobs must match one of these places. Add as many as you want, anywhere in the world, or
          leave this empty to search everywhere.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {locations.map((location) => (
            <Chip key={location} label={location} on onClick={() => patch({ locations: locations.filter((value) => value !== location) })} />
          ))}
        </div>
        {/* Remote is a place. It used to sit beside a "Show remote jobs only" checkbox that said
            the same thing in the opposite direction - the box NARROWED to remote, this chip WIDENS
            to include it - and the box is gone as of 2026-08-19. With Remote as the only place the
            jobs query builds `WHERE remote = true`, which is exactly what the box built. */}
        {!remoteChosen && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Chip label={`+ ${REMOTE_LOCATION}`} on={false} onClick={() => addLocation(REMOTE_LOCATION)} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={newLocation}
            list="litos-location-options"
            onChange={(event) => {
              const value = event.target.value;
              setNewLocation(value);
              /* A PICK FROM THE DROPDOWN ADDS ITSELF, same rule as the onboarding screen: the
                 choice was already made from a closed list, so a second button press is a step
                 that exists for no reason.

                 Keyed off the event, not the text. A datalist pick reports inputType
                 "insertReplacementText" in Chrome and Safari and none at all in Firefox, while
                 typing always reports an insert or delete type of its own - so typing "Dubai, UAE"
                 does not fire the moment it passes through "Dubai". */
              const inputType = (event.nativeEvent as InputEvent).inputType;
              const pickedFromList = inputType === "insertReplacementText" || inputType == null;
              if (pickedFromList && suggestions.some((option) => option.toLowerCase() === value.trim().toLowerCase())) {
                addLocation(value);
                setNewLocation("");
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addLocation(newLocation);
              setNewLocation("");
            }}
            placeholder="Add a city, country or region"
            aria-label="Add a preferred location"
            className="min-h-11 w-64 rounded-full border border-control-border bg-surface px-4 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
          />
          {/* The board's own cities first, then hubs on every continent. The facets alone are
              US-heavy, which told a student in Bangalore or Dubai that their city was not an
              option. Free text still works, and always did. */}
          <datalist id="litos-location-options">
            {suggestions.map((location) => <option key={location} value={location} />)}
          </datalist>
          <Button
            variant="secondary"
            size="sm"
            disabled={!newLocation.trim()}
            onClick={() => {
              addLocation(newLocation);
              setNewLocation("");
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink">Kind of work</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = categories.includes(c.slug);
            return (
              <Chip
                key={c.slug}
                label={c.label}
                on={on}
                onClick={() =>
                  patch({
                    categories: on ? categories.filter((x) => x !== c.slug) : [...categories, c.slug],
                  })
                }
              />
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink">Type</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {ROLE_TYPES.map((r) => {
            const slug = r.slug as RoleType;
            const on = roleTypes.includes(slug);
            return (
              <Chip
                key={r.slug}
                label={r.label}
                on={on}
                onClick={() =>
                  patch({ role_types: on ? roleTypes.filter((x) => x !== slug) : [...roleTypes, slug] })
                }
              />
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink">Titles</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {titles.map((x) => (
            <Chip key={x} label={x} on onClick={() => patch({ titles: titles.filter((y) => y !== x) })} />
          ))}
        </div>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTitle.trim()) {
              e.preventDefault();
              if (!titles.includes(newTitle.trim())) patch({ titles: [...titles, newTitle.trim()] });
              setNewTitle("");
            }
          }}
          placeholder="Add a title"
          aria-label="Add a title"
          className="mt-3 w-56 rounded-full border border-control-border bg-surface px-4 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
        />
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink">Main focus</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {periods.map((p) => (
            <Chip
              key={p.slug}
              label={p.label}
              on={t.primary_period === p.slug}
              onClick={() => patch({ primary_period: p.slug })}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink">Backup</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {periods
            .filter((p) => p.slug !== t.primary_period)
            .map((p) => (
              <Chip
                key={p.slug}
                label={p.label}
                on={t.backup_period === p.slug}
                onClick={() => patch({ backup_period: t.backup_period === p.slug ? null : p.slug })}
              />
            ))}
        </div>
      </div>

      {/* A period saved before its term started is now in the past: the chip row is derived from
          today, so it simply won't be offered any more. Say so rather than silently dropping it. */}
      {t.primary_period && !periods.some((p) => p.slug === t.primary_period) && (
        <p className="mt-5 rounded-inner bg-warn-soft px-4 py-3 text-[13px] leading-6 text-warn">
          Your main focus is set to {periodLabel(t.primary_period)}, which has already started.
          Pick a term that hasn&apos;t.
        </p>
      )}
    </Card>
  );
}
