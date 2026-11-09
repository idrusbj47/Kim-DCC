// Service worker Dokumen ISO.
// Prinsip: hanya "kerangka aplikasi" yang di-cache. Halaman dokumen, data, dan login
// (semua yang berasal dari Supabase) TIDAK PERNAH disimpan agar dokumen tidak tertinggal di perangkat.
const VERSION = 'v3';
const SHELL_CACHE = 'iso-shell-' + VERSION;
const LIB_CACHE = 'iso-lib-' + VERSION;
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL_CACHE, LIB_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase (API, auth, storage/halaman dokumen): selalu langsung ke jaringan, tanpa cache.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // Pustaka dan font dari CDN: pakai cache lalu perbarui di latar belakang.
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(LIB_CACHE).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Halaman utama: jaringan dulu supaya versi terbaru langsung terpakai; cadangan dari cache saat offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => { const copy = r.clone(); caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy)); return r; })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // File statis lain milik aplikasi (ikon, manifest): cache dulu.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
