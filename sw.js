// Guarda la app para que abra rapido y sin señal (los datos se guardan aparte,
// en el telefono, con la ultima vez que se pudieron bajar).
const VERSION = 'gina-mvl4eryr'
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'app.js', 'config.js', 'dinero.js', 'logo.png', 'icono-192.png', 'manifest.webmanifest']

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS))); self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))); self.clients.claim() })
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (u.origin !== location.origin || e.request.method !== 'GET') return
  // La app primero de la red (para tener siempre la ultima); sin red, la guardada.
  e.respondWith(fetch(e.request).then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r }).catch(() => caches.match(e.request)))
})
