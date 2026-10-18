// Funciona offline: guarda o app no aparelho e atualiza em segundo plano.
const CACHE = 'estudos-uff-v2';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/main.js', 'js/store.js', 'js/ui.js', 'js/bus.js', 'js/google.js', 'js/demo.js',
  'js/logic/dates.js', 'js/logic/planner.js', 'js/logic/grades.js', 'js/logic/attendance.js', 'js/logic/anki.js',
  'js/views/common.js', 'js/views/hoje.js', 'js/views/estudos.js', 'js/views/agenda.js', 'js/views/cards.js',
  'js/views/notas.js', 'js/views/presenca.js', 'js/views/ajustes.js',
  'icons/logo.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return; // Google APIs sempre pela rede
  const key = req.mode === 'navigate' ? './' : req;
  // Fontes: cache primeiro. App: rede primeiro (sempre a versão mais nova), cache se estiver offline.
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    if (isFont) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok || res.type === 'opaque') cache.put(key, res.clone());
      return res;
    } catch {
      return (await cache.match(key, { ignoreSearch: req.mode === 'navigate' })) || Response.error();
    }
  }));
});
