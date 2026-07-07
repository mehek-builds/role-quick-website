#!/usr/bin/env python3
"""Strip blue page ink from film frames / clips (FILM.md hard rule:
resumes are black and white; only the finale packet keeps its marks).

Turns every blue-band pixel (hue 190-290, sat > 0.06) into its luminance
gray, leaving whites, grays and every other hue untouched. Safe ONLY on
frames whose legitimate content is colorless: film frames 0000-0080 and
the sting/transition clips. NEVER run it on frames 0081+ (light washes,
packet cover marks).

Usage:
  python3 scripts/strip-page-blue.py frames public/film 0 80
  python3 scripts/strip-page-blue.py video in.mp4 out.mp4   # via ffmpeg pipes
"""
import subprocess, sys
import numpy as np
from PIL import Image

HUE_LO, HUE_HI, SAT_MIN = 190, 290, 0.06


def degrade(rgb: np.ndarray) -> np.ndarray:
    f = rgb.astype(np.float32) / 255
    mx, mn = f.max(-1), f.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    mask = (hue > HUE_LO) & (hue < HUE_HI) & (sat > SAT_MIN)
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    out = f.copy()
    for c in range(3):
        out[..., c] = np.where(mask, luma, f[..., c])
    return (out * 255 + 0.5).astype(np.uint8)


def frames(directory: str, lo: int, hi: int) -> None:
    for i in range(lo, hi + 1):
        p = f"{directory}/frame-{i:04d}.webp"
        img = Image.open(p).convert("RGB")
        Image.fromarray(degrade(np.asarray(img))).save(p, quality=82, method=6)
        print(p)


def video(src: str, dst: str) -> None:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate", "-of", "csv=p=0", src],
        capture_output=True, text=True).stdout.strip().split(",")
    w, h, rate = int(probe[0]), int(probe[1]), probe[2]
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo",
         "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{w}x{h}", "-r", rate, "-i", "-", "-c:v", "libx264",
         "-crf", "26", "-preset", "slow", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", "-an", dst], stdin=subprocess.PIPE)
    size = w * h * 3
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        frame = np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3)
        enc.stdin.write(degrade(frame).tobytes())
    enc.stdin.close()
    dec.wait()
    enc.wait()
    print(dst)


if __name__ == "__main__":
    if sys.argv[1] == "frames":
        frames(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    else:
        video(sys.argv[2], sys.argv[3])
