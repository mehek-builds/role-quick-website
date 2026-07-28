"use client";

import { Button } from "@/components/app/Button";
import { useEffect, useState } from "react";
import { RoleType, Targeting, api, getTargeting, putTargeting } from "@/lib/api";
import {
  CATEGORIES,
  MAX_CATEGORIES,
  MAX_ROLE_TYPES,
  ROLE_TYPES,
  periodLabel,
  periodsFor,
} from "@/lib/periods";
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
 * Same caps as /start and the same reason: an uncapped multi-select lets someone tick everything,
 * and "interested in everything" is indistinguishable from "hasn't chosen". Both match nothing.
 * The server enforces them too (targetingBodySchema); this just makes the limit visible before
 * it's hit rather than after a 400.
 */
export default function TargetingCard() {
  const [t, setT] = useState<Targeting | null>(null);
  const [gradYear, setGradYear] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const targeting = await getTargeting();
        if (!cancelled) setT(targeting);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the jobs you want.");
      }
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
  const periods = periodsFor(gradYear);
  const catFull = categories.length >= MAX_CATEGORIES;
  const typeFull = roleTypes.length >= MAX_ROLE_TYPES;

  function patch(p: Partial<Targeting>) {
    setT((prev) => ({ ...(prev as Targeting), ...p }));
  }

  async function save() {
    if (!t) return;
    setSaving(true);
    setError(null);
    try {
      await putTargeting({
        categories: t.categories,
        titles: t.titles,
        role_types: t.role_types,
        primary_period: t.primary_period,
        backup_period: t.backup_period,
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
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
        <div className="flex items-center gap-3">
          {savedAt && !saving && <span className="text-xs text-positive">Saved</span>}
          <Button
            onClick={() => void save()}
            disabled={saving} >
            {saving ? <PendingLabel onColor>Saving...</PendingLabel> : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] text-ink">Kind of work</p>
          <span className="font-mono text-[11px] text-faint">Up to {MAX_CATEGORIES}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = categories.includes(c.slug);
            return (
              <Chip
                key={c.slug}
                label={c.label}
                on={on}
                disabled={!on && catFull}
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
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] text-ink">Type</p>
          <span className="font-mono text-[11px] text-faint">Up to {MAX_ROLE_TYPES}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {ROLE_TYPES.map((r) => {
            const slug = r.slug as RoleType;
            const on = roleTypes.includes(slug);
            return (
              <Chip
                key={r.slug}
                label={r.label}
                on={on}
                disabled={!on && typeFull}
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
          className="mt-3 w-56 rounded-full border border-border bg-surface px-4 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
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
