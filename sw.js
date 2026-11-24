/* 教师工具箱 · Service Worker
   作用：
   1) 让站点满足 Chrome / Edge 的「可安装应用」判定（需要带 fetch 处理器的 SW）。
   2) 网络优先、离线兜底：在线永远拿最新页面，断网时用最近一次成功访问的副本。
   刻意不做的事：
   - 不做 precache：首页不带 sharecode 会被网关判 403，预缓存只会把错误页存进去。
   - 不缓存 403 / 5xx / 跨域请求：云 SDK、云接口、单词发音音源一律直连网络。
   - 不拦截非 GET 请求：注册、审核、打卡等写操作不受影响。 */
var CACHE = 'teacher-toolbox-v7';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/.cloud/') === 0) return;

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) {
          return c.put(req, copy);
        }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || new Response(
          '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>离线</title>' +
          '<body style="font:16px/1.7 system-ui;padding:40px;color:#e9f5ef;background:#070c11">' +
          '当前没有网络，且本机还没有缓存这个页面。连上网打开一次后，再离线就能看到了。</body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      });
    })
  );
});
