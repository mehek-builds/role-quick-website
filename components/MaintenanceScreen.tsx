export function MaintenanceScreen() {
  const update = process.env.LITOS_MAINTENANCE_NEXT_UPDATE;
  const statusUrl = process.env.NEXT_PUBLIC_STATUS_PAGE_URL;
  return (
    <main className="flex min-h-svh items-center justify-center bg-white px-6 py-20">
      <div className="w-full max-w-xl rounded-card border border-border bg-surface p-8 shadow-rest" role="status">
        <p className="text-label text-warn">Maintenance</p><h1 className="mt-3 text-section text-ink">Litos is temporarily unavailable.</h1>
        <p className="mt-4 text-body text-muted">Scheduled work is in progress. Saved account data is not changed by this screen. Retry after the next update.</p>
        <p className="mt-5 font-mono text-sm text-ink">{update ? `Next update: ${update}` : "Return time is not confirmed. This page will change when it is."}</p>
        <div className="mt-7 flex flex-wrap gap-4">{statusUrl && <a href={statusUrl} className="font-medium text-brand-ink underline underline-offset-4">Open status page</a>}<a href="mailto:support@trylitos.com" className="text-muted underline underline-offset-4">Email support</a></div>
      </div>
    </main>
  );
}
