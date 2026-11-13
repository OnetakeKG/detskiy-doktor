// Офлайн-режим: файлы игры кэшируются при первом открытии.
// При обновлении игры увеличьте номер версии, чтобы телефоны получили новые файлы.
const VERSION = 'v1';
const CACHE = 'detskiy-doktor-' + VERSION;
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'cases.js', 'cases2.js', 'cases3.js', 'codes.js', 'why.js', 'pixel.js', 'game.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Сначала сеть (чтобы получать обновления), при отсутствии сети — кэш.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
