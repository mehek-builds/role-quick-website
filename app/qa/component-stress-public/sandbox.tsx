"use client";

import { useState } from "react";

import { Button, ButtonLink } from "@/components/app/Button";
import { CountryEligibilityEditor } from "@/components/app/CountryEligibilityEditor";
import {
  DataErrorState,
  EmptyState,
  ErrorNote,
  LoadingOrb,
  Notice,
  PendingLabel,
  ShimmerRows,
} from "@/components/app/ui";
import { InstallLink } from "@/components/InstallLink";
import { MobileSendLink } from "@/components/MobileSendLink";
import { SignInLink } from "@/components/SignInLink";
import { SiteFooter } from "@/components/SiteFooter";
import { QuestionsStep } from "@/components/start/QuestionsStep";
import {
  Chip as OnboardingChip,
  FounderNote,
  LaterLink,
  PrimaryButton,
  Receipt,
  RefusalList,
  SkipLink,
  StartFlowProvider,
  StepRail,
} from "@/components/start/ui";
import type { OnboardingState, PostingPrescriptQuestion } from "@/lib/api";
import {
  COUNTRY_OPTIONS,
  blankCountryEligibility,
  type CountryWorkEligibilityDraft,
} from "@/lib/work-eligibility";
import { MAX_COUNTRY_ELIGIBILITY_RECORDS } from "@/lib/work-eligibility-limit";

const LONG_TEXT =
  "This label is deliberately long enough to wrap across several lines while preserving every word, the action, and the visible focus treatment at narrow widths.";
const UNBREAKABLE = "LITOSSTRESS".repeat(24);

const ONBOARDING_STATE: OnboardingState = {
  step: "questions",
  flow_version: 3,
  flow_completed: false,
  requires_onboarding: true,
  completed_at: null,
  has_focus: true,
  has_resume: true,
  has_base_resume: true,
  has_applied: false,
  has_targeting: false,
  learned: [],
  gaps: [],
  includes_gaps_step: false,
  includes_application_steps: true,
  includes_sponsorship_step: true,
  source_pages: 3,
  source_resume_url: null,
  harvest_active: false,
  automatic_submission_enabled: false,
  automatic_submission_consented_at: null,
  automatic_submission_consent_version: null,
  automatic_verification_enabled: false,
};

const CLOSED_QUESTION: PostingPrescriptQuestion = {
  question: "Will you now or in the future require sponsorship for employment?",
  input_type: "select-one",
  options: ["Yes", "No"],
  required: true,
  max_length: null,
  answer: "",
  reusable: true,
  remembered: false,
  reason: "self_declaration",
  explanation: "this is a legal declaration only you can make",
};

const OPEN_QUESTION: PostingPrescriptQuestion = {
  question: "Why are you interested in this role?",
  input_type: "textarea",
  options: null,
  required: true,
  max_length: 500,
  answer: "",
  reusable: false,
  remembered: false,
  reason: "needs_your_words",
  explanation: "the employer asks for your own words",
};

const OPTIONAL_QUESTION: PostingPrescriptQuestion = {
  question: "Is there anything else you would like us to know?",
  input_type: "textarea",
  options: null,
  required: false,
  max_length: 250,
  answer: "",
  reusable: false,
  remembered: false,
  reason: "needs_your_words",
};

const LONG_QUESTION: PostingPrescriptQuestion = {
  question: `${LONG_TEXT} ${UNBREAKABLE}`,
  input_type: "select-one",
  options: [LONG_TEXT, UNBREAKABLE, "No"],
  required: true,
  max_length: null,
  answer: LONG_TEXT,
  reusable: false,
  remembered: false,
  reason: "choice_for_you",
  explanation: `${LONG_TEXT} ${UNBREAKABLE}`,
};

const MANY_QUESTIONS: PostingPrescriptQuestion[] = Array.from({ length: 30 }, (_, index) => ({
  ...CLOSED_QUESTION,
  question: `Required employer question ${index + 1} of 30`,
  reason: "choice_for_you" as const,
}));

const MANY_RECEIPT_ROWS = Array.from({ length: 24 }, (_, index) => ({
  t: String(index + 1).padStart(2, "0"),
  k: `Recorded field ${index + 1}`,
  v: index === 23 ? "9,999,999,999,999,999" : `Complete value ${index + 1}`,
  done: index === 23,
}));

type RouteScenario = {
  id: string;
  label: string;
  path: string;
  width: number;
  fixturePath?: string;
};

const ROUTE_SCENARIOS = [
  { id: "marketing-mobile", label: "Marketing controls, mobile", path: "/", width: 320 },
  { id: "marketing-small", label: "Marketing controls, small", path: "/", width: 640 },
  { id: "marketing-wide", label: "Marketing controls, wide", path: "/", width: 1024 },
  { id: "marketing-xl", label: "Marketing controls, extra wide", path: "/", width: 1280 },
  { id: "pricing-loading", label: "Pricing loading", path: "/pricing", width: 320 },
  { id: "pricing-error", label: "Pricing catalog error", path: "/pricing", width: 640 },
  { id: "pricing-checkout", label: "Pricing checkout states", path: "/pricing", width: 1024 },
  { id: "jobs-empty", label: "Job board, no data", path: "/browse-jobs", fixturePath: "/browse-jobs?q=litos-stress-jobs-empty", width: 320 },
  { id: "jobs-one", label: "Job board, one item", path: "/browse-jobs", fixturePath: "/browse-jobs?q=litos-stress-jobs-one", width: 640 },
  { id: "jobs-many", label: "Job board, many items", path: "/browse-jobs", fixturePath: "/browse-jobs?q=litos-stress-jobs-many", width: 1024 },
  { id: "jobs-error", label: "Job board error", path: "/browse-jobs", fixturePath: "/browse-jobs?q=litos-stress-jobs-error", width: 320 },
  { id: "jobs-incomplete", label: "Job board incomplete and long data", path: "/browse-jobs", fixturePath: "/browse-jobs?q=litos-stress-jobs-incomplete", width: 320 },
  { id: "try-empty", label: "Try flow, no jobs", path: "/try", fixturePath: "/qa/component-stress-public/try", width: 320 },
  { id: "try-one", label: "Try flow, one job", path: "/try", fixturePath: "/qa/component-stress-public/try", width: 640 },
  { id: "try-many", label: "Try flow, many jobs", path: "/try", fixturePath: "/qa/component-stress-public/try", width: 1024 },
  { id: "try-generating", label: "Try flow generating", path: "/try", fixturePath: "/qa/component-stress-public/try", width: 320 },
  { id: "try-error", label: "Try flow error", path: "/try", fixturePath: "/qa/component-stress-public/try", width: 320 },
  { id: "try-auth-dialog", label: "Try flow auth dialog", path: "/try", fixturePath: "/qa/component-stress-public/try", width: 640 },
  { id: "contact-empty", label: "Contact empty form", path: "/contact", width: 320 },
  { id: "contact-validation", label: "Contact validation", path: "/contact", width: 320 },
  { id: "contact-pending", label: "Contact pending", path: "/contact", width: 640 },
  { id: "contact-error", label: "Contact error", path: "/contact", width: 640 },
  { id: "contact-sent", label: "Contact sent", path: "/contact", width: 1024 },
  { id: "billing-loading", label: "Billing return loading", path: "/billing/return", fixturePath: "/billing/return?context=11111111-1111-4111-8111-111111111111", width: 320 },
  { id: "billing-error", label: "Billing return error", path: "/billing/return", width: 640 },
  { id: "billing-success", label: "Billing return success", path: "/billing/return", fixturePath: "/billing/return?context=11111111-1111-4111-8111-111111111111", width: 1024 },
  { id: "install-redirect", label: "Install redirect", path: "/install", width: 320 },
  { id: "status-page", label: "Service status", path: "/status", width: 320 },
  { id: "maintenance-page", label: "Maintenance controls", path: "/maintenance", width: 640 },
  { id: "comparison-mobile", label: "Comparison table, mobile", path: "/litos-vs-simplify", width: 320 },
  { id: "career-centres-mobile", label: "Career centre page, mobile", path: "/for-career-centres", width: 320 },
  { id: "auth-signin", label: "Auth sign in", path: "/login", width: 320 },
  { id: "auth-signup", label: "Auth account creation", path: "/login?flow=signup", width: 640 },
  { id: "auth-product-preview", label: "Auth product preview", path: "/login", width: 1280 },
  { id: "auth-recovery", label: "Auth recovery", path: "/login?flow=recovery", width: 320 },
  { id: "auth-claim", label: "Auth guest claim", path: "/login?claim=1", width: 320 },
  {
    id: "auth-expired",
    label: "Auth expired session error",
    path: "/login?reason=session-expired",
    width: 1024,
  },
  { id: "onboarding-focus", label: "Onboarding roles", path: "/start?qa=1&step=focus", width: 320 },
  { id: "onboarding-resume", label: "Onboarding resume", path: "/start?qa=1&step=resume", width: 640 },
  { id: "onboarding-loading", label: "Onboarding loading", path: "/start", width: 320 },
  { id: "onboarding-error", label: "Onboarding load error", path: "/start", width: 640 },
  { id: "onboarding-impact", label: "Onboarding experience", path: "/start?qa=1&step=impact", width: 320 },
  { id: "onboarding-base", label: "Onboarding base resume", path: "/start?qa=1&step=base&scenario=saved", width: 1024 },
  { id: "onboarding-gaps", label: "Onboarding incomplete data", path: "/start?qa=1&step=gaps", width: 320 },
  { id: "onboarding-visa", label: "Onboarding work eligibility", path: "/start?qa=1&step=sponsorship&scenario=saved", width: 640 },
  { id: "onboarding-match", label: "Onboarding match states", path: "/start?qa=1&step=match", width: 320 },
  { id: "onboarding-questions", label: "Onboarding employer questions", path: "/start?qa=1&step=questions", width: 320 },
  { id: "onboarding-review", label: "Onboarding review and send", path: "/start?qa=1&step=review", width: 1024 },
  { id: "onboarding-trial", label: "Onboarding trial states", path: "/start?qa=1&step=trial", width: 320 },
  { id: "onboarding-notifications", label: "Onboarding notification permission", path: "/start?qa=1&step=notifications", width: 640 },
  { id: "onboarding-notifications-denied", label: "Onboarding notification permission denied", path: "/start?qa=1&step=notifications", width: 320 },
  { id: "onboarding-plan", label: "Onboarding plan states", path: "/start?qa=1&step=plan", width: 1024 },
  { id: "onboarding-done", label: "Onboarding completion", path: "/start?qa=1&step=done&scenario=saved", width: 320 },
] as const satisfies readonly RouteScenario[];

function interceptedRoutePath(
  path: string,
  scenario: string,
  qaKey?: string,
): string {
  const params = new URLSearchParams({ stress_scenario: scenario });
  if (qaKey) params.set("litos_qa_key", qaKey);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${params.toString()}`;
}

function Scenario({
  id,
  title,
  children,
  note,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section
      data-scenario={id}
      className="min-w-0 rounded-card border border-border bg-surface p-4"
    >
      <h2 className="break-words font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {title}
      </h2>
      {note && <p className="mt-1 break-words text-xs leading-5 text-muted">{note}</p>}
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function ActionMatrix() {
  const [lastAction, setLastAction] = useState("No action yet");
  return (
    <Scenario id="shared-actions" title="Shared actions" note="Every public button variant, native disabled state, link form, and content extreme.">
      <p data-testid="last-action" role="status" className="mb-4 break-words text-xs text-muted">
        {lastAction}
      </p>
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <Button onClick={() => setLastAction("Primary activated")}>Primary</Button>
        <Button variant="secondary" onClick={() => setLastAction("Secondary activated")}>Secondary</Button>
        <Button variant="quiet" onClick={() => setLastAction("Quiet activated")}>Quiet</Button>
        <Button variant="danger" onClick={() => setLastAction("Danger activated")}>Danger</Button>
        <Button size="sm" onClick={() => setLastAction("Small activated")}>Small</Button>
        <Button size="lg" onClick={() => setLastAction("Large activated")}>Large</Button>
        <Button disabled>Disabled</Button>
        <Button aria-disabled="true" onClick={() => setLastAction("Aria-disabled still activated")}>Aria disabled</Button>
        <Button><PendingLabel onColor>Saving changes</PendingLabel></Button>
        <Button block onClick={() => setLastAction("Block activated")}>Block action</Button>
        <Button block onClick={() => setLastAction("Long label activated")}>{LONG_TEXT}</Button>
        <Button block onClick={() => setLastAction("Unbreakable label activated")}>{UNBREAKABLE}</Button>
        <ButtonLink href="/login">Internal link</ButtonLink>
        <ButtonLink href="https://example.com" variant="secondary">External link</ButtonLink>
      </div>
    </Scenario>
  );
}

function StateMatrix() {
  const [retryCount, setRetryCount] = useState(0);
  return (
    <div className="space-y-4">
      <Scenario id="loading-states" title="Loading, zero, one, and many rows">
        <div className="space-y-5">
          <LoadingOrb label="Loading your setup" />
          <LoadingOrb label={LONG_TEXT} state="searching" />
          <LoadingOrb label={UNBREAKABLE} state="composing" />
          <div data-count="zero"><ShimmerRows rows={0} /></div>
          <div data-count="one"><ShimmerRows rows={1} /></div>
          <div data-count="many"><ShimmerRows rows={12} /></div>
        </div>
      </Scenario>

      <Scenario id="empty-error-states" title="Empty and retry states">
        <div className="space-y-7">
          <EmptyState
            visual="jobs"
            title="No jobs yet"
            body="Your saved filters returned no jobs."
            headingLevel="h3"
          />
          <EmptyState
            visual="profile"
            title={LONG_TEXT}
            body={`${LONG_TEXT} ${UNBREAKABLE}`}
            headingLevel="h3"
          />
          <DataErrorState
            title="Could not load this state"
            body={`${LONG_TEXT} ${UNBREAKABLE}`}
            onRetry={() => setRetryCount((count) => count + 1)}
            headingLevel="h3"
          />
          <p data-testid="retry-count" className="text-xs text-muted">Retries: {retryCount}</p>
        </div>
      </Scenario>

      <Scenario id="notice-states" title="Information, success, warning, and errors">
        <div className="space-y-3">
          <Notice variant="info" message="Your changes are ready to review." />
          <Notice variant="success" message="Your answers were saved." />
          <Notice variant="warning" message={LONG_TEXT} />
          <ErrorNote message="Update the Litos extension from the Chrome Web Store, then try again." />
          <ErrorNote message={`${LONG_TEXT} ${UNBREAKABLE}`} />
        </div>
      </Scenario>
    </div>
  );
}

function PublicLinkMatrix() {
  return (
    <div className="space-y-4">
      <Scenario id="public-links" title="Public navigation and install actions">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SignInLink
            source="qa-component-stress"
            className="inline-flex min-h-11 max-w-full items-center rounded-full bg-action px-4 text-sm font-medium text-action-ink"
          >
            Get started
          </SignInLink>
          <InstallLink
            source="qa-component-stress"
            className="inline-flex min-h-11 max-w-full items-center rounded-full border border-control-border px-4 text-sm font-medium text-ink"
          >
            {LONG_TEXT}
          </InstallLink>
        </div>
      </Scenario>

      <Scenario id="mobile-send-link" title="Mobile install handoff" note="Use a browser clipboard stub to exercise success and permission denial.">
        <MobileSendLink source="qa-component-stress" />
      </Scenario>
    </div>
  );
}

function OnboardingPrimitiveMatrix() {
  const [lastAction, setLastAction] = useState("No onboarding action yet");
  return (
    <StartFlowProvider state={ONBOARDING_STATE}>
      <div className="space-y-4">
        <Scenario id="onboarding-rail" title="Setup rail, loading and resolved">
          <div className="space-y-6">
            <StartFlowProvider state={null}><StepRail /></StartFlowProvider>
            <StepRail current="questions" />
          </div>
        </Scenario>

        <Scenario id="onboarding-actions" title="Setup controls" note="Selected, derived, disabled, long, and unbreakable chip content.">
          <p role="status" data-testid="onboarding-last-action" className="mb-4 break-words text-xs text-muted">{lastAction}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <PrimaryButton onClick={() => setLastAction("Continue activated")}>Continue</PrimaryButton>
            <PrimaryButton disabled><PendingLabel onColor>Saving</PendingLabel></PrimaryButton>
            <LaterLink onClick={() => setLastAction("Finish later activated")} />
            <SkipLink what="these answers" onClick={() => setLastAction("Skip activated")} />
            <OnboardingChip label="Normal" onClick={() => setLastAction("Normal chip activated")} />
            <OnboardingChip label="Selected" on onClick={() => setLastAction("Selected chip activated")} />
            <OnboardingChip label="Derived" derived on onClick={() => setLastAction("Derived chip activated")} />
            <OnboardingChip label="Disabled" disabled />
            <OnboardingChip label={LONG_TEXT} />
            <OnboardingChip label={UNBREAKABLE} />
          </div>
        </Scenario>

        <Scenario id="onboarding-receipt-empty" title="Receipt, no data">
          <Receipt rows={[]} />
        </Scenario>
        <Scenario id="onboarding-receipt-one" title="Receipt, one item">
          <Receipt rows={[{ t: "01", k: "Resume", v: "Ready", done: true }]} />
        </Scenario>
        <Scenario id="onboarding-receipt-many" title="Receipt, many items and a very large number">
          <Receipt rows={MANY_RECEIPT_ROWS} />
        </Scenario>
        <Scenario id="onboarding-receipt-long" title="Receipt, long and unbreakable values">
          <Receipt rows={[
            { t: "01", k: LONG_TEXT, v: LONG_TEXT },
            { t: "02", k: UNBREAKABLE, v: UNBREAKABLE, done: true },
          ]} />
        </Scenario>

        <Scenario id="onboarding-founder-note" title="Founder note, long content">
          <FounderNote>{LONG_TEXT} {UNBREAKABLE}</FounderNote>
        </Scenario>

        <Scenario id="onboarding-refusals" title="Refusal list">
          <RefusalList />
        </Scenario>
      </div>
    </StartFlowProvider>
  );
}

function QuestionsMatrix() {
  return (
    <StartFlowProvider state={ONBOARDING_STATE}>
      <div className="space-y-4">
        <Scenario id="questions-zero" title="Employer questions, no data">
          <QuestionsStep company="Acme" questions={[]} alreadyAnswered={12} onSaved={() => {}} onLater={() => {}} />
        </Scenario>
        <Scenario id="questions-one-incomplete" title="Employer questions, one incomplete item">
          <QuestionsStep company="Acme" questions={[CLOSED_QUESTION]} alreadyAnswered={0} onSaved={() => {}} onLater={() => {}} />
        </Scenario>
        <Scenario id="questions-many" title="Employer questions, many items">
          <QuestionsStep company="Acme" questions={MANY_QUESTIONS} alreadyAnswered={9_999_999_999} onSaved={() => {}} onLater={() => {}} />
        </Scenario>
        <Scenario id="questions-long" title="Employer questions, long and unbreakable content">
          <QuestionsStep company={UNBREAKABLE} questions={[LONG_QUESTION]} alreadyAnswered={1} onSaved={() => {}} onLater={() => {}} />
        </Scenario>
        <Scenario id="questions-error-trigger" title="Employer questions, save error" note="Activate Save and review to reproduce the real component error state.">
          <QuestionsStep
            company="Acme"
            questions={[{ ...CLOSED_QUESTION, answer: "No" }]}
            alreadyAnswered={2}
            onSaved={() => { throw new Error(`${LONG_TEXT} ${UNBREAKABLE}`); }}
            onLater={() => {}}
          />
        </Scenario>
        <Scenario id="questions-pending-trigger" title="Employer questions, pending" note="Activate Save and review to hold the real pending state.">
          <QuestionsStep
            company="Acme"
            questions={[{ ...OPEN_QUESTION, answer: "A saved answer" }, OPTIONAL_QUESTION]}
            alreadyAnswered={2}
            onSaved={() => new Promise<void>(() => {})}
            onLater={() => {}}
          />
        </Scenario>
      </div>
    </StartFlowProvider>
  );
}

function eligibilityRows(count: number): CountryWorkEligibilityDraft[] {
  return Array.from({ length: count }, (_, index) => ({
    country_code: COUNTRY_OPTIONS[index % COUNTRY_OPTIONS.length]?.[0] ?? "US",
    authorized_now: index % 2 === 0,
    needs_sponsorship_now: index % 2 !== 0,
    needs_sponsorship_future: index % 3 === 0,
    authorization_type: index === 0 ? UNBREAKABLE.slice(0, 120) : "Work permit",
    authorization_expiry: index === 0 ? null : "2035-12-31",
  }));
}

function EligibilityScenario({ id, title, initialRows }: { id: string; title: string; initialRows: CountryWorkEligibilityDraft[] }) {
  const [rows, setRows] = useState(initialRows);
  return (
    <Scenario id={id} title={title} note={`${rows.length} current rows. The real cap is ${MAX_COUNTRY_ELIGIBILITY_RECORDS}.`}>
      <CountryEligibilityEditor rows={rows} onChange={setRows} />
    </Scenario>
  );
}

function EligibilityMatrix() {
  return (
    <div className="space-y-4">
      <EligibilityScenario id="eligibility-zero" title="Work eligibility, no data" initialRows={[]} />
      <EligibilityScenario id="eligibility-one-incomplete" title="Work eligibility, one incomplete item" initialRows={[blankCountryEligibility()]} />
      <EligibilityScenario id="eligibility-many" title="Work eligibility, many items" initialRows={eligibilityRows(8)} />
      <EligibilityScenario
        id="eligibility-limit"
        title="Work eligibility, maximum items and disabled add action"
        initialRows={eligibilityRows(MAX_COUNTRY_ELIGIBILITY_RECORDS)}
      />
      <EligibilityScenario
        id="eligibility-over-limit"
        title="Work eligibility, permission boundary exceeded"
        initialRows={eligibilityRows(MAX_COUNTRY_ELIGIBILITY_RECORDS + 1)}
      />
    </div>
  );
}

function SharedComponentPage() {
  return (
    <div data-harness-view="shared" className="min-h-screen bg-canvas px-3 py-6 text-ink sm:px-5">
      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Temporary QA fixture</p>
        <h1 className="mt-2 break-words text-section font-normal tracking-[-0.02em] text-ink">Public, auth, and onboarding components.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Real exported components, local fixture state, no production data. Dark mode is not supported by this project.</p>
      </header>

      <div className="space-y-8">
        <ActionMatrix />
        <StateMatrix />
        <PublicLinkMatrix />
        <OnboardingPrimitiveMatrix />
        <QuestionsMatrix />
        <EligibilityMatrix />
        <Scenario id="site-footer-default" title="Site footer, default surface"><SiteFooter /></Scenario>
        <Scenario id="site-footer-wash" title="Site footer, wash surface"><SiteFooter wash /></Scenario>
      </div>
    </div>
  );
}

function selfFrameUrl(width: number, qaKey?: string): string {
  const params = new URLSearchParams({ embed: "shared", viewport: String(width) });
  if (qaKey) params.set("litos_qa_key", qaKey);
  return `/qa/component-stress-public?${params.toString()}`;
}

function ResponsiveFrame({ width, qaKey }: { width: number; qaKey?: string }) {
  return (
    <section
      data-scenario={`shared-components-${width}`}
      data-viewport={width}
      className="shrink-0 rounded-card border border-border bg-surface p-3"
      style={{ width: width + 26 }}
    >
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{width}px viewport</h2>
      <iframe
        title={`Shared component stress cases at ${width} pixels`}
        src={selfFrameUrl(width, qaKey)}
        width={width}
        height={1800}
        className="mt-3 block rounded-inner bg-white"
        sandbox="allow-forms allow-same-origin allow-scripts"
      />
    </section>
  );
}

function RouteScenarioFrames({ mounted, qaKey }: { mounted: boolean; qaKey?: string }) {
  return (
    <section id="fixture-route-targets" data-surface="route-owned-controls" className="mt-12">
      <h2 className="text-section font-normal tracking-[-0.02em] text-ink">Route-owned controls.</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        These states stay on their real routes. Add <code className="font-mono text-xs">mount_routes=1</code> only after browser request interception is installed for API, billing, notification, and job-board requests.
      </p>
      <div className="mt-6 flex items-start gap-4 overflow-x-auto pb-4">
        {ROUTE_SCENARIOS.map((scenario) => (
          <article
            key={scenario.id}
            data-scenario={scenario.id}
            data-route={scenario.path}
            data-viewport={scenario.width}
            data-network-contract="browser-request-interception-required"
            className="shrink-0 rounded-card border border-border bg-surface p-3"
            style={{ width: scenario.width + 26 }}
          >
            <h3 className="break-words font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{scenario.label}</h3>
            <p className="mt-1 break-all font-mono text-[10px] text-faint">{scenario.path}</p>
            {mounted ? (
              <iframe
                title={scenario.label}
                src={interceptedRoutePath(
                  "fixturePath" in scenario ? scenario.fixturePath : scenario.path,
                  scenario.id,
                  qaKey,
                )}
                width={scenario.width}
                height={760}
                className="mt-3 block rounded-inner bg-white"
                sandbox="allow-forms allow-same-origin allow-scripts"
              />
            ) : (
              <div className="mt-3 flex h-28 items-center justify-center rounded-inner border border-dashed border-control-border p-4 text-center text-xs leading-5 text-muted">
                Waiting for browser request interception. No production data is contacted by this fixture.
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function PublicStressHarness({
  embed,
  mountRouteFrames,
  qaKey,
}: {
  embed: boolean;
  mountRouteFrames: boolean;
  qaKey?: string;
}) {
  if (embed) return <SharedComponentPage />;

  return (
    <main data-harness="component-stress-public" className="min-h-screen bg-surface-alt px-4 py-10 text-ink sm:px-6">
      <div className="mx-auto max-w-none">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Temporary QA fixture</p>
        <h1 className="mt-2 text-section font-normal tracking-[-0.02em] text-ink">Public, auth, and onboarding stress gallery.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          Each responsive frame imports the real shared components under the app layout, fonts, styles, and tokens. All three viewports render together. Dark mode is skipped because Litos ships a light theme only.
        </p>
        <a
          href="/qa/component-stress-public"
          className="mt-4 inline-flex min-h-11 items-center text-sm text-brand-ink underline underline-offset-4"
        >
          Reset the local fixture
        </a>

        <section className="mt-8" data-surface="responsive-shared-components">
          <h2 className="sr-only">Responsive shared component frames</h2>
          <div className="flex items-start gap-4 overflow-x-auto pb-4">
            {[320, 640, 1024].map((width) => <ResponsiveFrame key={width} width={width} qaKey={qaKey} />)}
          </div>
        </section>

        <RouteScenarioFrames mounted={mountRouteFrames} qaKey={qaKey} />
      </div>
    </main>
  );
}
