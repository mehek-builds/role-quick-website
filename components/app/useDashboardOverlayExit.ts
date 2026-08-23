"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const DASHBOARD_OVERLAY_EXIT_MS = 130;

type ElementRef = {
  current: HTMLElement | null;
};

type DashboardOverlayExitOptions = {
  dialogRef: ElementRef;
  backdropRef?: ElementRef;
  nativeBackdrop?: boolean;
  onExitComplete: () => void;
};

/**
 * Keeps a dashboard overlay present long enough to settle out before its owner removes it.
 *
 * The ref-backed guard is synchronous, so Escape, backdrop, and button clicks that arrive in the
 * same frame all join the first close request. Capturing computed values before changing state also
 * lets an exit begin from the live midpoint of an interrupted entry instead of snapping to rest.
 */
export function useDashboardOverlayExit({
  dialogRef,
  backdropRef,
  nativeBackdrop = false,
  onExitComplete,
}: DashboardOverlayExitOptions) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onExitCompleteRef = useRef(onExitComplete);
  const afterExitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onExitCompleteRef.current = onExitComplete;
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const finish = useCallback(() => {
    clearTimer();
    const afterExit = afterExitRef.current;
    afterExitRef.current = null;
    onExitCompleteRef.current();
    if (afterExit) window.requestAnimationFrame(afterExit);
  }, [clearTimer]);

  const requestClose = useCallback((afterExit?: () => void) => {
    if (closingRef.current) return false;
    closingRef.current = true;
    afterExitRef.current = afterExit ?? null;

    const dialog = dialogRef.current;
    if (dialog) {
      dialog.style.setProperty(
        "--rq-dashboard-dialog-exit-from",
        window.getComputedStyle(dialog).transform,
      );
    }

    const backdrop = backdropRef?.current;
    if (backdrop) {
      backdrop.style.setProperty(
        "--rq-dashboard-backdrop-exit-from",
        window.getComputedStyle(backdrop).opacity,
      );
    } else if (nativeBackdrop && dialog) {
      dialog.style.setProperty(
        "--rq-dashboard-backdrop-exit-from",
        window.getComputedStyle(dialog, "::backdrop").opacity,
      );
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return true;
    }

    setClosing(true);
    timerRef.current = window.setTimeout(finish, DASHBOARD_OVERLAY_EXIT_MS);
    return true;
  }, [backdropRef, dialogRef, finish, nativeBackdrop]);

  const resetExit = useCallback(() => {
    clearTimer();
    closingRef.current = false;
    afterExitRef.current = null;

    const dialog = dialogRef.current;
    dialog?.style.removeProperty("--rq-dashboard-dialog-exit-from");
    dialog?.style.removeProperty("--rq-dashboard-backdrop-exit-from");
    dialog?.classList.remove("rq-dashboard-dialog-exit");
    dialog?.removeAttribute("aria-hidden");
    dialog?.removeAttribute("inert");

    const backdrop = backdropRef?.current;
    backdrop?.style.removeProperty("--rq-dashboard-backdrop-exit-from");
    backdrop?.classList.remove("rq-dashboard-backdrop-exit");
    setClosing(false);
  }, [backdropRef, clearTimer, dialogRef]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { closing, requestClose, resetExit };
}
