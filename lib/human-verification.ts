export type VerificationFrame = {
  state: "waiting";
  attemptId: string;
  frameId: string;
  revision: number;
  nextSequence: number;
  pointerDown: boolean;
  inputPending: boolean;
  width: number;
  height: number;
  expiresAt: number;
  capturedAt: number;
  image: string;
  mimeType: "image/jpeg";
};
export type VerificationView = VerificationFrame | { state: "not_ready" | "closed" };
export type VerificationEvent =
  | { type: "pointer"; phase: "down" | "move" | "up"; x: number; y: number }
  | { type: "focus" }
  | { type: "key"; key: "Tab" | "Shift+Tab" | "Enter" | "Space" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Backspace" | "Delete" | "Escape" }
  | { type: "text"; text: string };
export type VerificationCommand = VerificationEvent & {
  attemptId: string; frameId: string; revision: number; sequence: number;
};

export function sameVerificationFrame(a: VerificationFrame, b: VerificationFrame) {
  return a.attemptId === b.attemptId && a.frameId === b.frameId && a.revision === b.revision;
}

export function verificationPoint(frame: VerificationFrame, rect: { left: number; top: number; width: number; height: number }, x: number, y: number) {
  if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const point = { x: (x - rect.left) * frame.width / rect.width, y: (y - rect.top) * frame.height / rect.height };
  return point.x >= 0 && point.y >= 0 && point.x < frame.width && point.y < frame.height ? point : null;
}

// Sends only explicit user events. Pending moves coalesce, but down/up never do.
// An unknown acknowledgment clears the queue and requires a fresh, settled image.
export function createVerificationInputQueue({ send, onError, now = () => Date.now() }: {
  send: (command: VerificationCommand) => Promise<{ ok: true; nextSequence: number }>;
  onError: (message: string) => void;
  now?: () => number;
}) {
  let current: VerificationFrame | null = null;
  let sequence = 0;
  let working = false;
  let stopped = false;
  let blocked = false;
  let pointerHeld = false;
  const pending: Array<{ event: VerificationEvent; frame: VerificationFrame }> = [];
  const fail = () => {
    pending.length = 0;
    blocked = true;
    if (!stopped) onError("The last action could not be confirmed. Refresh this view before continuing.");
  };
  const drain = async () => {
    if (working || blocked || stopped) return;
    working = true;
    try {
      while (pending.length && !stopped && !blocked) {
        const item = pending.shift()!;
        if (!current || !sameVerificationFrame(current, item.frame) || now() >= current.expiresAt) { fail(); break; }
        const sentSequence = sequence;
        const result = await send({ ...item.event, attemptId: item.frame.attemptId,
          frameId: item.frame.frameId, revision: item.frame.revision, sequence: sentSequence });
        if (stopped) break;
        if (result.ok !== true || result.nextSequence !== sentSequence + 1) { fail(); break; }
        sequence = result.nextSequence;
      }
    } catch { fail(); }
    finally { working = false; }
  };
  return {
    observe(frame: VerificationFrame) {
      if (stopped) return;
      if (current && !sameVerificationFrame(current, frame) && (working || pending.length)) fail();
      if (!current || !sameVerificationFrame(current, frame)) sequence = frame.nextSequence;
      else sequence = Math.max(sequence, frame.nextSequence);
      if (!working && pending.length === 0 && frame.nextSequence >= sequence) pointerHeld = frame.pointerDown;
      current = frame;
    },
    push(event: VerificationEvent, frame: VerificationFrame) {
      if (stopped || blocked || !current || !sameVerificationFrame(current, frame) || now() >= frame.expiresAt) return false;
      if (event.type === "pointer" && event.phase === "down") pointerHeld = true;
      if (event.type === "pointer" && event.phase === "up") pointerHeld = false;
      const tail = pending[pending.length - 1];
      if (event.type === "pointer" && event.phase === "move" && tail?.event.type === "pointer" && tail.event.phase === "move") {
        pending[pending.length - 1] = { event, frame };
      } else pending.push({ event, frame });
      if (pending.length > 32) { fail(); return false; }
      void drain();
      return true;
    },
    resume(frame: VerificationFrame) {
      if (working || stopped || frame.inputPending || now() >= frame.expiresAt) return false;
      pending.length = 0;
      current = frame;
      sequence = frame.nextSequence;
      pointerHeld = frame.pointerDown;
      blocked = false;
      return true;
    },
    pause() { blocked = true; pending.length = 0; },
    pointerHeld() { return pointerHeld; },
    close() { stopped = true; pending.length = 0; },
  };
}
