/* ===========================================================================
   V.I.R.A.N.I. — service worker
   Two jobs: keep the shell available offline so the app opens instantly, and
   receive push notifications when the app is closed. This is what turns a web
   page into something that behaves like an installed assistant.
   ========================================================================= */

const CACHE = 'virani-v2';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // API calls must always be live — never answer them from a stale cache.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            if (response.ok && url.origin === self.location.origin) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => caches.match('/index.html'))
    )
  );
});

// --- Reminders arriving while the app is closed ---------------------------
self.addEventListener('push', (event) => {
  let payload = { title: 'VIRANI', body: 'You have a reminder.', url: '/' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch (_) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'virani',
      renotify: true,
      vibrate: [90, 50, 90],
      requireInteraction: payload.data?.kind === 'briefing',
      data: { url: payload.url || '/', ...payload.data },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus the app if it is already open, rather than opening a second copy.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
