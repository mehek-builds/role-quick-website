const BROWSER_LIVE_VIEW_HOSTS = new Set([
  "browserbase.com",
  "www.browserbase.com",
  "debug.browserbase.com",
  "live.browserbase.com",
]);

/** Accept only a provider-owned live-view URL, never an employer destination from passive data. */
export function safeBrowserLiveViewUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || url.hash
      || !BROWSER_LIVE_VIEW_HOSTS.has(url.hostname.toLowerCase())
      || !/^\/sessions?\/[^/]+(?:\/.*)?$/.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
