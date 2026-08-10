"use client";

import { useEffect, useState } from "react";
import { fetchResumeHealth, type ResumeHealth as Health } from "@/features/applications";
import type { ResumeSpec } from "@/lib/api";

/**
 * The resume quality rules, shown to the student.
 *
 * These rules already ran on every generation; their only reader was the model inside the retry
 * loop. The student saw the resume that came out and never the checks, so they could not tell a
 * resume that barely passed from one that passed comfortably.
 *
 * A LIST, NOT A SECOND SCORE. Rezi grades 0-100 across 23 criteria and its review corpus is
 * unanimous that the named prioritized fixes are the useful half; Jobscan's most common complaint
 * is users hitting 80%+ and hearing nothing, because one number invites you to optimize the number.
 * Litos already has one number, and it answers a specific question: how much of this posting's
 * requirements the resume covers. A second number beside it would teach students to average two
 * things that measure different questions.
 */
export function ResumeHealth({ spec, disabled = false }: { spec: ResumeSpec; disabled?: boolean }) {
  // The key travels WITH the answer, so staleness is derived during render rather than set from
  // inside the effect (a synchronous setState there cascades a render on every edit).
  const [state, setState] = useState<{ health: Health | null; failed: boolean; key: string }>({
    health: null,
    failed: false,
    key: "",
  });

  // Keyed on the resume's CONTENT, not the object identity. useDeferredValue does not debounce, so
  // depending on the spec object fired one authenticated POST per settled keystroke.
  const key = JSON.stringify({ experience: spec.experience, skills: spec.skills });

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchResumeHealth(spec)
        .then((health) => {
          if (cancelled) return;
          setState({ health, failed: false, key });
        })
        .catch(() => {
          if (cancelled) return;
          setState({ health: null, failed: true, key });
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // spec is intentionally absent: `key` is its content, and depending on both would refire on
    // every identity change, which is the thing the key exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, key]);

  if (state.failed) {
    return <p className="text-[13px] text-muted">We could not check this resume just now.</p>;
  }
  if (!state.health) {
    return <div className="h-4 w-40 animate-pulse rounded bg-surface-alt" aria-hidden="true" />;
  }

  const pending = state.key !== key;
  const { findings, bullet_count, quantified_count } = state.health;

  if (findings.length === 0) {
    // Says only what was actually checked. It used to claim every bullet "opens on a strong verb",
    // which the rule does not verify: it flags a closed list of weak openings, so a verb that is
    // merely unrecognised passes here and is still rewritten by the generator.
    return (
      <p className="text-sm text-ink">
        Nothing to fix. All {bullet_count} bullet{bullet_count === 1 ? "" : "s"} have a number in
        them, and none of them start on a weak word.
      </p>
    );
  }

  const fixes = findings.filter((f) => f.severity === "fix");

  return (
    <div className={pending ? "opacity-50 transition-opacity" : "transition-opacity"}>
      <p className="text-sm text-muted">
        {quantified_count} of your {bullet_count} bullet{bullet_count === 1 ? "" : "s"} have a number in them.
        {fixes.length > 0 && ` ${fixes.length} thing${fixes.length === 1 ? "" : "s"} worth fixing.`}
      </p>
      <ul className="mt-3 space-y-2">
        {findings.map((finding, i) => (
          <li
            key={`${finding.rule}-${i}`}
            className="rounded-inner border border-border bg-surface px-4 py-3"
          >
            <div className="flex items-baseline gap-2">
              <span
                aria-hidden="true"
                className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                  finding.severity === "fix" ? "bg-warn" : "bg-faint"
                }`}
              />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-5 text-ink">
                  {finding.title}
                  {finding.org && <span className="ml-1.5 font-normal text-muted">{finding.org}</span>}
                </p>
                <p className="mt-0.5 text-[13px] leading-5 text-muted">{finding.action}</p>
                {finding.bullet && (
                  <p className="mt-1.5 border-l-2 border-border pl-2.5 text-xs leading-5 text-muted">
                    {finding.bullet}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
