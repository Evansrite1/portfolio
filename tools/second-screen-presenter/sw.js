/* Keeps a copy of the Presenter files so the app also opens without internet. Online, the newest files always win. */
var CACHE = 'presenter-files-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || r.headers.has('range')) return;
  if (u.pathname.indexOf('/tools/') !== 0 && u.pathname !== '/favicon.ico') return;
  e.respondWith(
    caches.match(r, { ignoreSearch: r.mode === 'navigate' }).then(function (cached) {
      var net = fetch(r).then(function (res) {
        if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, copy); }); }
        return res;
      });
      if (!cached) return net;
      var slow = new Promise(function (resolve) { setTimeout(function () { resolve(cached); }, 4000); });
      return Promise.race([net.catch(function () { return cached; }), slow]);
    })
  );
});
