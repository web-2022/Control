// ============================================================
// sw.js — Service worker: hace que la app funcione sin internet.
// Estrategia: "primero caché, luego actualiza en segundo plano"
// para los archivos de la app. Las llamadas a Google (Apps Script)
// NO se interceptan: van siempre directo a la red.
// Al publicar cambios, sube el número de VERSION.
// ============================================================
const VERSION = 'control-v1.3.2';
const ARCHIVOS = [
  './', 'index.html', 'manifest.json', 'css/styles.css',
  'js/app.js', 'js/store.js', 'js/sync.js', 'js/parser.js', 'js/voz.js', 'js/vistas.js',
  'js/modales.js', 'js/componentes.js', 'js/modelo.js', 'js/ui.js', 'js/util.js',
  'js/catalogo.js', 'js/demo.js', 'js/iconos.js', 'js/diario.js', 'js/instalar.js', 'js/google.js', 'js/bienvenida.js', 'js/compartir.js', 'js/config.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Google y otros: red directa
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const enCache = await cache.match(e.request, { ignoreSearch: true });
      const red = fetch(e.request).then((r) => {
        if (r.ok) cache.put(e.request, r.clone());
        return r;
      }).catch(() => enCache || cache.match('index.html'));
      return enCache || red;
    })
  );
});

// Activar la nueva versión cuando el usuario acepte "Actualizar"
self.addEventListener('message', (e) => { if (e.data === 'activar') self.skipWaiting(); });

// Al tocar una notificación, abrir la app en la vista correspondiente
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = e.notification.data?.url || '#/hoy';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const c = cs[0];
      if (c) { c.postMessage({ url: destino }); return c.focus(); }
      return self.clients.openWindow('./' + destino);
    })
  );
});
