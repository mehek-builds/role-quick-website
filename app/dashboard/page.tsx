"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  Me,
  OnboardingState,
  OutreachEvent,
  GeneratedResume,
  getOnboardingState,
} from "@/lib/api";
import { STEPS } from "@/components/start/ui";
import { STORE_URL } from "@/lib/config";
import {
  Card,
  Chip,
  Meter,
  ShimmerRows,
  EmptyState,
  ErrorNote,
  formatDate,
} from "@/components/app/ui";

type Activity = {
  id: string;
  when: string | null;
  label: string;
  detail: string;
  chip: { label: string; kind: string };
  href: string;
};

export default function Overview() {
  const [me, setMe] = useState<Me | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, eventsRes, resumesRes, onboardingRes] = await Promise.all([
          api<Me>("/me"),
          api<{ events?: OutreachEvent[] } | OutreachEvent[]>("/track/events").catch(
            () => [] as OutreachEvent[],
          ),
          api<{ resumes: GeneratedResume[] }>("/resume/history").catch(() => ({
            resumes: [] as GeneratedResume[],
          })),
          getOnboardingState().catch(() => null),
        ]);
        if (cancelled) return;
        setMe(meRes);
        setOnboarding(onboardingRes);

        const events = Array.isArray(eventsRes)
          ? eventsRes
          : (eventsRes.events ?? []);
        const items: Activity[] = [
          ...events.map((e) => ({
            id: `e-${e.id}`,
            when: e.replied_at ?? e.sent_at ?? null,
            label: e.contact?.full_name
              ? `Outreach to ${e.contact.full_name}`
              : "Outreach draft",
            detail: e.subject ?? "",
            chip: { label: cap(e.status), kind: e.status },
            href: "/dashboard/outreach",
          })),
          ...resumesRes.resumes.map((r) => ({
            id: `r-${r.id}`,
            when: r.created_at,
            label: `Resume for ${r.job_context?.role ?? "a role"}`,
            detail: r.job_context?.company ?? "",
            chip: { label: "Ready", kind: "ready" },
            href: "/dashboard/applications",
          })),
        ]
          .sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""))
          .slice(0, 6);
        setActivity(items);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load your account.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!me)
    return (
      <div className="space-y-6">
        <div className="rq-shimmer h-8 w-56 rounded-full" />
        <ShimmerRows rows={3} />
      </div>
    );

  const trialActive =
    me.trial_ends_at && new Date(me.trial_ends_at).getTime() > Date.now();
  const trialDays = trialActive
    ? Math.ceil(
        (new Date(me.trial_ends_at!).getTime() - Date.now()) / 86400000,
      )
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Everything the extension has made for you, in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip label={me.tier === "pro" ? "Pro" : cap(me.tier)} kind={me.tier === "pro" ? "ready" : "draft"} />
          {trialActive && (
            <Chip label={`Trial, ${trialDays} day${trialDays === 1 ? "" : "s"} left`} kind="ready" />
          )}
        </div>
      </div>

      {/* Setup left unfinished. One mono row, stated as a fact - no progress bar, no
          percentage, no nag. The Guardrails ban streak/badge mechanics, and a student who
          chose "Finish later" was told the dashboard stays open. This holds them to that
          while making the way back obvious. */}
      {onboarding && onboarding.step !== "done" && (
        <Link href="/start" className="block">
          <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:border-ink/30">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                Setup
              </span>
              <span className="text-sm text-ink">
                {onboarding.has_resume
                  ? "Pick up where you left off"
                  : "Add your résumé to get started"}
              </span>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">
              {STEPS.find((s) => s.key === onboarding.step)?.act}{" "}
              {STEPS.find((s) => s.key === onboarding.step)?.label} →
            </span>
          </Card>
        </Link>
      )}

      {/* Usage meters fill in ink per DESIGN.md: a meter is a quantity, not a
          pillar. Autofill has no cap on any plan, so it has no meter. */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card className="p-6">
          <Meter
            label="Verified contacts"
            used={me.usage.contacts.used}
            limit={me.usage.contacts.limit}
          />
        </Card>
        <Card className="p-6">
          <Meter
            label="Outreach drafts"
            used={me.usage.drafts.used}
            limit={me.usage.drafts.limit}
          />
        </Card>
        <Card className="p-6">
          <Meter
            label="Tailored resumes"
            used={me.usage.resumes.used}
            limit={me.usage.resumes.limit}
          />
        </Card>
      </div>

      {/* Pro emphasis surface (DESIGN.md v1.1): blue-soft, the screen's
          strongest moment. States what you get; no urgency mechanics. */}
      {me.upgrade_url && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-brand-soft p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-medium text-ink">Go Pro. Apply to 500 jobs a month.</h2>
              <span className="rounded-full bg-brand px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-white">
                $49.99/mo
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              500 contacts, 1,000 drafts, unlimited resumes.
            </p>
          </div>
          <a
            href={me.upgrade_url}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Upgrade to Pro
          </a>
        </div>
      )}

      <section>
        <h2 className="mb-4 text-base font-medium text-ink">Recent activity</h2>
        {activity === null ? (
          <ShimmerRows />
        ) : activity.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body="Open a job posting on Lever, Greenhouse, Ashby, Workday, or LinkedIn with the extension installed. Your tailored resumes and outreach drafts will show up here."
          >
            <a
              href={STORE_URL}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Add RoleQuick to Chrome
            </a>
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {activity.map((a) => (
              <Link key={a.id} href={a.href} className="block">
                <Card className="flex items-center justify-between gap-4 p-4 transition-colors hover:border-ink/30">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{a.label}</p>
                    {a.detail && (
                      <p className="mt-0.5 truncate text-xs text-muted">{a.detail}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Chip label={a.chip.label} kind={a.chip.kind} />
                    {a.when && (
                      <span className="hidden font-mono text-xs text-faint sm:block">
                        {formatDate(a.when)}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
