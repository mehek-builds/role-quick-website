"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { STORE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

/* Tracked install redirect. The mobile send-link QR encodes /install?src=qr:
   a phone can't observe its own QR being scanned, so the desktop-side landing
   here is what counts the scan (design doc 2026-07-08). */
function InstallRedirect() {
  const params = useSearchParams();
  useEffect(() => {
    track("install_click", { source: params.get("src") ?? "direct" });
    const id = setTimeout(() => window.location.replace(STORE_URL), 150);
    return () => clearTimeout(id);
  }, [params]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-white px-6">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        Opening the Chrome Web Store…{" "}
        <a href={STORE_URL} className="underline decoration-border underline-offset-2">
          continue
        </a>
      </p>
    </main>
  );
}

export default function InstallPage() {
  return (
    <Suspense fallback={null}>
      <InstallRedirect />
    </Suspense>
  );
}
