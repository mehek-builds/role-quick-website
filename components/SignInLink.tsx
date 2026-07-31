"use client";

import { track } from "@/lib/analytics";

/* The counterpart to InstallLink, and now the more common of the two.

   "Add to Chrome" used to be the ask on every surface: header, hero, film
   card, close section, browse-jobs and the end of /try. It is now the ask in
   exactly one place, the #packet demo, where the Chrome extension is actually
   on screen doing the thing. Everywhere else the site sends people to the
   account, because the account is the door a phone can also open and the half
   of Litos that keeps working when the browser is shut.

   `source` mirrors InstallLink's so the two funnels stay comparable per CTA
   rather than only in aggregate. app/page.tsx is a server component, so the
   onClick needs this client boundary. */
export function SignInLink({
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
      href="/login"
      onClick={() => track("signin_click", { source })}
      className={className}
    >
      {children}
    </a>
  );
}
