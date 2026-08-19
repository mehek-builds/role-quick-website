/* The Litos service worker. It exists for exactly one thing: showing a notification.
 *
 * DELIBERATELY NOT A CACHE. A service worker is also the standard place to intercept fetches and
 * serve an app shell offline, and this one does none of that on purpose. Litos is a dashboard over
 * live data where a stale cached page is worse than no page: a student reading yesterday's
 * application statuses cannot tell them from today's. Adding a fetch handler here later would
 * change that silently for everybody, because a service worker outlives the tab that installed it.
 *
 * A SERVICE WORKER SURVIVES DEPLOYS. The browser keeps running the installed copy until this file's
 * BYTES change, then activates the new one on the next navigation. skipWaiting and clients.claim
 * below make that immediate rather than waiting for every tab to close, which matters because the
 * push handler is the thing being updated and a student with a pinned tab could otherwise run a
 * months-old copy indefinitely.
 */

self.addEventListener('install', () => {
  // Take over as soon as the new bytes land, rather than idling in "waiting" behind an open tab.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* A push arrives. The payload was encrypted end to end, so this is the first place it is readable.
 *
 * SHOWING SOMETHING IS NOT OPTIONAL. Chrome enforces a "userVisibleOnly" contract: a push handler
 * that resolves without calling showNotification gets a browser-generated "This site has been
 * updated in the background" notification instead, and repeated offences cost the origin its push
 * permission. So every branch here ends in a notification, including the ones where the payload is
 * malformed, and the fallback text is deliberately vague rather than wrong.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Litos';
  const body = typeof payload.body === 'string' && payload.body
    ? payload.body
    : 'Something moved on your applications.';
  /* Same tag means a digest that was never seen is REPLACED by the next one rather than stacking.
     Two unread summaries covering overlapping windows is worse than one that is current. */
  const tag = typeof payload.tag === 'string' && payload.tag ? payload.tag : 'litos';
  const url = typeof payload.url === 'string' && payload.url.startsWith('https://')
    ? payload.url
    : 'https://trylitos.com/dashboard/applications';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icon.png',
      badge: '/icon.png',
      /* False, so a notification that arrives while the laptop is asleep is still there when it
         wakes rather than having been shown to nobody. */
      renotify: false,
      requireInteraction: false,
      data: { url },
    }),
  );
});

/* A click. Focus a Litos tab if one is already open rather than opening a second one: a student who
 * already has the dashboard up should land on it, not accumulate duplicate tabs every morning. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url)
    || 'https://trylitos.com/dashboard/applications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
