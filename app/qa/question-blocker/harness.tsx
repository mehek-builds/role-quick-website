"use client";

/* Client half of the question-blocker harness. See page.tsx next door for why it exists. */

import { useEffect, useState } from "react";
import { DirectApplicationQuestion } from "@/app/dashboard/applications/page";
import type { DirectQuestionTask } from "@/features/applications";

const noop = () => {};
const settled = async () => ({ ok: true }) as never;

export function QuestionBlockerHarness({ tasks }: { tasks: DirectQuestionTask[] }) {
  const [index, setIndex] = useState(0);
  /* Flips to "1" only after hydration commits, so a driver knows the tab buttons are live. The
     server-rendered markup looks complete and clickable before React attaches a single handler,
     and a click landing in that window is silently lost: the same trap the controlled portal
     publishes data-litos-qa-ready for (see tests/e2e/qa-tunnel-hydration.spec.mjs). */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const task = tasks[index];
  return (
    <div data-litos-qa-ready={hydrated ? "1" : "0"} className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap gap-2">
        {tasks.map((candidate, position) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setIndex(position)}
            className={`rounded-inner border px-3 py-1 text-xs ${position === index ? "border-brand" : "border-control-border"}`}
          >
            {candidate.id}
          </button>
        ))}
      </div>
      <DirectApplicationQuestion
        key={task.id}
        task={task}
        position={index + 1}
        total={tasks.length}
        saving={false}
        saved={false}
        focusToken={index}
        hasPrevious={index > 0}
        hasNext={index < tasks.length - 1}
        preservedDraft={null}
        externalFailure={null}
        onDraftChange={noop}
        onClearDraft={noop}
        onClearFailure={noop}
        onPrevious={() => setIndex((n) => Math.max(0, n - 1))}
        onNext={() => setIndex((n) => Math.min(tasks.length - 1, n + 1))}
        onReviewApplication={noop}
        onSave={settled}
        onSkip={settled}
      />
    </div>
  );
}
