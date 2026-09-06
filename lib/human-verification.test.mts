import assert from "node:assert/strict";
import test from "node:test";
import { createVerificationInputQueue, verificationPoint, type VerificationFrame, type VerificationCommand } from "./human-verification.ts";

const frame: VerificationFrame = { state: "waiting", attemptId: "original", frameId: "frame", revision: 1,
  nextSequence: 1, pointerDown: false, inputPending: false, width: 400, height: 300,
  capturedAt: 1000, expiresAt: 10000, image: "fixture", mimeType: "image/jpeg" };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("scaled pointer coordinates stay within the displayed frame", () => {
  const rect = { left: 10, top: 20, width: 200, height: 150 };
  assert.deepEqual(verificationPoint(frame, rect, 110, 95), { x: 200, y: 150 });
  for (const [x, y] of [[9, 20], [210, 20], [10, 170], [NaN, 20]]) assert.equal(verificationPoint(frame, rect, x, y), null);
});

test("slow acknowledgments serialize down, coalesced moves and up without replay", async () => {
  const calls: VerificationCommand[] = [];
  let resolve!: (value: { ok: true; nextSequence: number }) => void;
  const q = createVerificationInputQueue({ now: () => 1000, onError: assert.fail,
    send: async command => { calls.push(command); if (calls.length === 1) return new Promise(r => { resolve = r; });
      return { ok: true, nextSequence: command.sequence + 1 }; } });
  q.observe(frame);
  q.push({ type: "pointer", phase: "down", x: 1, y: 2 }, frame);
  for (let x = 2; x <= 20; x++) q.push({ type: "pointer", phase: "move", x, y: 2 }, frame);
  q.push({ type: "pointer", phase: "up", x: 20, y: 2 }, frame);
  q.observe({ ...frame, nextSequence: 2, pointerDown: true });
  assert.equal(q.pointerHeld(), false, "a stale image cannot re-hold an already queued release");
  assert.equal(calls.length, 1);
  resolve({ ok: true, nextSequence: 2 });
  await tick();
  assert.deepEqual(calls.map(c => c.type === "pointer" ? [c.phase, c.sequence, c.x] : c.type), [["down", 1, 1], ["move", 2, 20], ["up", 3, 20]]);
  q.close();
});

test("a lost acknowledgment drops pending gestures and requires settled refresh", async () => {
  const calls: VerificationCommand[] = [], errors: string[] = [];
  const q = createVerificationInputQueue({ now: () => 1000, onError: message => errors.push(message),
    send: async command => { calls.push(command); throw new Error("lost response"); } });
  q.observe(frame);
  q.push({ type: "pointer", phase: "down", x: 1, y: 2 }, frame);
  q.push({ type: "pointer", phase: "up", x: 1, y: 2 }, frame);
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(q.push({ type: "key", key: "Enter" }, frame), false);
  assert.equal(q.resume({ ...frame, nextSequence: 2, inputPending: true }), false);
  assert.equal(q.resume({ ...frame, nextSequence: 2 }), true);
  assert.equal(calls.length, 1, "refresh itself never replays input");
  q.close();
});

test("replaced frame, expiry, cancellation and unmount stop queued input", async () => {
  for (const mode of ["frame", "expiry", "pause", "close"]) {
    let now = 1000;
    const calls: VerificationCommand[] = [];
    let resolve!: (value: { ok: true; nextSequence: number }) => void;
    const q = createVerificationInputQueue({ now: () => now, onError: () => {},
      send: async c => { calls.push(c); return new Promise(r => { resolve = r; }); } });
    q.observe(frame);
    q.push({ type: "focus" }, frame);
    q.push({ type: "key", key: "Enter" }, frame);
    if (mode === "frame") q.observe({ ...frame, frameId: "replacement" });
    if (mode === "expiry") now = 10001;
    if (mode === "pause") q.pause();
    if (mode === "close") q.close();
    resolve({ ok: true, nextSequence: 2 });
    await tick();
    assert.equal(calls.length, 1, mode);
    q.close();
  }
});

test("an old snapshot cannot reset sequence after a successful input", async () => {
  const calls: VerificationCommand[] = [];
  const q = createVerificationInputQueue({ now: () => 1000, onError: assert.fail,
    send: async c => { calls.push(c); return { ok: true, nextSequence: c.sequence + 1 }; } });
  q.observe(frame);
  q.push({ type: "focus" }, frame);
  await tick();
  q.observe(frame);
  q.push({ type: "key", key: "Tab" }, frame);
  await tick();
  assert.deepEqual(calls.map(c => c.sequence), [1, 2]);
  q.close();
});
