"use client";

import { STORE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

/* Every install CTA on the landing page, so the one metric that matters
   (install click-through, per lib/analytics.ts) is actually measured here
   and not only inside /try. `source` says which CTA earned the click, which
   is the whole point: the hero, the sticky pill and the close section are
   three different arguments and they should be comparable.

   app/page.tsx is a server component, so the onClick has to live in a
   client boundary. This is that boundary, and nothing else. */
export function InstallLink({
  source,
  className,
  children,
}: {
  source: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={STORE_URL}
      onClick={() => track("install_click", { source })}
      className={className}
    >
      {children}
    </a>
  );
}
