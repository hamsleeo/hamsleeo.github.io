/* 软件下载页逻辑：优先读云端 downloads 表，云端不可用时回退到 assets/downloads-data.js */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ITEMS = (window.DOWNLOAD_FALLBACK || []).slice();
  var source = 'manifest';
  var cloudError = null;
  var state = { kw: '', cat: '全部' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(u) {
    var v = String(u == null ? '' : u).trim();
    if (!v) return '';
    if (/^\s*(javascript|data|vbscript|file):/i.test(v)) return '';
    return v;
  }

  function mapItem(r) {
    return {
      id: String(r.id || ''),
      name: r.name || '',
      version: r.version || '',
      size: (r.size == null ? '' : r.size),
      platform: r.platform || '',
      category: r.category || '其他',
      desc: r.description || r.desc || '',
      note: r.note || '',
      icon: r.icon || '⬇',
      url: r.url || r.download_url || '',
      mirror: r.mirror || r.mirror_url || '',
      bundled: !!r.bundled
    };
  }

  function merge(rows) {
    var list = rows.map(mapItem), ids = {};
    list.forEach(function (t) { ids[t.id] = 1; });
    (window.DOWNLOAD_FALLBACK || []).forEach(function (t) {
      if (!t.bundled || ids[t.id]) return;
      ids[t.id] = 1;
      list.push(mapItem(t));
    });
    return list;
  }

  function fmtSize(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/^\d+(\.\d+)?$/.test(s)) {
      var n = Number(s);
      if (n >= 1024) {
        var units = ['B', 'KB', 'MB', 'GB'];
        var i = 0;
        while (n >= 1024 && i < units.length - 1) { n = n / 1024; i++; }
        return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + units[i];
      }
    }
    return s;
  }

  function loadItems() {
    var cloud = window.WFC_CLOUD;
    if (!cloud) { cloudError = window.WFC_CLOUD_ERROR || '云服务未连接'; return Promise.resolve(ITEMS); }
    return cloud.database.from('downloads')
      .select('*').eq('enabled', true).order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = Array.isArray(res.data) ? res.data : [];
        ITEMS = merge(rows);
        source = 'cloud';
        cloudError = null;
        return ITEMS;
      })
      .catch(function (e) {
        cloudError = (e && e.message) ? e.message : '云端读取失败';
        return ITEMS;
      });
  }

  function renderChips() {
    var counts = { '全部': ITEMS.length };
    ITEMS.forEach(function (t) {
      var c = t.category || '其他';
      counts[c] = (counts[c] || 0) + 1;
    });
    var cats = ['全部'].concat((window.DOWNLOAD_CATEGORIES || []).filter(function (c) { return counts[c]; }));
    Object.keys(counts).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
    $('dlChips').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (state.cat === c ? ' active' : '') + '" data-cat="' + esc(c) + '">' +
        esc(c) + '<span class="n">' + counts[c] + '</span></button>';
    }).join('');
  }

  function cardHtml(t) {
    var url = safeUrl(t.url);
    var mirror = safeUrl(t.mirror);
    var isDoc = /\.html?(\?|#|$)/i.test(url);
    var chips = '';
    if (t.platform) chips += '<span class="dl-chip">' + esc(t.platform) + '</span>';
    var size = fmtSize(t.size);
    if (size) chips += '<span class="dl-chip size">' + esc(size) + '</span>';
    if (t.category) chips += '<span class="dl-chip">' + esc(t.category) + '</span>';
    return '<article class="dl-card" data-id="' + esc(t.id) + '">' +
      '<div class="dl-ico">' + esc(t.icon) + '</div>' +
      '<div class="dl-main">' +
        '<div class="dl-title"><h3>' + esc(t.name) + '</h3>' +
          (t.version ? '<span class="dl-ver">' + esc(t.version) + '</span>' : '') +
        '</div>' +
        (t.desc ? '<p class="dl-desc">' + esc(t.desc) + '</p>' : '') +
        (chips ? '<div class="dl-meta">' + chips + '</div>' : '') +
        (t.note ? '<p class="dl-note">' + esc(t.note) + '</p>' : '') +
        '<div class="dl-actions">' +
          (url
            ? '<a class="btn btn-primary btn-sm" href="' + esc(url) + '" download rel="noopener">下载</a>' +
              (isDoc ? '<a class="btn btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener">在线阅读</a>' : '')
            : '<button class="btn btn-sm" type="button" data-act="no-url">链接待补充</button>') +
          (mirror ? '<a class="btn btn-sm" href="' + esc(mirror) + '" target="_blank" rel="noopener">备用链接</a>' : '') +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderNote() {
    var el = $('dlNote');
    if (!el) return;
    if (source === 'cloud') { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '当前为<strong>内置清单</strong>：显示的是随页面发布的软件条目，后台新增的软件需要联网后才会出现。' +
      '（' + esc(cloudError || '云服务未连接') + '）';
  }

  function render() {
    var kw = state.kw.trim().toLowerCase();
    var list = ITEMS.filter(function (t) {
      if (state.cat !== '全部' && (t.category || '其他') !== state.cat) return false;
      if (!kw) return true;
      var hay = [t.name, t.desc, t.platform, t.category, t.version, t.note].join(' ').toLowerCase();
      return hay.indexOf(kw) >= 0;
    });

    renderChips();
    $('dlCount').textContent = (kw || state.cat !== '全部')
      ? '共 ' + list.length + ' 个结果'
      : '共 ' + ITEMS.length + ' 个软件';

    if (!list.length) {
      $('dlGrid').innerHTML = '<div class="empty"><div class="big">⬇</div>' +
        '<h3>' + (ITEMS.length ? '没有找到匹配的软件' : '还没有上架的软件') + '</h3>' +
        '<p>' + (ITEMS.length ? '换个关键词试试。' : '请在「管理后台 → 软件管理」添加。') + '</p></div>';
    } else {
      $('dlGrid').innerHTML = list.map(cardHtml).join('');
    }

    $('dlTip').textContent = window.DOWNLOAD_SITE_NOTE || '';
    renderNote();
  }

  $('dlChips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    state.cat = chip.getAttribute('data-cat');
    render();
  });

  $('dlSearch').addEventListener('input', function () {
    state.kw = this.value;
    render();
  });

  $('dlGrid').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act="no-url"]');
    if (btn) {
      btn.textContent = '请到后台补链接';
      setTimeout(function () { btn.textContent = '链接待补充'; }, 1800);
    }
  });

  render();
  document.body.setAttribute('data-dl-source', 'loading');
  loadItems().then(function () {
    render();
    document.body.setAttribute('data-dl-source', source);
    document.body.setAttribute('data-dl-count', String(ITEMS.length));
  });
})();
