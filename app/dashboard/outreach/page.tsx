"use client";

import { useEffect, useMemo, useState } from "react";
import { api, OutreachEvent } from "@/lib/api";
import { STORE_URL } from "@/lib/config";
import {
  Card,
  Chip,
  ShimmerRows,
  EmptyState,
  ErrorNote,
  formatDate,
} from "@/components/app/ui";

const FILTERS = ["all", "drafted", "sent", "replied", "bounced"] as const;
type Filter = (typeof FILTERS)[number];

// Keys MUST match the backend persona union (resolve.ts personaOrder): alumni | near_peer |
// senior_ic | hiring_manager | recruiter. The old map keyed on "alum"/"team" (which never
// exist) and omitted near_peer/senior_ic, so most chips fell through to the raw snake_case.
const PERSONA_LABELS: Record<string, string> = {
  alumni: "Alum",
  near_peer: "Near-peer",
  senior_ic: "Senior IC",
  hiring_manager: "Hiring manager",
  recruiter: "Recruiter",
};

export default function Outreach() {
  const [events, setEvents] = useState<OutreachEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ events?: OutreachEvent[] } | OutreachEvent[]>(
          "/track/events",
        );
        if (cancelled) return;
        setEvents(Array.isArray(res) ? res : (res.events ?? []));
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load outreach.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!events) return null;
    const sorted = [...events].sort((a, b) =>
      (b.sent_at ?? "").localeCompare(a.sent_at ?? ""),
    );
    return filter === "all" ? sorted : sorted.filter((e) => e.status === filter);
  }, [events, filter]);

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Outreach</h1>
        <p className="mt-1 text-sm text-muted">
          Every contact Litos found and every draft it wrote. Sending
          always happens from your own Gmail, never from here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              filter === f
                ? "bg-ink text-white"
                : "border border-border text-muted hover:text-ink"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered === null ? (
        <ShimmerRows rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No outreach yet" : `Nothing ${filter} yet`}
          body="When the extension resolves a recruiter, hiring manager, or alum for a posting, the contact and its draft land here so you can track who you have written to and who replied."
        >
          {filter === "all" && (
            <a
              href={STORE_URL}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Add Litos to Chrome
            </a>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const persona = e.contact?.persona ?? "";
            return (
              <Card key={e.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {e.contact?.full_name ?? "Contact"}
                      {e.contact?.title && (
                        <span className="font-normal text-muted"> · {e.contact.title}</span>
                      )}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted">
                      {e.contact?.company_domain ?? ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {persona && (
                      <Chip label={PERSONA_LABELS[persona] ?? persona} kind="persona" />
                    )}
                    <Chip
                      label={e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                      kind={e.status}
                    />
                    {e.sent_at && (
                      <span className="font-mono text-xs text-faint">
                        {formatDate(e.sent_at)}
                      </span>
                    )}
                  </div>
                </div>

                {e.subject && (
                  <p className="mt-3 text-sm text-ink">
                    <span className="text-faint">Subject: </span>
                    {e.subject}
                  </p>
                )}

                {e.draft_text && (
                  <>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                      {open === e.id ? e.draft_text : truncate(e.draft_text, 160)}
                    </p>
                    {e.draft_text.length > 160 && (
                      <button
                        onClick={() => setOpen(open === e.id ? null : e.id)}
                        className="mt-2 text-xs font-medium text-coral-ink hover:underline"
                      >
                        {open === e.id ? "Show less" : "Show full draft"}
                      </button>
                    )}
                  </>
                )}

                {(e.follow_up_count ?? 0) > 0 && (
                  <p className="mt-3 text-xs text-faint">
                    {e.follow_up_count} follow-up{e.follow_up_count === 1 ? "" : "s"} sent
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n).trimEnd() + "...";
}
