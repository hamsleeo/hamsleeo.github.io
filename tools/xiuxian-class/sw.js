// 离线缓存：壳与静态资源缓存优先，页面导航网络优先（保证拿到最新版本）
var CACHE = 'xiuxian-class-v5';
var SHELL = [
    './',
    './index.html',
    './css/app.css',
    './js/core.js',
    './js/data.js',
    './js/auth.js',
    './js/views.js',
    './js/app.js',
    './manifest.webmanifest',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            return cache.addAll(SHELL).catch(function () {
                /* 单个资源失败不阻断安装 */
            });
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.map(function (key) {
                    if (key !== CACHE) return caches.delete(key);
                })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;

    var url = new URL(request.url);
    // 云端接口与授权跳转永不缓存
    if (url.pathname.indexOf('/.cloud') >= 0 || url.pathname.indexOf('/genie-baas') >= 0) return;
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    var copy = response.clone();
                    caches.open(CACHE).then(function (cache) {
                        cache.put(request, copy);
                    });
                    return response;
                })
                .catch(function () {
                    return caches.match(request).then(function (cached) {
                        return cached || caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // 静态资源也走网络优先，避免用户长期卡在旧版 CSS/JS；断网时回落缓存
    event.respondWith(
        fetch(request)
            .then(function (response) {
                if (response && response.status === 200) {
                    var copy = response.clone();
                    caches.open(CACHE).then(function (cache) {
                        cache.put(request, copy);
                    });
                }
                return response;
            })
            .catch(function () {
                return caches.match(request);
            })
    );
});
