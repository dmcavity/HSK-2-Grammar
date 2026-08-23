// Service Worker for 普通话 HSK 2 Grammar Journey
// v2: bumped cache name to force all existing installs to drop their old
// (possibly broken/outdated) cached copy. Also switched the main HTML
// document to network-first — previously it was cache-first, meaning a
// device that visited once during earlier testing could get stuck
// serving a stale, buggy snapshot indefinitely, since sw.js itself
// hadn't changed and browsers only re-check a service worker when its
// own bytes change.

const CACHE_NAME = 'hsk2-v2';
const CACHE_URLS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        CACHE_URLS.map(url => cache.add(url).catch(err => console.warn('[SW] Could not cache:', url, err)))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google TTS audio: network only, never cached (dynamic content)
  if (url.hostname === 'translate.googleapis.com' || url.hostname === 'translate.google.com') {
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }

  // The HTML document itself (navigations, and index.html directly):
  // NETWORK-FIRST. Always try to get the freshest version when online;
  // only fall back to a cached copy if genuinely offline. This is the
  // fix for "stuck on an old broken version" — cache-first previously
  // meant updates could silently never reach a returning visitor.
  const isHTMLDoc = event.request.mode === 'navigate' ||
                     url.pathname.endsWith('/') ||
                     url.pathname.endsWith('index.html');
  if (isHTMLDoc) {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
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

  // Everything else (icons, manifest): cache-first
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
