// 校园考勤请假 H5 / PWA Service Worker
// 策略：应用外壳预缓存（离线可用），运行时请求网络优先并回写缓存
const CACHE = 'pingshan-attendance-v3'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png']

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL)
      })
      .then(function () {
        return self.skipWaiting()
      })
      .catch(function () {})
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k !== CACHE
            })
            .map(function (k) {
              return caches.delete(k)
            })
        )
      })
      .then(function () {
        return self.clients.claim()
      })
  )
})

self.addEventListener('fetch', function (event) {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 页面导航：网络优先，离线回退到缓存的首页
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          const copy = res.clone()
          caches.open(CACHE).then(function (c) {
            c.put('./index.html', copy).catch(function () {})
          })
          return res
        })
        .catch(function () {
          return caches.match('./index.html').then(function (hit) {
            return hit || caches.match('./')
          })
        })
    )
    return
  }

  // 静态资源：缓存优先，未命中再取网络并回写
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then(function (c) {
            c.put(req, copy).catch(function () {})
          })
        }
        return res
      })
    })
  )
})
