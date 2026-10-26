/* Life-Line service worker — v3.4
 * Own files: network-first, cache fallback (a deploy reaches users at once;
 * v3.3 served app.js cache-first, so fixes never arrived until VERSION changed).
 * Leaflet CDN assets: cache-first (runtime). Leaflet CDN assets: cache-first (runtime).
 * API + SSE: never cached (network only). */
const VERSION = 'lifeline-v3.4';
const SHELL = [
  'index.html', 'styles.css', 'app.js', 'icons.js', 'icon.svg', 'manifest.webmanifest'
];
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/api/events') return;
  // Only cache what we know; any other cross-origin request goes straight to
  // the browser. (v3.3 proxied every CDN request through the worker, whose
  // fetch() is bound by the page CSP's connect-src 'self' — so Leaflet, jsPDF
  // and the fonts all failed from the second visit on.)
  const CDN_HOSTS = ['unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  if (url.origin !== location.origin && !CDN_HOSTS.includes(url.host)) return;

  // Navigations: serve shell offline.
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(e.request);
      } catch (_) {
        const cache = await caches.open(VERSION);
        return (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // Own static files: network-first so updates land immediately; offline → cache.
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch (_) {
        return (await cache.match(e.request, { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }

  // CDN assets: cache-first with runtime fill.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreVary: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') {
        cache.put(e.request, res.clone());
      }
      return res;
    } catch (_) {
      return Response.error();
    }
  })());
});
