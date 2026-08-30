/* Life-Line service worker — v3.3
 * Static shell: cache-first. Leaflet CDN assets: cache-first (runtime).
 * API + SSE: never cached (network only). */
const VERSION = 'lifeline-v3.3';
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

  // Everything else static: cache-first with runtime fill (covers CDN).
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreVary: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && (url.origin === location.origin || url.host === 'unpkg.com')) {
        cache.put(e.request, res.clone());
      }
      return res;
    } catch (_) {
      return Response.error();
    }
  })());
});
