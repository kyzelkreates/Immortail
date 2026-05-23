// Immortail™ Service Worker v1.0.0
const CACHE_VERSION = 'immortail-v3'; // v3: navigate fix + AI fallback
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const MEDIA_CACHE   = `${CACHE_VERSION}-media`;
const AI_CACHE      = `${CACHE_VERSION}-ai`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('immortail-') && ![STATIC_CACHE, MEDIA_CACHE, AI_CACHE].includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip cross-origin non-CDN requests
  if (url.origin !== self.location.origin &&
      !url.href.includes('cdn.jsdelivr.net') &&
      !url.href.includes('fonts.googleapis.com') &&
      !url.href.includes('fonts.gstatic.com')) return;

  // AI model files → AI cache (cache first, long TTL)
  if (url.pathname.includes('/models/') || url.href.includes('tfhub') || url.href.includes('jsdelivr')) {
    event.respondWith(cacheFirst(request, AI_CACHE));
    return;
  }

  // Static assets → cache first
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }
});

// ─── Strategies ───────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise || offlineFallback(request);
}

async function offlineFallback(request) {
  if (request.headers.get('accept')?.includes('text/html')) {
    const cache = await caches.open(STATIC_CACHE);
    return cache.match('/offline.html') || new Response('<h1>Immortail™ — Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
  }
  return new Response('Offline', { status: 503 });
}

// ─── Background sync ──────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
