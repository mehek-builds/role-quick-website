import type { Metadata } from "next";
import { requireQaAccess } from "../gate";
import { WaitingOnYou } from "@/components/app/WaitingOnYou";
import { waitingApplications } from "@/lib/captcha-queue";

/* The "waiting on you" queue, rendered against a fixture.
 *
 * Same reason as the dashboard packet harness next door: the real block is behind the login wall
 * and only appears once an application has actually stalled on a CAPTCHA, which is not a state you
 * can produce on demand without a cooperating employer. This feeds the component the same shape the
 * dashboard builds, through the same waitingApplications() the dashboard calls, so the fixture
 * cannot drift from the real payload without failing the typecheck.
 *
 * It is a harness, not a demo: nothing links here, and it answers 404 without the shared secret.
 * Robots-disallowed was the previous answer to "who can see this", and a robots rule is a request
 * made of crawlers rather than access control. See lib/qa-gate.ts. */
export const metadata: Metadata = {
  title: "Waiting-on-you queue harness",
  robots: { index: false, follow: false },
};

/* force-dynamic because the ages below are relative to render. At module scope in a prerendered
   page they freeze at build time and the harness that exists to exercise minutes, hours and days
   drifts to all-days the next morning. */
export const dynamic = "force-dynamic";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const fixture = () => [
  {
    id: "oldest-days",
    job_context: { company: "Northwind Systems", role: "Data Analyst" },
    spec: {
      _review: {
        status: "needs_attention",
        portal_url: "https://boards.greenhouse.io/northwind/jobs/4012345",
        stall: {
          kind: "human_verification" as const,
          stalled_at: ago(3 * 24 * 60 * 60 * 1000),
          surface: "server_run" as const,
          provider: "recaptcha_v2" as const,
          stage: "at_submit" as const,
          source: "observed" as const,
        },
      },
    },
  },
  {
    id: "hours-before-fill",
    job_context: { company: "Halcyon Labs", role: "Product Intern" },
    spec: {
      _review: {
        status: "needs_attention",
        portal_url: "https://jobs.lever.co/halcyon/abc-123/apply",
        stall: {
          kind: "human_verification" as const,
          stalled_at: ago(5 * 60 * 60 * 1000),
          surface: "extension" as const,
          provider: "hcaptcha" as const,
          stage: "before_fill" as const,
          source: "observed" as const,
        },
      },
    },
  },
  /* No portal_url, and no company. Both occur on real rows: packets built before the field existed,
     and anything created from a pasted description. The card has to stay readable. */
  {
    id: "no-url-no-company",
    job_context: { company: "  ", role: "" },
    spec: {
      _review: {
        status: "needs_attention",
        stall: {
          kind: "human_verification" as const,
          stalled_at: ago(20 * 60 * 1000),
          surface: "server_run" as const,
          provider: "unknown" as const,
          stage: "at_submit" as const,
          source: "assumed" as const,
        },
      },
    },
  },
  /* Must NOT appear: resolved stall, and needs_attention for an unrelated reason. */
  {
    id: "resolved",
    job_context: { company: "Already Done", role: "Sent" },
    spec: {
      _review: {
        status: "needs_attention",
        stall: {
          kind: "human_verification" as const,
          stalled_at: ago(9 * 60 * 60 * 1000),
          surface: "server_run" as const,
          provider: "turnstile" as const,
          stage: "at_submit" as const,
          source: "observed" as const,
          resolved_at: ago(60 * 1000),
        },
      },
    },
  },
  {
    id: "other-blocker",
    job_context: { company: "Missing Field Co", role: "Analyst" },
    spec: { _review: { status: "needs_attention" } },
  },
];

export default async function WaitingOnYouHarnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireQaAccess(await searchParams);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="mb-6 text-sm text-muted">
        Harness. Three rows should render, oldest first. The resolved stall and the
        unrelated-blocker row must not appear.
      </p>
      <WaitingOnYou items={waitingApplications(fixture())} />
    </main>
  );
}
