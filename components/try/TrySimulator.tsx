"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STORE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";
import { extractResumeText } from "@/lib/extract-resume";
import {
  CANNED_FIELDS,
  CANNED_FIELDS_TOTAL,
  CANNED_OUTREACH,
  CANNED_POSTING,
  CANNED_RESUME,
  type RealPacket,
} from "@/lib/try-data";
import type { TryJobCard } from "@/lib/try-jobs";
import { ThinkingOrb } from "thinking-orbs";
import { PendingLabel } from "@/components/app/ui";
import { MobileSendLink } from "@/components/MobileSendLink";

/* /try - the drive-it-yourself demo (design doc 2026-07-08).
   The visitor clicks the extension's real verbs: Detect -> Generate ->
   Fill -> Review. Submit stays visibly disabled: waiting on you.
   Two paths converge on this one assembly screen: canned (Alex Rivera
   canon) and real (paste your resume, desktop only). Every failure of
   the real path lands back on the canned data - no dead ends. */

type Step = "chooser" | "resume" | "autofill" | "outreach" | "done";
const STEP_ORDER: Step[] = ["chooser", "resume", "autofill", "outreach", "done"];


function after(step: Step, target: Step) {
  return STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(target);
}

export function TrySimulator({
  initialStep,
  jobs,
}: {
  initialStep?: string;
  jobs: TryJobCard[];
}) {
  /* Deep links (/try?step=resume|autofill|outreach) land in canned mode
     with prior steps completed - the real path is chooser-only. */
  const deepLink = (["resume", "autofill", "outreach"] as const).find(
    (s) => s === initialStep,
  );
  const [step, setStep] = useState<Step>(deepLink ?? "chooser");
  const [mode, setMode] = useState<"canned" | "real">("canned");
  const [jobIdx, setJobIdx] = useState(0);
  const [packet, setPacket] = useState<RealPacket | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filledCount, setFilledCount] = useState(deepLink && after(deepLink, "resume") ? CANNED_FIELDS.length : 0);
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef<number | null>(deepLink ? Date.now() : null);
  const [stamps, setStamps] = useState<Partial<Record<Step, string>>>({});

  useEffect(() => {
    track("try_start", { entry: deepLink ?? "top" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Honest clock: real elapsed seconds since the visitor's own Detect click. */
  useEffect(() => {
    if (t0.current == null || step === "done") return;
    const id = setInterval(() => setElapsed((Date.now() - t0.current!) / 1000), 100);
    return () => clearInterval(id);
  }, [step]);

  function stamp(s: Step) {
    const t = t0.current ? `+${((Date.now() - t0.current) / 1000).toFixed(1)}s` : "+0.0s";
    setStamps((prev) => ({ ...prev, [s]: t }));
  }

  function chooseCanned() {
    setMode("canned");
    track("path_chosen", { path: "canned" });
    if (t0.current == null) t0.current = Date.now();
    setStep("resume");
  }

  async function chooseReal(resume: string, website: string) {
    setMode("real");
    track("path_chosen", { path: "real" });
    if (t0.current == null) t0.current = Date.now();
    setGenerating(true);
    setNotice(null);
    try {
      const res = await fetch("/api/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, postingId: jobs[jobIdx]?.id ?? "", website }),
      });
      const data = await res.json();
      if (res.ok && data.packet) {
        setPacket(data.packet as RealPacket);
      } else if (data.error === "not_a_resume" || data.error === "too_long") {
        setGenerating(false);
        setNotice(
          data.error === "too_long"
            ? "That is too long. Make it shorter and try again."
            : "That does not look like a resume. Paste your resume, or watch it run on Alex's.",
        );
        return;
      } else {
        /* Degraded state (API down, rate-limited, unconfigured): fall back
           to the canned packet with one honest line. */
        setMode("canned");
        setNotice(
          data.reason === "rate_limited"
            ? "You have used all your tries today. This is Alex's."
            : "Live tries are down right now. This is Alex's.",
        );
      }
    } catch {
      setMode("canned");
      setNotice("Live preview is down. This is Alex's application.");
    }
    setGenerating(false);
    setPasteOpen(false);
    setStep("resume");
  }

  /* The packet assembles itself once a path is chosen (Mehek, 2026-07-08: the
     canned path is a "watch", it should play, not wait on clicks; the real
     product assembles the whole packet automatically too). Each act stamps a
     receipt timestamp, then hands off to the next. */
  useEffect(() => {
    if (step === "chooser" || step === "done") return;
    stamp(step);
    const NEXT: Record<string, Step> = {
      resume: "autofill",
      autofill: "outreach",
      outreach: "done",
    };
    const HOLD: Record<string, number> = {
      resume: 1300,
      autofill: 1700,
      outreach: 1500,
    };
    const id = setTimeout(() => {
      const next = NEXT[step];
      if (next === "done") track("packet_complete", { path: mode });
      setStep(next);
    }, HOLD[step]);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* Field-by-field fill animation while the application act plays. */
  useEffect(() => {
    if (!after(step, "resume") || filledCount >= CANNED_FIELDS.length) return;
    const id = setInterval(
      () => setFilledCount((n) => Math.min(n + 1, CANNED_FIELDS.length)),
      110,
    );
    return () => clearInterval(id);
  }, [step, filledCount]);

  const bullets = packet?.tailored_bullets ?? CANNED_RESUME.bullets;
  const coverage = packet?.ats_coverage ?? CANNED_RESUME.atsCoverage;
  const outreachBody = packet
    ? `${packet.outreach_opening} …`
    : CANNED_OUTREACH.body;

  /* The simulated job page IS the posting you're cycling (Mehek, 2026-07-08:
     the back-and-forth lives on the job page itself). While browsing (before a
     path is chosen) and in the real path, the left page + URL bar reflect the
     selected real job; the canned "watch on Alex's" example keeps the Notion
     canon so its packet stays consistent. */
  const realJob = jobs[jobIdx];
  const browsing = step === "chooser";
  const canCycle = browsing && jobs.length > 0;
  const showReal = (browsing || mode === "real") && !!realJob;
  const pageJob = showReal
    ? {
        company: realJob.company,
        title: realJob.title,
        location: realJob.location,
        url: realJob.applyUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, ""),
      }
    : {
        company: CANNED_POSTING.company,
        title: CANNED_POSTING.title,
        location: CANNED_POSTING.location,
        url: CANNED_POSTING.url,
      };
  const cycle = (d: number) =>
    setJobIdx((i) => (i + d + jobs.length) % jobs.length);

  return (
    <div className="mx-auto w-full max-w-5xl">
      {notice && (
        <p className="mb-4 text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          {notice}
        </p>
      )}

      {/* A Mac Chrome window (Mehek, 2026-07-08: simulate a whole Chrome tab on
          a Mac; the Litos popup is the real extension popup anchored to its
          toolbar icon). */}
      <div className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(18,18,15,0.04),0_30px_60px_-30px_rgba(18,18,15,0.28)]">
        {/* Tab strip + traffic lights */}
        <div className="flex items-center gap-3 bg-[var(--color-surface-alt)] px-3.5 pt-2.5">
          <span className="flex shrink-0 gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </span>
          <div className="flex min-w-0 items-center gap-2 rounded-t-lg bg-white px-3 py-1.5">
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-ink/80 text-[7px] font-bold text-white">
              {pageJob.company.slice(0, 1)}
            </span>
            <span className="truncate text-[11.5px] text-ink">
              {pageJob.company} · {pageJob.title}
            </span>
            <span className="shrink-0 text-[11px] text-faint">×</span>
          </div>
          <span className="shrink-0 text-sm text-faint">+</span>
        </div>

        {/* Toolbar: nav + omnibox + extensions (Litos icon anchors the popup) */}
        <div className="flex items-center gap-2.5 border-b border-border bg-white px-3.5 py-2">
          <span className="flex shrink-0 items-center gap-2.5 text-[15px] text-faint">
            <span>‹</span>
            <span>›</span>
            <span className="text-[13px]">⟳</span>
          </span>
          <span className="flex flex-1 items-center gap-2 truncate rounded-full bg-surface-alt px-3 py-1 font-mono text-[10.5px] text-muted">
            <span className="text-[9px] text-positive">🔒</span>
            <span className="truncate">{pageJob.url}</span>
          </span>
          <span className="shrink-0 text-[13px] text-faint">🧩</span>
          {/* The Litos toolbar icon the popup hangs off of */}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-2 ring-ink/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/litos-mark.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="h-5 w-5 shrink-0 rounded-full bg-surface-alt" />
        </div>

        {/* Page area: the job posting fills the tab; the popup floats over the
            top-right (anchored to the toolbar icon) like a real extension. */}
        <div className="relative bg-white">
          <div className="relative min-h-[420px] p-6 sm:p-7 lg:pr-[392px]">
            {canCycle && (
              <RoundArrow dir={-1} onClick={() => cycle(-1)} side="left" />
            )}
            {canCycle && (
              <RoundArrow dir={1} onClick={() => cycle(1)} side="right" />
            )}

            <PostingHeader job={pageJob} />
            {browsing ? (
              <div data-sample>
                <PostingBody jd={showReal ? realJob?.jd : undefined} />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <ResumeArtifact
                  bullets={bullets}
                  coverage={coverage}
                  real={mode === "real"}
                  active={step === "resume"}
                />
                {after(step, "resume") && (
                  <FormArtifact
                    filledCount={filledCount}
                    packet={packet}
                    active={step === "autofill"}
                  />
                )}
                {after(step, "autofill") && (
                  <OutreachArtifact body={outreachBody} real={mode === "real"} />
                )}
              </div>
            )}
          </div>

          {/* The real extension popup, anchored under its toolbar icon. */}
          <div className="border-t border-border p-3 sm:p-4 lg:absolute lg:right-3 lg:top-2 lg:w-[366px] lg:border-t-0 lg:p-0">
            <div className="relative rounded-[14px] border border-border bg-white shadow-[0_12px_40px_-12px_rgba(18,18,15,0.3)]">
              {/* caret pointing up to the toolbar icon */}
              <span className="absolute -top-1.5 right-6 hidden h-3 w-3 rotate-45 rounded-[3px] border-l border-t border-border bg-white lg:block" />

              {/* Header, matches the real popup: the mark + name + icons. The mark
                  carries its own white ground, so it sits on no coloured tile. */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/litos-mark.svg" alt="" className="h-6 w-6" />
                  </span>
                  <span className="text-[15px] font-bold tracking-tight text-ink">
                    Litos
                  </span>
                </span>
                <span className="flex items-center gap-1 text-faint">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px]">
                    ⤢
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px]">
                    ▤
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px]">
                    ⇥
                  </span>
                </span>
              </div>

              <div className="space-y-3 p-4">
                {/* Auto-detected job card - the extension spots it, no button */}
                <div className="flex items-start gap-2.5 rounded-xl border border-brand-soft bg-brand-soft/50 px-3 py-2.5">
                  <span className="shrink-0 text-base">🎯</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-brand-ink">
                      Spotted a job on this page
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {mode === "canned" && !browsing
                        ? `${CANNED_POSTING.title} at ${CANNED_POSTING.company}`
                        : `${pageJob.title} at ${pageJob.company}`}
                    </p>
                  </div>
                </div>

                {step === "chooser" && (
                  <Chooser
                    onCanned={chooseCanned}
                    onReal={chooseReal}
                    pasteOpen={pasteOpen}
                    setPasteOpen={setPasteOpen}
                    generating={generating}
                    elapsed={elapsed}
                    notice={notice}
                  />
                )}

                {step !== "chooser" && step !== "done" && (
                  <>
                    <ReceiptRows step={step} stamps={stamps} mode={mode} />
                    <p className="flex items-center justify-center gap-1.5 pt-0.5 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                      <ThinkingOrb state="working" size={20} />
                      Making your application
                    </p>
                  </>
                )}
                {step === "done" && <DonePanel mode={mode} />}
              </div>

              {/* Submit stays visibly not ours to press. */}
              <div className="border-t border-border px-4 py-3">
                <div className="flex w-full items-center justify-between rounded-full border-2 border-dashed border-border px-4 py-2">
                  <span className="text-[13px] font-medium text-faint">
                    Submit application
                  </span>
                  <span className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                    Waiting on you
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- popup pieces ---------- */

function VerbButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      {children}
    </button>
  );
}

function Chooser({
  onCanned,
  onReal,
  pasteOpen,
  setPasteOpen,
  generating,
  elapsed,
  notice,
}: {
  onCanned: () => void;
  onReal: (resume: string, website: string) => void;
  pasteOpen: boolean;
  setPasteOpen: (v: boolean) => void;
  generating: boolean;
  elapsed: number;
  notice: string | null;
}) {
  const [resume, setResume] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [pasteMode, setPasteMode] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setExtracting(true);
    setExtractErr(null);
    const result = await extractResumeText(f);
    setExtracting(false);
    if (result.ok) {
      setResume(result.text);
      setFileName(f.name);
    } else {
      setResume("");
      setFileName(null);
      setExtractErr(
        result.reason === "unsupported"
          ? "We cannot read that kind of file. Try a PDF, Word, or text file."
          : "We could not find any words in that file. It may be a photo. Paste the text instead.",
      );
      if (result.reason === "no_text") setPasteMode(true);
    }
  }

  if (generating) {
    return (
      <div className="rounded-xl bg-surface-alt/70 px-4 py-5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <ThinkingOrb state="working" size={20} />
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Making your application
          </p>
        </div>
        <p className="mt-2 font-mono text-[10px] text-faint">+{elapsed.toFixed(1)}s</p>
      </div>
    );
  }

  if (pasteOpen) {
    return (
      <div className="space-y-2.5">
        {(extractErr ?? notice) && (
          <p className="text-[12px] leading-5 text-coral-ink">{extractErr ?? notice}</p>
        )}

        {/* Upload-first: students have a resume file, not resume text on the
            clipboard (Mehek, 2026-07-08). The file is read in the browser;
            only extracted text is ever sent. */}
        {!pasteMode && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {resume && fileName ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-alt/60 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[12px] text-teal-ink">✓</span>
                  <span className="truncate text-[12.5px] font-medium text-ink">{fileName}</span>
                </span>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="shrink-0 text-[11.5px] font-medium text-muted hover:text-ink"
                >
                  Swap
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={extracting}
                className="w-full rounded-xl border border-dashed border-border bg-surface-alt/40 px-4 py-5 text-center transition-colors hover:border-ink disabled:opacity-60"
              >
                <span className="block text-[13px] font-medium text-ink">
                  {extracting ? <PendingLabel state="composing">Reading your resume…</PendingLabel> : "Upload your resume"}
                </span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.05em] text-faint">
                  PDF · DOCX · TXT
                </span>
              </button>
            )}
            <button
              onClick={() => setPasteMode(true)}
              className="w-full text-center text-[11.5px] font-medium text-faint hover:text-ink"
            >
              or paste the text instead
            </button>
          </>
        )}

        {pasteMode && (
          <>
            <textarea
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Paste your resume text here"
              rows={6}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[13px] leading-5 text-ink placeholder:text-faint focus:border-brand focus:outline-none"
            />
            <button
              onClick={() => {
                setPasteMode(false);
                setResume("");
                setFileName(null);
              }}
              className="w-full text-center text-[11.5px] font-medium text-faint hover:text-ink"
            >
              ← upload a file instead
            </button>
          </>
        )}

        {/* Honeypot - invisible to humans, irresistible to bots */}
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <div className={resume.trim().length < 200 ? "pointer-events-none opacity-50" : ""}>
          <VerbButton onClick={() => onReal(resume, website)}>
            Make my application
          </VerbButton>
        </div>
        <p className="text-[11px] leading-4 text-faint">
          Your file is read right here in your browser. Only the text is sent
          to Anthropic&apos;s API to generate this preview, and it is never
          stored.
        </p>
        <button
          onClick={() => setPasteOpen(false)}
          className="w-full text-center text-[12px] font-medium text-muted hover:text-ink"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[13px] leading-6 text-muted">
        Upload your resume to build an application for this role, or watch a
        sample on Alex&apos;s.
      </p>
      <VerbButton onClick={onCanned}>Watch it on Alex&apos;s</VerbButton>
      {/* Real path is desktop-only: phones can't install the extension anyway. */}
      <button
        onClick={() => setPasteOpen(true)}
        className="hidden w-full rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink sm:block"
      >
        Try it free with your resume
      </button>
    </div>
  );
}

function ReceiptRows({
  step,
  stamps,
  mode,
}: {
  step: Step;
  stamps: Partial<Record<Step, string>>;
  mode: "canned" | "real";
}) {
  const rows = [
    { key: "resume" as Step, label: "Resume rewritten", thread: "bg-brand", orb: "composing" as const },
    { key: "autofill" as Step, label: "Application filled", thread: "bg-teal", orb: "solving" as const },
    { key: "outreach" as Step, label: mode === "real" ? "Email opened" : "Email written", thread: "bg-coral", orb: "shaping" as const },
  ];
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const done = after(step, r.key);
        const active = step === r.key;
        return (
          <div
            key={r.key}
            className={`flex h-[44px] items-center justify-between gap-3 rounded-xl px-3 ${
              done ? "" : active ? "bg-surface-alt/70" : "border border-dashed border-border/70"
            }`}
          >
            <span className="flex items-center gap-3">
              <span className={`h-6 w-0.5 shrink-0 rounded-full ${done ? r.thread : "bg-border"}`} />
              <span className={`text-[13px] font-medium ${done ? "text-ink" : "text-faint"}`}>
                {r.label}
              </span>
            </span>
            <span className="flex items-center font-mono text-[10px] text-faint">
              {done ? (
                stamps[r.key] ?? ""
              ) : active ? (
                <ThinkingOrb state={r.orb} size={20} />
              ) : (
                ""
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DonePanel({ mode }: { mode: "canned" | "real" }) {
  return (
    <div className="space-y-3 pt-1">
      <p className="text-[13px] leading-6 text-muted">
        {mode === "real"
          ? "That was your resume on a real job. Litos does this on every job you open."
          : "That is the whole thing. Litos does this on every job you open, with your resume."}
      </p>
      <a
        href={STORE_URL}
        onClick={() => track("install_click", { source: "try" })}
        className="block w-full rounded-full bg-brand px-5 py-2.5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Add to Chrome, it&apos;s free
      </a>
      <MobileSendLink source="try" className="sm:hidden" />
    </div>
  );
}

/* ---------- left-stage pieces ---------- */

/* Small floating circle to circle roles (Mehek, 2026-07-08: little circles, not
   full-height borders, so they don't eat the screen). Sits over the page edges. */
function RoundArrow({
  dir,
  onClick,
  side,
}: {
  dir: -1 | 1;
  onClick: () => void;
  side: "left" | "right";
}) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === -1 ? "Previous role" : "Next role"}
      className={`absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-lg text-muted shadow-[0_2px_8px_-2px_rgba(18,18,15,0.2)] transition-colors hover:border-ink hover:text-ink ${
        side === "left" ? "left-2" : "right-2 lg:right-[372px]"
      }`}
    >
      {dir === -1 ? "‹" : "›"}
    </button>
  );
}

function PostingHeader({
  job,
}: {
  job: { company: string; title: string; location: string };
}) {
  return (
    <>
      <p className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        {job.company} · {job.location}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-ink">
        {job.title}
      </p>
    </>
  );
}

/* The posting body. Real jobs show their actual JD (people read it while
   cycling); the canned Notion page keeps the skeleton bars. */
function PostingBody({ jd }: { jd?: string }) {
  return (
    <>
      {jd ? (
        <div className="mt-4 space-y-3 text-[13px] leading-6 text-muted">
          {jd
            .split(/\n{2,}/)
            .map((para, i) => (
              <p key={i}>{para.trim()}</p>
            ))}
        </div>
      ) : (
        <div className="mt-5 space-y-2.5">
          <div className="h-1.5 w-11/12 rounded-full bg-surface-alt" />
          <div className="h-1.5 w-full rounded-full bg-surface-alt" />
          <div className="h-1.5 w-9/12 rounded-full bg-surface-alt" />
          <div className="h-1.5 w-10/12 rounded-full bg-surface-alt" />
          <div className="mt-5 h-1.5 w-4/12 rounded-full bg-border" />
          <div className="h-1.5 w-full rounded-full bg-surface-alt" />
          <div className="h-1.5 w-8/12 rounded-full bg-surface-alt" />
        </div>
      )}
      <span className="mt-7 inline-block rounded-full border border-border px-5 py-2 text-sm font-medium text-faint">
        Apply for this job
      </span>
    </>
  );
}

function ArtifactShell({
  eyebrow,
  chip,
  chipClass,
  active,
  children,
}: {
  eyebrow: string;
  chip: string;
  chipClass: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[12px] border bg-white p-4 transition-colors ${
        active ? "border-brand/40" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <p className="min-w-0 break-all font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          {eyebrow}
        </p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.05em] ${chipClass}`}>
          {chip}
        </span>
      </div>
      {children}
    </div>
  );
}

function ResumeArtifact({
  bullets,
  coverage,
  real,
  active,
}: {
  bullets: string[];
  coverage: number;
  real: boolean;
  active: boolean;
}) {
  return (
    <ArtifactShell
      eyebrow={real ? "Your resume · new version" : CANNED_RESUME.filename}
      chip={`ATS coverage ${coverage}%`}
      chipClass="bg-brand-soft text-brand-ink"
      active={active}
    >
      {!real && (
        <p className="mt-2 text-[13px] font-semibold text-ink">
          {CANNED_RESUME.name}
          <span className="ml-2 font-normal text-muted">{CANNED_RESUME.line}</span>
        </p>
      )}
      <ul className="mt-2.5 space-y-1.5">
        {bullets.slice(0, 3).map((b) => (
          <li key={b} className="flex gap-2 text-[12.5px] leading-5 text-muted">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
            {b}
          </li>
        ))}
      </ul>
      {real && (
        <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.05em] text-faint">
          Preview. The real one shows the whole page.
        </p>
      )}
    </ArtifactShell>
  );
}

function FormArtifact({
  filledCount,
  packet,
  active,
}: {
  filledCount: number;
  packet: RealPacket | null;
  active: boolean;
}) {
  const fields = useMemo(() => {
    if (!packet) return CANNED_FIELDS;
    return [
      { label: "University", value: packet.filled_fields.university },
      { label: "Work authorization", value: packet.filled_fields.work_authorization },
      { label: "Why this role?", value: packet.filled_fields.short_answer },
    ];
  }, [packet]);
  const shown = packet ? fields.length : filledCount;
  const total = packet ? 3 : CANNED_FIELDS_TOTAL;

  return (
    <ArtifactShell
      eyebrow="Application · Greenhouse"
      chip={`${Math.min(shown + (packet ? 0 : CANNED_FIELDS_TOTAL - CANNED_FIELDS.length), total)} of ${total} filled`}
      chipClass="bg-teal-soft text-teal-ink"
      active={active}
    >
      <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {fields.map((f, i) => {
          const filled = i < shown;
          return (
            <div
              key={f.label}
              className={`rounded-lg border px-2.5 py-1.5 ${
                filled ? "border-border bg-white" : "border-dashed border-border/70"
              } ${f.label === "Why this role?" ? "sm:col-span-2" : ""}`}
            >
              <p className="text-[9.5px] font-medium text-muted">{f.label}</p>
              <p className="flex items-center justify-between gap-2 text-[12px] text-ink">
                <span className="truncate">{filled ? f.value : " "}</span>
                {filled && <span className="shrink-0 text-[10px] text-teal-ink">✓</span>}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.05em] text-faint">
        {packet ? "3 example questions · nothing sent yet" : "27 questions · nothing sent yet"}
      </p>
    </ArtifactShell>
  );
}

function OutreachArtifact({ body, real }: { body: string; real: boolean }) {
  return (
    <ArtifactShell
      eyebrow={real ? "Your email · first lines" : `To ${CANNED_OUTREACH.to}`}
      chip={real ? "In your voice" : `~${CANNED_OUTREACH.words} words · in your voice`}
      chipClass="bg-coral-soft text-coral-ink"
    >
      {!real && (
        <p className="mt-2 text-[13px] font-medium text-ink">{CANNED_OUTREACH.subject}</p>
      )}
      <p className="mt-1.5 text-[12.5px] leading-5 text-muted">{body}</p>
      <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.05em] text-faint">
        This is a draft. You press send.
      </p>
    </ArtifactShell>
  );
}
