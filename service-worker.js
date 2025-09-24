// service-worker.js
const CACHE_VERSION = 'v1.0.1';
const STATIC_CACHE  = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './escuelas.html',
  './grupos.html',
  './opcionesgrupo.html',
  './tomar-asistencia.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  // SDKs que usas:
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignora no-GET y Firestore (lo maneja el SDK con IndexedDB)
  if (req.method !== 'GET') return;
  if (url.origin.includes('firestore.googleapis.com')) return;

  // HTML → network-first (para que veas actualizaciones cuando haya red)
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).then(res => {
        caches.open(RUNTIME_CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() =>
        caches.match(req).then(r => r || caches.match('./index.html'))
      )
    );
    return;
  }

  // Librerías de gstatic → stale-while-revalidate
  if (url.origin.includes('gstatic.com')) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(res => {
          caches.open(RUNTIME_CACHE).then(c => c.put(req, res.clone()));
          return res;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Estáticos locales → cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        caches.open(RUNTIME_CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => cached);
    })
  );
});
