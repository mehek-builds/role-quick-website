"use client";

import { useEffect, useState } from "react";

export function SearchSubmitButton() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <button type="submit" onClick={() => setPending(true)} disabled={pending} aria-live="polite" className="min-h-[44px] rounded-control bg-brand px-6 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70 sm:col-span-3 lg:col-span-1 lg:self-end">
      {pending ? "Searching..." : "Search"}
    </button>
  );
}
