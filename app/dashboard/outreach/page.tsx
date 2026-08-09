"use client";

import { useEffect, useMemo, useState } from "react";
import { api, OutreachEvent } from "@/lib/api";
import { STORE_URL } from "@/lib/config";
import { Button } from "@/components/app/Button";
import { Card, Chip, EmptyState, PageHeader, ShimmerRows, formatRelativeDate } from "@/components/app/ui";

const FILTERS = ["all", "drafted", "sent", "replied", "bounced"] as const;
type Filter = (typeof FILTERS)[number];

/* The same four words the extension uses (src/lib/outreach-status.ts). The page used to print
   whatever the status column happened to hold, with a capital letter bolted on. */
const STATUS_LABELS: Record<string, string> = {
  drafted: "Written",
  sent: "Sent",
  replied: "They replied",
  bounced: "Did not arrive",
};

const FILTER_LABELS: Record<string, string> = {
  all: "All",
  drafted: "Written",
  sent: "Sent",
  replied: "Replied",
  bounced: "Did not arrive",
};
const FILTER_EMPTY_TITLES: Record<Exclude<Filter, "all">, string> = {
  drafted: "No written emails",
  sent: "No sent emails",
  replied: "No replies yet",
  bounced: "No emails marked as undelivered",
};

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

/* These fixtures are photographed: public/product/dashboard-emails.png on the
   marketing site is this page in ?qa=1 mode. They used to read "USC student",
   "300 classmates", and two internship subjects, so the one screenshot of the
   dashboard announced a student-only product. Keep the alum persona and the
   shared-school angle; keep the role wording open-level. */
const QA_EVENTS: OutreachEvent[] = [
  {
    id: "qa-1", channel: "gmail", subject: "Fellow Trojan interested in Acme",
    draft_text: "Hi Jordan, fellow Trojan here, and interested in Acme's product engineering work. I built a scheduling tool that 300 people ended up using every week, and would value ten minutes to hear how your team thinks about onboarding.",
    sent_at: new Date().toISOString(), opened_at: null, replied_at: new Date().toISOString(),
    bounced: false, follow_up_count: 0, status: "replied",
    contact: { id: "c1", full_name: "Jordan Lee", title: "Product Engineer", persona: "alumni", company_domain: "acme.com" },
  },
  {
    id: "qa-2", channel: "gmail", subject: "Stripe engineering, quick question",
    draft_text: "Hi Sam, I would value your perspective on how Stripe's engineering teams are structured.",
    sent_at: new Date(Date.now() - 86_400_000).toISOString(), opened_at: null, replied_at: null,
    bounced: false, follow_up_count: 1, status: "sent",
    contact: { id: "c2", full_name: "Sam Chen", title: "Software Engineer", persona: "near_peer", company_domain: "stripe.com" },
  },
  {
    id: "qa-3", channel: "gmail", subject: "Notion product design role",
    draft_text: "Hi Priya, I am applying to the product design role and wanted to introduce myself.",
    sent_at: null, opened_at: null, replied_at: null,
    bounced: false, follow_up_count: 0, status: "drafted",
    contact: { id: "c3", full_name: "Priya Sharma", title: "Recruiter", persona: "recruiter", company_domain: "notion.so" },
  },
];

export default function Outreach() {
  const [events, setEvents] = useState<OutreachEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copyDraft(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000);
    } catch {
      /* clipboard blocked; the draft is on screen to copy by hand */
    }
  }

  useEffect(() => {
    // Same localhost-only QA bypass Home and Applications already use, so this page can be
    // reviewed without a live account. It was the one dashboard view with no fixture.
    const qaScenario = new URLSearchParams(window.location.search).get("qa");
    if (window.location.hostname === "localhost" && qaScenario !== null) {
      queueMicrotask(() => {
        if (qaScenario === "error") {
          setError("We could not load your emails.");
          return;
        }
        setEvents(qaScenario === "empty" ? [] : QA_EVENTS);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setError(null));
    (async () => {
      try {
        const res = await api<{ events?: OutreachEvent[] } | OutreachEvent[]>(
          "/track/events",
        );
        if (cancelled) return;
        setEvents(Array.isArray(res) ? res : (res.events ?? []));
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "We could not load your emails. Reload the page.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const filtered = useMemo(() => {
    if (!events) return null;
    const sorted = [...events].sort((a, b) =>
      (b.sent_at ?? "").localeCompare(a.sent_at ?? ""),
    );
    return filter === "all" ? sorted : sorted.filter((e) => e.status === filter);
  }, [events, filter]);

  if (error) {
    return (
      <EmptyState
        visual="error"
        headingLevel="h1"
        title="Emails did not load."
        body="Your emails are still saved. Try loading this view again."
      >
        <Button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          Try again
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Emails" sub="People you wrote to, and who wrote back." />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              filter === f
                ? "bg-surface-alt font-medium text-ink"
                : "border border-border text-muted hover:text-ink"
            }`}
          >
            {FILTER_LABELS[f] ?? f}
          </button>
        ))}
      </div>

      {filtered === null ? (
        <ShimmerRows rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          visual="emails"
          title={filter === "all" ? "No emails yet" : FILTER_EMPTY_TITLES[filter]}
          body={filter === "all"
            ? "Litos finds someone worth writing to and drafts the email. Every one you send shows up here, with whether they wrote back."
            : `There are no emails in the ${FILTER_LABELS[filter].toLowerCase()} view. Clear the filter to see every email.`}
        >
          {filter === "all" ? (
            <a
              href={STORE_URL}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Add Litos to Chrome
            </a>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setFilter("all")}>
              Clear filter
            </Button>
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
                    <Chip label={STATUS_LABELS[e.status] ?? e.status} kind={e.status} />
                    {e.sent_at && (
                      <span className="font-mono text-xs text-faint">
                        {formatRelativeDate(e.sent_at)}
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
                        className="mt-2 text-xs font-medium text-ink underline underline-offset-4"
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

                {/* Copy is the one action this endpoint can actually support: /track/events
                    returns no contact email, so an "Open in Gmail" link here could not address
                    itself. Wiring that needs the email on OutreachContact first. */}
                {e.draft_text && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={() => void copyDraft(e.id, e.draft_text ?? "")}
                      className="flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-ink transition-colors hover:border-ink"
                    >
                      {copied === e.id ? "Copied" : "Copy"}
                    </button>
                  </div>
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
