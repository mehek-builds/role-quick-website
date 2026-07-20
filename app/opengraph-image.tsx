import { ImageResponse } from "next/og";

/* Social share card: white canvas, the Dart mark, the hero line, the three
   pillar threads. Twitter falls back to this image automatically. */

/* The Dart mark (public/brand/litos-mark.svg), inlined as a data URI so
   Satori rasterizes the real logo rather than a stand-in glyph. */
const DART_MARK =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#eef1fe"/><path d="M55 10 L9 30 L25 37 Z" fill="#6b84e8"/><path d="M55 10 L25 37 L29 54 Z" fill="#3d51ad"/></svg>`,
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
          <img src={DART_MARK} width={72} height={72} alt="" />
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
