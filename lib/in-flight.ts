/**
 * Share concurrent work for one key, then forget it immediately.
 *
 * This is intentionally not a result cache. The next request starts fresh,
 * which keeps authenticated reads current while preventing duplicate fetches
 * mounted during the same render.
 */
export function shareInFlight<T>(
  cache: Map<string, Promise<unknown>>,
  key: string | null,
  start: () => Promise<T>,
): Promise<T> {
  if (!key) return start();
  const pending = cache.get(key);
  if (pending) return pending as Promise<T>;

  const request = start();
  cache.set(key, request);
  const cleanup = () => {
    if (cache.get(key) === request) cache.delete(key);
  };
  request.then(cleanup, cleanup);
  return request;
}

export function requestShareKey(
  path: string,
  token: string | null,
  init: RequestInit,
): string | null {
  const method = (init.method ?? "GET").toUpperCase();
  const hasRequestSpecificOptions = Object.keys(init).some((key) => key !== "method");
  return method === "GET" && !hasRequestSpecificOptions
    ? `${token ?? ""}|${path}`
    : null;
}
