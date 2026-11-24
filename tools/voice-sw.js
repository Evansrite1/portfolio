/* Keeps the speech model (Whisper) on this computer so "Listen to the message" works without internet.
   It only touches the speech files; the rest of the site is not affected. */
var CACHE = 'voice-v1';
var RX = /^\/tools\/(vendor\/(whisper|transformers)\/|whisper-worker\.js$)/;

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || r.headers.has('range') || !RX.test(u.pathname)) return;
  var worker = /whisper-worker\.js$/.test(u.pathname);
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(r).then(function (hit) {
      if (hit && !worker) return hit; /* the model files never change, so the saved copy is used straight away */
      return fetch(r).then(function (res) { if (res && res.ok && res.type === 'basic') c.put(r, res.clone()); return res; }).catch(function () { if (hit) return hit; throw new Error('offline'); });
    });
  }));
});
