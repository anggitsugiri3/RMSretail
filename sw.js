/**
 * sw.js — Service worker app mobile Petugas (RMS).
 *
 * PENTING (nyambung ke kasus "app HP ga kelihatan order baru" yang sempat dicek):
 * app ini scope-nya ONLINE-ONLY (lihat komentar di index.html) - SEMUA data
 * (pengantaran/stock opname/dst) SELALU fetch() langsung ke BACKEND_URL, TIDAK
 * PERNAH lewat cache service worker ini. Service worker di sini cuma nge-cache
 * "app shell" (index.html, manifest, icon) - itu murni supaya app bisa di-install
 * ke homescreen & tetap kebuka pas sinyal jelek, BUKAN cache data pesanan.
 *
 * Strategi index.html sengaja NETWORK-FIRST (bukan cache-first) - begitu ada
 * versi baru ke-deploy, HP kurir langsung ambil versi terbaru saat online, cache
 * cuma jadi fallback pas offline. Ini buat cegah app "nyangkut" di versi lama gara-gara
 * cache, kasus yang beberapa kali bikin fix/patch kelihatan "belum jalan" padahal
 * sebenarnya cuma app-nya belum reload versi baru.
 *
 * CACHE_NAME di-versionkan manual - tiap kali app shell diubah (index.html/icon/
 * manifest), NAIKKAN angka versi di bawah supaya cache lama otomatis kebuang
 * (lihat activate) & browser/HP tahu ada versi baru buat di-install.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = 'rms-petugas-shell-' + CACHE_VERSION;

const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  // skipWaiting - service worker versi baru langsung aktif begitu ke-install,
  // tidak nunggu semua tab lama ditutup dulu (default browser). Ini juga bagian
  // dari "jangan sampai nyangkut versi lama" di atas.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    Promise.all([
      // Buang semua cache versi lama (nama cache tidak match CACHE_NAME sekarang).
      caches.keys().then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key.indexOf('rms-petugas-shell-') === 0 && key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
        );
      }),
      // clients.claim - tab yang lagi kebuka langsung dikontrol SW baru ini juga,
      // tidak perlu full-close app dulu.
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = new URL(req.url);

  // Cuma tangani GET request SATU ORIGIN (app shell). Apapun selain itu - termasuk
  // SEMUA request ke BACKEND_URL (script.google.com, beda origin, dan selalu POST) -
  // dibiarkan lewat langsung ke network apa adanya, TIDAK PERNAH disentuh/di-cache
  // service worker ini. Ini yang jamin data pesanan/stok selalu real-time.
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Navigasi (buka/reload app) & index.html - network-first, fallback cache pas offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put('./index.html', copy); });
          return res;
        })
        .catch(function () {
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Asset statis lain (icon/manifest) - cache-first (jarang berubah), tetap
  // update cache di belakang layar tiap kali berhasil fetch (stale-while-revalidate ringan).
  event.respondWith(
    caches.match(req).then(function (cached) {
      const network = fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
