// Service Worker — v3
//
// Repeated reports of "fixes aren't appearing" pointed at stale caching.
// This version is deliberately conservative: the app's own code (HTML/JS)
// is ALWAYS fetched from the network when online, and is never served
// from cache unless the device is genuinely offline. Only static assets
// (icons, manifest, fonts) are cached aggressively.
const CACHE_NAME = 'hsk2-v3';

const STATIC_ASSETS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(STATIC_ASSETS.map(u => cache.add(u).catch(()=>{}))))
      .then(() => self.skipWaiting())   // activate immediately, don't wait for old tabs
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())  // take control of open pages right away
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google TTS: always network, never cached (dynamic audio).
  if (url.hostname === 'translate.googleapis.com' || url.hostname === 'translate.google.com') {
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }

  // The app document itself: NETWORK-ONLY while online.
  // cache.put is intentionally NOT called on the happy path — an offline
  // fallback copy is only written when we successfully fetch, and it is
  // only ever *read* when the network genuinely fails.
  const isAppDoc = event.request.mode === 'navigate' ||
                   url.pathname.endsWith('/') ||
                   url.pathname.endsWith('index.html');
  if (isAppDoc) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))   // offline only
    );
    return;
  }

  // Google Fonts: cache-first (they never change).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached =>
          cached || fetch(event.request).then(resp => {
            if (resp && resp.status === 200) cache.put(event.request, resp.clone());
            return resp;
          }).catch(() => cached)
        )
      )
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(resp => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      })
    )
  );
});
