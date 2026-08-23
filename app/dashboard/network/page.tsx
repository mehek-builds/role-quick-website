"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/app/Button";
import { Card, DataErrorState, EmptyState, ErrorNote, PendingLabel, ShimmerRows } from "@/components/app/ui";
import { MotionPanel, runDashboardTransition } from "@/components/app/Motion";
import { useBilling } from "@/components/billing/BillingProvider";

type NetworkTab = "people" | "companies" | "linkedin";
type LinkedInStatus = {
  source?: "csv" | "oauth" | null;
  connected?: boolean;
  data_use_active?: boolean;
  imported_people_count?: number;
  retained_people_count?: number;
  imported_at?: string | null;
  refresh_available?: boolean;
};
type Person = { id: string; name?: string; full_name?: string; company?: string | null; title?: string | null; relationship?: string | null };
type Company = { id?: string; name: string; connection_count?: number; open_role_count?: number };
type Preview = { import_id: string; accepted_rows: number; rejected_rows: number; warnings?: string[]; expires_at?: string };

export default function NetworkPage() {
  const { canUse, openUpgrade } = useBilling();
  const [tab, setTab] = useState<NetworkTab>("people");
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [statusReload, setStatusReload] = useState(0);
  const [peopleReload, setPeopleReload] = useState(0);
  const [companiesReload, setCompaniesReload] = useState(0);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const premium = canUse("networking_discovery") === true;
  const disconnectedWithRetainedData = status?.connected === false && (status.retained_people_count ?? 0) > 0;

  useEffect(() => {
    let cancelled = false;
    api<LinkedInStatus>("/network/linkedin/status")
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setStatusError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setStatusError("Litos could not check your LinkedIn import just now.");
      });
    return () => { cancelled = true; };
  }, [statusReload]);

  useEffect(() => {
    let cancelled = false;
    if (!premium || status?.connected === false) {
      queueMicrotask(() => {
        if (cancelled) return;
        setPeople([]);
        setPeopleError(null);
      });
      return () => { cancelled = true; };
    }
    if (status?.connected !== true) return () => { cancelled = true; };
    queueMicrotask(() => {
      if (cancelled) return;
      setPeople(null);
      setPeopleError(null);
    });
    api<{ people?: Person[] } | Person[]>("/network/people")
      .then((result) => {
        if (cancelled) return;
        setPeople(Array.isArray(result) ? result : result.people ?? []);
        setPeopleError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setPeopleError("Litos could not load your imported people just now.");
      });
    return () => { cancelled = true; };
  }, [peopleReload, premium, status?.connected]);

  useEffect(() => {
    let cancelled = false;
    if (!premium || status?.connected === false) {
      queueMicrotask(() => {
        if (cancelled) return;
        setCompanies([]);
        setCompaniesError(null);
      });
      return () => { cancelled = true; };
    }
    if (status?.connected !== true) return () => { cancelled = true; };
    queueMicrotask(() => {
      if (cancelled) return;
      setCompanies(null);
      setCompaniesError(null);
    });
    api<{ companies?: Company[] } | Company[]>("/network/companies")
      .then((result) => {
        if (cancelled) return;
        setCompanies(Array.isArray(result) ? result : result.companies ?? []);
        setCompaniesError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setCompaniesError("Litos could not load company matches just now.");
      });
    return () => { cancelled = true; };
  }, [companiesReload, premium, status?.connected]);

  function retryStatus() {
    setStatus(null);
    setStatusError(null);
    setStatusReload((value) => value + 1);
  }

  function retryPeople() {
    setPeople(null);
    setPeopleError(null);
    setPeopleReload((value) => value + 1);
  }

  function retryCompanies() {
    setCompanies(null);
    setCompaniesError(null);
    setCompaniesReload((value) => value + 1);
  }

  function refreshNetworkLists() {
    setPeople(null);
    setCompanies(null);
    setPeopleError(null);
    setCompaniesError(null);
    setPeopleReload((value) => value + 1);
    setCompaniesReload((value) => value + 1);
  }

  function requestPremium(feature: "networking_discovery" | "referral_paths", trigger: string) {
    openUpgrade({
      feature,
      placement: "network",
      trigger,
      manualLabel: "Keep managing my connections",
      explanation: "Importing, disconnecting, and deleting your own LinkedIn data stay available. Litos+ adds company matches and referral paths.",
    });
  }

  function chooseTab(next: NetworkTab) {
    if (next === tab) return;
    runDashboardTransition(() => setTab(next));
  }

  function chooseFile(next: File | undefined) {
    setPreview(null);
    setError(null);
    if (!next) return;
    if (next.size > 20 * 1024 * 1024 || !/\.csv$/i.test(next.name)) {
      setFile(null);
      setError("Choose LinkedIn's Connections.csv file, no larger than 20 MB.");
      return;
    }
    setFile(next);
  }

  async function previewImport() {
    if (!file || !consent) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("connections", file);
    form.append("consent_version", "linkedin_csv_v1");
    try {
      setPreview(await api<Preview>("/network/linkedin/import/preview", { method: "POST", body: form }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not preview this export.");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<LinkedInStatus>("/network/linkedin/import/commit", { method: "POST", body: JSON.stringify({ import_id: preview.import_id }) });
      setStatus(next);
      setStatusError(null);
      refreshNetworkLists();
      setPreview(null);
      setFile(null);
      setConsent(false);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not save this import.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(removeData: boolean) {
    if (removeData && !window.confirm("Delete imported people, connections, and company matches from Litos? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<LinkedInStatus>(removeData ? "/network/linkedin/data" : "/network/linkedin/disconnect", { method: removeData ? "DELETE" : "POST" });
      setStatus(next);
      setPeople([]);
      setCompanies([]);
      setStatusError(null);
      setPeopleError(null);
      setCompaniesError(null);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not update this connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <header>
        <p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">Your connection map</p>
        <h1 className="mt-2 text-section font-[450] text-ink">Network</h1>
        <p className="mt-2 max-w-2xl text-body text-muted">Bring connections you already own into Litos, then see where a real path into a company exists.</p>
      </header>

      <nav aria-label="Network sections" className="flex gap-2 border-b border-border pb-3">
        {(["people", "companies", "linkedin"] as const).map((value) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => chooseTab(value)} className={`min-h-11 rounded-control px-4 text-small capitalize ${tab === value ? "bg-coral-soft font-medium text-coral-ink" : "text-muted hover:bg-surface-alt hover:text-ink"}`}>{value === "linkedin" ? "LinkedIn" : value}</button>)}
      </nav>
      {error && <ErrorNote message={error} />}

      <MotionPanel key={tab} name="dashboard-network-panel">
      {tab === "people" && (
        <section>
          {premium && statusError ? (
            <NetworkRequestError title="Could not check your network" body="Litos cannot tell whether your import is connected. Retry before treating this as an empty network." onRetry={retryStatus} />
          ) : disconnectedWithRetainedData ? (
            <EmptyState visual="profile" title="Network use is disconnected" body="Disconnect stops future use. Your imported data is retained only so you can delete it later from LinkedIn settings."><Button type="button" variant="secondary" onClick={() => chooseTab("linkedin")}>Review retained data</Button></EmptyState>
          ) : !premium ? (
            <LockedInsight title="People you may know at target companies" body="Litos+ matches your imported first-degree connections to the companies in your search." onOpen={() => requestPremium("referral_paths", "people_list")} />
          ) : peopleError ? (
            <NetworkRequestError title="Could not load imported people" body="Your saved connections may still be there. Retry before treating this as an empty network." onRetry={retryPeople} />
          ) : people === null ? <ShimmerRows rows={3} /> : people.length === 0 ? (
            <EmptyState visual="profile" title="No imported people yet" body="Import your own LinkedIn connections, or add a contact from Outreach."><Button type="button" variant="secondary" onClick={() => chooseTab("linkedin")}>Import connections</Button></EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {people.map((person) => <Card key={person.id} className="p-5"><h2 className="text-heading font-[450] text-ink">{person.full_name ?? person.name ?? "Connection"}</h2><p className="mt-1 text-small text-muted">{[person.title, person.company].filter(Boolean).join(" at ") || "Details not included in the export"}</p><p className="mt-3 font-mono text-label text-coral-ink">{person.relationship ?? "First-degree connection"}</p></Card>)}
            </div>
          )}
          <p className="mt-5 text-small text-muted">Need someone not in your import? Add a contact manually from <Link href="/dashboard/outreach" className="font-medium text-coral-ink underline underline-offset-4">Outreach</Link>.</p>
        </section>
      )}

      {tab === "companies" && (
        premium && statusError ? <NetworkRequestError title="Could not check your network" body="Litos cannot tell whether your import is connected. Retry before treating this as an empty network." onRetry={retryStatus} />
          : disconnectedWithRetainedData ? <EmptyState visual="jobs" title="Network use is disconnected" body="Company matches are hidden because disconnect stops future use. Delete the retained import from LinkedIn settings whenever you choose." />
          : !premium ? <LockedInsight title="Companies where you have a path" body="Litos+ groups real imported connections by company and never invents a second-degree relationship." onOpen={() => requestPremium("networking_discovery", "company_matches")} />
          : companiesError ? <NetworkRequestError title="Could not load company matches" body="Your imported network may still have company matches. Retry before treating this as an empty result." onRetry={retryCompanies} />
          : companies === null ? <ShimmerRows rows={3} /> : companies.length === 0 ? <EmptyState visual="jobs" title="No company matches yet" body="Import LinkedIn connections, then Litos can match their current companies to your search." />
            : <div className="grid gap-3 sm:grid-cols-2">{companies.map((company) => <Card key={company.id ?? company.name} className="p-5"><h2 className="text-heading font-[450] text-ink">{company.name}</h2><p className="mt-3 font-mono text-label text-coral-ink">{company.connection_count ?? 0} imported connection{company.connection_count === 1 ? "" : "s"}</p>{typeof company.open_role_count === "number" && <p className="mt-1 text-small text-muted">{company.open_role_count} open role{company.open_role_count === 1 ? "" : "s"}</p>}</Card>)}</div>
      )}

      {tab === "linkedin" && (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-6">
            <p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">LinkedIn connections export</p>
            <h2 className="mt-2 text-heading font-[450] text-ink">Import only when you choose.</h2>
            <p className="mt-3 text-small text-muted">Litos reads names, roles, companies, and profile URLs from your LinkedIn Connections.csv export. It uses them to match companies and possible referral paths. Litos never sends LinkedIn messages for you.</p>
            <ul className="mt-4 space-y-2 text-small text-muted"><li>Raw files are deleted after parsing and within 24 hours.</li><li>Disconnect stops future use. Your imported data stays retained so you can delete it later.</li><li>Delete removes imported network data.</li></ul>
            <label className="mt-5 flex gap-3 rounded-inner border border-border bg-surface-alt p-4 text-small text-ink"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-4 accent-coral" /><span>I consent to Litos processing my LinkedIn connections export for company matches and referral paths.</span></label>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} />
            <div className="mt-5 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Choose Connections.csv</Button><Button type="button" variant="secondary" disabled={!file || !consent || busy} onClick={() => void previewImport()}>{busy && !preview ? <PendingLabel>Checking file</PendingLabel> : "Preview import"}</Button></div>
            {file && <p className="mt-3 font-mono text-label text-muted">{file.name} · {Math.ceil(file.size / 1024)} KB</p>}
            {preview && <div className="mt-5 rounded-inner border border-coral/35 bg-coral-soft/45 p-4" role="status"><p className="font-mono text-machine text-ink">{preview.accepted_rows} accepted · {preview.rejected_rows} rejected</p>{preview.warnings?.map((warning) => <p key={warning} className="mt-2 text-small text-muted">{warning}</p>)}<Button type="button" variant="secondary" className="mt-4 border-coral text-coral-ink" disabled={busy} onClick={() => void commitImport()}>{busy ? <PendingLabel>Saving import</PendingLabel> : "Import accepted rows"}</Button></div>}
          </Card>
          <Card className="p-6">
            <p className="font-mono text-label uppercase tracking-[0.08em] text-muted">Current state</p>
            {statusError ? <NetworkRequestError title="Could not check your LinkedIn import" body="Litos cannot tell whether a network is connected or stored right now." onRetry={retryStatus} /> : status === null ? <div className="mt-4"><PendingLabel>Checking connection</PendingLabel></div> : disconnectedWithRetainedData ? <><h2 className="mt-2 text-heading font-[450] text-ink">Disconnected, {status.retained_people_count} imported people retained</h2><p className="mt-2 text-small text-muted">Litos has stopped future use of this data. It remains stored only so you can delete it below.</p></> : <><h2 className="mt-2 text-heading font-[450] text-ink">{status.imported_people_count ? `${status.imported_people_count} imported people` : "No network imported"}</h2><p className="mt-2 text-small text-muted">{status.imported_at ? `Last imported ${new Date(status.imported_at).toLocaleDateString()}.` : "Use LinkedIn's official export whenever you are ready."}</p></>}
            {(status?.connected || (status?.retained_people_count ?? 0) > 0) ? <div className="mt-5 flex flex-col gap-2">{status?.connected && <Button type="button" variant="secondary" disabled={busy} onClick={() => void disconnect(false)}>Disconnect</Button>}<Button type="button" variant="quiet" disabled={busy} onClick={() => void disconnect(true)} className="text-danger">Delete imported data</Button></div> : null}
          </Card>
        </div>
      )}
      </MotionPanel>
    </div>
  );
}

function NetworkRequestError({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return <div role="alert"><DataErrorState title={title} body={body} headingLevel="h2" onRetry={onRetry} /></div>;
}

function LockedInsight({ title, body, onOpen }: { title: string; body: string; onOpen: () => void }) {
  return <Card className="border-coral/35 bg-coral-soft/30 p-6"><p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">Litos+</p><h2 className="mt-2 text-heading font-[450] text-ink">{title}</h2><p className="mt-2 max-w-xl text-small text-muted">{body}</p><Button type="button" variant="secondary" className="mt-5 border-coral text-coral-ink" onClick={onOpen}>See Litos+</Button></Card>;
}
