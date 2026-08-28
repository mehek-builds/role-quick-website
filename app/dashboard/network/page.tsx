"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { validateApplicationDocument } from "@/lib/document-size";
import { Button } from "@/components/app/Button";
import { Card, DataErrorState, EmptyState, ErrorNote, PendingLabel, ShimmerRows } from "@/components/app/ui";
import { MotionPanel, runDashboardTransition } from "@/components/app/Motion";
import { useBilling } from "@/components/billing/BillingProvider";

type NetworkTab = "people" | "companies" | "linkedin";
const NETWORK_TABS: Array<{ id: NetworkTab; label: string }> = [
  { id: "people", label: "People" },
  { id: "companies", label: "Companies" },
  { id: "linkedin", label: "LinkedIn" },
];
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
type NetworkOperationKind = "preview" | "commit" | "disconnect" | "delete";
type NetworkOperation = { id: number; kind: NetworkOperationKind };

export default function NetworkPage() {
  const {
    canUse,
    openUpgrade,
    loading: billingLoading,
    error: billingError,
    refresh: refreshBilling,
  } = useBilling();
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
  const [operation, setOperation] = useState<NetworkOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusRequestGenerationRef = useRef(0);
  const previewRequestGenerationRef = useRef(0);
  const consentRef = useRef(false);
  const operationRef = useRef<NetworkOperation | null>(null);
  const operationGenerationRef = useRef(0);
  const networkTabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<NetworkTab, HTMLButtonElement | null>>({
    people: null,
    companies: null,
    linkedin: null,
  });
  const requestedTabRef = useRef<NetworkTab>("people");
  const tabTransitionActiveRef = useRef(false);
  const pendingTabFocusRef = useRef<NetworkTab | null>(null);
  const networkAccess = canUse("networking_discovery");
  const premium = networkAccess === true;
  const billingUnavailable = !billingLoading && networkAccess === null;
  const disconnectedWithRetainedData = status?.connected === false && (status.retained_people_count ?? 0) > 0;
  const operationKind = operation?.kind ?? null;
  const busy = operationKind !== null;
  const mutationBusy = operationKind !== null && operationKind !== "preview";

  useEffect(() => {
    let cancelled = false;
    const generation = ++statusRequestGenerationRef.current;
    api<LinkedInStatus>("/network/linkedin/status")
      .then((next) => {
        if (cancelled || generation !== statusRequestGenerationRef.current) return;
        setStatus(next);
        setStatusError(null);
      })
      .catch(() => {
        if (cancelled || generation !== statusRequestGenerationRef.current) return;
        setStatusError("Litos could not check your LinkedIn import just now.");
      });
    return () => { cancelled = true; };
  }, [statusReload]);

  useEffect(() => {
    let cancelled = false;
    if (networkAccess === false || status?.connected === false) {
      queueMicrotask(() => {
        if (cancelled) return;
        setPeople([]);
        setPeopleError(null);
      });
      return () => { cancelled = true; };
    }
    if (networkAccess !== true || status?.connected !== true) return () => { cancelled = true; };
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
  }, [networkAccess, peopleReload, status?.connected]);

  useEffect(() => {
    let cancelled = false;
    if (networkAccess === false || status?.connected === false) {
      queueMicrotask(() => {
        if (cancelled) return;
        setCompanies([]);
        setCompaniesError(null);
      });
      return () => { cancelled = true; };
    }
    if (networkAccess !== true || status?.connected !== true) return () => { cancelled = true; };
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
  }, [companiesReload, networkAccess, status?.connected]);

  function focusNetworkPanel() {
    document.getElementById("network-panel")?.focus();
  }

  function retryStatus() {
    focusNetworkPanel();
    statusRequestGenerationRef.current += 1;
    setStatus(null);
    setStatusError(null);
    setStatusReload((value) => value + 1);
  }

  function retryPeople() {
    focusNetworkPanel();
    setPeople(null);
    setPeopleError(null);
    setPeopleReload((value) => value + 1);
  }

  function retryCompanies() {
    focusNetworkPanel();
    setCompanies(null);
    setCompaniesError(null);
    setCompaniesReload((value) => value + 1);
  }

  function retryBilling() {
    focusNetworkPanel();
    void refreshBilling();
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

  function chooseTab(next: NetworkTab, options: { focusTab?: boolean } = {}) {
    requestedTabRef.current = next;
    if (options.focusTab) pendingTabFocusRef.current = next;
    if (tabTransitionActiveRef.current) return;
    if (next === tab) {
      if (options.focusTab) {
        pendingTabFocusRef.current = null;
        tabRefs.current[next]?.focus();
      }
      return;
    }
    tabTransitionActiveRef.current = true;
    runDashboardTransition(() => setTab(next));
  }

  useEffect(() => {
    tabTransitionActiveRef.current = false;
    if (requestedTabRef.current !== tab) {
      // Serialize ViewTransition commits. A newer click or arrow-key intent waits for the active
      // commit, then becomes the only next transition instead of racing the older update.
      queueMicrotask(() => {
        if (tabTransitionActiveRef.current || requestedTabRef.current === tab) return;
        const next = requestedTabRef.current;
        tabTransitionActiveRef.current = true;
        runDashboardTransition(() => setTab(next));
      });
      return;
    }
    if (pendingTabFocusRef.current !== tab) return;
    pendingTabFocusRef.current = null;
    tabRefs.current[tab]?.focus();
  }, [tab]);

  useEffect(() => {
    const tablist = networkTabsRef.current;
    if (!tablist) return;
    const requestTab = (next: NetworkTab, focusTab: boolean) => {
      requestedTabRef.current = next;
      if (focusTab) pendingTabFocusRef.current = next;
      if (tabTransitionActiveRef.current) return;
      if (next === tab) {
        if (focusTab) {
          pendingTabFocusRef.current = null;
          tabRefs.current[next]?.focus();
        }
        return;
      }
      tabTransitionActiveRef.current = true;
      runDashboardTransition(() => setTab(next));
    };
    const targetTab = (event: Event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>("[data-network-tab]")
        : null;
      const tabId = target?.dataset.networkTab;
      return tabId && NETWORK_TABS.some((item) => item.id === tabId)
        ? tabId as NetworkTab
        : null;
    };
    const handleClick = (event: MouseEvent) => {
      const next = targetTab(event);
      if (next) requestTab(next, false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const current = targetTab(event);
      if (!current) return;
      event.preventDefault();
      const currentIndex = NETWORK_TABS.findIndex((item) => item.id === current);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? NETWORK_TABS.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % NETWORK_TABS.length
            : (currentIndex - 1 + NETWORK_TABS.length) % NETWORK_TABS.length;
      const next = NETWORK_TABS[nextIndex].id;
      requestTab(next, true);
    };
    tablist.addEventListener("click", handleClick);
    tablist.addEventListener("keydown", handleKeyDown);
    return () => {
      tablist.removeEventListener("click", handleClick);
      tablist.removeEventListener("keydown", handleKeyDown);
    };
  }, [tab]);

  function beginOperation(kind: NetworkOperationKind) {
    if (operationRef.current) return null;
    const owner = { id: ++operationGenerationRef.current, kind };
    operationRef.current = owner;
    setOperation(owner);
    return owner;
  }

  function finishOperation(owner: NetworkOperation) {
    if (operationRef.current !== owner) return;
    operationRef.current = null;
    setOperation(null);
  }

  function changeConsent(nextConsent: boolean) {
    const activeOperation = operationRef.current;
    if (activeOperation && activeOperation.kind !== "preview") return;
    consentRef.current = nextConsent;
    setConsent(nextConsent);
    if (!nextConsent) {
      previewRequestGenerationRef.current += 1;
      if (activeOperation?.kind === "preview") finishOperation(activeOperation);
      setPreview(null);
    }
  }

  function chooseFile(next: File | undefined) {
    const activeOperation = operationRef.current;
    if (activeOperation && activeOperation.kind !== "preview") return;
    previewRequestGenerationRef.current += 1;
    if (activeOperation?.kind === "preview") finishOperation(activeOperation);
    setPreview(null);
    setError(null);
    if (!next) return;
    /* The shared gate (document-size.ts), not the backend route's own 20 MB allowance: this
       import rides the same serverless function as every other upload, so the platform rejects a
       body past the shared cap as an unreadable 413 before the backend's larger limit is ever
       reached. Promising 20 MB here was promising a number no request could deliver. */
    const problem = validateApplicationDocument(next, {
      accept: "csv",
      typeMessage: "Choose LinkedIn's Connections.csv file.",
    });
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile(next);
  }

  async function previewImport() {
    if (!file || !consent || !consentRef.current) return;
    const owner = beginOperation("preview");
    if (!owner) return;
    const generation = ++previewRequestGenerationRef.current;
    setError(null);
    const form = new FormData();
    form.append("connections", file);
    form.append("consent_version", "linkedin_csv_v1");
    try {
      const next = await api<Preview>("/network/linkedin/import/preview", { method: "POST", body: form });
      if (generation !== previewRequestGenerationRef.current || !consentRef.current) return;
      setPreview(next);
    } catch (reason) {
      if (generation !== previewRequestGenerationRef.current) return;
      setError(reason instanceof Error ? reason.message : "Litos could not preview this export.");
    } finally {
      if (generation === previewRequestGenerationRef.current) finishOperation(owner);
    }
  }

  async function commitImport() {
    if (!preview || !consent || !consentRef.current) return;
    const owner = beginOperation("commit");
    if (!owner) return;
    const importId = preview.import_id;
    setError(null);
    try {
      const next = await api<LinkedInStatus>("/network/linkedin/import/commit", { method: "POST", body: JSON.stringify({ import_id: importId }) });
      statusRequestGenerationRef.current += 1;
      setStatus(next);
      setStatusError(null);
      refreshNetworkLists();
      setPreview(null);
      setFile(null);
      consentRef.current = false;
      setConsent(false);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not save this import.");
    } finally {
      finishOperation(owner);
    }
  }

  async function disconnect(removeData: boolean) {
    if (operationRef.current) return;
    if (removeData && !window.confirm("Delete imported people, connections, and company matches from Litos? This cannot be undone.")) return;
    const owner = beginOperation(removeData ? "delete" : "disconnect");
    if (!owner) return;
    setError(null);
    try {
      const next = await api<LinkedInStatus>(removeData ? "/network/linkedin/data" : "/network/linkedin/disconnect", { method: removeData ? "DELETE" : "POST" });
      statusRequestGenerationRef.current += 1;
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
      finishOperation(owner);
    }
  }

  return (
    <div className="space-y-7">
      <header>
        <p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">Your connection map</p>
        <h1 className="mt-2 text-section font-[450] text-ink">Network</h1>
        <p className="mt-2 max-w-2xl text-body text-muted">Bring connections you already own into Litos, then see where a real path into a company exists.</p>
      </header>

      <div ref={networkTabsRef} role="tablist" aria-label="Network sections" className="flex gap-2 border-b border-border pb-3">
        {NETWORK_TABS.map(({ id, label }) => (
          <button
            key={id}
            ref={(node) => { tabRefs.current[id] = node; }}
            type="button"
            role="tab"
            id={`network-tab-${id}`}
            data-network-tab={id}
            aria-selected={tab === id}
            aria-controls="network-panel"
            tabIndex={tab === id ? 0 : -1}
            className={`min-h-11 rounded-control px-4 text-small ${tab === id ? "bg-coral-soft font-medium text-coral-ink" : "text-muted hover:bg-surface-alt hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <ErrorNote message={error} />}

      <MotionPanel key={tab} name="dashboard-network-panel">
      <div id="network-panel" role="tabpanel" aria-labelledby={`network-tab-${tab}`} tabIndex={0}>
      {tab === "people" && (
        <section>
          {billingLoading ? (
            <ShimmerRows rows={3} />
          ) : billingUnavailable ? (
            <NetworkRequestError
              title="Could not check your plan access"
              body={billingError ? "Litos could not verify Network access just now." : "Network access was not included in the latest plan response."}
              onRetry={retryBilling}
            />
          ) : premium && statusError ? (
            <NetworkRequestError title="Could not check your network" body="Litos cannot tell whether your import is connected. Retry before treating this as an empty network." onRetry={retryStatus} />
          ) : disconnectedWithRetainedData ? (
            <EmptyState visual="profile" title="Network use is disconnected" body="Disconnect stops future use. Your imported data is retained only so you can delete it later from LinkedIn settings."><Button type="button" variant="secondary" onClick={() => chooseTab("linkedin", { focusTab: true })}>Review retained data</Button></EmptyState>
          ) : networkAccess === false ? (
            <LockedInsight title="People you may know at target companies" body="Litos+ matches your imported first-degree connections to the companies in your search." onOpen={() => requestPremium("referral_paths", "people_list")} />
          ) : status === null ? (
            <ShimmerRows rows={3} />
          ) : peopleError ? (
            <NetworkRequestError title="Could not load imported people" body="Your saved connections may still be there. Retry before treating this as an empty network." onRetry={retryPeople} />
          ) : people === null ? <ShimmerRows rows={3} /> : people.length === 0 ? (
            <EmptyState visual="profile" title="No imported people yet" body="Import your own LinkedIn connections, or add a contact from Outreach."><Button type="button" variant="secondary" onClick={() => chooseTab("linkedin", { focusTab: true })}>Import connections</Button></EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {people.map((person) => <Card key={person.id} className="p-5"><h2 className="text-heading font-[450] text-ink">{person.full_name ?? person.name ?? "Connection"}</h2><p className="mt-1 text-small text-muted">{[person.title, person.company].filter(Boolean).join(" at ") || "Details not included in the export"}</p><p className="mt-3 font-mono text-label text-coral-ink">{person.relationship ?? "First-degree connection"}</p></Card>)}
            </div>
          )}
          <p className="mt-5 text-small text-muted">Need someone not in your import? Add a contact manually from <Link href="/dashboard/outreach" className="font-medium text-coral-ink underline underline-offset-4">Outreach</Link>.</p>
        </section>
      )}

      {tab === "companies" && (
        billingLoading ? <ShimmerRows rows={3} />
          : billingUnavailable ? <NetworkRequestError
            title="Could not check your plan access"
            body={billingError ? "Litos could not verify Network access just now." : "Network access was not included in the latest plan response."}
            onRetry={retryBilling}
          />
          : premium && statusError ? <NetworkRequestError title="Could not check your network" body="Litos cannot tell whether your import is connected. Retry before treating this as an empty network." onRetry={retryStatus} />
          : disconnectedWithRetainedData ? <EmptyState visual="jobs" title="Network use is disconnected" body="Company matches are hidden because disconnect stops future use. Delete the retained import from LinkedIn settings whenever you choose." />
          : networkAccess === false ? <LockedInsight title="Companies where you have a path" body="Litos+ groups real imported connections by company and never invents a second-degree relationship." onOpen={() => requestPremium("networking_discovery", "company_matches")} />
          : status === null ? <ShimmerRows rows={3} />
          : companiesError ? <NetworkRequestError title="Could not load company matches" body="Your imported network may still have company matches. Retry before treating this as an empty result." onRetry={retryCompanies} />
          : companies === null ? <ShimmerRows rows={3} /> : companies.length === 0 ? <EmptyState visual="jobs" title="No company matches yet" body="Import LinkedIn connections, then Litos can match their current companies to your search." />
            : <div className="grid gap-3 sm:grid-cols-2">{companies.map((company) => <Card key={company.id ?? company.name} className="p-5"><h2 className="text-heading font-[450] text-ink">{company.name}</h2><p className="mt-3 font-mono text-label text-coral-ink">{company.connection_count ?? 0} imported connection{company.connection_count === 1 ? "" : "s"}</p>{typeof company.open_role_count === "number" && <p className="mt-1 text-small text-muted">{company.open_role_count} open role{company.open_role_count === 1 ? "" : "s"}</p>}</Card>)}</div>
      )}

      {tab === "linkedin" && (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-6" aria-busy={busy} data-network-operation={operationKind ?? "idle"}>
            <p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">LinkedIn connections export</p>
            <h2 className="mt-2 text-heading font-[450] text-ink">Import only when you choose.</h2>
            <p className="mt-3 text-small text-muted">Litos reads names, roles, companies, and profile URLs from your LinkedIn Connections.csv export. It uses them to match companies and possible referral paths. Litos never sends LinkedIn messages for you.</p>
            <ul className="mt-4 space-y-2 text-small text-muted"><li>Raw files are deleted after parsing and within 24 hours.</li><li>Disconnect stops future use. Your imported data stays retained so you can delete it later.</li><li>Delete removes imported network data.</li></ul>
            <label className={`mt-5 flex gap-3 rounded-inner border border-border bg-surface-alt p-4 text-small text-ink ${mutationBusy ? "cursor-not-allowed opacity-60" : ""}`}><input type="checkbox" checked={consent} disabled={mutationBusy} onChange={(event) => changeConsent(event.target.checked)} className="mt-0.5 size-4 accent-coral" /><span>I consent to Litos processing my LinkedIn connections export for company matches and referral paths.</span></label>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(event) => chooseFile(event.target.files?.[0])} />
            <div className="mt-5 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Choose Connections.csv</Button><Button type="button" variant="secondary" disabled={!file || !consent || busy} onClick={() => void previewImport()}>{operationKind === "preview" ? <PendingLabel>Checking file</PendingLabel> : "Preview import"}</Button></div>
            {file && <p className="mt-3 font-mono text-label text-muted">{file.name} · {Math.ceil(file.size / 1024)} KB</p>}
            {preview && <div className="mt-5 rounded-inner border border-coral/35 bg-coral-soft/45 p-4" role="status"><p className="font-mono text-machine text-ink">{preview.accepted_rows} accepted · {preview.rejected_rows} rejected</p>{preview.warnings?.map((warning) => <p key={warning} className="mt-2 text-small text-muted">{warning}</p>)}<Button type="button" variant="secondary" className="mt-4 border-coral text-coral-ink" disabled={!consent || busy} onClick={() => void commitImport()}>{operationKind === "commit" ? <PendingLabel>Saving import</PendingLabel> : "Import accepted rows"}</Button></div>}
          </Card>
          <Card className="p-6">
            <p className="font-mono text-label uppercase tracking-[0.08em] text-muted">Current state</p>
            {statusError ? <NetworkRequestError title="Could not check your LinkedIn import" body="Litos cannot tell whether a network is connected or stored right now." onRetry={retryStatus} /> : status === null ? <div className="mt-4"><PendingLabel>Checking connection</PendingLabel></div> : disconnectedWithRetainedData ? <><h2 className="mt-2 text-heading font-[450] text-ink">Disconnected, {status.retained_people_count} imported people retained</h2><p className="mt-2 text-small text-muted">Litos has stopped future use of this data. It remains stored only so you can delete it below.</p></> : <><h2 className="mt-2 text-heading font-[450] text-ink">{status.imported_people_count ? `${status.imported_people_count} imported people` : "No network imported"}</h2><p className="mt-2 text-small text-muted">{status.imported_at ? `Last imported ${new Date(status.imported_at).toLocaleDateString()}.` : "Use LinkedIn's official export whenever you are ready."}</p></>}
            {(status?.connected || (status?.retained_people_count ?? 0) > 0) ? <div className="mt-5 flex flex-col gap-2">{status?.connected && <Button type="button" variant="secondary" disabled={busy} onClick={() => void disconnect(false)}>{operationKind === "disconnect" ? <PendingLabel>Disconnecting</PendingLabel> : "Disconnect"}</Button>}<Button type="button" variant="quiet" disabled={busy} onClick={() => void disconnect(true)} className="text-danger">{operationKind === "delete" ? <PendingLabel>Deleting data</PendingLabel> : "Delete imported data"}</Button></div> : null}
          </Card>
        </div>
      )}
      </div>
      </MotionPanel>
    </div>
  );
}

function NetworkRequestError({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return <DataErrorState title={title} body={body} headingLevel="h2" onRetry={onRetry} />;
}

function LockedInsight({ title, body, onOpen }: { title: string; body: string; onOpen: () => void }) {
  return <Card className="border-coral/35 bg-coral-soft/30 p-6"><p className="font-mono text-label uppercase tracking-[0.08em] text-coral-ink">Litos+</p><h2 className="mt-2 text-heading font-[450] text-ink">{title}</h2><p className="mt-2 max-w-xl text-small text-muted">{body}</p><Button type="button" variant="secondary" className="mt-5 border-coral text-coral-ink" onClick={onOpen}>See Litos+</Button></Card>;
}
