// sw.js — service worker PWA A'ini ERP Petugas.
// TUJUAN: cache shell app (HTML/manifest/icon) supaya bisa di-install & dibuka standalone
// di Android. TIDAK menyentuh data server (login, sync, api Penerimaan/Stock Opname) -
// semua request ke Apps Script (/exec, doPost) SENGAJA dibiarkan lewat network-only,
// tidak dicache, karena data harus selalu fresh (token, stok, dsb).

const CACHE_NAME = 'anini-petugas-shell-v1';
const SHELL_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);

  // Request ke luar origin app (Apps Script /exec, doPost sync, dsb) - jangan cache,
  // langsung network, biar data (login/token/stok) selalu real-time.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Shell file sendiri: cache-first, fallback network, lalu update cache diam-diam.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      const network = fetch(event.request).then(function (resp) {
        if (resp && resp.ok) {
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, resp.clone());
          });
        }
        return resp;
      }).catch(function () {
        return cached;
      });
      return cached || network;
    })
  );
});
