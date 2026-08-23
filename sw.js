// Service Worker for 普通话 HSK 2 Grammar Journey
// Cache-first for app shell; network-first for audio (TTS)

const CACHE_NAME = 'hsk2-v1';
const CACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  // Google Fonts — cached on first load so app works offline after
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap',
];

// ── Install: cache app shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can; don't fail install if a resource can't be cached
      return Promise.allSettled(
        CACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Could not cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google TTS audio: network only (dynamic, can't precache)
  // Falls back gracefully if offline — the app falls back to browser TTS
  if (url.hostname === 'translate.googleapis.com' || url.hostname === 'translate.google.com') {
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }

  // Google Fonts CSS: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(response => {
            if (response && response.status === 200) cache.put(event.request, response.clone());
            return response;
          }).catch(() => null);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Everything else (app shell): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
