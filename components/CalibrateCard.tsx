"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import {
  FIELDS,
  HUNTS,
  REGIONS,
  matchRoles,
  regionsLabel,
  type Field,
  type Hunt,
  type Region,
} from "@/lib/rolesFeed";

/* The calibration card. Three taps (hunt, field, region) and the site
   answers with the person's actual market: matched real programs, one
   honest early-applicant stat, and the shortest path into onboarding.
   Frosted glass, bottom-right, machine voice for labels. It never
   interrupts the opening: the card enters only after three sections are
   behind the visitor (the hero's rolling tape plus the first two
   chapters), and X respects them forever. Answers live in this browser
   only. */

const LS_PROFILE = "litos.profile.v1";
const LS_DISMISSED = "litos.calibrate.dismissed.v1";

type Profile = { hunt: Hunt; field: Field; region: Region };
type Phase = "hidden" | "card" | "pill";

const chipCls =
  "inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ink";
const monoCls =
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em]";

export function CalibrateCard() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [entered, setEntered] = useState(false);
  const [step, setStep] = useState(0);
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [field, setField] = useState<Field | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  /* the matching beat between the third tap and the reveal */
  const [matching, setMatching] = useState(false);
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownOnce = useRef(false);

  useEffect(
    () => () => {
      if (matchTimer.current) clearTimeout(matchTimer.current);
    },
    [],
  );

  useEffect(() => {
    let saved: Profile | null = null;
    try {
      if (localStorage.getItem(LS_DISMISSED)) return;
      const raw = localStorage.getItem(LS_PROFILE);
      if (raw) saved = JSON.parse(raw) as Profile;
    } catch {
      /* storage unavailable: behave as a fresh visit */
    }
    if (saved) {
      setProfile(saved);
      setPhase("pill");
      return;
    }
    const show = () => {
      if (shownOnce.current) return;
      shownOnce.current = true;
      setPhase("card");
    };
    /* Only after the visitor has spent the opening: the hero (the rolling
       tape) plus the receipt and odds chapters. The card enters as the
       third content section (#formats) reaches the viewport; if that
       anchor ever disappears, fall back to a four-viewport scroll depth.
       No timer: someone who stays on the hero is never interrupted. */
    const target = document.getElementById("formats");
    let io: IntersectionObserver | null = null;
    let onScroll: (() => void) | null = null;
    if (target && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            show();
            io?.disconnect();
          }
        },
        { rootMargin: "0px 0px -20% 0px" },
      );
      io.observe(target);
      /* a hard jump (native anchor, restored scroll) can teleport past
         the section between rendering frames and the observer never sees
         it intersect; a passive position check catches being at or past
         the trigger line */
      onScroll = () => {
        if (target.getBoundingClientRect().top < window.innerHeight * 0.8)
          show();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    } else {
      onScroll = () => {
        if (window.scrollY > window.innerHeight * 4) show();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    return () => {
      io?.disconnect();
      if (onScroll) window.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* slide-in on the frame after mount so the transition actually runs */
  useEffect(() => {
    if (phase === "hidden") {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  /* Publish the phase so other fixed chrome can stand down instead of
     stacking in the same corner (StickyCTA reads this). */
  useEffect(() => {
    document.documentElement.dataset.calibrate = phase;
    return () => {
      delete document.documentElement.dataset.calibrate;
    };
  }, [phase]);

  const dismiss = () => {
    if (matchTimer.current) clearTimeout(matchTimer.current);
    setMatching(false);
    if (profile) {
      setStep(3);
      setPhase("pill");
      return;
    }
    try {
      localStorage.setItem(LS_DISMISSED, "1");
    } catch {}
    setPhase("hidden");
  };

  const finish = (region: Region) => {
    if (!hunt || !field) return;
    const p: Profile = { hunt, field, region };
    setProfile(p);
    try {
      localStorage.setItem(LS_PROFILE, JSON.stringify(p));
    } catch {}
    /* one short thinking beat (the dashboard's orb) before the reveal;
       skipped under reduced motion, and the match itself is instant */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(3);
      return;
    }
    setMatching(true);
    matchTimer.current = setTimeout(() => {
      setMatching(false);
      setStep(3);
    }, 1400);
  };

  if (phase === "hidden") return null;

  if (phase === "pill") {
    return (
      <button
        onClick={() => {
          setStep(3);
          setPhase("card");
        }}
        className={`fixed bottom-5 right-5 z-40 rounded-full border border-border bg-surface/90 px-4 py-2.5 shadow-sm backdrop-blur transition-all duration-300 hover:border-ink motion-reduce:transition-none ${
          entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 motion-reduce:translate-y-0"
        } ${monoCls} text-muted hover:text-ink`}
        aria-label="Open your matched roles"
      >
        Your roles
      </button>
    );
  }

  const hu = HUNTS.find((h) => h.id === profile?.hunt);
  const matches =
    profile ? matchRoles(profile.hunt, profile.field, profile.region) : [];
  const top = matches[0];
  const rest = matches.slice(1);
  const fieldLabel = FIELDS.find((f) => f.id === profile?.field)?.label ?? "";
  const regionShort =
    REGIONS.find((r) => r.id === profile?.region)?.short ?? "";
  const startHref = profile
    ? `/start?src=calibrate&hunt=${profile.hunt}&field=${profile.field}&region=${profile.region}`
    : "/start";

  return (
    <aside
      role="dialog"
      aria-label="Find your roles"
      /* near-opaque: the sections behind this card are dense (mockups,
         film stills) and the default 55% glass let them collide with
         the payoff text */
      style={{ background: "rgba(255, 255, 255, 0.96)" }}
      className={`fixed bottom-4 left-4 right-4 z-40 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[360px] rounded-2xl border border-border rq-glass p-5 shadow-[0_12px_40px_rgba(18,18,15,0.10)] transition-all duration-300 ease-out motion-reduce:transition-none ${
        entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0 motion-reduce:translate-y-0"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className={`${monoCls} text-faint`}>
          {matching ? "Calibrating" : step < 3 ? "Find your roles · 3 taps" : "Calibrated"}
        </p>
        <button
          onClick={dismiss}
          aria-label="Close"
          className="-m-2 flex h-11 w-11 items-center justify-center p-2 text-faint transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            <path
              d="m3 3 10 10M13 3 3 13"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {step === 0 && (
        <>
          <p className="mt-3 text-[17px] font-[450] tracking-[-0.01em] text-ink">
            What job do you want?
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {HUNTS.map((h) => (
              <button
                key={h.id}
                className={chipCls}
                onClick={() => {
                  setHunt(h.id);
                  setStep(1);
                }}
              >
                {h.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p className="mt-3 text-[17px] font-[450] tracking-[-0.01em] text-ink">
            Your field?
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {FIELDS.map((f) => (
              <button
                key={f.id}
                className={chipCls}
                onClick={() => {
                  setField(f.id);
                  setStep(2);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && !matching && (
        <>
          <p className="mt-3 text-[17px] font-[450] tracking-[-0.01em] text-ink">
            Where?
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                className={chipCls}
                onClick={() => finish(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step < 3 && !matching && (
        <div className="mt-4 flex items-center justify-between">
          <p className={`${monoCls} text-faint`}>
            0{step + 1} / 03
          </p>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="text-[12px] font-medium text-muted transition-colors hover:text-ink"
            >
              ← Back
            </button>
          )}
        </div>
      )}

      {matching && (
        <div className="flex flex-col items-center py-9">
          <div className="flex h-8 w-8 items-center justify-center">
            <ThinkingOrb state="searching" size={20} />
          </div>
          <p className={`${monoCls} mt-3 text-faint`}>Finding your jobs</p>
        </div>
      )}

      {step === 3 && !matching && profile && top && (
        <>
          <p className="mt-3 text-[16px] font-[450] leading-snug tracking-[-0.01em] text-ink">
            {hu?.short ?? "Roles"}. {fieldLabel}.{" "}
            {profile.region === "anywhere" ? "Anywhere" : regionShort}.
          </p>

          <div className="mt-3 rounded-xl border border-border bg-surface p-3.5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[15px] font-semibold text-brand-ink">
                {top.company.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">
                  {top.role}
                </p>
                <p className="truncate text-[12.5px] text-muted">{top.company}</p>
                <p className="mt-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink">
                  {top.status} · {regionsLabel(top)}
                </p>
                {top.verified && (
                  <p className="mt-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">
                    Verified {top.verified}
                  </p>
                )}
              </div>
              <a
                href={top.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${top.company} careers page`}
                className="ml-auto shrink-0 text-faint transition-colors hover:text-ink"
              >
                ↗
              </a>
            </div>
          </div>

          {rest.length > 0 && (
            <div className="mt-2.5 space-y-1">
              {rest.map((r) => (
                <p
                  key={r.company + r.role}
                  className="truncate text-[12px] text-muted"
                >
                  {r.role} · {r.company}
                </p>
              ))}
            </div>
          )}

          <p className="mt-3.5 text-[12.5px] leading-relaxed text-muted">
            Nearly 70% of interviews go to people who applied in the first
            week a posting is live. Early is the whole game.
          </p>
          <p className="mt-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
            Measured by Lever, a job application company
          </p>

          <div className="mt-4 flex items-center gap-3">
            <a
              href={startHref}
              className="rounded-full bg-brand px-5 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Get your first one ready
            </a>
            <a
              href="/try"
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              Try the demo
            </a>
          </div>
          <p className="mt-2.5 text-[11px] text-faint">
            Saved in this browser only.
          </p>
        </>
      )}
    </aside>
  );
}
