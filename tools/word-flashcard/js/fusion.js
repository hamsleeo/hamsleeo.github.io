/* ==========================================================
   融合层：统一导航、线性图标、朗读提示、自检信息
   不改动原版任何业务逻辑，只做 DOM 增强。
   ========================================================== */
(function () {
  'use strict';

  var P = '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>';
  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var I = {
    volume: svg(P),
    book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>'),
    map: svg('<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>'),
    pen: svg('<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
    puzzle: svg('<path d="M9 3h3v3a2 2 0 1 0 4 0V3h5v5h-3a2 2 0 1 0 0 4h3v9h-6v-3a2 2 0 1 0-4 0v3H3v-6h3a2 2 0 1 0 0-4H3V3h6Z"/>'),
    castle: svg('<path d="M4 21V9h3V5h3v4h4V5h3v4h3v12H4Z"/><path d="M10 21v-5h4v5"/>'),
    send: svg('<path d="m21 3-9 9-9-6 18-3Z"/><path d="m21 3-6 18-6-9 12-9Z"/>'),
    chart: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h6l3-5 3 8 2-3h4"/>'),
    inbox: svg('<path d="M3 12h5l2 3h4l2-3h5"/><path d="M4 5h16l1 7v7H3v-7L4 5Z"/>'),
    home: svg('<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    refresh: svg('<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/><path d="m17 4 3 3-3 3"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    users: svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20a6 6 0 0 1 12 0M15 20a5 5 0 0 1 6-4"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>'),
    target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
    star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"/>'),
    bulb: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
    bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>'),
    medal: svg('<circle cx="12" cy="15" r="5"/><path d="m8 3 2 6M16 3l-2 6M12 12v.01"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    cap: svg('<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>'),
    check: svg('<path d="m4 12 5 5L20 6"/>'),
    cards: svg('<rect x="3" y="5" width="13" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/>'),
    layers: svg('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>')
  };

  /* 原版功能 emoji → 线性 SVG（宠物形象与庆祝图标保留，属于原版趣味元素） */
  var MAP = {
    '🔊': I.volume, '🔉': I.volume, '📖': I.book, '📚': I.book, '🗺': I.map,
    '✍️': I.pen, '✏️': I.pen, '📝': I.pen, '🧩': I.puzzle, '🏰': I.castle,
    '📤': I.send, '📊': I.chart, '📥': I.inbox, '🏠': I.home, '🔁': I.refresh,
    '👨‍👩‍👧': I.users, '👤': I.user, '📋': I.list, '🎯': I.target, '⭐': I.star,
    '💡': I.bulb, '🔍': I.search, '⚙️': I.gear, '🔔': I.bell, '🏅': I.medal,
    '📅': I.calendar, '🎓': I.cap, '✅': I.check, '📈': I.chart, '🧠': I.bulb
  };
  var keys = Object.keys(MAP).sort(function (a, b) { return b.length - a.length; });
  var RE = new RegExp(keys.map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g');

  function swapIcons(root) {
    if (!root) return 0;
    var walker, count = 0;
    try {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (/^(SCRIPT|STYLE|INPUT|TEXTAREA|SELECT|OPTION|SVG)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
          if (p.classList && p.classList.contains('ico-inline')) return NodeFilter.FILTER_REJECT;
          RE.lastIndex = 0;
          return RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
    } catch (e) { return 0; }
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      RE.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, m;
      while ((m = RE.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var span = document.createElement('span');
        span.className = 'ico-inline';
        span.innerHTML = MAP[m[0]];
        frag.appendChild(span);
        last = m.index + m[0].length;
        count++;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
    return count;
  }

  /* ---------- 顶部统一导航 ---------- */
  function mountTopbar() {
    if (document.querySelector('.fusion-top')) return;
    var bar = document.createElement('div');
    bar.className = 'fusion-top';
    bar.innerHTML =
      '<span class="ft-mark">' + I.layers + '</span>' +
      '<span class="ft-brand">单词精灵岛<span class="ft-sub">融合版 · 全量词库</span></span>' +
      '<span class="ft-nav">' +
      '<a class="ft-btn accent" href="card.html" title="3D 翻卡 / 生词本 / 听写">' + I.cards + ' 单词记忆卡</a>' +
      '<a class="ft-btn" href="../../index.html" target="_top" title="返回教师工具箱">' + I.home + ' 工具箱</a>' +
      '</span>';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function mountSpeakNote() {
    if (document.getElementById('speakNote')) return;
    var n = document.createElement('div');
    n.id = 'speakNote';
    n.className = 'speak-note';
    n.hidden = true;
    document.body.appendChild(n);
  }

  function init() {
    mountTopbar();
    mountSpeakNote();
    var view = document.getElementById('view');
    var tabbar = document.getElementById('tabbar');
    swapIcons(view);
    swapIcons(tabbar);

    var busy = false;
    try {
      var mo = new MutationObserver(function () {
        if (busy) return;
        busy = true;
        try {
          swapIcons(document.getElementById('view'));
          swapIcons(document.getElementById('tabbar'));
        } finally { busy = false; }
      });
      var opt = { childList: true, subtree: true, characterData: true };
      if (view) mo.observe(view, opt);
      if (tabbar) mo.observe(tabbar, opt);
    } catch (e) { /* 老浏览器退化为首次替换 */ }

    /* 自检信息（供无头浏览器验证，不影响正常使用） */
    window.FUSION = {
      ok: !!window.WI && !!window.App && !!window.Speak,
      routes: window.PAGES ? Object.keys(window.PAGES) : [],
      speak: function () { return window.Speak ? window.Speak.status() : null; },
      swapIcons: swapIcons,
      quizCheck: function () {
        try {
          var L = window.WI.store.levels();
          var l = L[0];
          var made = window.WI.quiz.makeQuiz(l.words, window.WI.quiz.allWords());
          return { book: l.book, unit: l.unit, words: l.words.length, questions: made.qs.length };
        } catch (e) { return { error: String(e) }; }
      }
    };
    document.body.setAttribute('data-fusion', window.FUSION.ok ? 'ready' : 'partial');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
