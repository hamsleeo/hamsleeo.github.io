/* H5 运行时：wx API 垫片 —— 让小程序逻辑层（store/quiz/audio/checkin/qr）零逻辑改动跑在浏览器里 */
(function () {
  var mem = {}
  function ls() { try { return window.localStorage } catch (e) { return null } }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) { }
    document.body.removeChild(ta)
  }

  var wx = window.wx = {
    getStorageSync: function (k) {
      var s = ls()
      if (!s) return mem[k] !== undefined ? mem[k] : ''
      try { var v = s.getItem('wx::' + k); return v === null ? '' : JSON.parse(v) } catch (e) { return '' }
    },
    setStorageSync: function (k, v) {
      var s = ls(); var j
      try { j = JSON.stringify(v) } catch (e) { return }
      if (s) { try { s.setItem('wx::' + k, j) } catch (e) { mem[k] = v } } else mem[k] = v
    },
    removeStorageSync: function (k) {
      var s = ls()
      if (s) { try { s.removeItem('wx::' + k) } catch (e) { } }
      delete mem[k]
    },
    clearStorageSync: function () {
      var s = ls()
      if (s) {
        var del = []
        for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k.indexOf('wx::') === 0) del.push(k) }
        del.forEach(function (k) { s.removeItem(k) })
      }
      mem = {}
    },
    setClipboardData: function (o) {
      var done = function () { o && o.success && o.success() }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(o.data).then(done, function () { fallbackCopy(o.data); done() })
      } else { fallbackCopy(o.data); done() }
    },
    getClipboardData: function (o) {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) { o && o.success && o.success({ data: t }) },
          function () { o && o.fail && o.fail({}) })
      } else o && o.fail && o.fail({})
    },
    showToast: function (o) { if (window.App) App.toast(o && o.title) },
    showModal: function (o) { if (window.App) App.modal(o) },
    vibrateShort: function () { try { navigator.vibrate && navigator.vibrate(35) } catch (e) { } },
    navigateTo: function (o) { window.App && App.nav(o.url) },
    redirectTo: function (o) { window.App && App.nav(o.url, true) },
    reLaunch: function (o) { window.App && App.nav(o.url, true) },
    switchTab: function (o) { window.App && App.nav(o.url, true) },
    navigateBack: function () { window.App && App.back() },
    pageScrollTo: function (o) {
      try { window.scrollTo({ top: (o && o.scrollTop) || 0, behavior: 'smooth' }) } catch (e) { window.scrollTo(0, 0) }
    },
    setInnerAudioOption: function () { },
    createInnerAudioContext: function () {
      var a = new Audio()
      a.preload = 'auto'
      var handlers = { error: null, ended: null }
      a.addEventListener('error', function () { handlers.error && handlers.error({ errMsg: 'audio error' }) })
      a.addEventListener('ended', function () { handlers.ended && handlers.ended() })
      return {
        set src(v) { a.src = v },
        play: function () {
          var p = a.play()
          if (p && p.catch) p.catch(function () { handlers.error && handlers.error({ errMsg: 'play blocked' }) })
        },
        stop: function () { try { a.pause(); a.currentTime = 0 } catch (e) { } },
        onError: function (f) { handlers.error = f },
        onEnded: function (f) { handlers.ended = f }
      }
    },
    scanCode: function (o) { o && o.fail && o.fail({ errMsg: 'scanCode unsupported in H5' }) },
    getSystemInfoSync: function () { return { pixelRatio: window.devicePixelRatio || 2, platform: 'h5' } }
  }
})()
