/* 前台逻辑：从云端 tools 表读取入口，搜索、分类、最近打开 */
(function () {
  'use strict';

  var RECENT_KEY = 'tbox_recent_v1';
  var TOOLS = (window.TOOLBOX_FALLBACK || []).slice();
  var source = 'fallback';
  var cloudError = null;
  var state = { keyword: '', category: '全部' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) {
    var v = String(u || '').trim();
    if (!v || /^\s*javascript:/i.test(v) || /^\s*data:/i.test(v)) return '';
    return v;
  }
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function mapRow(r) {
    return {
      id: r.id, name: r.name, tagline: r.tagline || '', desc: r.description || '',
      icon: r.icon || '◈', category: r.category || '其他',
      tags: Array.isArray(r.tags) ? r.tags : [], badge: r.badge || '',
      colors: Array.isArray(r.colors) ? r.colors : ['#1b5e46', '#3f9d78', '#43e08a'],
      url: r.url, mode: r.mode || 'embed', note: r.note || '',
      bundled: false
    };
  }
  /* 随站点内置的外部资源（assets/tools.js 里标了 bundled:true 的条目）不依赖云端 tools 表。
     云端读取成功时，把云端没有同 ID 记录的内置条目补进列表：新增一个外部资源
     只需改代码并发布，不必先取得数据库写入权限。
     管理员若在后台用同一个 ID 建了记录，则以云端记录为准（可改文案、排序、停用）。 */
  function mergeBundled(rows) {
    var list = rows.map(mapRow);
    var ids = {};
    list.forEach(function (t) { ids[t.id] = 1; });
    (window.TOOLBOX_FALLBACK || []).forEach(function (t) {
      if (!t.bundled || ids[t.id]) return;
      ids[t.id] = 1;
      list.push({
        id: t.id, name: t.name, tagline: t.tagline || '', desc: t.desc || '',
        icon: t.icon || '◈', category: t.category || '其他',
        tags: Array.isArray(t.tags) ? t.tags : [], badge: t.badge || '',
        colors: Array.isArray(t.colors) ? t.colors : ['#1b5e46', '#3f9d78', '#43e08a'],
        url: t.url, mode: t.mode || 'window', note: t.note || '',
        bundled: true
      });
    });
    return list;
  }
  function find(id) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
    return null;
  }
  function getAll() { return TOOLS; }
  function isExternal(t) { return /^https?:\/\//i.test(t.url || ''); }
  function openMode(t) { return (t.mode === 'window' || isExternal(t)) ? 'window' : 'embed'; }
  function markOpen(t) {
    var recent = read(RECENT_KEY, []);
    if (!Array.isArray(recent)) recent = [];
    recent = recent.filter(function (r) { return r && r.id !== t.id; });
    recent.unshift({ id: t.id, name: t.name, icon: t.icon, ts: Date.now() });
    write(RECENT_KEY, recent.slice(0, 8));
  }
  function openTool(t, forceWindow) {
    var url = safeUrl(t.url);
    if (!url) { toast('这个工具的链接无效'); return; }
    markOpen(t);
    if (forceWindow || openMode(t) === 'window') window.open(url, '_blank', 'noopener');
    else window.location.href = 'view.html?tool=' + encodeURIComponent(t.id);
  }
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }
  function timeAgo(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 604800000) return Math.floor(d / 86400000) + ' 天前';
    var dt = new Date(ts);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  /* 云端读取：成功即以云端为准，并补上内置外部资源；失败才回退到内置清单 */
  function loadTools() {
    var cloud = window.WFC_CLOUD;
    if (!cloud) { cloudError = window.WFC_CLOUD_ERROR || '云服务未连接'; return Promise.resolve(TOOLS); }
    return cloud.database.from('tools')
      .select('*').eq('enabled', true).order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = Array.isArray(res.data) ? res.data : [];
        TOOLS = mergeBundled(rows);
        source = 'cloud';
        cloudError = null;
        return TOOLS;
      })
      .catch(function (e) {
        cloudError = (e && e.message) ? e.message : '云端读取失败';
        return TOOLS;
      });
  }

  window.TBox = {
    esc: esc, safeUrl: safeUrl, find: find, getAll: getAll,
    openTool: openTool, toast: toast, timeAgo: timeAgo, loadTools: loadTools,
    mergeBundled: mergeBundled, isExternal: isExternal, openMode: openMode,
    getSource: function () { return source; }, getCloudError: function () { return cloudError; }
  };

  if (!document.getElementById('grid')) return;
  var $ = function (id) { return document.getElementById(id); };

  /* 把「是否需要登录 / 数据存在哪 / 是不是演示版」直接写清楚，
     不要藏在 badge 的 title 里（手机上根本没有悬停）。 */
  function accessLabel(t) {
    var s = (t.note || '') + ' ' + (t.badge || '') + ' ' + (t.desc || '');
    if (/外部站点|第三方站点|teacherlab\.cn/i.test(s)) return { text: '外部站点 · 数据不进本平台', cls: 'external' };
    if (/尚未打通|独立账号|需要.*登录|登录云端|云端账号/.test(s)) return { text: '需单独登录', cls: 'login' };
    if (/演示|模拟数据|预览版/.test(s)) return { text: '演示版 · 本机数据', cls: 'demo' };
    if (/统一账号|手机注册/.test(s)) return { text: '统一账号 · 手机注册', cls: 'login' };
    if (/本机|本地|离线/.test(s)) return { text: '免登录 · 本机数据', cls: 'local' };
    return null;
  }
  function cardHtml(t, i) {
    var c = t.colors || ['#1b5e46', '#3f9d78', '#43e08a'];
    var tags = (t.tags || []).slice(0, 3).map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('');
    var badge = t.badge ? '<span class="badge" title="' + esc(t.note || '') + '">' + esc(t.badge) + '</span>' : '';
    var access = accessLabel(t);
    var accessHtml = access ? '<span class="access-tag ' + access.cls + '">' + esc(access.text) + '</span>' : '';
    var noteHtml = t.note ? '<div class="card-note">' + esc(t.note) + '</div>' : '';
    var winLabel = openMode(t) === 'window' ? '打开工具 ↗' : '进入工具 →';
    return '' +
      '<article class="card" data-id="' + esc(t.id) + '" style="--c1:' + esc(c[0]) + ';--c2:' + esc(c[1]) + ';animation-delay:' + (i * 45) + 'ms">' +
        '<div class="thumb">' + badge +
          '<div class="thumb-icon">' + esc(t.icon || '◈') + '</div>' +
          '<div class="thumb-label">' + esc(t.tagline || '') + '</div>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-title-row"><h3>' + esc(t.name) + '</h3><span class="cat-dot">' + esc(t.category || '其他') + '</span></div>' +
          (t.tagline ? '<div class="tagline">' + esc(t.tagline) + '</div>' : '') +
          accessHtml +
          '<p class="card-desc">' + esc(t.desc || '') + '</p>' +
          '<div class="tags">' + tags + '</div>' +
          noteHtml +
          '<div class="card-foot">' +
            '<button class="btn btn-primary btn-sm" data-act="open">' + winLabel + '</button>' +
            '<button class="icon-btn" data-act="window" title="在新窗口打开">↗</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderChips(all) {
    var counts = { '全部': all.length };
    all.forEach(function (t) { var c = t.category || '其他'; counts[c] = (counts[c] || 0) + 1; });
    var cats = ['全部'].concat((window.TOOLBOX_CATEGORIES || []).filter(function (c) { return counts[c]; }));
    Object.keys(counts).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
    $('chips').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (state.category === c ? ' active' : '') + '" data-cat="' + esc(c) + '">' +
        esc(c) + '<span class="n">' + counts[c] + '</span></button>';
    }).join('');
  }

  function renderRecent() {
    var recent = read(RECENT_KEY, []);
    if (!Array.isArray(recent)) recent = [];
    var valid = recent.filter(function (r) { return r && find(r.id); }).slice(0, 5);
    var sec = $('recentSection');
    if (!valid.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $('recentList').innerHTML = valid.map(function (r) {
      return '<a class="recent-item" href="#" data-recent="' + esc(r.id) + '">' +
        '<span class="e">' + esc(r.icon || '◈') + '</span>' + esc(r.name) +
        '<span class="t">' + timeAgo(r.ts) + '</span></a>';
    }).join('');
  }

  function renderCloudNote() {
    var el = $('cloudNote');
    if (!el) return;
    if (source === 'cloud') { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '当前为<strong>离线预览</strong>：显示的是内置清单，后台新增或调整的工具需要联网后才会出现。' +
      '（' + esc(cloudError || '云服务未连接') + '）';
  }

  function render() {
    var all = getAll();
    var kw = state.keyword.trim().toLowerCase();
    renderChips(all);
    var list = all.filter(function (t) {
      if (state.category !== '全部' && (t.category || '其他') !== state.category) return false;
      if (!kw) return true;
      var hay = [t.name, t.tagline, t.desc, t.category, (t.tags || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(kw) >= 0;
    });
    $('statTools').textContent = all.length;
    var cats = {};
    all.forEach(function (t) { cats[t.category || '其他'] = 1; });
    $('statCats').textContent = Object.keys(cats).length;
    $('shownCount').textContent = (kw || state.category !== '全部') ? '共 ' + list.length + ' 个结果' : '全部工具';
    if (!list.length) {
      $('grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">◇</div>' +
        '<h3>' + (all.length ? '没有找到匹配的工具' : '还没有上架的工具') + '</h3>' +
        '<p>' + (all.length ? '换个关键词试试。' : '请到后台管理界面添加工具入口。') + '</p></div>';
    } else {
      $('grid').innerHTML = list.map(cardHtml).join('');
    }
    renderRecent();
    renderCloudNote();
  }

  $('grid').addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (!card) return;
    var t = find(card.getAttribute('data-id'));
    if (!t) return;
    var btn = e.target.closest('[data-act]');
    if (btn) {
      var act = btn.getAttribute('data-act');
      if (act === 'open') openTool(t, false);
      else if (act === 'window') openTool(t, true);
      return;
    }
    openTool(t, false);
  });
  $('chips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    state.category = chip.getAttribute('data-cat'); render();
  });
  var search = $('search');
  search.addEventListener('input', function () {
    state.keyword = search.value;
    $('clearSearch').classList.toggle('show', !!search.value);
    render();
  });
  $('clearSearch').addEventListener('click', function () {
    search.value = ''; state.keyword = '';
    $('clearSearch').classList.remove('show');
    render(); search.focus();
  });
  $('recentList').addEventListener('click', function (e) {
    var a = e.target.closest('[data-recent]');
    if (!a) return;
    e.preventDefault();
    var t = find(a.getAttribute('data-recent'));
    if (t) openTool(t, false);
  });
  $('clearRecent').addEventListener('click', function () {
    write(RECENT_KEY, []); renderRecent(); toast('已清空最近打开');
  });

  /* 统一账号：右上角显示当前登录者与审核状态，避免"要不要登录"靠猜 */
  (function () {
    var A = window.TBAccount, link = $('accountLink');
    if (!A || !link) return;
    A.getSession().then(function (r) {
      if (!r || !r.data) return;
      return A.myIdentity().then(function (id) {
        var d = id && id.data;
        if (!d) return;
        var span = link.querySelector('span');
        if (!d.registered) { span.textContent = '完善资料'; link.title = '已登录，请补充身份与班级信息'; return; }
        span.textContent = (d.name || '我的账号') + (d.status === 'pending' ? ' · 待审核' : '');
        link.title = '身份：' + (A.IDENTITY[d.identity] || '—') + '　角色：' + (A.ROLE[d.role] || '—');
      });
    }).catch(function () {});
  })();

  render();
  document.body.setAttribute('data-tool-source', 'loading');
  loadTools().then(function () {
    render();
    document.body.setAttribute('data-tool-source', source);
    document.body.setAttribute('data-tool-count', String(getAll().length));
  });
})();
