"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { hasLoopbackQaApiUrl, hasQaInterceptionSignal } from "@/app/qa/network-safety";

import {
  AppliedToday,
  AutopilotLockNote,
  AutopilotStrip,
  AutopilotToggle,
  NextMatchCard,
  type ConsentEligibility,
} from "@/components/app/Autopilot";
import { AvailabilityWindowTable } from "@/components/app/AvailabilityWindowTable";
import { Button, ButtonLink } from "@/components/app/Button";
import { CaptchaConsentControl } from "@/components/app/CaptchaConsentControl";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { ConsentAcknowledgementControl } from "@/components/app/ConsentAcknowledgementControl";
import { CountryEligibilityEditor } from "@/components/app/CountryEligibilityEditor";
import { DailyMatchesComplete } from "@/components/app/DailyMatchesComplete";
import { InterviewPrep } from "@/components/app/InterviewPrep";
import { MatchGaps, MatchScore } from "@/components/app/MatchScore";
import { AuditedJobDescription, PacketAuditBreakdown } from "@/components/app/PacketAuditEvidence";
import {
  MatchLegend,
  RequirementProvider,
  RequirementText,
  TermMark,
} from "@/components/app/RequirementText";
import { ResumeHealth } from "@/components/app/ResumeHealth";
import { SectionBoundary } from "@/components/app/SectionBoundary";
import { WaitingOnYou } from "@/components/app/WaitingOnYou";
import {
  Card,
  Chip,
  DataErrorState,
  EmptyState,
  ErrorNote,
  ExtensionStoreLink,
  LoadingOrb,
  Meter,
  Notice,
  PageHeader,
  PendingLabel,
  ScoreRing,
  ShimmerRows,
  TerminalActionBar,
} from "@/components/app/ui";
import { API_URL } from "@/lib/config";
import { buildRequirementIndex } from "@/features/applications";
import type { AvailabilityWindowInput } from "@/lib/availability-window";
import type { PacketAudit, ResumeSpec } from "@/lib/api";
import {
  CONSENT_GRANTS,
  type ConsentGrantField,
} from "@/lib/consent-acknowledgement";
import { PACKET_AUDIT_VERSION } from "@/lib/packet-audit-version";
import { MAX_COUNTRY_ELIGIBILITY_RECORDS } from "@/lib/work-eligibility-limit";
import {
  COUNTRY_OPTIONS,
  blankCountryEligibility,
  type CountryWorkEligibilityDraft,
} from "@/lib/work-eligibility";

const LONG_TEXT =
  "This scenario uses a realistic but unusually detailed label that keeps explaining the application, the selected company, the saved profile, and what will happen after the action completes.";
const UNBREAKABLE = `application_packet_${"x".repeat(128)}`;

type PanelName = "primitives" | "automation" | "inputs" | "analysis";

type HarnessProps = {
  panel?: string;
  scenario?: string;
  qaKey: string | null;
};

function Scenario({
  id,
  title,
  note,
  children,
  className = "",
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-stress-scenario={id}
      className={`rounded-card border border-border bg-surface p-4 shadow-rest ${className}`}
    >
      <div className="mb-4 border-b border-border pb-3">
        <p className="font-mono text-label text-muted">{id}</p>
        <h2 className="mt-1 text-heading text-ink">{title}</h2>
        {note && <p className="mt-1 text-small text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function PanelShell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <main
      data-stress-panel={name}
      className="min-h-svh bg-canvas px-3 py-5 text-ink sm:px-5"
    >
      <header className="mb-6">
        <p className="font-mono text-label text-muted">Temporary QA fixture</p>
        <h1 className="mt-1 text-section">Dashboard controls: {name}</h1>
        <p className="mt-2 text-small text-muted">
          Real exported controls, local fixture data, light mode only.
        </p>
      </header>
      <div className="space-y-5">{children}</div>
    </main>
  );
}

function PrimitivePanel() {
  const [lastAction, setLastAction] = useState("No action yet");
  const act = (message: string) => () => setLastAction(message);

  return (
    <PanelShell name="primitives">
      <p
        data-stress-action-log="true"
        role="status"
        aria-live="polite"
        className="sticky top-2 z-30 rounded-inner bg-ink px-3 py-2 font-mono text-machine text-white"
      >
        {lastAction}
      </p>

      <Scenario id="button-variants-sizes" title="Button variants and sizes">
        <div className="flex flex-wrap items-center gap-3">
          {(["primary", "secondary", "quiet", "danger"] as const).flatMap((variant) =>
            (["sm", "md", "lg"] as const).map((size) => (
              <Button key={`${variant}-${size}`} variant={variant} size={size} onClick={act(`${variant} ${size}`)}>
                {variant} {size}
              </Button>
            )),
          )}
        </div>
      </Scenario>

      <Scenario id="button-content-states" title="Button content and disabled states">
        <div className="space-y-3">
          <Button block onClick={act("block button")}>Block button</Button>
          <Button block variant="secondary" onClick={act("long label")}>{LONG_TEXT}</Button>
          <Button block variant="secondary" onClick={act("unbreakable label")}>{UNBREAKABLE}</Button>
          <div className="flex flex-wrap gap-3">
            <Button disabled>Disabled</Button>
            <Button aria-disabled="true" onClick={() => undefined}>ARIA disabled</Button>
            <Button disabled><PendingLabel onColor>Opening the application</PendingLabel></Button>
          </div>
        </div>
      </Scenario>

      <Scenario id="button-links" title="ButtonLink internal and external forms">
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="#fixture-target">Internal target</ButtonLink>
          <ButtonLink href="mailto:qa@example.com" variant="secondary">Email link</ButtonLink>
          <ButtonLink href="#fixture-target" block variant="quiet">Block quiet link</ButtonLink>
        </div>
        <div id="fixture-target" className="mt-4 text-small text-muted">Hash target reached.</div>
      </Scenario>

      <Scenario id="cards-text" title="Card text lengths">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">Normal card content.</Card>
          <Card className="p-4">{LONG_TEXT}</Card>
          <Card className="p-4">{UNBREAKABLE}</Card>
        </div>
      </Scenario>

      <Scenario id="chips" title="Chip meanings and text lengths">
        <div className="flex flex-wrap gap-2">
          <Chip label="Draft" kind="draft" />
          <Chip label="Ready" kind="ready" />
          <Chip label="Sent" kind="sent" />
          <Chip label="Waiting" kind="warn" />
          <Chip label="Bounced" kind="bounced" />
          <Chip label="Hiring manager" kind="persona" />
          <Chip label={LONG_TEXT} />
          <Chip label={UNBREAKABLE} />
        </div>
      </Scenario>

      <Scenario id="meters" title="Meters, limits, and large quantities">
        <div className="space-y-5">
          <Meter label="Applications" used={0} limit={20} />
          <Meter label="Applications" used={1} limit={20} />
          <Meter label="Applications" used={20} limit={20} />
          <Meter label="Applications" used={999999999999} limit={1000000000000} />
          <Meter label={UNBREAKABLE} used={500} limit={0} />
          <Meter label="Over the reported limit" used={120} limit={100} />
        </div>
      </Scenario>

      <Scenario id="score-rings" title="ScoreRing numeric boundaries">
        <div className="flex flex-wrap items-center gap-5">
          <ScoreRing score={-999999} />
          <ScoreRing score={0} />
          <ScoreRing score={1} />
          <ScoreRing score={54.4} />
          <ScoreRing score={100} />
          <ScoreRing score={999999999999} metricLabel={UNBREAKABLE} />
        </div>
      </Scenario>

      <Scenario id="pending-labels" title="Pending labels and orb states">
        <div className="flex flex-wrap gap-4">
          {(["working", "searching", "solving", "listening", "composing", "shaping"] as const).map((state) => (
            <PendingLabel key={state} state={state}>{state}</PendingLabel>
          ))}
          <PendingLabel>{LONG_TEXT}</PendingLabel>
          <PendingLabel>{UNBREAKABLE}</PendingLabel>
        </div>
      </Scenario>

      <Scenario id="loading-orbs" title="Loading cues">
        <div className="grid gap-4 sm:grid-cols-2">
          <LoadingOrb />
          <LoadingOrb label="Loading applications" />
          <LoadingOrb label={LONG_TEXT} state="composing" />
          <LoadingOrb label={UNBREAKABLE} state="searching" />
        </div>
      </Scenario>

      <Scenario id="shimmer-rows" title="Shimmer rows with zero, one, and many items">
        <div className="space-y-5">
          <div><p className="mb-2 text-label text-muted">0 rows</p><ShimmerRows rows={0} /></div>
          <div><p className="mb-2 text-label text-muted">1 row</p><ShimmerRows rows={1} /></div>
          <div><p className="mb-2 text-label text-muted">12 rows</p><ShimmerRows rows={12} /></div>
        </div>
      </Scenario>

      <Scenario id="page-header" title="PageHeader long content and action">
        <PageHeader
          title={UNBREAKABLE}
          sub={LONG_TEXT}
          action={<Button onClick={act("header action")}>Review application</Button>}
        />
      </Scenario>

      <Scenario id="empty-states" title="EmptyState visual variants">
        <div className="space-y-4">
          {(["applications", "emails", "jobs", "profile", "error"] as const).map((visual) => (
            <EmptyState
              key={visual}
              visual={visual}
              title={visual === "jobs" ? UNBREAKABLE : `No ${visual} yet`}
              body={visual === "profile" ? LONG_TEXT : `The ${visual} list has no items.`}
            >
              <Button variant="secondary" onClick={act(`empty ${visual}`)}>Continue</Button>
            </EmptyState>
          ))}
        </div>
      </Scenario>

      <Scenario id="data-error" title="DataErrorState with retry">
        <DataErrorState
          title="Could not load applications"
          body={`${LONG_TEXT} ${UNBREAKABLE}`}
          headingLevel="h2"
          onRetry={act("retry requested")}
        />
      </Scenario>

      <Scenario id="notices" title="Notice variants and mapped errors">
        <div className="space-y-3">
          <Notice variant="info" message="Your saved answers are available." />
          <Notice variant="success" message="Application saved." />
          <Notice variant="warning" message={LONG_TEXT} />
          <Notice variant="error" message={UNBREAKABLE} />
          <ErrorNote message="Update the Litos extension from the Chrome Web Store, then try again." />
          <ErrorNote message="request failed (503) at /private/tmp/qa" />
          <p className="text-small text-muted"><ExtensionStoreLink /></p>
        </div>
      </Scenario>

      <Scenario id="company-logo-fallback" title="CompanyLogo without a usable image source">
        <div className="flex flex-wrap items-center gap-4">
          <CompanyLogo company="Notion" />
          <CompanyLogo company="" />
          <CompanyLogo company={UNBREAKABLE} boardUrl="https://boards.greenhouse.io/fixture" />
        </div>
      </Scenario>

      <Scenario id="terminal-action" title="TerminalActionBar at narrow widths">
        <TerminalActionBar>
          <p className="min-w-0 text-small text-muted">{LONG_TEXT}</p>
          <Button onClick={act("terminal action")}>Fill application</Button>
        </TerminalActionBar>
      </Scenario>

      <Scenario id="waiting-zero" title="WaitingOnYou with no items" note="The real component should render no region.">
        <WaitingOnYou items={[]} />
        <p className="text-small text-muted">Fixture marker: zero-item render complete.</p>
      </Scenario>
    </PanelShell>
  );
}

const ELIGIBLE: ConsentEligibility = {
  eligible: true,
  reviewed_submits: 3,
  required: 3,
  remaining: 0,
};

const LOCKED: ConsentEligibility = {
  eligible: false,
  reviewed_submits: 1,
  required: 3,
  remaining: 2,
};

function AutomationPanel({ scenario }: { scenario?: string }) {
  const kind = scenario ?? "normal";
  const initialEnabled = kind === "normal";
  const [enabled, setEnabled] = useState(initialEnabled);
  const [lastAction, setLastAction] = useState("No action yet");

  if (kind === "content") {
    const normalMatch = {
      id: "match-normal",
      company: "Northwind Systems",
      role: "Software Engineering Intern",
      match: { score: 54, band: "Solid match", matched: 2, total: 4 },
    };
    const longMatch = {
      id: "match-long",
      company: UNBREAKABLE,
      role: `${LONG_TEXT} ${UNBREAKABLE}`,
      match: { score: 999999999999, band: UNBREAKABLE, matched: 999999999999, total: 1000000000000 },
    };
    return (
      <PanelShell name="automation-content">
        <p role="status" aria-live="polite" className="rounded-inner bg-ink px-3 py-2 font-mono text-machine text-white">{lastAction}</p>
        <Scenario id="autopilot-strip-counts" title="Autopilot strip and daily counts">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AutopilotStrip />
            <AppliedToday count={0} />
            <AppliedToday count={1} />
            <AppliedToday count={999999999999} />
            <span data-null-count="true"><AppliedToday count={null} /></span>
          </div>
        </Scenario>
        <Scenario id="next-match-loading" title="NextMatchCard loading">
          <NextMatchCard match={null} searching autopilot={false} appliedToday={0} onSend={() => undefined} onOpen={() => undefined} />
        </Scenario>
        <Scenario id="next-match-empty" title="NextMatchCard empty">
          <NextMatchCard match={null} searching={false} autopilot={false} appliedToday={1} onSend={() => undefined} onOpen={() => undefined} />
        </Scenario>
        <Scenario id="next-match-queued" title="NextMatchCard queued and interactive">
          <NextMatchCard
            match={normalMatch}
            searching={false}
            autopilot={false}
            appliedToday={12}
            onSend={(id) => setLastAction(`sent ${id}`)}
            onOpen={(id) => setLastAction(`opened ${id}`)}
          />
        </Scenario>
        <Scenario id="next-match-countdown" title="NextMatchCard countdown and cancel">
          <NextMatchCard
            match={longMatch}
            searching={false}
            autopilot
            appliedToday={999999999999}
            onSend={(id) => setLastAction(`sent ${id}`)}
            onOpen={(id) => setLastAction(`opened ${id}`)}
          />
        </Scenario>
      </PanelShell>
    );
  }

  const locked = kind === "locked";
  const premium = kind === "premium";
  const saving = kind === "saving";
  const eligibility = locked ? LOCKED : ELIGIBLE;

  return (
    <PanelShell name={`automation-${kind}`}>
      <p role="status" aria-live="polite" className="rounded-inner bg-ink px-3 py-2 font-mono text-machine text-white">{lastAction}</p>
      <Scenario id={`autopilot-toggle-${kind}`} title={`AutopilotToggle: ${kind}`}>
        <AutopilotToggle
          enabled={enabled}
          eligibility={eligibility}
          saving={saving}
          onToggle={(next) => {
            setEnabled(next);
            setLastAction(`toggle ${next ? "on" : "off"}`);
          }}
          premiumLocked={premium}
          premiumLoading={kind === "premium-loading"}
          onPremiumRequest={() => setLastAction("upgrade requested")}
        />
        <div className="mt-3">
          <AutopilotLockNote enabled={enabled} eligibility={eligibility} />
        </div>
      </Scenario>
    </PanelShell>
  );
}

function AvailabilityScenario({ id, value }: { id: string; value: AvailabilityWindowInput }) {
  const [current, setCurrent] = useState(value);
  return (
    <Scenario id={id} title={`AvailabilityWindowTable: ${id.replace("availability-", "")}`}>
      <AvailabilityWindowTable value={current} onChange={setCurrent} />
    </Scenario>
  );
}

function EligibilityScenario({
  id,
  title,
  initial,
  scroll = false,
}: {
  id: string;
  title: string;
  initial: CountryWorkEligibilityDraft[];
  scroll?: boolean;
}) {
  const [rows, setRows] = useState(() => initial.map((row) => ({ ...row })));
  return (
    <Scenario id={id} title={title}>
      <div className={scroll ? "max-h-[900px] overflow-y-auto pr-1" : ""}>
        <CountryEligibilityEditor rows={rows} onChange={setRows} />
      </div>
    </Scenario>
  );
}

function CaptchaScenario({ id, initial, disabled = false }: { id: string; initial: boolean; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <Scenario id={id} title={`Captcha consent: ${id.replace("captcha-", "")}`}>
      <CaptchaConsentControl
        idPrefix={id}
        value={value}
        grantedAt={initial ? "2026-08-26T12:00:00.000Z" : null}
        disabled={disabled}
        onChange={setValue}
      />
    </Scenario>
  );
}

function ConsentScenario({ id, disabled = false }: { id: string; disabled?: boolean }) {
  const [values, setValues] = useState<Partial<Record<ConsentGrantField, boolean>>>(() => ({
    [CONSENT_GRANTS[0].field]: true,
    [CONSENT_GRANTS[1].field]: false,
  }));
  return (
    <Scenario id={id} title={`Employer consent: ${disabled ? "disabled" : "partial"}`}>
      <ConsentAcknowledgementControl
        idPrefix={id}
        values={values}
        grantedAt={{ [CONSENT_GRANTS[0].field]: "2026-08-25T09:30:00.000Z" }}
        disabled={disabled}
        onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      />
    </Scenario>
  );
}

const ONE_ELIGIBILITY: CountryWorkEligibilityDraft[] = [{
  ...blankCountryEligibility("US"),
  authorized_now: true,
  needs_sponsorship_now: false,
  needs_sponsorship_future: true,
  authorization_type: UNBREAKABLE.slice(0, 120),
  authorization_expiry: "2028-06-01",
}];

const FOUR_ELIGIBILITY: CountryWorkEligibilityDraft[] = ["US", "AE", "GB", "IN"].map((country, index) => ({
  ...blankCountryEligibility(country),
  authorized_now: index !== 3,
  needs_sponsorship_now: index === 3,
  needs_sponsorship_future: index > 1,
  authorization_type: index === 0 ? "CPT" : null,
  authorization_expiry: index === 0 ? "2028-06-01" : null,
}));

const OVER_LIMIT_ELIGIBILITY: CountryWorkEligibilityDraft[] = COUNTRY_OPTIONS
  .slice(0, MAX_COUNTRY_ELIGIBILITY_RECORDS + 1)
  .map(([country]) => ({
    ...blankCountryEligibility(country),
    authorized_now: true,
    needs_sponsorship_now: false,
    needs_sponsorship_future: false,
  }));

function InputPanel({ scenario }: { scenario?: string }) {
  const nextYear = useMemo(() => new Date().getUTCFullYear() + 1, []);
  if (scenario === "many") {
    return (
      <PanelShell name="inputs-many">
        <EligibilityScenario
          id="eligibility-over-limit"
          title={`${OVER_LIMIT_ELIGIBILITY.length} country rows, one above the supported maximum`}
          initial={OVER_LIMIT_ELIGIBILITY}
          scroll
        />
      </PanelShell>
    );
  }

  return (
    <PanelShell name="inputs-basic">
      <AvailabilityScenario id="availability-empty" value={{ cycle: "", start: "", end: "", validThrough: "" }} />
      <AvailabilityScenario id="availability-incomplete" value={{ cycle: `Summer ${nextYear}`, start: `${nextYear}-05-20`, end: "", validThrough: "" }} />
      <AvailabilityScenario id="availability-incoherent" value={{ cycle: `Summer ${nextYear}`, start: `${nextYear}-08-20`, end: `${nextYear}-05-20`, validThrough: `${nextYear}-04-01` }} />
      <AvailabilityScenario id="availability-ready" value={{ cycle: `Summer ${nextYear}`, start: `${nextYear}-05-20`, end: `${nextYear}-08-20`, validThrough: `${nextYear}-04-01` }} />
      <EligibilityScenario id="eligibility-zero" title="CountryEligibilityEditor: no rows" initial={[]} />
      <EligibilityScenario id="eligibility-one" title="CountryEligibilityEditor: one complete row" initial={ONE_ELIGIBILITY} />
      <EligibilityScenario id="eligibility-many" title="CountryEligibilityEditor: four diverse rows" initial={FOUR_ELIGIBILITY} />
      <CaptchaScenario id="captcha-off" initial={false} />
      <CaptchaScenario id="captcha-on" initial />
      <CaptchaScenario id="captcha-disabled" initial={false} disabled />
      <ConsentScenario id="consent-partial" />
      <ConsentScenario id="consent-disabled" disabled />
    </PanelShell>
  );
}

const RESUME_SPEC: ResumeSpec = {
  target_role: "Software Engineer",
  school: "University of Southern California",
  degree: "B.S. Computer Science",
  grad_date: "May 2027",
  coursework: "Distributed Systems, Databases, Human Computer Interaction",
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
  experience: [{
    type: "job",
    org: "Northwind Systems",
    title: "Engineering Intern",
    date_range: "2025 to now",
    bullets: ["Built reliable TypeScript APIs used by 12 teams."],
  }],
};

const REQUIREMENT_INDEX = buildRequirementIndex(
  [
    { term: "typescript", display: "TypeScript", weight: 1 },
    { term: "frontend", display: "frontend", weight: 1, satisfied_by: "React" },
  ],
  [
    { term: "postgresql", display: "PostgreSQL", weight: 1 },
    { term: UNBREAKABLE.toLowerCase(), display: UNBREAKABLE, weight: 0.7 },
  ],
);

function exactAuditFixture(): { jdText: string; audit: PacketAudit } {
  const jdText = "Build reliable APIs. Improve deployment safety. Communication matters.";
  const digest = "a".repeat(64);
  const coveredText = "Build reliable APIs.";
  const missingText = "Improve deployment safety.";
  const unknownText = "Communication matters.";
  const missingStart = jdText.indexOf(missingText);
  const unknownStart = jdText.indexOf(unknownText);
  const evidence = {
    source: "resume_spec" as const,
    path: "/experience/0/bullets/0",
    sha256: digest,
    quote: `Built reliable APIs for 12 teams. ${UNBREAKABLE}`,
  };
  const coveredTerm = {
    text: "reliable APIs",
    key: "reliable apis",
    start: jdText.indexOf("reliable APIs"),
    end: jdText.indexOf("reliable APIs") + "reliable APIs".length,
    clauseIndex: 0,
    evidence,
  };
  const missingTerm = {
    text: "deployment safety",
    key: "deployment safety",
    start: jdText.indexOf("deployment safety"),
    end: jdText.indexOf("deployment safety") + "deployment safety".length,
    clauseIndex: 1,
  };
  return {
    jdText,
    audit: {
      version: PACKET_AUDIT_VERSION,
      status: "passed",
      complete: true,
      degraded: false,
      rejectedCount: 0,
      packet_version: digest,
      audit_digest: digest,
      bindings: {
        ownerSha256: digest,
        applicationId: "fixture-application",
        jdSha256: digest,
        specSha256: digest,
        jobContextSha256: digest,
        questionsSha256: digest,
        applicantSnapshotSha256: digest,
        resumeContactEmailSha256: digest,
        applicantEmailSha256: digest,
        pdf: { objectKey: "resumes/fixture.pdf", sha256: digest, sizeBytes: 999999999999 },
        employerDelivery: { version: "employer_delivery_v1", mode: "browser", sha256: digest },
      },
      identities: {
        resume_email: `${"student".repeat(18)}@example.edu`,
        applicant_email: `${"route".repeat(24)}@apply.litos.example`,
      },
      clauses: [
        {
          text: coveredText,
          start: 0,
          end: coveredText.length,
          verdict: "covered",
          evidence: [evidence],
          highlight_terms: [{ ...coveredTerm, tone: "covered" }],
        },
        {
          text: missingText,
          start: missingStart,
          end: missingStart + missingText.length,
          verdict: "missing",
          highlight_terms: [{ ...missingTerm, tone: "missing" }],
        },
        {
          text: unknownText,
          start: unknownStart,
          end: unknownStart + unknownText.length,
          verdict: "unscoreable",
          highlight_terms: [],
        },
      ],
      editedTerms: [],
      terms: {
        covered: [coveredTerm],
        missing: [missingTerm],
        edited: [],
      },
    },
  };
}

function BrokenBand(): never {
  throw new Error("Intentional fixture render failure");
}

function AnalysisPanel() {
  const auditFixture = useMemo(() => exactAuditFixture(), []);
  const liveRequestFixtureReady = useSyncExternalStore(
    () => () => undefined,
    () => (
      window.location.hostname === "localhost" &&
      hasQaInterceptionSignal(window.sessionStorage) &&
      hasLoopbackQaApiUrl(API_URL)
    ),
    () => false,
  );
  const browserReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  return (
    <PanelShell name="analysis">
      <RequirementProvider index={REQUIREMENT_INDEX}>
        <Scenario id="requirement-text" title="RequirementText content lengths and keyboard marks">
          <p className="text-body leading-7">
            <RequirementText text={`This role uses TypeScript and React, prefers PostgreSQL, and names ${UNBREAKABLE}.`} />
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <TermMark term="covered-direct" tone="covered">Covered</TermMark>
            <TermMark term="missing-direct" tone="missing">Missing</TermMark>
            <TermMark term="edited-direct" tone="edited">Edited</TermMark>
            <TermMark term="unscoreable-direct" tone="unscoreable">Not scoreable</TermMark>
          </div>
        </Scenario>

        <Scenario id="match-legends" title="MatchLegend measured and unmeasured states">
          <div className="space-y-4">
            <MatchLegend missingCount={0} />
            <MatchLegend missingCount={1} editedCount={1} />
            <MatchLegend missingCount={999999999999} unscoreableCount={999999999999} mode="packet" />
            <MatchLegend missingCount={null} unscoreableCount={1} mode="packet" />
          </div>
        </Scenario>

        <Scenario id="match-gaps-empty" title="MatchGaps with no missing requirements">
          <MatchGaps missing={[]} resumeText="TypeScript and React" />
        </Scenario>

        <Scenario id="analysis-disabled-loading" title="Backend analysis disabled for local fixture">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-label text-muted">MatchScore</p>
              <MatchScore jdText="TypeScript and React" spec={RESUME_SPEC} disabled />
            </div>
            <div>
              <p className="mb-2 text-label text-muted">ResumeHealth</p>
              <ResumeHealth spec={RESUME_SPEC} disabled />
            </div>
          </div>
        </Scenario>

        <Scenario id="interview-prep-collapsed" title="InterviewPrep default control">
          {liveRequestFixtureReady ? (
            <InterviewPrep jdText="Build TypeScript systems." spec={RESUME_SPEC} jobContext={{ company: "Northwind", role: "Engineer" }} />
          ) : (
            <p className="text-small text-muted">This live request control mounts only after the browser fixture runner installs request interception.</p>
          )}
        </Scenario>

        <Scenario id="packet-audit-evidence" title="Exact packet audit evidence, one item per verdict">
          <div className="space-y-5">
            <AuditedJobDescription jdText={auditFixture.jdText} audit={auditFixture.audit} />
            <PacketAuditBreakdown jdText={auditFixture.jdText} audit={auditFixture.audit} />
          </div>
        </Scenario>

        <Scenario id="section-boundary-healthy" title="SectionBoundary healthy child">
          <SectionBoundary band="qa-healthy" title="Healthy panel">
            <p className="text-small text-muted">The child rendered.</p>
          </SectionBoundary>
        </Scenario>

        <Scenario id="section-boundary-error" title="SectionBoundary contained render error">
          <SectionBoundary band="qa-failure" title="Fixture panel">
            {browserReady ? <BrokenBand /> : <p className="text-small text-muted">Waiting for the browser render.</p>}
          </SectionBoundary>
        </Scenario>
      </RequirementProvider>

      <Scenario id="daily-matches-complete" title="DailyMatchesComplete">
        <DailyMatchesComplete />
      </Scenario>
    </PanelShell>
  );
}

type FrameSpec = {
  id: string;
  title: string;
  src: string;
  width: 320 | 640 | 1024;
  height: number;
};

function qaUrl(path: string, qaKey: string | null): string {
  if (!qaKey) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}litos_qa_key=${encodeURIComponent(qaKey)}`;
}

function panelUrl(panel: PanelName, width: number, qaKey: string | null, scenario?: string): string {
  const params = new URLSearchParams({ panel, viewport: String(width) });
  if (scenario) params.set("scenario", scenario);
  if (qaKey) params.set("litos_qa_key", qaKey);
  return `/qa/component-stress-dashboard?${params.toString()}`;
}

function FrameRail({ id, title, frames }: { id: string; title: string; frames: FrameSpec[] }) {
  return (
    <section data-stress-group={id} className="border-t border-border py-8">
      <h2 className="text-heading text-ink">{title}</h2>
      <p className="mt-1 text-small text-muted">Every frame is eager and same origin. Scroll each frame for its full fixture.</p>
      <div className="mt-5 overflow-x-auto pb-4">
        <div className="flex min-w-max items-start gap-5">
          {frames.map((frame) => (
            <article
              key={frame.id}
              data-stress-frame={frame.id}
              className="overflow-hidden rounded-card border border-border bg-surface shadow-rest"
              style={{ width: frame.width + 2 }}
            >
              <div className="border-b border-border bg-surface-alt px-3 py-2">
                <p className="font-mono text-label text-muted">{frame.width}px</p>
                <h3 className="mt-0.5 text-small font-medium text-ink">{frame.title}</h3>
              </div>
              <iframe
                title={`${frame.title}, ${frame.width}px`}
                src={frame.src}
                loading="eager"
                className="block w-full bg-canvas"
                style={{ height: frame.height }}
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Gallery({ qaKey }: { qaKey: string | null }) {
  const localInterceptedRunner = useSyncExternalStore(
    () => () => undefined,
    () => (
      window.location.hostname === "localhost" &&
      hasQaInterceptionSignal(window.sessionStorage) &&
      hasLoopbackQaApiUrl(API_URL)
    ),
    () => false,
  );

  const componentFrames: FrameSpec[] = [
    { id: "primitives-320", title: "Shared primitives", src: panelUrl("primitives", 320, qaKey), width: 320, height: 1800 },
    { id: "primitives-640", title: "Shared primitives", src: panelUrl("primitives", 640, qaKey), width: 640, height: 1800 },
    { id: "primitives-1024", title: "Shared primitives", src: panelUrl("primitives", 1024, qaKey), width: 1024, height: 1800 },
  ];
  const automationFrames: FrameSpec[] = [
    { id: "autopilot-normal-320", title: "Toggle on and off", src: panelUrl("automation", 320, qaKey, "normal"), width: 320, height: 760 },
    { id: "autopilot-locked-320", title: "Eligibility locked", src: panelUrl("automation", 320, qaKey, "locked"), width: 320, height: 760 },
    { id: "autopilot-premium-320", title: "Plan locked", src: panelUrl("automation", 320, qaKey, "premium"), width: 320, height: 760 },
    { id: "autopilot-saving-320", title: "Saving disabled", src: panelUrl("automation", 320, qaKey, "saving"), width: 320, height: 760 },
    { id: "next-match-640", title: "Loading, empty, queued, countdown", src: panelUrl("automation", 640, qaKey, "content"), width: 640, height: 1600 },
    { id: "next-match-1024", title: "Loading, empty, queued, countdown", src: panelUrl("automation", 1024, qaKey, "content"), width: 1024, height: 1600 },
  ];
  const inputFrames: FrameSpec[] = [
    { id: "inputs-320", title: "Dates, countries, consent", src: panelUrl("inputs", 320, qaKey), width: 320, height: 1800 },
    { id: "inputs-640", title: "Dates, countries, consent", src: panelUrl("inputs", 640, qaKey), width: 640, height: 1800 },
    { id: "inputs-many-320", title: "65 country rows", src: panelUrl("inputs", 320, qaKey, "many"), width: 320, height: 1200 },
  ];
  const analysisFrames: FrameSpec[] = [
    { id: "analysis-320", title: "Requirement and audit controls", src: panelUrl("analysis", 320, qaKey), width: 320, height: 1800 },
    { id: "analysis-640", title: "Requirement and audit controls", src: panelUrl("analysis", 640, qaKey), width: 640, height: 1800 },
    { id: "analysis-1024", title: "Requirement and audit controls", src: panelUrl("analysis", 1024, qaKey), width: 1024, height: 1800 },
  ];
  const realFixtureFrames: FrameSpec[] = [
    { id: "packet-modal-320", title: "ApplicationPacket modal", src: qaUrl("/qa/packet/dashboard", qaKey), width: 320, height: 900 },
    { id: "packet-modal-1024", title: "ApplicationPacket modal", src: qaUrl("/qa/packet/dashboard", qaKey), width: 1024, height: 900 },
    { id: "exact-pdf-320", title: "Exact packet PDF", src: qaUrl("/qa/exact-packet-pdf", qaKey), width: 320, height: 900 },
    { id: "exact-pdf-bad-binding-640", title: "Exact PDF invalid digest", src: qaUrl(`/qa/exact-packet-pdf?sha256=${"0".repeat(64)}`, qaKey), width: 640, height: 900 },
    { id: "waiting-many-320", title: "WaitingOnYou many and incomplete", src: qaUrl("/qa/waiting-on-you", qaKey), width: 320, height: 900 },
    { id: "waiting-many-1024", title: "WaitingOnYou many and incomplete", src: qaUrl("/qa/waiting-on-you", qaKey), width: 1024, height: 900 },
  ];
  const pageFrames: FrameSpec[] = [
    { id: "home-320", title: "Dashboard home", src: "/dashboard?qa=1", width: 320, height: 900 },
    { id: "home-1024", title: "Dashboard home", src: "/dashboard?qa=1", width: 1024, height: 900 },
    { id: "jobs-default-320", title: "Jobs many", src: "/dashboard/jobs?qa=1", width: 320, height: 900 },
    { id: "jobs-empty-320", title: "Jobs empty", src: "/dashboard/jobs?qa=empty", width: 320, height: 900 },
    { id: "jobs-error-640", title: "Jobs error", src: "/dashboard/jobs?qa=error", width: 640, height: 900 },
    { id: "applications-default-320", title: "Applications one", src: "/dashboard/applications?qa=1", width: 320, height: 900 },
    { id: "applications-empty-320", title: "Applications empty", src: "/dashboard/applications?qa=empty", width: 320, height: 900 },
    { id: "applications-error-640", title: "Applications error", src: "/dashboard/applications?qa=error", width: 640, height: 900 },
    { id: "outreach-default-320", title: "Outreach many", src: "/dashboard/outreach?qa=1", width: 320, height: 900 },
    { id: "outreach-empty-320", title: "Outreach empty", src: "/dashboard/outreach?qa=empty", width: 320, height: 900 },
    { id: "outreach-error-640", title: "Outreach error", src: "/dashboard/outreach?qa=error", width: 640, height: 900 },
  ];

  return (
    <main data-stress-gallery="dashboard" className="min-h-svh bg-canvas px-4 py-8 text-ink sm:px-6 lg:px-10">
      <header className="mx-auto max-w-5xl">
        <p className="font-mono text-label text-muted">Temporary, gated, no production data</p>
        <h1 className="mt-2 text-section sm:text-display">Dashboard component stress gallery.</h1>
        <p className="mt-3 max-w-3xl text-body text-muted">
          Real exported controls and the dashboard&apos;s existing localhost QA routes. Every frame loads in one pass at a real 320, 640, or 1024 CSS pixel viewport.
        </p>
        <a
          href={qaUrl("/qa/component-stress-dashboard", qaKey)}
          className="mt-4 inline-flex min-h-11 items-center rounded-control border border-control-border px-4 text-small font-medium text-ink hover:border-ink"
        >
          Reload fixture gallery
        </a>
        <Notice variant="info" message="Dark mode is not included because Litos does not ship dark mode." />
      </header>

      <div className="mx-auto mt-8 max-w-[1600px]">
        <FrameRail id="shared-primitives" title="Shared primitives" frames={componentFrames} />
        <FrameRail id="automation" title="Automation controls" frames={automationFrames} />
        <FrameRail id="settings-inputs" title="Settings inputs and consent" frames={inputFrames} />
        <FrameRail id="analysis-controls" title="Requirement and audit controls" frames={analysisFrames} />
        <FrameRail id="real-component-fixtures" title="Existing real component fixtures" frames={realFixtureFrames} />
        {localInterceptedRunner ? (
          <FrameRail id="real-dashboard-pages" title="Existing localhost dashboard QA pages" frames={pageFrames} />
        ) : (
          <section data-stress-group="real-dashboard-pages" className="border-t border-border py-8">
            <h2 className="text-heading text-ink">Existing localhost dashboard QA pages</h2>
            <p className="mt-2 text-small text-muted">These frames mount only on exact localhost after the browser fixture runner installs request interception.</p>
          </section>
        )}

        <section data-stress-group="request-interception-only" className="border-t border-border py-8">
          <h2 className="text-heading text-ink">Request-interception browser cases</h2>
          <p className="mt-2 max-w-3xl text-small text-muted">
            Documents, Resume, Network, and Settings own their controls inside their pages and do not expose complete fixture props. Test loading, error, empty, permission, and destructive-dialog states there by intercepting their same-origin API requests in the browser. They are intentionally not rebuilt here.
          </p>
          <ul className="mt-4 flex flex-wrap gap-3">
            {[
              "/dashboard/documents",
              "/dashboard/resume",
              "/dashboard/network",
              "/dashboard/settings",
            ].map((href) => (
              <li key={href}><code className="rounded-inner bg-surface-alt px-3 py-2 text-machine text-ink">{href}</code></li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

export function DashboardStressHarness({ panel, scenario, qaKey }: HarnessProps) {
  if (panel === "primitives") return <PrimitivePanel />;
  if (panel === "automation") return <AutomationPanel scenario={scenario} />;
  if (panel === "inputs") return <InputPanel scenario={scenario} />;
  if (panel === "analysis") return <AnalysisPanel />;
  return <Gallery qaKey={qaKey} />;
}
