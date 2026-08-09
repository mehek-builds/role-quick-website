"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/app/Button";
import { EmptyState } from "@/components/app/ui";
import { track } from "@/lib/analytics";

/* The dashboard's error boundary, and the one that matters most.
 *
 * This is the surface where a throw is most expensive. It is signed-in, it is
 * where the student's applications and resume live, and it is the half of Litos
 * with real data flowing through it, so it is the half where a malformed API
 * payload can reach a render. ISSUE-010 was exactly that shape: a pure function
 * on app/dashboard/page.tsx that was one unexpected field away from blanking
 * the whole screen. The guard for that specific payload shipped; this is the
 * floor under the next one.
 *
 * It sits at app/dashboard/error.tsx rather than being folded into the root
 * boundary because a segment boundary keeps its layout: the sidebar, the mobile
 * tab bar and the page title survive, so a failed Applications page leaves Jobs,
 * Emails and Account one tap away instead of dropping the student onto a
 * marketing page they have to sign back in from.
 *
 * No error text on screen, ever. `error.message` on an authenticated surface is
 * the worst version of the leak, because the messages that reach it carry API
 * shapes and occasionally an identifier. The student gets a sentence and a
 * button; the digest is a message-free hash, useful only for quoting to us. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    track("render_error", { surface: "dashboard", digest: error.digest ?? "none" });
  }, [error.digest]);

  return (
    <div className="py-10">
      <EmptyState
        visual="error"
        headingLevel="h1"
        title="This page did not load."
        body="Nothing you saved was lost. Try loading it again, and the rest of your dashboard is still working."
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/dashboard" variant="secondary">
            Go to Home
          </ButtonLink>
        </div>
      </EmptyState>
      {error.digest && (
        <p className="mt-6 text-center font-mono text-[11px] text-faint">
          Reference {error.digest}. Quote it at{" "}
          <a href="/contact" className="underline hover:text-muted">
            contact
          </a>{" "}
          and we can find this one.
        </p>
      )}
    </div>
  );
}
