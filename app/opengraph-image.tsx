import { ImageResponse } from "next/og";

/* Social share card: white canvas, the mark, the hero line, the three
   pillar threads. Twitter falls back to this image automatically. */

/* The mark (public/brand/litos-mark.svg), inlined as a data URI so Satori
   rasterizes the real logo rather than a stand-in glyph. Keep this path in
   sync with scripts/generate-brand-assets.mjs, which owns the artwork. */
const MARK =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="#ffffff"/><path fill="#000000" d="M32.81 8 L76.01 8 L75.17 16 L31.97 16 Z M27.53 24 L77.93 24 L77.09 32 L26.69 32 Z M22.25 40 L79.85 40 L79.01 48 L21.41 48 Z M16.97 56 L81.77 56 L80.93 64 L16.13 64 Z M11.69 72 L83.69 72 L81.59 92 L9.59 92 Z"/></svg>`,
  ).toString("base64");

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Litos: tailored resume, filled application, real outreach";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={72} height={72} alt="" />
          <div style={{ fontSize: 44, fontWeight: 600, color: "#12120f" }}>
            Litos
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            display: "flex",
            fontSize: 92,
            fontWeight: 500,
            letterSpacing: "-0.03em",
            color: "#12120f",
          }}
        >
          Apply&nbsp;<span style={{ color: "#3d51ad" }}>in seconds.</span>
        </div>
        <div
          style={{
            marginTop: 36,
            display: "flex",
            fontSize: 30,
            color: "#6b6a64",
          }}
        >
          It tailors your resume, fills the application, drafts the outreach.
        </div>
        <div style={{ marginTop: 56, display: "flex", gap: 10 }}>
          <div style={{ width: 48, height: 5, borderRadius: 3, background: "#6b84e8" }} />
          <div style={{ width: 48, height: 5, borderRadius: 3, background: "#68ad95" }} />
          <div style={{ width: 48, height: 5, borderRadius: 3, background: "#dd9273" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
