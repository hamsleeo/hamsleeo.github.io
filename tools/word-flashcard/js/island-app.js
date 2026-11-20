/* H5 框架层：路由 + 渲染 + 事件委托 + toast/modal。
 * 页面控制器在 js/pages.js（window.PAGES），视图模板在 js/views.js（window.VIEWS）。 */
(function () {
  const PAGES = window.PAGES
  const VIEWS = window.VIEWS

  const ROUTES = {
    index: { title: '单词精灵岛', page: 'index' },
    quiz: { title: '闯关', page: 'quiz' },
    units: { title: '自由闯关', page: 'units' },
    grammar: { title: '语法闯关', page: 'grammar' },
    usage: { title: '词汇运用', page: 'usage' },
    roots: { title: '词根 & 拼读', page: 'roots' },
    words: { title: '完整词表', page: 'words' },
    review: { title: '复习', page: 'review' },
    me: { title: '我的', page: 'me' },
    class: { title: '班级', page: 'class' },
    teacher: { title: '教师端', page: 'teacher' }
  }
  const TABS = ['index', 'review', 'class', 'me']

  const container = document.getElementById('view')
  const stack = []       // {route, params}
  let current = null     // 当前页面实例

  /* ---------- setData 支持 ---------- */
  function setPath(obj, path, val) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
    let o = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i]
      if (o[k] == null) o[k] = /^\d+$/.test(parts[i + 1]) ? [] : {}
      o = o[k]
    }
    o[parts[parts.length - 1]] = val
  }
  function deepMerge(dst, patch) {
    Object.keys(patch).forEach(k => {
      const v = patch[k]
      if (/[\[\.]/.test(k)) { setPath(dst, k, v); return }
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
        deepMerge(dst[k], v)
      } else dst[k] = v
    })
  }

  /* ---------- toast / modal ---------- */
  let toastTimer = null
  function toast(title) {
    const el = document.getElementById('toast')
    el.textContent = title || ''
    el.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200)
  }

  function modal(opt) {
    const wrap = document.createElement('div')
    wrap.className = 'modal-mask'
    const inputHtml = opt.editable
      ? '<input class="input" id="modal-input" placeholder="' + (opt.placeholderText || '') + '">'
      : ''
    wrap.innerHTML =
      '<div class="modal"><div class="modal-title">' + (opt.title || '') + '</div>' +
      (opt.content ? '<div class="modal-content">' + String(opt.content).replace(/\n/g, '<br>') + '</div>' : '') +
      inputHtml +
      '<div class="modal-btns">' +
      (opt.showCancel === false ? '' : '<button class="btn btn-ghost" data-m="cancel">取消</button>') +
      '<button class="btn" data-m="ok">确定</button>' +
      '</div></div>'
    document.body.appendChild(wrap)
    const input = wrap.querySelector('#modal-input')
    if (input) { setTimeout(() => input.focus(), 60) }
    function close(res) {
      document.body.removeChild(wrap)
      if (opt.success) opt.success(res)
    }
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-m]')
      if (!b) return
      if (b.dataset.m === 'ok') close({ confirm: true, content: input ? input.value : '' })
      else close({ confirm: false })
    })
  }

  /* ---------- 渲染 ---------- */
  function render(scrollTop) {
    if (!current) return
    const def = ROUTES[current.route]
    const html = VIEWS[current.route](current.data)
    const keepScroll = scrollTop === undefined
    const y = window.scrollY
    container.innerHTML = html
    document.title = def ? def.title : '单词精灵岛'
    renderTabs()
    if (keepScroll) window.scrollTo(0, y)
    else window.scrollTo(0, 0)
  }

  function renderTabs() {
    const bar = document.getElementById('tabbar')
    if (!current || TABS.indexOf(current.route) < 0) { bar.style.display = 'none'; return }
    bar.style.display = ''
    bar.innerHTML = TABS.map(t =>
      '<div class="tabbar-item' + (current.route === t ? ' on' : '') + '" data-tab="' + t + '">' +
      (VIEWS._tabNames[t] || t) + '</div>'
    ).join('')
  }

  /* ---------- 页面实例 ---------- */
  function createPage(route, params) {
    const def = PAGES[route]
    const inst = Object.create(def)
    inst.data = JSON.parse(JSON.stringify(def.data || {}))
    inst.route = route
    inst.params = params || {}
    inst.setData = function (patch, opts) {
      deepMerge(inst.data, patch)
      if (!(opts && opts.silent)) render()
    }
    return inst
  }

  function parseUrl(url) {
    let u = String(url || '').replace(/^#/, '')
    /* 先摘出 ?query，避免路径正则的贪婪段吞掉参数 */
    const qi = u.indexOf('?')
    const query = qi >= 0 ? u.slice(qi + 1) : ''
    if (qi >= 0) u = u.slice(0, qi)
    if (u.indexOf('/pages/') === 0) {
      const m = u.match(/^\/pages\/([^\/]+)(?:\/[^\/]*)?$/)
      if (m) u = m[1]
    }
    const params = {}
    if (query) {
      query.split('&').forEach(kv => {
        const i = kv.indexOf('=')
        if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1))
      })
    }
    return { route: u, params: params }
  }

  function enter(route, params, replace) {
    /* 兼容小程序风格的完整路径：'/pages/quiz/quiz?book=xx' → route='quiz' */
    if (route && route.charAt(0) === '/') {
      const p = parseUrl(route)
      route = p.route
      params = Object.keys(params || {}).length ? Object.assign(p.params, params) : p.params
    }
    if (!PAGES[route]) { route = 'index'; params = {} }
    current = createPage(route, params)
    if (replace) stack.pop()
    stack.push({ route: route, params: params })
    try {
      history[replace ? 'replaceState' : 'pushState']({ route: route, params: params }, '', '#/pages/' + route)
    } catch (e) { }
    if (current.onLoad) current.onLoad(Object.assign({}, params))
    if (current.onShow) current.onShow()
    render(0)
  }

  function back() {
    if (stack.length <= 1) { enter('index', {}, true); return }
    stack.pop()
    const prev = stack[stack.length - 1]
    current = createPage(prev.route, prev.params)
    try { history.replaceState({ route: prev.route, params: prev.params }, '', '#/pages/' + prev.route) } catch (e) { }
    if (current.onLoad) current.onLoad(Object.assign({}, prev.params))
    if (current.onShow) current.onShow()
    render(0)
  }

  window.App = {
    nav: enter,
    back: back,
    toast: toast,
    modal: modal
  }

  /* ---------- 事件委托 ---------- */
  function fire(page, act, target, evtName) {
    const fn = page && page[act]
    if (typeof fn !== 'function') return
    const e = {
      currentTarget: { dataset: Object.assign({}, target.dataset) },
      target: target,
      detail: { value: target.value }
    }
    fn.call(page, e)
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]')
    if (t) {
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT') { /* 输入元素点击不触发 */ }
      else {
        e.preventDefault()
        fire(current, t.dataset.act, t, 'click')
        return
      }
    }
    const tab = e.target.closest('[data-tab]')
    if (tab) {
      const r = tab.dataset.tab
      if (current && current.route === r) return
      enter(r, {})
    }
  })

  document.addEventListener('input', e => {
    const t = e.target.closest('[data-act]')
    if (t) fire(current, t.dataset.act, t, 'input')
  })

  document.addEventListener('change', e => {
    const t = e.target.closest('[data-act]')
    if (t) fire(current, t.dataset.act, t, 'change')
  })

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    const t = e.target
    if (t && t.tagName === 'INPUT' && t.dataset.act === 'spellInput') fire(current, 'spellCheck', t, 'enter')
    if (t && t.tagName === 'INPUT' && t.dataset.act === 'input') fire(current, 'submit', t, 'enter')
  })

  window.addEventListener('popstate', ev => {
    const st = ev.state
    if (!st || !st.route || !PAGES[st.route]) { enter('index', {}, true); return }
    current = createPage(st.route, st.params || {})
    stack.length = 0
    stack.push({ route: st.route, params: st.params || {} })
    if (current.onLoad) current.onLoad(Object.assign({}, st.params || {}))
    if (current.onShow) current.onShow()
    render(0)
  })

  /* ---------- 启动 ---------- */
  function start() {
    const init = parseUrl(location.hash)
    if (!PAGES[init.route]) init.route = 'index'
    stack.length = 0
    enter(init.route, init.params, true)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
