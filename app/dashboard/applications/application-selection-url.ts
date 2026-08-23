export type ApplicationSelectionLocation = Readonly<{
  pathname: string;
  search: string;
  hash: string;
}>;

/**
 * Build the reload-safe URL for one application, or for the application ledger after closing it.
 *
 * The application and intent parameters form one instruction. Opening replaces both together, and
 * closing removes both together. Unrelated query parameters belong to the surrounding dashboard
 * view and stay in place.
 */
export function applicationSelectionPath(
  location: ApplicationSelectionLocation,
  applicationId: string | null,
): string {
  const params = new URLSearchParams(location.search);
  const normalizedId = applicationId?.trim();

  /* These parameters each open a different workspace. Keeping one beside an application
     instruction lets a reload reopen the composer or restart a posting lookup over the selected
     application, so selection and close both clear them as one atomic navigation. */
  params.delete("new");
  params.delete("job");
  params.delete("checkout_action");

  if (normalizedId) {
    params.set("application", normalizedId);
    params.set("intent", "apply");
  } else {
    params.delete("application");
    params.delete("intent");
  }

  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;
}
