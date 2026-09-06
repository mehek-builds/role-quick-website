"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { getHumanVerificationView, sendHumanVerificationInput } from "@/lib/api";
import { createVerificationInputQueue, sameVerificationFrame, verificationPoint,
  type VerificationEvent, type VerificationFrame } from "@/lib/human-verification";
import { Button } from "./Button";

export function HumanVerificationPanel({ packetId }: { packetId: string }) {
  const descriptionId = useId();
  const errorId = useId();
  const [frame, setFrame] = useState<VerificationFrame | null>(null);
  const [seen, setSeen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState("");
  const queue = useRef<ReturnType<typeof createVerificationInputQueue> | null>(null);
  const displayed = useRef<VerificationFrame | null>(null);
  const active = useRef(false);
  const image = useRef<HTMLImageElement>(null);
  const gesture = useRef<{ pointerId: number; frame: VerificationFrame } | null>(null);
  const read = useRef<Promise<Awaited<ReturnType<typeof getHumanVerificationView>>> | null>(null);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    const channel = createVerificationInputQueue({
      send: command => sendHumanVerificationInput(packetId, command),
      onError: message => { if (active.current) { gesture.current = null; setError(message); } },
    });
    queue.current = channel;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const pending = read.current ??= getHumanVerificationView(packetId);
      try {
        const next = await pending;
        if (cancelled) return;
        if (next.state === "waiting" && next.expiresAt > Date.now()) {
          channel.observe(next);
          setFrame(next);
          setSeen(true);
        } else {
          if (displayed.current) channel.pause();
          setFrame(null); displayed.current = null; gesture.current = null;
        }
      } catch {
        if (!cancelled && displayed.current) {
          channel.pause();
          setError("The verification view could not refresh. Please refresh it before continuing.");
        }
      } finally {
        if (read.current === pending) read.current = null;
        if (!cancelled) timer = setTimeout(poll, 750);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      active.current = false;
      channel.close();
      displayed.current = null;
      gesture.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [packetId]);

  useEffect(() => {
    const element = image.current;
    displayed.current = frame && element?.complete && element.naturalWidth > 0
      && element.src === `data:${frame.mimeType};base64,${frame.image}` ? frame : null;
  }, [frame]);

  const send = (event: VerificationEvent) => {
    const current = displayed.current;
    if (!current || error || refreshing || !frame || !sameVerificationFrame(current, frame)) return;
    queue.current?.push(event, current);
  };
  const pointer = (event: PointerEvent<HTMLImageElement>, phase: "down" | "move" | "up") => {
    const current = displayed.current;
    if (!current || !frame || error || refreshing || event.button > 0 || !sameVerificationFrame(current, frame)
      || event.currentTarget.src !== `data:${current.mimeType};base64,${current.image}`) {
      if (phase === "up" && gesture.current) {
        queue.current?.pause(); gesture.current = null;
        setError("The view changed during the gesture. Refresh it before continuing.");
      }
      return;
    }
    const point = verificationPoint(current, event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
    if (!point) {
      if (phase === "up" && gesture.current) {
        queue.current?.pause(); gesture.current = null;
        setError("The pointer was released outside the challenge. Refresh the view before continuing.");
      }
      return;
    }
    if (phase === "down") {
      if (gesture.current) return;
      gesture.current = { pointerId: event.pointerId, frame: current };
      event.currentTarget.setPointerCapture(event.pointerId);
      // After an uncertain drag, the refreshed image may show the original button
      // still held. The user's next gesture moves/releases it, never repeats down.
      send({ type: "pointer", phase: queue.current?.pointerHeld() ? "move" : "down", ...point });
    } else if (gesture.current?.pointerId === event.pointerId && sameVerificationFrame(gesture.current.frame, current)) {
      send({ type: "pointer", phase, ...point });
      if (phase === "up") { gesture.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }
    }
    event.preventDefault();
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      read.current ??= getHumanVerificationView(packetId);
      const next = await read.current;
      if (!active.current) return;
      if (next.state === "waiting" && queue.current?.resume(next)) {
        displayed.current = null;
        setFrame(next);
        setError(null);
      } else setError("The previous action is still settling or the verification view has closed. Litos is checking the original application.");
    } catch { if (active.current) setError("The verification view is unavailable. Try refreshing it again."); }
    finally { read.current = null; if (active.current) setRefreshing(false); }
  };
  if (!seen) return null;
  const disabled = !frame || Boolean(error) || refreshing;
  return (
    <section className="rounded-card border border-border bg-surface p-5" aria-label="Employer human verification" aria-describedby={descriptionId}>
      <h2 className="text-heading text-ink">Complete the company verification.</h2>
      <p id={descriptionId} className="mt-2 text-small text-muted" role="status">
        {frame ? "Complete the challenge below. Your actions go to the company verification window while you stay in Litos. Litos will then check the submission." : "The verification window has closed. Litos is checking the original application for confirmation."}
      </p>
      {frame && (
        <>
          {/* Native image: this private, changing JPEG must not use the image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={image} src={`data:${frame.mimeType};base64,${frame.image}`} alt="Live company human-verification challenge"
            width={frame.width} height={frame.height} draggable={false}
            className="mt-4 block h-auto max-w-full touch-none select-none rounded-inner border border-control-border"
            aria-describedby={`${descriptionId} ${errorId}`}
            onLoad={() => { displayed.current = frame; }}
            onPointerDown={event => pointer(event, "down")} onPointerMove={event => pointer(event, "move")}
            onPointerUp={event => pointer(event, "up")}
            onPointerCancel={() => { queue.current?.pause(); gesture.current = null; setError("The gesture was interrupted. Refresh the view before continuing."); }} />
          {frame.pointerDown && error === null && <p className="mt-2 text-small text-muted">A drag is active. Move to the intended position and release inside the challenge.</p>}
          <details className="mt-4">
            <summary className="cursor-pointer text-small text-ink">Keyboard controls</summary>
            <p className="mt-2 text-small text-muted">Choose Enter challenge first. These buttons send keys only to the challenge; your Tab key still moves through Litos normally. The company challenge is shown as an image, so its contents may not be readable by a screen reader.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={disabled} onClick={() => send({ type: "focus" })}>Enter challenge</Button>
              {([["Tab", "Next control"], ["Shift+Tab", "Previous control"], ["Enter", "Activate control"], ["Space", "Space"], ["ArrowLeft", "Left"], ["ArrowRight", "Right"], ["ArrowUp", "Up"], ["ArrowDown", "Down"], ["Escape", "Escape"]] as const).map(([key, label]) => (
                <Button key={key} variant="secondary" size="sm" disabled={disabled} onClick={() => send({ type: "key", key })}>{label}</Button>
              ))}
            </div>
            <label className="mt-3 block text-small text-ink" htmlFor={`${descriptionId}-text`}>Text for the selected challenge field</label>
            <input id={`${descriptionId}-text`} className="mt-1 min-h-11 w-full rounded-inner border border-control-border px-3 text-body"
              value={text} maxLength={128} disabled={disabled} onChange={event => setText(event.target.value)} autoComplete="off" />
            <Button className="mt-2" variant="secondary" disabled={disabled || !text.trim()} onClick={() => { send({ type: "text", text }); setText(""); }}>Enter text</Button>
          </details>
        </>
      )}
      <p id={errorId} role="alert" className="mt-3 text-small text-danger">{error ?? ""}</p>
      <Button variant="secondary" className="mt-3" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Refreshing view" : "Refresh verification view"}</Button>
    </section>
  );
}
