"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

const INSTALL_URL = `${SITE_URL}/install?src=qr`;

/* Phones can't install Chrome extensions, so "Add to Chrome" is a dead end on
   the device most students are actually holding. The mobile conversion is
   "get this link onto my desktop": copy-link + QR, zero backend.

   Lived inside /try's DonePanel first; lifted here so the landing page can
   use the same door instead of leaving phone visitors with nothing. `source`
   keeps the funnel readable about which surface sent the link. */
export function MobileSendLink({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, INSTALL_URL, {
        width: 128,
        margin: 1,
        color: { dark: "#12120f", light: "#ffffff" },
      })
        .then(() => {
          /* toCanvas writes width/height ATTRIBUTES, which beat Tailwind's
             utility classes on a canvas. Pin the CSS box explicitly or the
             code renders at its bitmap size and eats a third of the card. */
          const c = canvasRef.current;
          if (c) {
            c.style.width = "64px";
            c.style.height = "64px";
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <div className={`rq-sendlink ${className}`}>
      <div className="flex items-center gap-3.5 rounded-inner border border-border bg-surface-alt/60 p-3 text-left">
        <canvas
          ref={canvasRef}
          style={{ width: 64, height: 64 }}
          className="shrink-0 rounded-inner"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-5 text-muted">
            Litos installs on a laptop. Scan this, or copy the link for later.
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(INSTALL_URL);
                setCopied(true);
                track("send_link_submit", { method: "copy", source });
              } catch {}
            }}
            className="mt-1.5 min-h-[44px] rounded-full border border-control-border bg-surface px-3.5 py-1.5 text-xs font-medium text-ink"
          >
            {copied ? "Copied" : "Copy install link"}
          </button>
        </div>
      </div>
    </div>
  );
}
