import { ImageResponse } from "next/og";

/* The R mark as the favicon: same circular blue badge as the site header.
   Replaces the stock Next.js favicon.ico. */

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6b84e8",
          borderRadius: "50%",
          color: "#ffffff",
          fontSize: 38,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        R
      </div>
    ),
    { ...size },
  );
}
