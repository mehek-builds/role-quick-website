"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, OutreachEvent, ParsedProfile } from "@/lib/api";
import { Button } from "@/components/app/Button";
import { Card, Chip, EmptyState, ErrorNote, PageHeader, PendingLabel, ShimmerRows, formatRelativeDate } from "@/components/app/ui";
import { useBilling } from "@/components/billing/BillingProvider";
import { isStructuredUpgradeDenial } from "@/features/billing";
import { completeOperationId, operationIdFor } from "@/lib/operation-id";

const FILTERS = ["all", "drafted", "sent", "replied", "bounced"] as const;
type Filter = (typeof FILTERS)[number];
type ResolvedContact = {
  contact: {
    id: string;
    full_name: string;
    title: string;
    persona: string;
    school_match: boolean;
    linkedin_url?: string;
    company_domain: string;
  };
  email_resolution: { email: string | null; tier: string; status: string };
};

const DRAFT_TYPES = [
  ["first_note", "First note"],
  ["follow_up", "Follow-up"],
  ["thank_you", "Thank-you"],
  ["referral_ask", "Referral ask"],
  ["offer_stage", "Offer-stage"],
] as const;
type DraftType = (typeof DRAFT_TYPES)[number][0];

type DurableOutreachDraft = {
  draft_id: string;
  operation_id: string;
  draft_type: DraftType;
  generation_source: "ai_generated" | "user_written";
  contact_id: string;
  contact_email: string | null;
  application_id: string;
  company_scope_key: string;
  company_name: string;
  role: string;
  subject: string;
  body: string;
  word_count: number;
  warnings: string[];
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    full_name: string;
    title: string;
    persona: string;
    company_domain: string | null;
    email: string | null;
    linkedin_url?: string | null;
  };
};

type DisplayedOutreachEvent = OutreachEvent & {
  durableDraft?: DurableOutreachDraft;
  activityAt?: string;
};

type OutreachCheckoutState = {
  applicationId: string | null;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  company: string;
  companyDomain: string;
  targetRole: string;
  subject: string;
  draft: string;
  draftType: DraftType;
  editingDraftId: string | null;
  resolvedContacts: ResolvedContact[] | null;
  selectedContact: ResolvedContact | null;
};

const OUTREACH_CHECKOUT_KEY = "litos_outreach_checkout_state_v1";

function rememberOutreachCheckoutState(value: OutreachCheckoutState): void {
  window.sessionStorage.setItem(OUTREACH_CHECKOUT_KEY, JSON.stringify(value));
}

function readOutreachCheckoutState(): OutreachCheckoutState | null {
  const raw = window.sessionStorage.getItem(OUTREACH_CHECKOUT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OutreachCheckoutState>;
    if ([value.contactName, value.contactTitle, value.contactEmail, value.company, value.companyDomain, value.targetRole, value.subject, value.draft]
      .some((field) => typeof field !== "string")) return null;
    const draftType = DRAFT_TYPES.some(([id]) => id === value.draftType) ? value.draftType as DraftType : "first_note";
    return { ...value, draftType, editingDraftId: typeof value.editingDraftId === "string" ? value.editingDraftId : null } as OutreachCheckoutState;
  } catch {
    return null;
  }
}

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
  const { canUse, openUpgrade } = useBilling();
  const [events, setEvents] = useState<DisplayedOutreachEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [company, setCompany] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<DraftType>("first_note");
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [resolvedContacts, setResolvedContacts] = useState<ResolvedContact[] | null>(null);
  const [selectedContact, setSelectedContact] = useState<ResolvedContact | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [resolveBusy, setResolveBusy] = useState(false);
  const contactOperationIds = useRef(new Map<string, string>());
  const draftOperationIds = useRef(new Map<string, string>());

  function currentCheckoutState(applicationOverride: string | null = applicationId): OutreachCheckoutState {
    return {
      applicationId: applicationOverride,
      contactName,
      contactTitle,
      contactEmail,
      company,
      companyDomain,
      targetRole,
      subject,
      draft,
      draftType,
      editingDraftId,
      resolvedContacts,
      selectedContact,
    };
  }

  async function ensureOutreachApplication(): Promise<string> {
    if (applicationId) return applicationId;
    const result = await api<{ application: { id: string } }>("/applications", {
      method: "POST",
      body: JSON.stringify({
        company: company.trim(),
        ...(companyDomain.trim() ? { company_domain: companyDomain.trim() } : {}),
        role: targetRole.trim(),
        source_surface: "dashboard",
      }),
    });
    setApplicationId(result.application.id);
    return result.application.id;
  }

  async function copyDraft(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000);
    } catch {
      /* clipboard blocked; the draft is on screen to copy by hand */
    }
  }

  function editSavedDraft(saved: DurableOutreachDraft) {
    const savedDomain = saved.contact.company_domain
      ?? (saved.company_scope_key.startsWith("domain:") ? saved.company_scope_key.slice("domain:".length) : "");
    setApplicationId(saved.application_id);
    setEditingDraftId(saved.draft_id);
    setDraftType(saved.draft_type);
    setCompany(saved.company_name);
    setCompanyDomain(savedDomain);
    setTargetRole(saved.role);
    setContactName(saved.contact.full_name);
    setContactTitle(saved.contact.title);
    setContactEmail(saved.contact.email ?? saved.contact_email ?? "");
    setSubject(saved.subject);
    setDraft(saved.body);
    setSelectedContact({
      contact: {
        id: saved.contact.id,
        full_name: saved.contact.full_name,
        title: saved.contact.title,
        persona: saved.contact.persona,
        school_match: false,
        ...(saved.contact.linkedin_url ? { linkedin_url: saved.contact.linkedin_url } : {}),
        company_domain: savedDomain,
      },
      email_resolution: { email: saved.contact.email ?? saved.contact_email, tier: "saved", status: "saved" },
    });
    setResolvedContacts(null);
    setComposeError(null);
    setComposeOpen(true);
    window.requestAnimationFrame(() => document.getElementById("outreach-draft-body")?.focus());
  }

  async function saveEditedDraft() {
    if (!editingDraftId) return;
    setComposeBusy(true);
    setComposeError(null);
    try {
      const result = await api<{ draft: DurableOutreachDraft }>(`/drafts/${encodeURIComponent(editingDraftId)}`, {
        method: "PATCH",
        body: JSON.stringify({ subject, body: draft, contact_email: contactEmail.trim() || null }),
      });
      setEvents((current) => current?.map((event) => event.id === editingDraftId ? {
        ...event,
        subject: result.draft.subject,
        draft_text: result.draft.body,
        durableDraft: result.draft,
      } : event) ?? current);
      setSubject(result.draft.subject);
      setDraft(result.draft.body);
    } catch (reason) {
      setComposeError(reason instanceof Error ? reason.message : "Litos could not save this draft.");
    } finally {
      setComposeBusy(false);
    }
  }

  async function saveManualDraft() {
    if (editingDraftId || !contactName.trim() || !contactTitle.trim() || !company.trim() || !targetRole.trim() || !subject.trim() || !draft.trim()) return;
    setComposeBusy(true);
    setComposeError(null);
    try {
      const canonicalApplicationId = await ensureOutreachApplication();
      const contactKey = selectedContact?.contact.id
        ?? `${contactName.trim().toLowerCase()}:${contactTitle.trim().toLowerCase()}`;
      const operationKey = `manual-draft:${canonicalApplicationId}:${draftType}:${contactKey}`;
      const operationId = operationIdFor(draftOperationIds.current, operationKey);
      const saved = await api<DurableOutreachDraft>("/drafts/manual", {
        method: "POST",
        body: JSON.stringify({
          application_id: canonicalApplicationId,
          operation_id: operationId,
          draft_type: draftType,
          contact: {
            ...(selectedContact?.contact.id ? { id: selectedContact.contact.id } : {}),
            full_name: contactName.trim(),
            title: contactTitle.trim(),
            persona: selectedContact?.contact.persona ?? "near_peer",
            company: company.trim(),
            school_match: selectedContact?.contact.school_match ?? false,
            ...(selectedContact?.contact.linkedin_url ? { linkedin_url: selectedContact.contact.linkedin_url } : {}),
            ...(companyDomain.trim() ? { company_domain: companyDomain.trim() } : {}),
            ...(contactEmail.trim() ? { email: contactEmail.trim() } : {}),
          },
          subject: subject.trim(),
          body: draft.trim(),
        }),
      });
      completeOperationId(draftOperationIds.current, operationKey);
      setApplicationId(saved.application_id);
      setEditingDraftId(saved.draft_id);
      setSubject(saved.subject);
      setDraft(saved.body);
      setDraftType(saved.draft_type);
      setContactEmail(saved.contact.email ?? saved.contact_email ?? "");
      setLoadAttempt((attempt) => attempt + 1);
    } catch (reason) {
      setComposeError(reason instanceof Error ? reason.message : "Litos could not save this draft.");
    } finally {
      setComposeBusy(false);
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
          setEvents([]);
          return;
        }
        setEvents(qaScenario === "empty" ? [] : QA_EVENTS);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      setError(null);
      setEvents(null);
    });
    (async () => {
      const [eventResult, draftResult] = await Promise.allSettled([
        api<{ events?: OutreachEvent[] } | OutreachEvent[]>("/track/events"),
        api<{ drafts?: DurableOutreachDraft[] }>("/drafts?limit=100", { cache: "no-store" }),
      ]);
      if (cancelled) return;
      if (eventResult.status === "rejected" && draftResult.status === "rejected") {
        setError("We could not load your emails. Reload the page.");
        setEvents([]);
        return;
      }
      if (eventResult.status === "rejected" || draftResult.status === "rejected") {
        setError("Some saved outreach could not load. Your records are still stored.");
      }
      const tracked = eventResult.status === "fulfilled"
        ? Array.isArray(eventResult.value) ? eventResult.value : (eventResult.value.events ?? [])
        : [];
      const drafts = draftResult.status === "fulfilled" ? (draftResult.value.drafts ?? []) : [];
      const generated: DisplayedOutreachEvent[] = drafts.map((saved) => ({
        id: saved.draft_id,
        channel: "email",
        subject: saved.subject,
        draft_text: saved.body,
        sent_at: null,
        opened_at: null,
        replied_at: null,
        bounced: false,
        follow_up_count: 0,
        status: "drafted",
        contact: saved.contact,
        durableDraft: saved,
        activityAt: saved.created_at,
      }));
      const trackedContent = new Set(tracked.map(outreachContentKey));
      setEvents([
        ...generated.filter((item) => !trackedContent.has(outreachContentKey(item))),
        ...tracked,
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("checkout_action")) return;
    const restored = readOutreachCheckoutState();
    if (!restored) return;
    queueMicrotask(() => {
      setContactName(restored.contactName);
      setContactTitle(restored.contactTitle);
      setContactEmail(restored.contactEmail);
      setCompany(restored.company);
      setCompanyDomain(restored.companyDomain);
      setTargetRole(restored.targetRole);
      setSubject(restored.subject);
      setDraft(restored.draft);
      setDraftType(restored.draftType);
      setEditingDraftId(restored.editingDraftId);
      setResolvedContacts(restored.resolvedContacts);
      setSelectedContact(restored.selectedContact);
      setApplicationId(restored.applicationId ?? null);
      setComposeOpen(true);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!events) return null;
    const sorted = [...events].sort((a, b) =>
      (b.sent_at ?? b.activityAt ?? "").localeCompare(a.sent_at ?? a.activityAt ?? ""),
    );
    return filter === "all" ? sorted : sorted.filter((e) => e.status === filter);
  }, [events, filter]);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Outreach" sub="People you wrote to, and who wrote back." />
      </div>

      {error && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-danger/35 bg-danger-soft p-4" role="alert">
          <div>
            <p className="text-small font-medium text-ink">Emails did not load.</p>
            <p className="mt-1 text-small text-muted">Your emails are still saved. You can compose a new message or try this list again.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            Try again
          </Button>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-coral/35 bg-coral-soft/30 p-5">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">People</p>
          <h2 className="mt-2 text-heading font-[450] text-ink">Find people at a company.</h2>
          <p className="mt-2 text-small text-muted">Use real company and network data to choose someone relevant. Litos never guesses an address.</p>
          <Button type="button" variant="secondary" className="mt-5 border-coral text-coral-ink" onClick={() => {
            if (canUse("contact_discovery") === true) setComposeOpen(true);
            else openUpgrade({ feature: "contact_discovery", placement: "outreach", trigger: "find_people", manualLabel: "Add contact manually", returnRoute: "/dashboard/outreach", onManual: () => setComposeOpen(true) });
          }}>Find people</Button>
        </Card>
        <Card className="border-coral/35 bg-coral-soft/30 p-5">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">Draft</p>
          <h2 className="mt-2 text-heading font-[450] text-ink">Write outreach.</h2>
          <p className="mt-2 text-small text-muted">Create a grounded first note, follow-up, thank-you, referral ask, or offer-stage message.</p>
          <Button type="button" variant="secondary" className="mt-5 border-coral text-coral-ink" onClick={() => {
            if (canUse("outreach_email_generation") === true) setComposeOpen(true);
            else openUpgrade({ feature: "outreach_email_generation", placement: "outreach", trigger: "write_outreach", manualLabel: "Write it myself", returnRoute: "/dashboard/outreach", onManual: () => setComposeOpen(true) });
          }}>Write outreach</Button>
        </Card>
      </div>

      {composeOpen && (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">Compose</p><h2 className="mt-2 text-heading font-[450] text-ink">A note you choose to send.</h2></div><button type="button" onClick={() => setComposeOpen(false)} className="min-h-11 px-3 text-small text-muted">Close</button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-small text-muted">Name<input value={contactName} onChange={(event) => { setContactName(event.target.value); setSelectedContact(null); }} className="rq-field mt-1.5 w-full rounded-inner px-3 py-2.5 text-ink" /></label>
            <label className="text-small text-muted">Contact title<input value={contactTitle} onChange={(event) => { setContactTitle(event.target.value); setSelectedContact(null); }} placeholder="Software engineer" className="rq-field mt-1.5 w-full rounded-inner px-3 py-2.5 text-ink" /></label>
            <label className="text-small text-muted">Email<input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className="rq-field mt-1.5 w-full rounded-inner px-3 py-2.5 text-ink" /></label>
            <label className="text-small text-muted">Company<input value={company} onChange={(event) => { setCompany(event.target.value); setApplicationId(null); setSelectedContact(null); setResolvedContacts(null); }} className="rq-field mt-1.5 w-full rounded-inner px-3 py-2.5 text-ink" /></label>
            <label className="text-small text-muted">Company domain<input value={companyDomain} onChange={(event) => { setCompanyDomain(event.target.value); setApplicationId(null); setSelectedContact(null); setResolvedContacts(null); }} placeholder="acme.com" className="rq-field mt-1.5 w-full rounded-inner px-3 py-2.5 text-ink" /></label>
            <label className="text-small text-muted">Role you want<input value={targetRole} onChange={(event) => { setTargetRole(event.target.value); setApplicationId(null); }} className="rq-field mt-1.5 w-full rounded-inner px-3 py-2.5 text-ink" /></label>
          </div>
          <div className="mt-4 rounded-inner border border-coral/30 bg-coral-soft/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-small font-medium text-ink">Find a verified contact</p><p className="mt-1 text-label text-muted">Litos uses the exact company domain you enter to keep contact and draft usage together.</p></div>
              <Button type="button" variant="secondary" className="border-coral text-coral-ink" disabled={resolveBusy || !company.trim() || !companyDomain.trim() || !targetRole.trim()} onClick={() => {
                setResolveBusy(true);
                setComposeError(null);
                const operationKey = `contact:${companyDomain.trim().toLowerCase()}:${targetRole.trim().toLowerCase()}`;
                const operationId = operationIdFor(contactOperationIds.current, operationKey);
                let canonicalApplicationId = applicationId;
                void (async () => {
                  canonicalApplicationId = await ensureOutreachApplication();
                  return api<{ contacts?: ResolvedContact[] }>("/resolve", {
                    method: "POST",
                    body: JSON.stringify({
                      company: company.trim(),
                      domain: companyDomain.trim(),
                      role: targetRole.trim(),
                      application_id: canonicalApplicationId,
                      operation_id: operationId,
                    }),
                  });
                })().then((result) => {
                  completeOperationId(contactOperationIds.current, operationKey);
                  setResolvedContacts(result.contacts ?? []);
                })
                  .catch((reason) => {
                    if (isStructuredUpgradeDenial(reason, "contact_discovery")) {
                      openUpgrade({
                        feature: "contact_discovery",
                        placement: "outreach_compose",
                        trigger: "server_entitlement_denial",
                        manualLabel: "Add contact manually",
                        returnRoute: "/dashboard/outreach?checkout_action=resolve_contacts",
                        applicationId: canonicalApplicationId ?? undefined,
                        onBeforeCheckout: () => rememberOutreachCheckoutState(currentCheckoutState(canonicalApplicationId)),
                      }, { source: "server_denial" });
                      return;
                    }
                    setComposeError(reason instanceof Error ? reason.message : "Litos could not find contacts for this company.");
                  })
                  .finally(() => setResolveBusy(false));
              }}>{resolveBusy ? <PendingLabel>Finding contacts</PendingLabel> : "Find contacts"}</Button>
            </div>
            {resolvedContacts && resolvedContacts.length === 0 && <p className="mt-4 text-small text-muted">No verified contacts were found. You can still add someone manually and write the message yourself.</p>}
            {resolvedContacts && resolvedContacts.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{resolvedContacts.map((resolved) => {
              const active = selectedContact?.contact.id === resolved.contact.id;
              return <button key={resolved.contact.id} type="button" aria-pressed={active} onClick={() => {
                setSelectedContact(resolved);
                setContactName(resolved.contact.full_name);
                setContactTitle(resolved.contact.title);
                setContactEmail(resolved.email_resolution.email ?? "");
                setCompanyDomain(resolved.contact.company_domain);
              }} className={`rounded-inner border px-4 py-3 text-left ${active ? "border-coral bg-coral-soft" : "border-border bg-surface hover:border-coral/50"}`}><span className="block text-small font-medium text-ink">{resolved.contact.full_name}</span><span className="mt-1 block text-label text-muted">{resolved.contact.title || "Role not listed"} · {resolved.email_resolution.tier}</span></button>;
            })}</div>}
          </div>
          <label className="mt-4 block text-small text-muted">Message type<select value={draftType} onChange={(event) => setDraftType(event.target.value as DraftType)} className="rq-field mt-1.5 w-full rounded-inner px-4 py-3 text-ink">{DRAFT_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="mt-4 block text-small text-muted">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} className="rq-field mt-1.5 w-full rounded-inner px-4 py-3 text-ink" /></label>
          <label className="mt-4 block text-small text-muted">Message<textarea id="outreach-draft-body" rows={8} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write your note here, or ask Litos+ for a first draft." className="rq-field mt-1.5 w-full rounded-inner px-4 py-3 text-ink" /></label>
          {composeError && <div className="mt-4"><ErrorNote message={composeError} /></div>}
          <div className="mt-5 flex flex-wrap gap-3">
            {editingDraftId && <Button type="button" variant="secondary" disabled={composeBusy || !subject.trim() || !draft.trim()} onClick={() => void saveEditedDraft()}>{composeBusy ? <PendingLabel>Saving draft</PendingLabel> : "Save changes"}</Button>}
            {!editingDraftId && <Button type="button" variant="secondary" disabled={composeBusy || !contactName.trim() || !contactTitle.trim() || !company.trim() || !targetRole.trim() || !subject.trim() || !draft.trim()} onClick={() => void saveManualDraft()}>{composeBusy ? <PendingLabel>Saving draft</PendingLabel> : "Save draft"}</Button>}
            <Button type="button" variant="secondary" disabled={composeBusy || !contactName.trim() || !contactTitle.trim() || !company.trim() || !targetRole.trim()} onClick={async () => {
              setComposeBusy(true); setComposeError(null);
              let canonicalApplicationId = applicationId;
              try {
                const operationKey = `draft:${draftType}:${selectedContact?.contact.id ?? `${contactName.trim().toLowerCase()}:${contactTitle.trim().toLowerCase()}`}:${companyDomain.trim().toLowerCase() || company.trim().toLowerCase()}:${targetRole.trim().toLowerCase()}`;
                const operationId = operationIdFor(draftOperationIds.current, operationKey);
                canonicalApplicationId = await ensureOutreachApplication();
                const profile = await api<ParsedProfile>("/profile");
                const result = await api<{
                  subject: string;
                  body: string;
                  contact_id: string;
                  draft_id: string;
                  draft_type: DraftType;
                }>("/draft", {
                  method: "POST",
                  body: JSON.stringify({
                    operation_id: operationId,
                    application_id: canonicalApplicationId,
                    draft_type: draftType,
                    contact: {
                      ...(selectedContact?.contact.id ? { id: selectedContact.contact.id } : {}),
                      full_name: contactName.trim(),
                      title: contactTitle.trim(),
                      persona: selectedContact?.contact.persona ?? "near_peer",
                      company: company.trim(),
                      school_match: selectedContact?.contact.school_match ?? false,
                      ...(selectedContact?.contact.linkedin_url ? { linkedin_url: selectedContact.contact.linkedin_url } : {}),
                      ...(companyDomain.trim() ? { company_domain: companyDomain.trim() } : {}),
                      ...(contactEmail.trim() ? { email: contactEmail.trim() } : {}),
                    },
                    role: targetRole.trim(),
                    company: company.trim(),
                    ...(companyDomain.trim() ? { company_domain: companyDomain.trim() } : {}),
                    user_profile: {
                      experience: profile.experience,
                      skills: profile.skills,
                      school: profile.school,
                      grad_year: profile.grad_year,
                    },
                  }),
                });
                setSubject(result.subject);
                setDraft(result.body);
                setDraftType(result.draft_type);
                setEditingDraftId(result.draft_id);
                completeOperationId(draftOperationIds.current, operationKey);
                window.sessionStorage.removeItem(OUTREACH_CHECKOUT_KEY);
                setLoadAttempt((attempt) => attempt + 1);
              } catch (reason) {
                if (isStructuredUpgradeDenial(reason, "outreach_email_generation")) {
                  const denial = reason instanceof ApiError && reason.data && typeof reason.data === "object"
                    ? reason.data as { contact_id?: unknown }
                    : null;
                  const canonicalContactId = typeof denial?.contact_id === "string"
                    ? denial.contact_id
                    : selectedContact?.contact.id;
                  openUpgrade({
                    feature: "outreach_email_generation",
                    placement: "outreach_compose",
                    trigger: "server_entitlement_denial",
                    manualLabel: "Write it myself",
                    returnRoute: "/dashboard/outreach?checkout_action=write_outreach",
                    applicationId: canonicalApplicationId ?? undefined,
                    contactId: canonicalContactId,
                    onBeforeCheckout: () => rememberOutreachCheckoutState(currentCheckoutState(canonicalApplicationId)),
                  }, { source: "server_denial" });
                } else {
                  setComposeError(reason instanceof Error ? reason.message : "Litos could not draft this message.");
                }
              }
              finally { setComposeBusy(false); }
            }}>{composeBusy ? <PendingLabel>Writing draft</PendingLabel> : "Draft with Litos+"}</Button>
            <a href={contactEmail && draft ? `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(draft)}` : undefined} aria-disabled={!contactEmail || !draft} className="inline-flex min-h-11 items-center rounded-control border border-coral px-5 text-small font-medium text-coral-ink aria-disabled:pointer-events-none aria-disabled:opacity-50">Open in email</a>
          </div>
          <p className="mt-3 text-label text-muted">Opening your email app never sends the message. You review the recipient and press Send there.</p>
        </Card>
      )}

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
            <Button type="button" variant="secondary" onClick={() => setComposeOpen(true)}>Write a message</Button>
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
                      <span className="font-mono text-xs text-muted">
                        {formatRelativeDate(e.sent_at)}
                      </span>
                    )}
                  </div>
                </div>

                {e.subject && (
                  <p className="mt-3 text-sm text-ink">
                    <span className="text-muted">Subject: </span>
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
                  <p className="mt-3 text-xs text-muted">
                    {e.follow_up_count} follow-up{e.follow_up_count === 1 ? "" : "s"} sent
                  </p>
                )}

                {/* Copy is the one action this endpoint can actually support: /track/events
                    returns no contact email, so an "Open in Gmail" link here could not address
                    itself. Wiring that needs the email on OutreachContact first. */}
                {e.draft_text && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    {e.durableDraft && (
                      <button
                        type="button"
                        onClick={() => editSavedDraft(e.durableDraft!)}
                        className="flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-ink transition-colors hover:border-ink"
                      >
                        Edit
                      </button>
                    )}
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

function outreachContentKey(event: Pick<OutreachEvent, "contact" | "subject" | "draft_text">): string {
  return [
    event.contact?.id ?? "",
    event.subject?.trim() ?? "",
    event.draft_text?.trim() ?? "",
  ].join("\n");
}
