/* 渲染引擎：只负责「把数据变成 HTML」和朗读，不持有状态
   状态与事件在 app.js */
(function () {
  'use strict';
  var F = window.FLASH;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(id) { return '<svg aria-hidden="true"><use href="#i-' + id + '"></use></svg>'; }
  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = r[i]; r[i] = r[j]; r[j] = t; }
    return r;
  }
  function word(idx) { return F.flat[idx] || ['', 0, '', '', '', '', 0]; }
  function labelOf(idx) {
    var f = word(idx), b = F.books[f[0]];
    return (b ? b.name : '') + ' · ' + (b && b.units[f[1]] ? b.units[f[1]].title : '');
  }
  function tipWord(w) {
    return '<span class="tip-word" data-word="' + esc(w.toLowerCase()) + '">' + esc(w) + '</span>';
  }

  /* ---------- 朗读：统一走 js/audio-fix.js 的三级音源 ----------
     有道美音 → 百度 TTS → 浏览器语音（en-US，语速 0.72），
     解决部分浏览器 speechSynthesis 静默失败导致「点了没声音」。 */
  function speak(text, rate) {
    if (window.Speak) { window.Speak(text); return; }
    /* 兜底：audio-fix.js 未加载时仍保留浏览器语音 */
    if (!('speechSynthesis' in window)) { window.Toast && window.Toast('当前浏览器不支持朗读'); return; }
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'en-US'; u.rate = rate || 0.72; u.pitch = 1;
      var vs = window.speechSynthesis.getVoices() || [];
      var v = vs.filter(function (x) { return /en[-_]US/i.test(x.lang); })[0] ||
              vs.filter(function (x) { return /^en/i.test(x.lang); })[0];
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) { /* 某些浏览器禁用了语音，静默降级 */ }
  }

  /* ---------- 卡片正面：分段着色 + 藏词放大 + 词义特效 ---------- */
  function frontHtml(idx, seen) {
    var f = word(idx), w = f[2], ph = f[4];
    var segs = F.seg[idx] || [w];
    var hidden = (F.hid[idx] || []).map(function (h) { return h[0]; });
    var fx = F.fx[idx];
    var colorMode = fx && fx[0] === 'color';
    var cls = 'word-main' + (fx && fx[0] === 'size' ? ' fx-' + fx[1] : '');
    var style = colorMode ? ' style="color:' + fx[1] + '"' : '';
    var parts = segs.map(function (s, i) {
      var isHidden = hidden.indexOf(s.toLowerCase()) >= 0;
      var c = 'word-seg seg-' + (i % 6) + (isHidden ? ' seg-hidden' : '');
      var st = colorMode ? ' style="color:inherit;border-color:inherit"' : '';
      return '<span class="' + c + '"' + st + '>' + esc(s) + '</span>';
    }).join('');
    return {
      tag: labelOf(idx),
      seen: seen > 1 ? '第 ' + seen + ' 次出现' : '',
      word: '<div class="' + cls + '"' + style + '>' + parts + '</div>',
      phonetic: ph ? '/ ' + esc(ph) + ' /' : '音标待补 · 点喇叭跟读'
    };
  }

  /* ---------- 记忆窍门：全部由数据规则算出，不手写单词 ---------- */
  function diffHtml(a, b, pos) {
    function mark(s) {
      return esc(s.slice(0, pos)) + '<em>' + esc(s.charAt(pos)) + '</em>' + esc(s.slice(pos + 1));
    }
    return mark(a) + ' / ' + mark(b);
  }
  function tipsHtml(idx) {
    var f = word(idx), w = f[2], lw = w.toLowerCase(), out = [];

    // 1. 藏词：把词里藏着的那部分换色放大（同类只取最有代表性的一条）
    (F.hid[idx] || []).slice(0, 1).forEach(function (h) {
      var sub = h[0], st = h[1], len = h[2];
      var shown = esc(w.slice(0, st)) + '<em>' + esc(w.slice(st, st + len)) + '</em>' + esc(w.slice(st + len));
      out.push('<div class="tip tip-hidden"><span class="tip-title">藏词</span>' + shown +
        ' 里藏着课本里的 ' + tipWord(sub) + '，把熟悉的小词放大看，长词就不长了。</div>');
    });

    // 2. 拼读家族：按字母组合 + 音标归成一家
    (F.fam[idx] || []).slice(0, 1).forEach(function (k) {
      var meta = (F.phon || []).filter(function (p) { return p.k === k; })[0] || { tip: k + ' 组合' };
      var mates = (F.famMembers[k] || []).filter(function (m) { return m !== lw; }).slice(0, 5);
      if (!mates.length) return;
      out.push('<div class="tip"><span class="tip-title">拼读家族</span><b>' + esc(k) +
        '</b> 一家：' + mates.map(tipWord).join('、') + '。' + esc(meta.tip) + '</div>');
    });

    // 3. 别搞混：只差一个字母，差异字母标红
    (F.con[idx] || []).slice(0, 1).forEach(function (c) {
      out.push('<div class="tip tip-diff"><span class="tip-title">别搞混</span>' +
        diffHtml(w, c[0], c[1]) + ' 只差第 ' + (c[1] + 1) + ' 个字母，' + tipWord(c[0]) + ' 要分清。</div>');
    });

    // 4. 形状窍门（少数像图画的词）
    if (F.shape[idx]) out.push('<div class="tip"><span class="tip-title">形状窍门</span>' + esc(F.shape[idx]) + '</div>');

    if (!out.length) out.push('<div class="tip"><span class="tip-title">记忆窍门</span>按 ' +
      esc((F.seg[idx] || [w]).join(' · ')) + ' 分段读，一段一段记更牢。</div>');
    return out.join('');
  }

  function backHtml(idx) {
    var f = word(idx), ex = F.ex[idx] || ['', 0];
    return {
      tag: labelOf(idx),
      w: f[2],
      meaning: esc(f[3] || '（暂无释义）') + (f[5] ? ' <span style="font-size:12px;color:#7ba48d">[' + esc(f[5]) + ']</span>' : ''),
      example: '<span class="ex-label">' + (ex[1] ? '课本语境例句' : '例句') + '</span>' + esc(ex[0]),
      tips: tipsHtml(idx)
    };
  }

  /* ---------- 串起来看：按主题分组画关系图 ---------- */
  var COLOR_MAP = { red: '#d94b45', green: '#2f9e60', blue: '#3b78c3', yellow: '#d9a51c', black: '#22292b', white: '#e8f0eb', orange: '#e07b2d', pink: '#dd719b', purple: '#8355b4', brown: '#8b6242', grey: '#7d8a8c', gray: '#7d8a8c', gold: '#c9a227', silver: '#9aa7ad' };
  function nodeHtml(idx) {
    var f = word(idx);
    return '<div class="map-node" data-idx="' + idx + '">' + esc(f[2]) + '<small>' + esc(String(f[3]).slice(0, 12)) + '</small></div>';
  }
  var NUM_ORDER = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'zero'];
  var WEEK_MONTH = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function lineRank(w, groupName) {
    var arr = groupName === '数字' ? NUM_ORDER : (groupName === '星期月份' ? WEEK_MONTH : []);
    var i = arr.indexOf(String(w).toLowerCase());
    return i < 0 ? 999 : i;
  }
  function mapHtml(bookIdx, unitIdx) {
    var groups = F.theme['u' + bookIdx + '_' + unitIdx] || [];
    if (!groups.length) return '<div class="empty-state">这个单元暂时没有可分组的主题词。</div>';
    return groups.map(function (g) {
      var name = g[0], kind = g[1], ids = g[2], body;
      if (kind === 'tree') {
        body = '<div class="map-tree"><div class="root-node">' + esc(name) + '</div><div class="branch">' +
          ids.map(nodeHtml).join('') + '</div></div>';
      } else if (kind === 'swatch') {
        body = '<div class="map-swatch">' + ids.map(function (i) {
          var w = word(i)[2].toLowerCase(), c = COLOR_MAP[w] || '#3c8c62';
          var light = ['white', 'silver', 'yellow', 'gold'].indexOf(w) >= 0;
          return '<div class="swatch-item" data-idx="' + i + '" style="background:' + c + ';color:' +
            (light ? '#163a2a' : '#ffffff') + ';text-shadow:' + (light ? 'none' : '0 1px 3px rgba(0,0,0,.5)') +
            '">' + esc(word(i)[2]) + '</div>';
        }).join('') + '</div>';
      } else if (kind === 'line') {
        var ordered = ids.slice().sort(function (a, b) {
          return lineRank(word(a)[2], name) - lineRank(word(b)[2], name);
        });
        body = '<div class="map-line">' + ordered.map(function (i, k) {
          return (k ? '<span class="line-arrow">→</span>' : '') + nodeHtml(i);
        }).join('') + '</div>';
      } else {
        body = '<div class="map-grid">' + ids.map(nodeHtml).join('') + '</div>';
      }
      return '<div class="map-group"><div class="map-title">' + esc(name) + ' · ' + ids.length + ' 词</div>' + body + '</div>';
    }).join('');
  }

  window.Engine = {
    esc: esc, icon: icon, shuffle: shuffle, word: word, labelOf: labelOf,
    speak: speak, frontHtml: frontHtml, backHtml: backHtml, mapHtml: mapHtml, tipWord: tipWord
  };
})();
