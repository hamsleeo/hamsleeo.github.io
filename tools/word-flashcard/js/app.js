/* 单词记忆卡 · 交互与状态
   数据：data/flash-data.js   渲染：js/engine.js
   所有进度 / 生词本存在 localStorage，刷新不丢失；不使用 alert / confirm */
(function () {
  'use strict';
  var F = window.FLASH, E = window.Engine;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return E.esc(s); }
  var LS_KEY = 'wordFlashcard.v1';

  /* ---------------- 持久化 ---------------- */
  var save = { fav: {}, mastered: {}, star: {}, last: { book: 0, unit: 0 }, spriteSeen: 0 };
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) {
      var p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        save.fav = p.fav || {}; save.mastered = p.mastered || {};
        save.star = p.star || {}; save.last = p.last || save.last;
        save.spriteSeen = p.spriteSeen || 0;
      }
    }
  } catch (e) { /* 隐私模式下 localStorage 不可用，退化为内存态 */ }
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(save)); } catch (e) { }
  }

  var state = {
    book: 0, unit: 0,
    queue: [], qpos: 0, current: null, flipped: false,
    seen: {}, modal: null, dict: null, quest: null, review: null
  };

  /* ---------------- 通用 UI ---------------- */
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2200);
  }
  window.Toast = toast;

  function openModal(opt) {
    state.modal = opt || null;
    $('modalRoot').innerHTML =
      '<div class="modal-mask"><div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><div><h2>' + esc(opt.title) + '</h2>' +
          (opt.sub ? '<div class="sub">' + esc(opt.sub) + '</div>' : '') + '</div>' +
          '<button class="icon-btn" data-act="close" aria-label="关闭">' + E.icon('close') + '</button></div>' +
        '<div class="modal-body" id="modalBody">' + (opt.body || '') + '</div>' +
        (opt.foot ? '<div class="modal-foot" id="modalFoot">' + opt.foot + '</div>' : '') +
      '</div></div>';
    if (opt.onMount) opt.onMount($('modalRoot'));
  }
  function closeModal() { $('modalRoot').innerHTML = ''; state.modal = null; state.dict = null; state.quest = null; state.review = null; }
  function setBody(html) { var b = $('modalBody'); if (b) b.innerHTML = html; }
  function setFoot(html) { var f = $('modalFoot'); if (f) f.innerHTML = html; }

  $('modalRoot').addEventListener('click', function (ev) {
    if (ev.target.classList.contains('modal-mask')) { closeModal(); return; }
    var jump = ev.target.closest('[data-word]');
    if (jump) { closeModal(); jumpToWord(jump.getAttribute('data-word')); return; }
    var node = ev.target.closest('[data-idx]');
    if (node) { closeModal(); jumpToIdx(parseInt(node.getAttribute('data-idx'), 10)); return; }
    var act = ev.target.closest('[data-act]');
    if (!act) return;
    dispatch(act.getAttribute('data-act'), act);
  });
  $('modalRoot').addEventListener('submit', function (ev) {
    if (ev.target.id === 'dictForm') { ev.preventDefault(); submitDict(); }
  });

  /* ---------------- 范围与进度 ---------------- */
  function scopeKey() {
    if (state.book < 0) return 'all';
    return 'b' + state.book + (state.unit < 0 ? '' : 'u' + state.unit);
  }
  function scopeIds() {
    if (state.book < 0) { var all = []; for (var i = 0; i < F.flat.length; i++) all.push(i); return all; }
    var b = F.books[state.book];
    if (!b) return [];
    if (state.unit < 0) { var r = []; b.units.forEach(function (u) { r = r.concat(u.ids); }); return r; }
    return (b.units[state.unit] || { ids: [] }).ids.slice();
  }
  function scopeName() {
    if (state.book < 0) return '全部词库';
    var b = F.books[state.book];
    if (state.unit < 0) return b.name + ' · 整册';
    return b.name + ' · ' + (b.units[state.unit] || {}).title;
  }
  function masteredList() { return save.mastered[scopeKey()] || (save.mastered[scopeKey()] = []); }
  function totalStars() { var n = 0; Object.keys(save.star).forEach(function (k) { n += save.star[k] || 0; }); return n; }
  function totalMastered() { var n = 0; Object.keys(save.mastered).forEach(function (k) { n += (save.mastered[k] || []).length; }); return n; }

  function updateProgress() {
    var ids = scopeIds(), done = masteredList().filter(function (i) { return ids.indexOf(i) >= 0; }).length;
    $('scopeName').textContent = scopeName();
    $('progressText').textContent = '已记住 ' + done + ' / ' + ids.length;
    $('progressFill').style.width = (ids.length ? done / ids.length * 100 : 0) + '%';
    $('statMastered').textContent = totalMastered();
    $('statFav').textContent = Object.keys(save.fav).length;
    $('statSprite').textContent = unlockedSprites();
    $('libCount').textContent = F.meta.words + ' 词 / ' + F.meta.books + ' 册 / ' + F.meta.units + ' 单元';
    $('scopeNote').textContent = state.book < 0
      ? '当前是全部 ' + F.meta.words + ' 词，卡片随机抽，进度按全库统计。'
      : (state.unit < 0 ? '整册共 ' + ids.length + ' 词，逐张刷完可再刷一遍。' : '本单元共 ' + ids.length + ' 词，记完会出现庆祝与听写入口。');
  }

  function renderChips() {
    var bh = '<button class="chip all' + (state.book < 0 ? ' on' : '') + '" data-book="-1">全部词库</button>';
    F.books.forEach(function (b, i) {
      bh += '<button class="chip' + (b.extra ? ' extra' : '') + (state.book === i ? ' on' : '') +
        '" data-book="' + i + '" title="' + esc(b.name + ' · ' + b.edition) + '">' + esc(b.name) + '</button>';
    });
    $('bookChips').innerHTML = bh;

    var uh = '';
    if (state.book >= 0) {
      var b = F.books[state.book];
      uh += '<button class="chip' + (state.unit < 0 ? ' on' : '') + '" data-unit="-1">整册</button>';
      b.units.forEach(function (u, i) {
        uh += '<button class="chip' + (state.unit === i ? ' on' : '') + '" data-unit="' + i + '">' + esc(u.title) + '</button>';
      });
    } else {
      uh = '<span class="chip" style="cursor:default">先选一册，再按单元筛选</span>';
    }
    $('unitChips').innerHTML = uh;
  }

  /* ---------------- 队列与卡片 ---------------- */
  function newRound(clearMastered) {
    if (clearMastered) { save.mastered[scopeKey()] = []; persist(); }
    var done = masteredList(), ids = scopeIds().filter(function (i) { return done.indexOf(i) < 0; });
    state.queue = E.shuffle(ids);
    state.qpos = 0; state.seen = {};
    if (!state.queue.length) { updateProgress(); renderChips(); openCelebrate(); return; }
    renderAt(0);
    updateProgress(); renderChips();
  }
  function renderAt(pos) {
    if (pos >= state.queue.length) pos = 0;
    if (!state.queue.length) { openCelebrate(); return; }
    state.qpos = Math.max(0, pos);
    state.current = state.queue[state.qpos];
    state.flipped = false;
    state.seen[state.current] = (state.seen[state.current] || 0) + 1;
    paint();
  }
  function paint() {
    var idx = state.current;
    if (idx == null) return;
    var front = E.frontHtml(idx, state.seen[idx] || 1), back = E.backHtml(idx);
    $('cardTag').textContent = front.tag;
    $('cardSeen').textContent = front.seen;
    $('wordWrap').innerHTML = front.word;
    $('phonetic').innerHTML = front.phonetic;
    $('phonetic').className = 'phonetic' + (F.flat[idx][4] ? '' : ' empty');
    $('backTag').textContent = back.tag;
    $('backWord').textContent = back.w;
    $('meaning').innerHTML = back.meaning;
    $('example').innerHTML = back.example;
    $('tips').innerHTML = back.tips;
    $('backWord').style.color = (F.fx[idx] && F.fx[idx][0] === 'color') ? F.fx[idx][1] : '';
    $('flashcard').classList.remove('flipped');
    $('judgeRow').hidden = true;
    $('btnFav').classList.toggle('on', !!save.fav[idx]);
    $('btnFav').setAttribute('title', save.fav[idx] ? '从生词本移除' : '加入生词本');
    // 背面窍门条数不一，卡片高度随内容自适应，避免内容被裁切
    var backEl = document.querySelector('.card-back');
    var minH = window.innerWidth <= 760 ? 400 : 430;
    var fc = $('flashcard');
    fc.style.height = minH + 'px';                 // 先回到基准高度再量，避免逐张累加
    fc.style.height = Math.max(minH, backEl.scrollHeight + 8) + 'px';
  }
  function flip(force) {
    state.flipped = force === undefined ? !state.flipped : !!force;
    $('flashcard').classList.toggle('flipped', state.flipped);
    $('judgeRow').hidden = !state.flipped;
  }
  function jumpToWord(w) {
    var idx = F.byWord[String(w).toLowerCase()];
    if (idx === undefined) { toast('词库里没有找到「' + w + '」'); return; }
    jumpToIdx(idx);
  }
  function jumpToIdx(idx) {
    if (!F.flat[idx]) return;
    state.queue.splice(state.qpos, 0, idx);   // 插到当前位置，保证「记住/没记住」仍作用于它
    renderAt(state.qpos);
    toast('已跳到 ' + F.flat[idx][2]);
  }
  function addFav(idx, silent) {
    if (!save.fav[idx]) { save.fav[idx] = { streak: 0 }; persist(); if (!silent) toast('已加入生词本'); }
    $('btnFav').classList.add('on');
    $('btnFav').setAttribute('title', '从生词本移除');
    updateProgress();
  }
  function removeFav(idx, silent) {
    delete save.fav[idx]; persist();
    if (state.current === idx) { $('btnFav').classList.remove('on'); $('btnFav').setAttribute('title', '加入生词本'); }
    if (!silent) toast('已从生词本移除');
    updateProgress();
  }
  function judge(known) {
    var idx = state.current;
    if (idx == null) return;
    if (known) {
      var list = masteredList();
      if (list.indexOf(idx) < 0) list.push(idx);
      persist();
      state.queue.splice(state.qpos, 1);
      if (!state.queue.length) { updateProgress(); openCelebrate(); return; }
      renderAt(Math.min(state.qpos, state.queue.length - 1));
    } else {
      addFav(idx, true);
      state.seen[idx] = (state.seen[idx] || 1) + 1;   // 复现时再 +1，显示「第 3 次出现」
      state.queue.splice(state.qpos, 1);
      var at = state.qpos + 3;                        // 隔 3 张卡后再出现一次
      if (at > state.queue.length) state.queue.push(idx); else state.queue.splice(at, 0, idx);
      if (!state.queue.length) state.queue.push(idx);
      toast('已加入生词本，隔 3 张卡再考你一次');
      renderAt(Math.min(state.qpos, state.queue.length - 1));
    }
    updateProgress();
  }
  function nextRandom() {
    var ids = state.queue.length ? state.queue : scopeIds();
    if (!ids.length) { openCelebrate(); return; }
    var pick = ids[Math.floor(Math.random() * ids.length)];
    var pos = state.queue.indexOf(pick);
    if (pos < 0) { state.queue.splice(state.qpos, 0, pick); pos = state.qpos; }
    renderAt(pos);
  }

  /* ---------------- 生词本 ---------------- */
  function favRows() {
    var ids = Object.keys(save.fav).map(Number).sort(function (a, b) { return a - b; });
    if (!ids.length) return '<div class="empty-state">生词本还是空的。<br>点卡片右上角的爱心，或点「没记住」，单词会自动收进来。</div>';
    return ids.map(function (i) {
      var f = F.flat[i], st = save.fav[i].streak || 0;
      var dots = [0, 1, 2].map(function (k) { return '<span class="dot' + (k < st ? ' on' : '') + '"></span>'; }).join('');
      return '<div class="fav-item"><div><div class="fav-word">' + esc(f[2]) + '</div>' +
        '<div class="fav-ph">' + esc(f[4] ? '/ ' + f[4] + ' /' : '') + '</div></div>' +
        '<div class="fav-mean">' + esc(String(f[3]).slice(0, 26)) + '</div>' +
        '<div class="dots" title="连续拼对 ' + st + ' 次">' + dots + '</div>' +
        '<button class="mini-btn" data-act="fav-speak" data-i="' + i + '">' + E.icon('volume') + '</button>' +
        '<button class="mini-btn danger" data-act="fav-remove" data-i="' + i + '">移除</button></div>';
    }).join('');
  }
  function openFavList() {
    openModal({
      title: '生词本', sub: '共 ' + Object.keys(save.fav).length + ' 个词 · 连续拼对 3 次自动移出',
      body: '<div id="favList">' + favRows() + '</div>',
      foot: '<button class="mini-btn accent" data-act="dict-fav"' + (Object.keys(save.fav).length ? '' : ' disabled') + '>' +
        E.icon('pencil') + ' 听写生词本</button><button class="mini-btn" data-act="close">关闭</button>'
    });
  }
  function refreshFavList() {
    var l = $('favList'); if (l) l.innerHTML = favRows();
    var m = $('modalRoot').querySelector('.sub'); if (m) m.textContent = '共 ' + Object.keys(save.fav).length + ' 个词 · 连续拼对 3 次自动移出';
    updateProgress();
  }

  /* ---------------- 听写 ---------------- */
  function openDictation(mode) {
    var pool = mode === 'fav'
      ? Object.keys(save.fav).map(Number)
      : scopeIds();
    if (!pool.length) { toast('这个范围里没有可听写的词'); return; }
    var ids = E.shuffle(pool).slice(0, 10);
    state.dict = { ids: ids, pos: 0, score: [], mode: mode, checked: false };
    openModal({
      title: mode === 'fav' ? '听写生词本' : '开始听写',
      sub: '每题自动读单词并显示中文，拼错会自动进生词本',
      body: '<div id="dictArea"></div>',
      foot: '<button class="mini-btn" data-act="close">结束</button>',
      onMount: renderDictQuestion
    });
  }
  function renderDictQuestion() {
    var d = state.dict; if (!d) return;
    if (d.pos >= d.ids.length) { finishDict(); return; }
    d.checked = false;
    var idx = d.ids[d.pos], f = F.flat[idx];
    var ticks = d.ids.map(function (_, k) {
      return '<span class="dict-tick' + (d.score[k] === 1 ? ' ok' : d.score[k] === 0 ? ' bad' : '') + (k === d.pos ? ' cur' : '') + '"></span>';
    }).join('');
    setBody('<div id="dictArea">' +
      '<div class="dict-head"><span>第 ' + (d.pos + 1) + ' / ' + d.ids.length + ' 题</span><span>' + (d.mode === 'fav' ? '生词本' : scopeName()) + '</span></div>' +
      '<div class="dict-score">' + ticks + '</div>' +
      '<div class="dict-mean">' + esc(f[3] || '（暂无释义）') + '</div>' +
      '<div style="text-align:center;margin-bottom:14px"><button class="mini-btn" data-act="dict-speak">' + E.icon('volume') + ' 再听一遍</button></div>' +
      '<form id="dictForm"><input class="dict-input" id="dictInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="在这里拼写单词"></form>' +
      '<div id="dictResult"></div></div>');
    setFoot('<button class="mini-btn accent" data-act="dict-submit">提交</button><button class="mini-btn" data-act="dict-next">跳过</button><button class="mini-btn" data-act="close">结束</button>');
    var inp = $('dictInput'); if (inp) inp.focus();
    E.speak(f[2]);
  }
  function checkDict(skip) {
    var d = state.dict; if (!d || d.checked) return;
    d.checked = true;
    var idx = d.ids[d.pos], f = F.flat[idx];
    var val = skip ? '' : ($('dictInput') ? $('dictInput').value : '').trim().toLowerCase().replace(/\s+/g, ' ');
    var ok = !skip && val === String(f[2]).toLowerCase().trim();
    d.score[d.pos] = ok ? 1 : 0;
    if (ok) {
      if (d.mode === 'fav' && save.fav[idx]) {
        save.fav[idx].streak = (save.fav[idx].streak || 0) + 1;
        persist();
        if (save.fav[idx].streak >= 3) {
          removeFav(idx, true);
          $('dictResult').innerHTML = '<div class="dict-result ok">' + E.icon('check') + ' 拼对了！连续 3 次全对，<strong>' + esc(f[2]) + '</strong> 已自动移出生词本。</div>';
        } else {
          $('dictResult').innerHTML = '<div class="dict-result ok">' + E.icon('check') + ' 拼对了！正确拼写 <strong>' + esc(f[2]) + '</strong>，连续 ' + save.fav[idx].streak + ' / 3 次。</div>';
        }
      } else {
        $('dictResult').innerHTML = '<div class="dict-result ok">' + E.icon('check') + ' 拼对了！正确拼写 <strong>' + esc(f[2]) + '</strong>。</div>';
      }
    } else {
      addFav(idx, true);
      $('dictResult').innerHTML = '<div class="dict-result bad">' + E.icon('x') + (skip ? '已跳过。' : '拼错了。') +
        ' 正确拼写是 <strong>' + esc(f[2]) + '</strong>' + (f[4] ? ' / ' + esc(f[4]) + ' /' : '') + '，已加入生词本。</div>';
    }
    setFoot('<button class="mini-btn accent" data-act="dict-next">' + (d.pos + 1 >= d.ids.length ? '查看结果' : '下一题') + '</button><button class="mini-btn" data-act="close">结束</button>');
    updateProgress();
  }
  function submitDict() { checkDict(false); }
  function nextDictQuestion() {
    var d = state.dict; if (!d) return;
    if (!d.checked) checkDict(true);
    d.pos++;
    renderDictQuestion();
  }
  function finishDict() {
    var d = state.dict; if (!d) return;
    var right = d.score.filter(function (x) { return x === 1; }).length;
    setBody('<div class="celebrate"><div class="ring">' + E.icon('trophy') + '</div>' +
      '<h3>听写完成</h3><p>共 ' + d.ids.length + ' 题，拼对 ' + right + ' 题</p>' +
      '<p>' + (right === d.ids.length ? '全对，这一组可以毕业了。' : '拼错的词已经收进生词本，隔天再练一轮。') + '</p></div>');
    setFoot('<button class="mini-btn accent" data-act="dict-again">再来一轮</button><button class="mini-btn" data-act="fav-open">查看生词本</button><button class="mini-btn" data-act="close">关闭</button>');
    state.dict = null;
  }

  /* ---------------- 庆祝 ---------------- */
  function openCelebrate() {
    var ids = scopeIds();
    openModal({
      title: '本单元全部记住', sub: scopeName() + ' · ' + ids.length + ' 词',
      body: '<div class="celebrate"><div class="ring">' + E.icon('star') + '</div>' +
        '<h3>这一组单词毕业了</h3><p>已记住 ' + ids.length + ' / ' + ids.length + ' 词</p>' +
        '<p>可以再刷一遍巩固，也可以直接听写检验拼写。</p></div>',
      foot: '<button class="mini-btn accent" data-act="again">再刷一遍</button>' +
        '<button class="mini-btn" data-act="dict-unit">听写本单元</button>' +
        '<button class="mini-btn" data-act="close">关闭</button>'
    });
  }

  /* ---------------- 串起来看 ---------------- */
  function openMap() {
    var html;
    if (state.book < 0) html = '<div class="empty-state">先选一册和一个单元，关系图按单元主题生成。</div>';
    else if (state.unit >= 0) html = E.mapHtml(state.book, state.unit);
    else {
      html = F.books[state.book].units.map(function (u, i) {
        return '<div class="map-group"><div class="map-title">' + esc(u.title) + '</div>' + E.mapHtml(state.book, i) + '</div>';
      }).join('');
    }
    openModal({ title: '串起来看', sub: scopeName() + ' · 点任意单词直接跳到那张卡', body: html, foot: '<button class="mini-btn" data-act="close">关闭</button>' });
  }

  /* ---------------- 原版玩法：闯关 ---------------- */
  function openQuest() {
    var pool = scopeIds();
    if (pool.length < 4) { toast('这个范围词太少，换一个单元再闯关'); return; }
    var ids = E.shuffle(pool).slice(0, 5);
    state.quest = { ids: ids, pos: 0, right: 0, locked: false };
    openModal({ title: '单元闯关', sub: scopeName() + ' · 5 题 · 答对得星', body: '<div id="questArea"></div>',
      foot: '<button class="mini-btn" data-act="close">退出闯关</button>', onMount: renderQuest });
  }
  function renderQuest() {
    var q = state.quest; if (!q) return;
    if (q.pos >= q.ids.length) {
      var stars = q.right >= 5 ? 3 : q.right >= 4 ? 2 : q.right >= 3 ? 1 : 0;
      var old = save.star[scopeKey()] || 0;
      if (stars > old) { save.star[scopeKey()] = stars; persist(); }
      var st = [0, 1, 2].map(function (k) { return E.icon('star').replace('<svg', '<svg class="' + (k < stars ? 'on' : '') + '"'); }).join('');
      setBody('<div class="celebrate"><div class="ring">' + E.icon('trophy') + '</div><h3>闯关结束</h3>' +
        '<div class="quest-progress">' + st + '</div><p>答对 ' + q.right + ' / ' + q.ids.length + ' 题，本单元 ' + Math.max(old, stars) + ' 星</p>' +
        '<p>累计 ' + totalStars() + ' 星，可解锁更多精灵图鉴。</p></div>');
      setFoot('<button class="mini-btn accent" data-act="quest-again">再闯一次</button><button class="mini-btn" data-act="codex-open">精灵图鉴</button><button class="mini-btn" data-act="close">关闭</button>');
      updateProgress();
      return;
    }
    var idx = q.ids[q.pos], f = F.flat[idx];
    var opts = [idx];
    var pool = scopeIds().filter(function (i) { return i !== idx; });
    while (opts.length < 4 && pool.length) {
      var pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      if (opts.indexOf(pick) < 0) opts.push(pick);
    }
    opts = E.shuffle(opts);
    setBody('<div id="questArea">' +
      '<div class="dict-head"><span>第 ' + (q.pos + 1) + ' / ' + q.ids.length + ' 关</span><span>已答对 ' + q.right + ' 题</span></div>' +
      '<div class="quest-q">' + esc(f[2]) + ' 的意思是？</div>' +
      '<div class="opt-list">' + opts.map(function (i) {
        return '<button class="opt" data-act="quest-answer" data-i="' + i + '">' + esc(String(F.flat[i][3]).slice(0, 24)) + '</button>';
      }).join('') + '</div><div id="questResult" style="margin-top:14px"></div></div>');
  }
  function answerQuest(chosen, btn) {
    var q = state.quest; if (!q || q.locked) return;
    q.locked = true;
    var right = chosen === q.ids[q.pos];
    if (right) q.right++;
    var all = $('modalRoot').querySelectorAll('.opt');
    for (var i = 0; i < all.length; i++) {
      if (parseInt(all[i].getAttribute('data-i'), 10) === q.ids[q.pos]) all[i].classList.add('right');
    }
    if (!right) btn.classList.add('wrong');
    $('questResult').innerHTML = '<div class="dict-result ' + (right ? 'ok' : 'bad') + '">' +
      (right ? E.icon('check') + ' 答对了' : E.icon('x') + ' 答错了，正确答案已标绿') + '：' + esc(F.flat[q.ids[q.pos]][2]) + '</div>';
    setFoot('<button class="mini-btn accent" data-act="quest-next">' + (q.pos + 1 >= q.ids.length ? '查看结算' : '下一关') + '</button><button class="mini-btn" data-act="close">退出闯关</button>');
  }

  /* ---------------- 原版玩法：精灵图鉴 ---------------- */
  var SPRITES = ['芽芽', '叶灵', '露珠', '风铃', '苔藓', '松果', '萤火', '溪语', '云朵', '星尘', '月桂', '山岚'];
  var SPRITE_COLORS = ['#64e6a2', '#7fd0a8', '#7cc4ff', '#a8d8ff', '#b7e07a', '#e3b45c', '#f2d472', '#7fd8d0', '#b9c9ff', '#d8a8ff', '#f0b8d0', '#9fe6c0'];
  function unlockedSprites() {
    var s = totalStars(), n = 0;
    while (n < SPRITES.length && s >= (n + 1) * 3) n++;
    if (n < SPRITES.length && totalMastered() >= (n + 1) * 12) n++;
    return n;
  }
  function spriteSvg(i) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<circle cx="32" cy="34" r="21"/>' +
      '<path d="M18 16 l7 8 M46 16 l-7 8"/>' +
      '<circle cx="25" cy="31" r="2.4" style="fill:currentColor"/>' +
      '<circle cx="39" cy="31" r="2.4" style="fill:currentColor"/>' +
      '<path d="M25 42 q7 6 14 0"/>' +
      (i % 3 === 0 ? '<path d="M32 11 v5"/>' : '') + '</svg>';
  }
  function openCodex() {
    var un = unlockedSprites();
    var html = '<div class="codex-grid">' + SPRITES.map(function (nm, i) {
      var lock = i >= un;
      return '<div class="codex-cell' + (lock ? ' locked' : '') + '" style="color:' + SPRITE_COLORS[i] + '">' +
        spriteSvg(i) + '<div class="nm">' + esc(nm) + '</div>' +
        '<div class="need">' + (lock ? '需 ' + ((i + 1) * 3) + ' 星' : '已解锁') + '</div></div>';
    }).join('') + '</div>';
    openModal({ title: '精灵图鉴', sub: '累计 ' + totalStars() + ' 星 · 已解锁 ' + un + ' / ' + SPRITES.length + ' 只精灵',
      body: html + '<p style="font-size:12px;color:var(--ink-3);margin-top:16px;line-height:1.7">闯关得星、闪卡记住单词都能解锁精灵。星数每满 3 星解锁一只；累计记住的词每满 12 个也能提前解锁一只。</p>',
      foot: '<button class="mini-btn accent" data-act="quest-open">去闯关</button><button class="mini-btn" data-act="close">关闭</button>' });
  }

  /* ---------------- 原版玩法：复习岛 ---------------- */
  function openReview() {
    var ids = Object.keys(save.fav).map(Number);
    if (!ids.length) { openModal({ title: '复习岛', body: '<div class="empty-state">生词本还是空的，先去刷几张卡吧。</div>', foot: '<button class="mini-btn" data-act="close">关闭</button>' }); return; }
    state.review = { ids: E.shuffle(ids), pos: 0, show: false };
    openModal({ title: '复习岛', sub: '共 ' + ids.length + ' 词 · 看中文想英文', body: '<div id="reviewArea"></div>',
      foot: '<button class="mini-btn" data-act="close">退出复习</button>', onMount: renderReview });
  }
  function renderReview() {
    var r = state.review; if (!r) return;
    if (r.pos >= r.ids.length) {
      setBody('<div class="celebrate"><div class="ring">' + E.icon('check') + '</div><h3>复习岛走完一圈</h3><p>想再练一轮，随时回来。</p></div>');
      setFoot('<button class="mini-btn accent" data-act="review-again">再走一圈</button><button class="mini-btn" data-act="close">关闭</button>');
      return;
    }
    var idx = r.ids[r.pos], f = F.flat[idx];
    setBody('<div id="reviewArea"><div class="dict-head"><span>第 ' + (r.pos + 1) + ' / ' + r.ids.length + ' 词</span><span>生词本复习</span></div>' +
      '<div class="review-mean">' + esc(f[3] || '') + '</div>' +
      '<div class="review-word">' + (r.show ? esc(f[2]) : '· · · · ·') + '</div>' +
      '<div style="text-align:center;font-size:13px;color:var(--ink-3)">' + (r.show ? esc(f[4] ? '/ ' + f[4] + ' /' : '') + ' · ' + esc(F.ex[idx][0]) : '先在心里拼一遍，再点「看答案」') + '</div></div>');
    setFoot(r.show
      ? '<button class="mini-btn accent" data-act="review-know">记住了</button><button class="mini-btn" data-act="review-next">再练一次</button><button class="mini-btn" data-act="close">退出</button>'
      : '<button class="mini-btn accent" data-act="review-show">看答案</button><button class="mini-btn" data-act="review-speak">' + E.icon('volume') + ' 听读音</button><button class="mini-btn" data-act="close">退出</button>');
  }

  /* ---------------- 事件分发 ---------------- */
  function dispatch(act, el) {
    var i = el ? parseInt(el.getAttribute('data-i'), 10) : NaN;
    switch (act) {
      case 'close': closeModal(); break;
      case 'again': closeModal(); newRound(true); break;
      case 'dict-unit': closeModal(); openDictation('unit'); break;
      case 'dict-fav': closeModal(); openDictation('fav'); break;
      case 'fav-open': closeModal(); openFavList(); break;
      case 'fav-remove': removeFav(i); refreshFavList(); break;
      case 'fav-speak': E.speak(F.flat[i][2]); break;
      case 'dict-submit': submitDict(); break;
      case 'dict-next': nextDictQuestion(); break;
      case 'dict-speak': E.speak(F.flat[state.dict.ids[state.dict.pos]][2]); break;
      case 'dict-again': closeModal(); openDictation('unit'); break;
      case 'quest-open': closeModal(); openQuest(); break;
      case 'quest-again': closeModal(); openQuest(); break;
      case 'quest-answer': answerQuest(i, el); break;
      case 'quest-next': if (state.quest) { state.quest.pos++; state.quest.locked = false; renderQuest(); } break;
      case 'codex-open': closeModal(); openCodex(); break;
      case 'review-show': state.review.show = true; renderReview(); break;
      case 'review-speak': E.speak(F.flat[state.review.ids[state.review.pos]][2]); break;
      case 'review-know':
        var rid = state.review.ids[state.review.pos];
        var ml = masteredList(); if (ml.indexOf(rid) < 0) ml.push(rid);
        removeFav(rid, true); persist();
        state.review.pos++; state.review.show = false; renderReview(); updateProgress(); break;
      case 'review-next': state.review.pos++; state.review.show = false; renderReview(); break;
      case 'review-again': closeModal(); openReview(); break;
    }
  }

  /* ---------------- 页面绑定 ---------------- */
  $('bookChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-book]'); if (!b) return;
    state.book = parseInt(b.getAttribute('data-book'), 10);
    state.unit = state.book < 0 ? -1 : 0;
    save.last = { book: state.book, unit: state.unit }; persist();
    newRound(false);
  });
  $('unitChips').addEventListener('click', function (e) {
    var u = e.target.closest('[data-unit]'); if (!u) return;
    state.unit = parseInt(u.getAttribute('data-unit'), 10);
    save.last = { book: state.book, unit: state.unit }; persist();
    newRound(false);
  });
  $('flashcard').addEventListener('click', function (e) {
    if (e.target.closest('.corner-btn')) return;
    flip();
  });
  $('btnFlip').addEventListener('click', function () { flip(); });
  $('btnNext').addEventListener('click', nextRandom);
  $('btnFav').addEventListener('click', function (e) {
    e.stopPropagation();
    if (save.fav[state.current]) removeFav(state.current); else addFav(state.current);
  });
  $('btnSpeak').addEventListener('click', function (e) {
    e.stopPropagation(); E.speak(F.flat[state.current][2]);
  });
  $('btnFavList').addEventListener('click', openFavList);
  $('btnKnown').addEventListener('click', function () { judge(true); });
  $('btnForgot').addEventListener('click', function () { judge(false); });
  $('btnMap').addEventListener('click', openMap);
  $('btnDictation').addEventListener('click', function () { openDictation('unit'); });
  $('btnBack').addEventListener('click', function () {
    var home = new URL('../../index.html', location.href).href;
    try { if (window.top !== window) window.top.location.href = home; else location.href = home; }
    catch (e) { location.href = home; }
  });
  /* 融合版：legacy-bar 已改为「原版完整玩法」直达链接（<a href>），
     只有仍带 data-view 的按钮才走页内简化弹窗。 */
  Array.prototype.forEach.call(document.querySelectorAll('.legacy-btn[data-view]'), function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-view');
      Array.prototype.forEach.call(document.querySelectorAll('.legacy-btn'), function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      if (v === 'quest') openQuest(); else if (v === 'codex') openCodex(); else openReview();
      setTimeout(function () { b.classList.remove('on'); }, 600);
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    if (e.key === 'ArrowRight') nextRandom();
  });

  /* ---------------- 启动 ---------------- */
  if (save.last && typeof save.last.book === 'number') {
    state.book = Math.min(Math.max(-1, save.last.book), F.books.length - 1);
    state.unit = state.book < 0 ? -1 : Math.min(Math.max(-1, save.last.unit || 0), F.books[state.book].units.length - 1);
  }
  if (!('speechSynthesis' in window)) { /* 无 TTS 时喇叭按钮静默降级 */ }
  else { try { window.speechSynthesis.getVoices(); } catch (e) { } }
  newRound(false);

  // 供自检脚本驱动（本地工具，无副作用）
  window.__flashDebug = { jump: jumpToWord, state: state, save: save, newRound: newRound };
})();
