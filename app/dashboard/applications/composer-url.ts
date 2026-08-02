type ComposerLocation = Pick<Location, "hash" | "pathname" | "search">;

export function closedComposerPath(location: ComposerLocation): string {
  const params = new URLSearchParams(location.search);
  params.delete("job");
  params.delete("new");
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;
}

export function replaceClosedComposerUrl(
  location: ComposerLocation,
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void,
): string {
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const nextPath = closedComposerPath(location);
  if (nextPath !== currentPath) replaceState(null, "", nextPath);
  return nextPath;
}
