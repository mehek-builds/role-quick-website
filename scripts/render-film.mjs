/* Renders the scroll-film frame sequence: scattered application pages drift
   in slow chaos, then converge into one aligned packet while light washes
   move blue → teal → coral (the three pillars) and resolve to clean white.

   This is the local stand-in for a Higgsfield-generated film. The output
   contract is the only thing the site depends on: 121 frames at
   public/film/frame-0000.webp … frame-0120.webp, 16:9. Regenerating the
   film from a real video is: ffmpeg -i film.mp4 -vf fps=12,scale=1600:900
   frames, then webp: same filenames, no code change.

   Usage: node scripts/render-film.mjs  (writes PNGs to .film-tmp/, then
   convert with ffmpeg, see printed command). */

import { createCanvas } from "canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".film-tmp");
mkdirSync(OUT, { recursive: true });

const W = 1600;
const H = 900;
const FRAMES = 121; // t = frame / (FRAMES - 1)

/* Deterministic RNG so the film is reproducible. */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260706);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, t) => easeInOut(clamp01((t - a) / (b - a)));

/* The cast: 26 sheets. Depth drives size, shadow and draw order. */
const N = 26;
const stackOrder = [...Array(N).keys()];
for (let i = stackOrder.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [stackOrder[i], stackOrder[j]] = [stackOrder[j], stackOrder[i]];
}
const SHEETS = Array.from({ length: N }, (_, i) => {
  const depth = rand(); // 0 far … 1 near
  const w = lerp(95, 235, depth);
  return {
    depth,
    w,
    h: w * 1.3,
    x0: W * (0.06 + 0.88 * rand()),
    y0: H * (0.05 + 0.9 * rand()),
    driftX: (rand() - 0.5) * 150,
    driftY: (rand() - 0.5) * 120,
    rot0: (rand() - 0.5) * 0.85,
    rotDrift: (rand() - 0.5) * 0.45,
    convStart: 0.40 + 0.34 * rand(), // staggered departure into the stack
    stackIndex: stackOrder[i],
    stackJitter: (rand() - 0.5) * 0.045,
    lines: 4 + Math.floor(rand() * 4),
    lineSeed: rand(),
  };
});

/* Stack target: centered, near-aligned. */
const STACK = { x: W / 2, y: H * 0.53, w: 310, h: 310 * 1.3 };

function drawSheet(ctx, s, t) {
  const conv = smooth(s.convStart, Math.min(s.convStart + 0.30, 0.95), t);
  const settle = smooth(0.86, 1, t);

  const cx = lerp(s.x0 + s.driftX * t, STACK.x, conv);
  const cy = lerp(s.y0 + s.driftY * t, STACK.y - s.stackIndex * 1.9, conv);
  const rot = lerp(s.rot0 + s.rotDrift * t, s.stackJitter * (1 - settle), conv);
  const w = lerp(s.w, STACK.w, conv);
  const h = lerp(s.h, STACK.h, conv);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  /* Soft shadow: airy while drifting, tight once stacked. */
  const shadowA = lerp(0.10 + 0.10 * s.depth, 0.05, settle);
  ctx.shadowColor = `rgba(18,18,15,${shadowA.toFixed(3)})`;
  ctx.shadowBlur = lerp(lerp(34, 16, s.depth), 10, conv);
  ctx.shadowOffsetY = lerp(lerp(14, 7, s.depth), 4, conv);

  /* Paper: far sheets sit in the warm haze. */
  const warm = 1 - s.depth * 0.8;
  const c = Math.round(lerp(255, 250, warm * (1 - conv)));
  ctx.fillStyle = `rgb(${c},${c},${Math.max(c - 2, 246)})`;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.025);
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(18,18,15,0.05)";
  ctx.lineWidth = 1;
  ctx.stroke();

  /* Text hints: abstract gray bars, never readable. */
  const pad = w * 0.12;
  const lineH = h * 0.018;
  ctx.fillStyle = "rgba(18,18,15,0.06)";
  ctx.fillRect(-w / 2 + pad, -h / 2 + pad, w * 0.42, lineH * 1.9); // name bar
  ctx.fillStyle = "rgba(18,18,15,0.042)";
  for (let li = 0; li < s.lines; li++) {
    const y = -h / 2 + pad + h * 0.085 + li * h * 0.075;
    const len = w * (0.5 + 0.26 * (((s.lineSeed * 977 + li * 131) % 97) / 97));
    ctx.fillRect(-w / 2 + pad, y, len, lineH);
  }

  /* The finished packet's top sheet carries the three pillar threads. */
  if (s.stackIndex === N - 1 && settle > 0) {
    const a = settle * 0.75;
    const bw = w * 0.11;
    const y = h / 2 - pad * 0.9;
    const cols = [`rgba(107,132,232,${a})`, `rgba(104,173,149,${a})`, `rgba(221,146,115,${a})`];
    cols.forEach((col, k) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(-w / 2 + pad + k * (bw + w * 0.03), y, bw, lineH * 1.4, lineH);
      ctx.fill();
    });
  }
  ctx.restore();
}

/* Light washes: multiply gradients that sweep across as chapters pass.
   White canvas × pale tint = the wash. */
const WASHES = [
  { tint: [201, 212, 250], peak: 0.20, width: 0.13, maxA: 0.55 }, // blue: documents
  { tint: [207, 232, 222], peak: 0.47, width: 0.12, maxA: 0.5 },  // teal: autofill
  { tint: [246, 220, 204], peak: 0.72, width: 0.12, maxA: 0.5 },  // coral: outreach
];

function drawWashes(ctx, t) {
  for (const wsh of WASHES) {
    const a = wsh.maxA * Math.exp(-Math.pow((t - wsh.peak) / wsh.width, 2));
    if (a < 0.01) continue;
    const sweep = (t - wsh.peak) / wsh.width; // -1 … 1 through the chapter
    const gx = W * (0.5 + sweep * 0.55);
    const g = ctx.createLinearGradient(gx - W * 0.75, 0, gx + W * 0.75, H);
    const mix = (c, k) => Math.round(lerp(255, c, k));
    const col = (k) =>
      `rgb(${mix(wsh.tint[0], a * k)},${mix(wsh.tint[1], a * k)},${mix(wsh.tint[2], a * k)})`;
    g.addColorStop(0, col(0.25));
    g.addColorStop(0.5, col(1));
    g.addColorStop(1, col(0.25));
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

for (let f = 0; f < FRAMES; f++) {
  const t = f / (FRAMES - 1);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  /* Camera push-in toward the stack. */
  const zoom = 1 + 0.13 * easeInOut(t);
  ctx.translate(W / 2, H / 2 + H * 0.02 * easeInOut(t));
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);

  /* Floor shadow grows under the settling packet. */
  const settle = smooth(0.8, 1, t);
  if (settle > 0) {
    const g = ctx.createRadialGradient(STACK.x, STACK.y + STACK.h * 0.58, 10, STACK.x, STACK.y + STACK.h * 0.58, STACK.w * 1.1);
    g.addColorStop(0, `rgba(18,18,15,${(0.10 * settle).toFixed(3)})`);
    g.addColorStop(1, "rgba(18,18,15,0)");
    ctx.save();
    ctx.scale(1, 0.28);
    ctx.translate(0, (STACK.y + STACK.h * 0.58) * (1 / 0.28 - 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(STACK.x, STACK.y + STACK.h * 0.58, STACK.w * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* Far-to-near while drifting, stack order once converged. */
  const sorted = [...SHEETS].sort((a, b) => {
    const ka = lerp(a.depth, a.stackIndex / N, smooth(a.convStart, a.convStart + 0.3, t));
    const kb = lerp(b.depth, b.stackIndex / N, smooth(b.convStart, b.convStart + 0.3, t));
    return ka - kb;
  });
  for (const s of sorted) drawSheet(ctx, s, t);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawWashes(ctx, t);

  const name = `frame-${String(f).padStart(4, "0")}.png`;
  writeFileSync(join(OUT, name), canvas.toBuffer("image/png"));
  if (f % 20 === 0) console.log(`rendered ${name}`);
}

console.log(`\nDone: ${FRAMES} PNGs in ${OUT}`);
console.log(`Convert: ffmpeg -y -i ${OUT}/frame-%04d.png -c:v libwebp -quality 78 public/film/frame-%04d.webp`);
