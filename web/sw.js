// Service worker SIMAK: membuat situs bisa dipasang sebagai aplikasi + halaman cadangan saat offline.
const CACHE = 'simak-v1';
const INTI = ['/', '/index.html', '/offline.html', '/logo.png', '/ikon-192.png', '/ikon-512.png', '/manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(INTI)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // aplikasi Google tidak disentuh
  if (e.request.mode === 'navigate') {
    // halaman: selalu ambil yang terbaru, kalau offline pakai halaman cadangan
    e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok && /\.(png|jpg|webmanifest)$/.test(u.pathname)) { const s = res.clone(); caches.open(CACHE).then(c => c.put(e.request, s)); }
    return res;
  })));
});
