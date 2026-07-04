import { ImageResponse } from "next/og";

/* Social share card: white canvas, the R mark, the hero line, the three
   pillar threads. Twitter falls back to this image automatically. */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "RoleQuick: tailored resume, filled application, real outreach";

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
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#6b84e8",
              borderRadius: "50%",
              color: "#ffffff",
              fontSize: 42,
              fontWeight: 700,
            }}
          >
            R
          </div>
          <div style={{ fontSize: 44, fontWeight: 600, color: "#12120f" }}>
            RoleQuick
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
