/* 다이빙 여행 PWA — 화면은 캐시에서 즉시, 데이터는 네트워크 우선 */
var V = 'trip-v1';
var SHELL = ['./', 'index.html', 'style.css', 'app.js', 'sync.js', 'manifest.webmanifest', 'icons/icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === V ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  var u;
  try { u = new URL(r.url); } catch (x) { return; }
  if (u.origin !== location.origin) return;            // Open-Meteo 등 바깥 API 는 그대로 통과

  // 1) 데이터(JSON): 항상 네트워크 먼저 — 피클이 커밋하면 바로 반영. 실패하면 캐시.
  if (u.pathname.indexOf('/data/') >= 0) {
    e.respondWith(
      fetch(r).then(function (res) {
        var cp = res.clone();
        caches.open(V).then(function (c) { c.put(r, cp); });
        return res;
      }).catch(function () { return caches.match(r); })
    );
    return;
  }

  // 2) 화면 이동: 네트워크 먼저, 실패하면 app shell
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r).then(function (res) {
        var cp = res.clone();
        caches.open(V).then(function (c) { c.put('index.html', cp); });
        return res;
      }).catch(function () { return caches.match('index.html'); })
    );
    return;
  }

  // 3) 나머지(스타일·스크립트·아이콘): 캐시 우선 + 뒤에서 갱신
  e.respondWith(
    caches.match(r).then(function (hit) {
      var net = fetch(r).then(function (res) {
        var cp = res.clone();
        caches.open(V).then(function (c) { c.put(r, cp); });
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
