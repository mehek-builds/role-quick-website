/**
 * The gate that decides whether a page renders fabricated fixture data.
 *
 * This predicate is the ONLY thing keeping made-up match scores and a fake "Applied" state off a
 * real student's screen, and it was written out by hand in seven separate files. A boundary that
 * matters this much should be readable in one place and testable at all; seven hand-written copies
 * are one careless paste away from being six copies and a hostname check.
 *
 * BOTH conditions are load-bearing. `localhost` alone would turn fixtures on for anyone running
 * the app locally against real data, and `?qa=1` alone would ship them to production the first
 * time someone pasted a link with the parameter still attached.
 *
 * The hostname test is exact equality on purpose: `localhost.trylitos.com` is a domain an attacker
 * can own, and `127.0.0.1` is deliberately excluded rather than being an oversight, so there is
 * exactly one string that opens this door.
 */
export function isQaRenderFor(hostname: string, search: string): boolean {
  return hostname === "localhost" && new URLSearchParams(search).has("qa");
}

/** The browser-side call. Safe only after mount: it reads `window`. */
export function isQaRender(): boolean {
  if (typeof window === "undefined") return false;
  return isQaRenderFor(window.location.hostname, window.location.search);
}
