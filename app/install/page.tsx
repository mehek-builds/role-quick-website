"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { STORE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

/* Tracked install redirect (design doc 2026-07-08). It was built to count QR
   scans, which a phone cannot observe on its own screen; that QR is gone
   (MobileSendLink, deleted 2026-09-09), so ?src=qr no longer has a producer.
   The route stays because it is still the off-site store fallback: billing's
   return page links here as "Extension help", and anyone who saved or shared
   the old link still lands on it. `src` now records whoever sent them. */
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
