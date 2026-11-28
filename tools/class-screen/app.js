/* 班级班务大屏 · 交互逻辑 */
(function () {
  'use strict';
  var KEY = 'classScreenState_v1';
  var LAYOUT_KEY = 'classScreenLayoutLocal_v1'; // 本机布局覆盖：教室端拖拽的尺寸/位置优先于云端
  var CLOUD_SEEN_KEY = 'classScreenCloudLayoutSeen_v1'; // 已应用的云端布局版本；云端变新时强制采用云端
  var SNAPSHOT_KEY = 'classScreenLastGood_v1'; // 云端最后一次成功同步的整份数据快照（离线兜底用）
  var POLL_MS = 20000; // 大屏轮询间隔：5s→20s，云端请求量降到 1/4（节省资源点）
  var lastCloudOk = 0; // 上次云端同步成功时间戳；用于判断离线状态显示
  var screen = document.getElementById('screen');
  var grid = document.getElementById('dashboardGrid');
  var _modeParam = new URLSearchParams(location.search).get('mode');
  // layout = 教师端内嵌的布局预览/编辑模式：与大屏同款拖拽编辑器，
  // 但不轮询、不弹喊话、不显示桌面图标，编辑完成后通知父页面保存云端。
  var MODE = _modeParam === 'admin' ? 'admin' : (_modeParam === 'layout' ? 'layout' : 'display');
  var cloudReady = false;
  var remoteSession = null;
  var saveTimer = null;
  var SHOUT_SEEN_KEY = 'classScreenLastShout';
  var lastShoutId = '';
  var shoutTimers = { hide: null, tick: null };
  var state = loadState();
  var ui = {
    editing: false,
    hwSubject: 0,
    scoreMode: 'plus',
    selectedDim: '学习态度',
    selectedStudents: new Set(),
    drawer: null,
    snapshot: null,
    toastTimer: null
  };

  /* ---------------- 基础工具 ---------------- */
  function deepMerge(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    Object.keys(extra).forEach(function (k) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        deepMerge(base[k], extra[k]);
      } else if (extra[k] !== undefined) {
        base[k] = extra[k];
      }
    });
    return base;
  }
  // 老数据迁移：云端只有 schedule 没有 weeklySchedule 时，用它的课表填充周一~周五，
  // 避免展示端误用默认示范课表；同时保证新字段存在。
  function normalizeState(st) {
    if (!st.weeklySchedule || !Object.keys(st.weeklySchedule).length) {
      var seed = (st.schedule && st.schedule.length) ? st.schedule : [];
      var ws = {};
      for (var d = 1; d <= 7; d++) ws[d] = d <= 5 ? seed.slice() : [];
      st.weeklySchedule = ws;
    }
    if (!st.leaves) st.leaves = [];
    if (st.termStart == null) st.termStart = '';
    // 喊话样式：老数据补默认模板（背景色留空=用模板默认）
    if (!st.shoutStyle || typeof st.shoutStyle !== 'object') st.shoutStyle = { template: 'classic', bgColor: '' };
    if (!st.shoutStyle.template) st.shoutStyle.template = 'classic';
    if (st.shoutStyle.bgColor == null) st.shoutStyle.bgColor = '';
    // 布局版本号：老数据没有时按 0 处理，本机布局记录优先
    st.layoutVersion = +st.layoutVersion || 0;
    // 自由布局：老数据没有 panelRects 时用默认矩形补齐每个模块
    if (!st.panelRects || typeof st.panelRects !== 'object') st.panelRects = window.defaultPanelRects ? window.defaultPanelRects() : {};
    else {
      var dflt = window.defaultPanelRects ? window.defaultPanelRects() : {};
      Object.keys(dflt).forEach(function (m) { if (!st.panelRects[m]) st.panelRects[m] = dflt[m]; });
    }
    if (st.moduleOrder && st.moduleOrder.indexOf('leave') < 0) {
      var i = st.moduleOrder.indexOf('attention');
      st.moduleOrder.splice(i >= 0 ? i : st.moduleOrder.length, 0, 'leave');
    }
    // 布局调整：今日消消乐移到六维画像之前，并占用更宽的格子（span 3）。
    // 老数据的 moduleOrder 仍是“画像在前、消消乐在后”，这里一次性交换，避免拖拽时跳回旧位置。
    if (st.moduleOrder) {
      var ri = st.moduleOrder.indexOf('radar'), fi = st.moduleOrder.indexOf('fun');
      if (ri >= 0 && fi >= 0 && ri < fi) {
        st.moduleOrder[ri] = 'fun';
        st.moduleOrder[fi] = 'radar';
      }
    }
    return st;
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return createDefaultState();
      return normalizeState(deepMerge(createDefaultState(), JSON.parse(raw)));
    } catch (e) { return createDefaultState(); }
  }
  function saveNow() {
    if (!cloudReady || MODE !== 'admin') return Promise.resolve();
    return CloudAPI.saveBoard(state, remoteSession).then(function () {
      setSync('已保存至云端 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }).catch(function (e) {
      setSync('云端保存失败');
      toast('保存失败：' + e.message);
    });
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式忽略 */ }
    // 自由布局单独落地：教室端（display）拖拽后能持久保存，且能用版本号和云端比新旧
    try {
      if (state.panelRects) {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({
          panelRects: state.panelRects,
          ts: Date.now(),
          version: +state.layoutVersion || 0
        }));
      }
    } catch (e) { /* 忽略 */ }
    if (!cloudReady || MODE !== 'admin') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 600);
  }
  // 大屏上改了布局：顶高本机版本号，让这份布局在下次云端轮询时依然有效
  function markLayoutEdited() {
    state.layoutVersion = Date.now();
    save();
  }
  // 云端数据合并后，用本机布局覆盖。
  // 规则：本机布局版本 >= 云端版本 → 用本机（教室端刚拖过）；
  //       本机版本更旧 → 丢弃本机覆盖，让教师端刚保存的新布局生效。
  function applyLocalLayoutOverride() {
    try {
      var raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return false;
      var local = JSON.parse(raw);
      if (!local || !local.panelRects || typeof local.panelRects !== 'object') return false;
      var cloudVer = +state.layoutVersion || 0;
      var localVer = +local.version || 0;
      if (localVer < cloudVer) {
        localStorage.removeItem(LAYOUT_KEY); // 过期覆盖，清掉避免一直干扰
        return false;
      }
      state.panelRects = deepMerge(window.defaultPanelRects ? window.defaultPanelRects() : {}, local.panelRects);
      if (localVer > cloudVer) state.layoutVersion = localVer;
      return true;
    } catch (e) { return false; }
  }
  function setSync(text) {
    var el = document.getElementById('syncStatus');
    if (el) el.textContent = text;
  }
  // 云端最后一次成功同步的整份数据写入本地快照。大屏掉线/刷新时据此恢复，
  // 避免退回默认演示数据（display 模式原本从不把云端数据落地）。
  function writeSnapshot() {
    if (MODE !== 'display') return;
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ data: state, ts: Date.now() }));
    } catch (e) { /* 隐私模式/容量不足忽略 */ }
  }
  function readSnapshot() {
    try {
      var raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.data || typeof s.data !== 'object') return null;
      return s;
    } catch (e) { return null; }
  }
  // 离线恢复：用快照数据重建 state，并应用本机布局覆盖。返回是否成功恢复。
  function restoreFromSnapshot() {
    var s = readSnapshot();
    if (!s) return false;
    try {
      state = normalizeState(deepMerge(createDefaultState(), s.data));
      applyLocalLayoutOverride();
      syncSettingsInputs();
      renderAll();
      var t = s.ts ? new Date(s.ts).toLocaleString('zh-CN', { hour12: false }) : '';
      setSync('离线模式 · 显示最后同步数据' + (t ? '（' + t + '）' : ''));
      return true;
    } catch (e) { return false; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function toMin(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function fmtDur(sec) {
    sec = Math.max(0, sec);
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function fmtClock(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }

  /* ---------------- 尺寸 / 主题 ---------------- */
  function applyLayout() {
    var fit = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    var scale = fit * state.zoom / 100;
    screen.style.transform = 'scale(' + scale + ')';
    screen.style.left = Math.max(0, (window.innerWidth - 1920 * scale) / 2) + 'px';
    screen.style.top = Math.max(0, (window.innerHeight - 1080 * scale) / 2) + 'px';
    var m = state.margins;
    screen.style.setProperty('--rail-w', (1920 * m.left / 100) + 'px');
    screen.style.setProperty('--stage-r', (1920 * m.right / 100) + 'px');
    screen.style.setProperty('--stage-t', (1080 * m.top / 100) + 'px');
    screen.style.setProperty('--stage-b', (1080 * m.bottom / 100) + 'px');
  }
  function applyTheme() {
    var t = THEMES[state.theme] || THEMES.aurora;
    screen.style.setProperty('--bg-a', t.a);
    screen.style.setProperty('--bg-b', t.b);
    screen.style.setProperty('--bg-c', t.c);
    screen.style.setProperty('--accent', t.accent);
    screen.style.setProperty('--accent-2', t.accent2);
    screen.style.setProperty('--glow-a', t.accent);
    screen.style.setProperty('--glow-b', t.c);
    /* 浅色主题标记：CSS 据此把文字/面板/深色底切换到浅色调 */
    if (t.light) screen.setAttribute('data-light', '1');
    else screen.removeAttribute('data-light');
    var w = WALLPAPERS[state.wallpaper] || WALLPAPERS.gradient;
    screen.style.setProperty('--wall-image', w.css);
  }
  /* 自由布局：把每个板块的矩形(百分比)写成内联样式。
     画布是 dashboard-grid，left/top/width/height 都相对它计算。 */
  function applyPanelRects() {
    var rects = state.panelRects || {};
    $$('.panel').forEach(function (panel) {
      var m = panel.dataset.module;
      var r = rects[m];
      if (!r) return;
      var x = Math.max(0, Math.min(99, +r.x || 0));
      var y = Math.max(0, Math.min(99, +r.y || 0));
      var w = Math.max(3, Math.min(100 - x, +r.w || 25));
      var h = Math.max(3, Math.min(100 - y, +r.h || 25));
      panel.style.left = x + '%';
      panel.style.top = y + '%';
      panel.style.width = w + '%';
      panel.style.height = h + '%';
    });
  }
  /* 板块标题样式：管理端为每个模块设置的标题颜色/字号 */
  function applyModuleStyles() {
    var styles = state.moduleStyles || {};
    $$('.panel').forEach(function (p) {
      var st = styles[p.dataset.module];
      var h2 = $('h2', p);
      if (!h2) return;
      if (st && st.titleColor) { h2.style.color = st.titleColor; }
      else { h2.style.color = ''; }
      if (st && +st.titleSize > 0) { h2.style.fontSize = st.titleSize + 'px'; }
      else { h2.style.fontSize = ''; }
    });
  }

  /* ---------------- 顶部与桌面图标 ---------------- */
  var deskIcons = [
    { g: '▦', label: '班务大屏', act: 'home' },
    { g: '✦', label: '积分点评', act: 'score' },
    { g: '▤', label: '今日作业', act: 'homework' },
    { g: '✓', label: '值日安排', act: 'duty' },
    { g: '◷', label: '课程表', act: 'schedule' },
    { g: '◈', label: '公告栏', act: 'notice' },
    { g: '⚙', label: '大屏设置', act: 'settings' },
    { g: '♻', label: '恢复数据', act: 'reset' }
  ];
  function renderShell() {
    $('#className').textContent = state.className;
    document.title = '班级班务大屏 · ' + state.className;
    $('#railSlogan').textContent = state.slogan;
    $('#topQuote').textContent = state.quote;
    $('#deskIcons').innerHTML = deskIcons.map(function (d) {
      return '<button class="desk-icon" data-act="' + d.act + '"><span class="glyph">' + d.g + '</span><span>' + d.label + '</span></button>';
    }).join('');
  }
  function renderClock() {
    var d = new Date();
    $('#clockTime').textContent = fmtClock(d);
    var week = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][d.getDay()];
    $('#clockDate').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + week;
  }

  /* ---------------- 班务模块 ---------------- */
  // 返回"今天"的课表：优先按 weeklySchedule[周一~周日=1~7]，旧数据回退到 state.schedule
  function todayKey() { var d = new Date().getDay(); return d === 0 ? 7 : d; }
  function todayCourses() {
    var ws = state.weeklySchedule;
    if (ws && ws[todayKey()] && ws[todayKey()].length) return ws[todayKey()];
    return state.schedule || [];
  }
  // 单双周：科目写成“单周/双周”（如 体育/班会），按周次奇偶取对应一门。
  // 周次基准：优先用 state.termStart（开学第一周那周的周一），该周算第1周(单周)，
  // 每 7 天推进一周；未设置时回退到自然年周数（兼容老数据）。
  function parseDate(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function mondayOf(d) { var x = new Date(d); var w = x.getDay() || 7; x.setDate(x.getDate() - (w - 1)); x.setHours(0, 0, 0, 0); return x; }
  function termWeekNumber() {
    var base = parseDate(state.termStart);
    if (!base) return 0;
    var thisMon = mondayOf(new Date());
    return Math.round((thisMon - mondayOf(base)) / (7 * 86400000)) + 1;
  }
  function isOddWeek() {
    var tw = termWeekNumber();
    if (tw > 0) return (tw % 2 === 1);
    return weekNumber() % 2 === 1;
  }
  function actualSubject(c) {
    var s = String(c.subject || '');
    if (s.indexOf('/') < 0) return s;
    var parts = s.split('/');
    return (isOddWeek() ? parts[0] : (parts[1] || parts[0])).trim();
  }
  function hasAlt(c) { return String(c.subject || '').indexOf('/') >= 0; }
  function weekTag() { return isOddWeek() ? '单周' : '双周'; }
  function renderSchedule() {
    var cur = nowMin();
    var courses = todayCourses();
    var idxNow = -1;
    courses.forEach(function (c, i) { if (cur >= toMin(c.start) && cur < toMin(c.end)) idxNow = i; });
    var dayName = ['周日','周一','周二','周三','周四','周五','周六'][new Date().getDay()];
    var tw = termWeekNumber();
    $('#scheduleWeek').textContent = dayName + ' · 第 ' + (tw > 0 ? tw : weekNumber()) + ' 周 · ' + weekTag();
    $('#scheduleStrip').innerHTML = courses.length ? courses.map(function (c, i) {
      var cls = i === idxNow ? ' is-now' : (toMin(c.end) <= cur ? ' is-done' : '');
      var altBadge = hasAlt(c) ? '<span class="sc-alt">' + weekTag() + '</span>' : '';
      return '<div class="schedule-card' + cls + '">' +
        '<div class="sc-top"><span>第' + (i + 1) + '节</span>' + altBadge + (i === idxNow ? '<span style="color:var(--accent)">● 进行中</span>' : '') + '</div>' +
        '<div class="sc-subject">' + esc(actualSubject(c)) + '</div>' +
        '<div class="sc-time">' + esc(c.start) + '–' + esc(c.end) + '</div></div>';
    }).join('') : '<div class="schedule-empty">今天没有排课，好好安排自习吧 ✨</div>';
  }
  function weekNumber() {
    var d = new Date();
    var start = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
  }
  function renderCurrent() {
    var d = new Date(), cur = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    var courses = todayCourses();
    var found = -1, next = -1;
    for (var i = 0; i < courses.length; i++) {
      var s = toMin(courses[i].start) * 60, e = toMin(courses[i].end) * 60;
      if (cur >= s && cur < e) { found = i; break; }
      if (cur < s && next < 0) next = i;
    }
    var html = '';
    if (found >= 0) {
      var c = courses[found];
      var left = toMin(c.end) * 60 - cur;
      var total = (toMin(c.end) - toMin(c.start)) * 60;
      html = '<div class="cur-state">正 在 上 课</div><div class="cur-subject">第' + (found + 1) + '节 · ' + esc(actualSubject(c)) + '</div>' +
        '<div class="cur-time">' + fmtDur(left) + '</div><div class="cur-hint">距下课 · ' + esc(c.end) + '</div>' +
        '<div class="cur-progress"><i style="width:' + Math.max(0, Math.min(100, (1 - left / total) * 100)) + '%"></i></div>';
    } else if (next >= 0) {
      var n = courses[next];
      var left2 = toMin(n.start) * 60 - cur;
      html = '<div class="cur-state">课 间</div><div class="cur-subject">下一节 · ' + esc(actualSubject(n)) + '</div>' +
        '<div class="cur-time">' + fmtDur(left2) + '</div><div class="cur-hint">距上课 · ' + esc(n.start) + '</div>' +
        '<div class="cur-progress"><i style="width:' + Math.max(4, Math.min(96, 100 - left2 / 6)) + '%"></i></div>';
    } else {
      html = '<div class="cur-state">课 后</div><div class="cur-subject">今天课程已结束</div>' +
        '<div class="cur-time" style="font-size:42px">辛苦了</div><div class="cur-hint">明天见 · 好好休息</div>';
    }
    $('#currentBody').innerHTML = html;
  }
  // 请假通报：按日期显示今天及最近的请假，教师端登记后大屏自动同步
  function renderLeave() {
    var el = $('#leaveList');
    if (!el) return;
    var leaves = (state.leaves || []).slice();
    leaves.sort(function (a, b) { return String(a.start || '') < String(b.start || '') ? 1 : -1; });
    el.innerHTML = leaves.length ? leaves.slice(0, 6).map(function (l) {
      var range = l.start && l.end && l.start !== l.end ? (l.start.slice(5) + ' 至 ' + l.end.slice(5)) : (l.start ? l.start.slice(5) : '今天');
      return '<div class="leave-item"><div class="leave-name">' + esc(l.name) + '</div>' +
        '<div class="leave-reason">' + esc(l.reason) + '</div>' +
        '<div class="leave-date">' + esc(range) + '</div></div>';
    }).join('') : '<div class="leave-empty">今日暂无请假 · 全员到齐 🎉</div>';
  }
  function renderHomework() {
    $('#hwTabs').innerHTML = state.homework.map(function (h, i) {
      return '<button class="hw-tab' + (i === ui.hwSubject ? ' active' : '') + '" data-hw="' + i + '">' + esc(h.subject) + '</button>';
    }).join('');
    if (ui.hwSubject >= state.homework.length) ui.hwSubject = 0;
    var hw = state.homework[ui.hwSubject] || { items: [] };
    $('#hwList').innerHTML = hw.items.map(function (it, i) {
      return '<div class="hw-item"><div class="hw-title"><b>' + String(i + 1).padStart(2, '0') + '</b>' + esc(it.title) + '</div>' +
        '<div class="hw-meta"><span>' + esc(hw.subject) + '</span><span>' + esc(it.detail) + '</span></div></div>';
    }).join('');
  }
  function renderDuty() {
    $('#dutyList').innerHTML = state.duty.map(function (d) {
      return '<div class="duty-row"><div class="duty-task">' + esc(d.task) + '</div><div class="duty-names">' + esc(d.names) + '</div></div>';
    }).join('');
  }
  function renderCountdown() {
    var cd = state.countdown;
    var days = Math.ceil((new Date(cd.date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
    $('#countdownBody').innerHTML = '<div class="cd-title">' + esc(cd.title) + '</div>' +
      '<div class="cd-days">' + Math.max(0, days) + '</div><div class="cd-unit">DAYS · 天</div>' +
      '<div class="cd-date">' + esc(cd.date) + '</div>';
  }

  /* ---------------- 积分模块 ---------------- */
  function renderOverview() {
    var weekNet = state.weekNet.reduce(function (a, b) { return a + b; }, 0);
    var pos = state.students.reduce(function (a, s) { return a + s.positive; }, 0);
    var neg = state.students.reduce(function (a, s) { return a + s.negative; }, 0);
    var total = state.students.reduce(function (a, s) { return a + s.points; }, 0);
    var max = Math.max.apply(null, state.weekNet.concat([1]));
    function bar(v, i) {
      var h = Math.max(4, v / max * 56);
      var x = 12 + i * 39;
      return '<g><rect x="' + x + '" y="' + (72 - h) + '" width="22" height="' + h + '" rx="4" fill="url(#barGrad)"/>' +
        '<text x="' + (x + 11) + '" y="' + (68 - h) + '" text-anchor="middle" font-size="9" fill="#a9bbd4">' + v + '</text>' +
        '<text x="' + (x + 11) + '" y="86" text-anchor="middle" font-size="9" fill="#7d90ad">' + ['一','二','三','四','五','六','日'][i] + '</text></g>';
    }
    $('#overviewBody').innerHTML =
      '<div class="ov-stats">' +
        '<div class="ov-stat"><div class="ov-label">本周净得</div><div class="ov-value good">+' + weekNet + '</div></div>' +
        '<div class="ov-stat"><div class="ov-label">正向总分</div><div class="ov-value">' + pos + '</div></div>' +
        '<div class="ov-stat"><div class="ov-label">全班累计</div><div class="ov-value">' + total + '</div></div>' +
      '</div><div class="ov-chart"><svg viewBox="0 0 300 92" preserveAspectRatio="none">' +
        '<defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8fe8d0"/><stop offset="100%" stop-color="#3d9c8d"/></linearGradient></defs>' +
        state.weekNet.map(bar).join('') +
      '</svg></div><div class="ov-foot"><span>负向 ' + neg + ' · 正负比 ' + (neg ? (pos / neg).toFixed(1) : '全正向') + ' : 1</span><span>在册 ' + state.students.length + ' 人</span></div>';
  }
  function renderRadar() {
    var dims = state.dims, n = dims.length, cx = 115, cy = 100, r = 60;
    var vals = dims.map(function (d) {
      var arr = state.students.map(function (s) { return s.dim[d] || 0; });
      if (!arr.length) return 0;
      var avg = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
      return Math.max(0, Math.min(1, avg / 26));
    });
    function pt(i, ratio) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / n;
      return [cx + Math.cos(a) * r * ratio, cy + Math.sin(a) * r * ratio];
    }
    function poly(ratio) { return dims.map(function (_, i) { return pt(i, ratio).join(','); }).join(' '); }
    var gridSvg = [0.25, 0.5, 0.75, 1].map(function (t) {
      return '<polygon points="' + poly(t) + '" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>';
    }).join('');
    var axes = dims.map(function (_, i) {
      var p = pt(i, 1);
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="rgba(255,255,255,.12)"/>';
    }).join('');
    var dataPts = vals.map(function (v, i) { return pt(i, v); });
    var dataPoly = dataPts.map(function (p) { return p.join(','); }).join(' ');
    var dots = dataPts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.8" fill="#ffc97a"/>'; }).join('');
    var labels = dims.map(function (d, i) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / n;
      var x = cx + Math.cos(a) * 82, y = cy + Math.sin(a) * 82;
      var anchor = Math.cos(a) > .3 ? 'start' : (Math.cos(a) < -.3 ? 'end' : 'middle');
      var lbl = (state.dimShort && state.dimShort[i]) || (d && d.slice(0, 2)) || '';
      return '<text class="radar-label" x="' + x + '" y="' + (y + 3) + '" text-anchor="' + anchor + '">' + lbl + '</text>';
    }).join('');
    $('#radarBody').innerHTML = '<svg viewBox="0 0 230 200">' +
      '<defs><linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7fd6c0" stop-opacity=".65"/><stop offset="100%" stop-color="#ffc97a" stop-opacity=".28"/></linearGradient></defs>' +
      gridSvg + axes + '<polygon points="' + dataPoly + '" fill="url(#radarGrad)" stroke="#7fd6c0" stroke-width="2"/>' + dots + labels + '</svg>';
  }
  function renderGroups() {
    var gs = state.groups.slice().sort(function (a, b) { return b.points - a.points; }).slice(0, 5);
    var max = gs.length ? gs[0].points : 1;
    $('#groupList').innerHTML = gs.map(function (g, i) {
      return '<div class="group-row"><div class="group-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</div>' +
        '<div class="group-info"><div class="group-name"><span>' + esc(g.name) + '</span><span style="color:var(--ink-3);font-size:10px">' + g.members.length + ' 人</span></div>' +
        '<div class="group-bar"><i style="width:' + (g.points / max * 100) + '%"></i></div></div>' +
        '<div class="group-score">' + g.points + '</div></div>';
    }).join('');
  }
  function renderModels() {
    var medals = ['🥇','🥈','🥉','★'];
    $('#modelList').innerHTML = state.models.slice(0, 4).map(function (m, i) {
      return '<div class="model-row"><div class="avatar">' + esc(m.emoji || '🌟') + '</div>' +
        '<div><div class="model-name">' + esc(m.name) + '</div><div class="model-role">' + esc(m.role) + '</div></div>' +
        '<div class="model-medal">' + medals[i] + '</div><div class="model-score">' + m.score + '</div></div>';
    }).join('');
  }
  function renderFun() {
    $('#funList').innerHTML = state.fun.map(function (f) {
      var pct = f.total ? Math.round(f.done / f.total * 100) : 0;
      return '<div><div class="fun-row"><div class="fun-label">' + esc(f.subject) + '</div>' +
        '<div class="fun-bar"><i style="width:' + pct + '%"></i></div><div class="fun-count">' + f.done + '/' + f.total + '</div></div>' +
        '<div class="fun-unfinished">「' + esc(f.title) + '」未完成：<b>' + esc(f.unfinished || '无') + '</b></div></div>';
    }).join('');
  }
  function safeColor(c) { return /^#[0-9a-fA-F]{3,8}$|^rgb\([\d\s,.]+\)$/.test(String(c || '')) ? c : '#7fd6c0'; }
  function renderNotice() {
    $('#noticeList').innerHTML = state.announcements.slice(0, 3).map(function (a) {
      var accent = safeColor(a.accent);
      return '<div class="notice-item" style="border-left-color:' + accent + '">' +
        '<div class="n-title" style="color:' + accent + '">' + esc(a.title) + '</div>' +
        '<div class="n-text">' + esc(a.text) + '</div></div>';
    }).join('') + '<div class="notice-more">— 共 ' + state.announcements.length + ' 条班务公告 · 数据已同步 —</div>';
  }
  function renderAttention() {
    var low = state.students.slice().sort(function (a, b) { return a.points - b.points; }).slice(0, 4);
    var evs = state.events.slice(0, 6);
    $('#attentionBody').innerHTML =
      '<div class="att-col"><div class="att-title">◆ 需要关注</div>' + low.map(function (s) {
        return '<div class="att-row"><span class="att-name">' + esc(s.name) + '</span><span class="att-tag">' + esc(weakDim(s)) + '</span><span class="att-score">' + s.points + '</span></div>';
      }).join('') + '</div>' +
      '<div class="att-col"><div class="att-title">◆ 操作流水</div>' + evs.map(function (e, i) {
        return '<div class="log-row"><span class="log-time">' + esc(e.time) + '</span><span class="log-text">' + esc(e.name) + ' · ' + esc(e.label) + '</span>' +
          '<span class="log-delta ' + (e.delta >= 0 ? 'plus' : 'minus') + '">' + (e.delta >= 0 ? '+' : '') + e.delta + '</span></div>';
      }).join('') + '</div>';
  }
  function weakDim(s) {
    var best = null, min = Infinity;
    state.dims.forEach(function (d) { if ((s.dim[d] || 0) < min) { min = s.dim[d]; best = d; } });
    return state.dimShort[state.dims.indexOf(best)] || '综合';
  }

  function renderAll() {
    renderShell(); renderSchedule(); renderCurrent(); renderHomework(); renderDuty(); renderCountdown();
    renderOverview(); renderRadar(); renderGroups(); renderModels(); renderFun(); renderNotice(); renderLeave(); renderAttention();
    setupEditActions();
    applyTheme(); applyLayout(); applyPanelRects(); applyModuleStyles();
    applyModuleVisibility();
    renderToggles(); renderThemeChoices(); renderStudentPicker(); renderDimTabs(); renderBehaviors(); renderRecentLog();
  }
  function applyModuleVisibility() {
    $$('.panel').forEach(function (p) {
      p.classList.toggle('hidden', state.hiddenModules.indexOf(p.dataset.module) >= 0);
    });
  }

  /* ---------------- 抽屉设置 ---------------- */
  function openDrawer(id) {
    closeDrawers();
    ui.drawer = id;
    document.getElementById(id).classList.add('open');
    $('#drawerMask').classList.add('show');
  }
  function closeDrawers() {
    $$('.drawer').forEach(function (d) { d.classList.remove('open'); });
    $('#drawerMask').classList.remove('show');
    ui.drawer = null;
  }
  function renderToggles() {
    // 板块显隐已在管理端「板块布局」统一配置，前端不再渲染显隐开关。
    var box = $('#moduleToggles');
    if (box) box.innerHTML = '';
  }
  function renderThemeChoices() {
    $('#themeSwatches').innerHTML = Object.keys(THEMES).map(function (k) {
      var t = THEMES[k];
      return '<button class="theme-swatch' + (state.theme === k ? ' active' : '') + '" data-theme="' + k + '" title="' + t.name + '" ' +
        'style="background:linear-gradient(135deg,' + t.a + ',' + t.c + ')"></button>';
    }).join('');
    $('#wallpaperChoices').innerHTML = Object.keys(WALLPAPERS).map(function (k) {
      return '<button class="wall-choice' + (state.wallpaper === k ? ' active' : '') + '" data-wall="' + k + '" title="' + WALLPAPERS[k].name + '" ' +
        'style="background-image:' + WALLPAPERS[k].css + ';background-color:#223"></button>';
    }).join('');
  }
  function syncSettingsInputs() {
    var m = state.margins;
    $('#marginLeft').value = m.left; $('#marginRight').value = m.right;
    $('#marginTop').value = m.top; $('#marginBottom').value = m.bottom;
    $('#zoomRange').value = state.zoom;
    $('#valLeft').textContent = m.left + '%'; $('#valRight').textContent = m.right + '%';
    $('#valTop').textContent = m.top + '%'; $('#valBottom').textContent = m.bottom + '%';
    $('#valZoom').textContent = state.zoom + '%';
    $('#inputClassName').value = state.className;
    $('#inputSlogan').value = state.slogan;
    $('#inputQuote').value = state.quote;
  }

  /* ---------------- 编辑模式 ---------------- */
  function setupEditActions() {
    $$('.panel').forEach(function (panel) {
      var actions = $('.head-actions', panel);
      // 显隐统一由管理端「板块布局」控制，前端不再提供隐藏按钮，避免教室内误操作
      actions.innerHTML = '<button class="head-action-btn" data-gear="' + panel.dataset.module + '" title="配置模块">⚙</button>';
      // 八角缩放手柄：编辑模式下拖动改板块自身矩形（n/nw/ne/w/e/sw/s/se）
      var dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      dirs.forEach(function (d) {
        var h = $('.rz[data-dir="' + d + '"]', panel);
        if (!h) {
          h = document.createElement('div');
          h.className = 'rz';
          h.dataset.dir = d;
          panel.appendChild(h);
        }
      });
    });
    // 显隐已移至管理端：隐藏前端设置抽屉里的"显示模块"区与工具栏的"添加模块"按钮
    var mt = $('#moduleToggles');
    if (mt) {
      var box = mt.closest('.field') || mt;
      if (box.parentNode) {
        var h4 = box.previousElementSibling;
        if (h4 && h4.tagName === 'H4') h4.style.display = 'none';
        box.style.display = 'none';
      }
    }
    var addBtn = $('#btnAddModule');
    if (addBtn) addBtn.style.display = 'none';
  }
  function enterEdit() {
    ui.editing = true;
    screen.classList.add('editing');
    $$('.panel').forEach(function (p) { p.draggable = false; });
    $('#btnEdit').innerHTML = '<span>✓</span> 完成';
    // 展示模式 applyChrome() 把工具条隐藏了，进编辑态要恢复，否则「重置布局」按钮用不了
    var bar = $('#editToolbar');
    if (bar) bar.style.display = '';
    // 教师端预览里不弹设置抽屉，否则会盖住画布没法拖板块
    if (MODE !== 'layout') { openDrawer('settingsDrawer'); switchSettingsTab('layout'); }
  }
  function exitEdit() {
    ui.editing = false;
    screen.classList.remove('editing');
    $('#btnEdit').innerHTML = '<span>✎</span> 编辑';
    closeDrawers();
    // 展示/预览模式下编辑工具条默认隐藏，退出编辑态收回（管理模式保持可见）
    if (MODE !== 'admin') { var bar = $('#editToolbar'); if (bar) bar.style.display = 'none'; }
    save();
    toast('布局已保存');
    // 通知教师端：预览里的布局草稿已更新，父页面据此自动保存到云端（无需再点外层按钮）
    if (MODE === 'layout' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'classScreenLayoutEdited',
          panelRects: state.panelRects,
          version: +state.layoutVersion || 0
        }, '*');
      } catch (e) {}
    }
  }
  function switchSettingsTab(tab) {
    $$('#settingsTabs .dtab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    $$('.dtab-pane').forEach(function (p) { p.classList.toggle('active', p.dataset.pane === tab); });
  }

  /* ---- 编辑模式：自由移动 + 八角缩放 ---- */
  // 画布百分比坐标：把屏幕像素位移换算成相对画布宽高的百分比（已含 transform scale）
  function canvasScale() {
    var rect = grid.getBoundingClientRect();
    return { px: rect.width / 100, py: rect.height / 100 };
  }
  function clampRect(r) {
    var MINW = 6, MINH = 5; // 最小宽高(百分比)
    r.w = Math.max(MINW, Math.min(100 - r.x, r.w));
    r.h = Math.max(MINH, Math.min(100 - r.y, r.h));
    r.x = Math.max(0, Math.min(100 - r.w, r.x));
    r.y = Math.max(0, Math.min(100 - r.h, r.y));
    return r;
  }
  function writeRect(panel, r) {
    panel.style.left = r.x + '%'; panel.style.top = r.y + '%';
    panel.style.width = r.w + '%'; panel.style.height = r.h + '%';
  }
  var moveState = null; // {panel, module, startX, startY, rect, sc, kind:'move'|'resize', dir}
  grid.addEventListener('pointerdown', function (e) {
    if (!ui.editing || e.button !== 0) return;
    var panel = e.target.closest('.panel');
    if (!panel) return;
    // 避开按钮/齿轮/手柄点击：点配置按钮不触发拖动
    if (e.target.closest('button, .head-action-btn')) return;
    var handle = e.target.closest('.rz');
    var kind = handle ? 'resize' : 'move';
    // 点面板标题或空白处都可以拖动；点输入/滚动内容时不拖（编辑态一般不填内容）
    var r0 = (state.panelRects || {})[panel.dataset.module];
    if (!r0) return;
    var sc = canvasScale();
    moveState = {
      panel: panel, module: panel.dataset.module,
      startX: e.clientX, startY: e.clientY,
      rect: { x: +r0.x, y: +r0.y, w: +r0.w, h: +r0.h },
      sc: sc, kind: kind, dir: handle ? handle.dataset.dir : ''
    };
    panel.classList.add('dragging');
    e.preventDefault();
  });
  grid.addEventListener('pointermove', function (e) {
    if (!moveState || !ui.editing) return;
    var dx = (e.clientX - moveState.startX) / moveState.sc.px;
    var dy = (e.clientY - moveState.startY) / moveState.sc.py;
    var r = { x: moveState.rect.x, y: moveState.rect.y, w: moveState.rect.w, h: moveState.rect.h };
    if (moveState.kind === 'move') {
      r.x += dx; r.y += dy;
    } else {
      var d = moveState.dir;
      // 每边可独立拖动；拖动左边/上边时同时改变 x/y 与 w/h
      if (d.indexOf('w') >= 0) { var nx = Math.max(0, Math.min(r.x + r.w - 6, r.x + dx)); r.w += r.x - nx; r.x = nx; }
      if (d.indexOf('e') >= 0) { r.w = Math.max(6, Math.min(100 - r.x, r.w + dx)); }
      if (d.indexOf('n') >= 0) { var ny = Math.max(0, Math.min(r.y + r.h - 5, r.y + dy)); r.h += r.y - ny; r.y = ny; }
      if (d.indexOf('s') >= 0) { r.h = Math.max(5, Math.min(100 - r.y, r.h + dy)); }
    }
    clampRect(r);
    writeRect(moveState.panel, r);
    state.panelRects[moveState.module] = { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.w.toFixed(2), h: +r.h.toFixed(2) };
    e.preventDefault();
  });
  function endMove(e) {
    if (!moveState) return;
    moveState.panel.classList.remove('dragging');
    var wasDragging = moveState;
    moveState = null;
    if (wasDragging.panel.hasPointerCapture && e && e.pointerId != null) {
      try { wasDragging.panel.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    markLayoutEdited(); // 顶高版本号，避免被 5 秒云端轮询覆盖
  }
  grid.addEventListener('pointerup', endMove);
  grid.addEventListener('pointercancel', endMove);

  /* ---------------- 模块配置弹窗 ---------------- */
  var MODAL_CONFIG = {
    schedule: {
      title: '配置整周课程表', hint: '每行一天，格式：星期|科目=开始-结束,科目=开始-结束 …（24小时制）。例：周一|语文=08:00-08:40,数学=08:50-09:30。留空的那天表示无课。',
      get: function () {
        var names = ['周一','周二','周三','周四','周五','周六','周日'];
        var ws = state.weeklySchedule || {};
        return names.map(function (n, i) {
          var arr = ws[i + 1] || [];
          return n + '|' + arr.map(function (c) { return c.subject + '=' + c.start + '-' + c.end; }).join(',');
        }).join('\n');
      },
      set: function (text) {
        var names = ['周一','周二','周三','周四','周五','周六','周日'];
        var ws = {};
        text.split('\n').forEach(function (line) {
          if (!line.trim() || line.indexOf('|') < 0) return;
          var p = line.split('|'), day = names.indexOf((p[0] || '').trim()) + 1;
          if (day < 1) return;
          ws[day] = (p[1] || '').split(',').map(function (item) {
            if (!item.trim()) return null;
            var cp = item.split('='), tp = (cp[1] || '').split('-');
            return { subject: (cp[0] || '自习').trim(), start: (tp[0] || '08:00').trim(), end: (tp[1] || '08:40').trim() };
          }).filter(Boolean);
        });
        for (var d = 1; d <= 7; d++) if (!ws[d]) ws[d] = [];
        state.weeklySchedule = ws;
        // 同步一份到旧的 schedule，保证老版本大屏/其他入口也能显示当天课
        state.schedule = (ws[todayKey()] && ws[todayKey()].length) ? ws[todayKey()] : (ws[1] || []);
      }
    },
    homework: {
      title: '配置今日作业', hint: '每行一条：科目|标题|要求详情',
      get: function () {
        var out = []; state.homework.forEach(function (h) { h.items.forEach(function (it) { out.push([h.subject, it.title, it.detail].join('|')); }); }); return out.join('\n');
      },
      set: function (text) {
        var list = text.split('\n').filter(Boolean).map(function (l) { var p = l.split('|'); return { subject: p[0] || '其他', title: p[1] || '作业', detail: p[2] || '' }; });
        var by = {}; list.forEach(function (it) { (by[it.subject] = by[it.subject] || []).push({ title: it.title, detail: it.detail }); });
        state.homework = Object.keys(by).map(function (k) { return { subject: k, items: by[k] }; });
        ui.hwSubject = 0;
      }
    },
    duty: {
      title: '配置今日值日', hint: '每行一项：任务|负责同学（多人用顿号分隔）',
      get: function () { return state.duty.map(function (d) { return d.task + '|' + d.names; }).join('\n'); },
      set: function (text) { state.duty = text.split('\n').filter(Boolean).map(function (l) { var p = l.split('|'); return { task: p[0] || '值日', names: p[1] || '' }; }); }
    },
    countdown: {
      title: '配置事件倒计时', hint: '一行：事件名称|YYYY-MM-DD',
      get: function () { return state.countdown.title + '|' + state.countdown.date; },
      set: function (text) { var p = text.split('\n')[0].split('|'); if (p[0]) state.countdown = { title: p[0], date: p[1] || state.countdown.date }; }
    },
    notice: {
      title: '配置公告栏', hint: '每行一条：标题|公告内容|强调色（可留空，如 #ffc97a）',
      get: function () { return state.announcements.map(function (a) { return [a.title, a.text, a.accent].join('|'); }).join('\n'); },
      set: function (text) { state.announcements = text.split('\n').filter(Boolean).map(function (l, i) { var p = l.split('|'); return { title: p[0] || '公告', text: p[1] || '', accent: p[2] || ['#ffc97a','#7fd6c0','#9db8ff'][i % 3] }; }); }
    },
    models: {
      title: '配置今日榜样', hint: '每行一位：姓名|称号|积分|头像 emoji',
      get: function () { return state.models.map(function (m) { return [m.name, m.role, m.score, m.emoji].join('|'); }).join('\n'); },
      set: function (text) { state.models = text.split('\n').filter(Boolean).map(function (l) { var p = l.split('|'); return { name: p[0] || '', role: p[1] || '优秀学生', score: +p[2] || 0, emoji: p[3] || '🌟' }; }); }
    },
    fun: {
      title: '配置今日消消乐', hint: '每行一科：科目|任务名|总人数|已完成人数|未完成名单',
      get: function () { return state.fun.map(function (f) { return [f.subject, f.title, f.total, f.done, f.unfinished].join('|'); }).join('\n'); },
      set: function (text) { state.fun = text.split('\n').filter(Boolean).map(function (l) { var p = l.split('|'); return { subject: p[0] || '其他', title: p[1] || '任务', total: +p[2] || 45, done: +p[3] || 0, unfinished: p[4] || '' }; }); }
    }
  };
  function openConfig(module) {
    if (['overview','radar','groups','attention','current'].indexOf(module) >= 0) {
      openDrawer('scoreDrawer');
      toast('该模块数据来自积分点评，可在快捷点评中加减分');
      return;
    }
    var cfg = MODAL_CONFIG[module];
    if (!cfg) return;
    var root = $('#modalRoot');
    root.innerHTML = '<div class="modal"><h3>' + esc(cfg.title) + '</h3><p class="hint">' + esc(cfg.hint) + '</p>' +
      '<textarea id="modalText">' + esc(cfg.get()) + '</textarea>' +
      '<div class="modal-actions"><button class="et-btn" data-modal="cancel">取消</button><button class="et-btn primary" data-modal="save">保存</button></div></div>';
    root.classList.add('show');
    root.dataset.config = module;
    $('#modalText').focus();
  }
  function closeModal() { $('#modalRoot').classList.remove('show'); $('#modalRoot').innerHTML = ''; }

  /* ---------------- 快捷点评 ---------------- */
  function renderStudentPicker() {
    var q = ($('#studentSearch').value || '').trim();
    var list = state.students.filter(function (s) { return !q || s.name.indexOf(q) >= 0 || String(s.no).indexOf(q) >= 0; });
    $('#studentPicker').innerHTML = list.map(function (s) {
      return '<button class="stu-chip' + (ui.selectedStudents.has(s.id) ? ' selected' : '') + '" data-stu="' + s.id + '">' + esc(s.name) + '</button>';
    }).join('') || '<p class="hint">没有匹配的学生</p>';
  }
  function renderDimTabs() {
    $('#dimTabs').innerHTML = state.dims.map(function (d) {
      return '<button class="dim-tab' + (ui.selectedDim === d ? ' active' : '') + '" data-dim="' + esc(d) + '">' + esc(d) + '</button>';
    }).join('');
  }
  function renderBehaviors() {
    var list = (state.behaviors[ui.selectedDim] || []).filter(function (b) {
      return ui.scoreMode === 'plus' ? b.value > 0 : b.value < 0;
    });
    $('#behaviorChips').innerHTML = list.map(function (b, i) {
      return '<button class="behavior-chip' + (b.value < 0 ? ' minus' : '') + '" data-behavior="' + i + '">' +
        esc(b.label) + '<b>' + (b.value > 0 ? '+' : '') + b.value + '</b></button>';
    }).join('');
  }
  function renderRecentLog() {
    $('#recentLog').innerHTML = state.events.slice(0, 12).map(function (e, i) {
      return '<div class="log-row"><span class="log-time">' + esc(e.time) + '</span>' +
        '<span class="log-text">' + esc(e.name) + ' · ' + esc(e.label) + '</span>' +
        '<span class="log-delta ' + (e.delta >= 0 ? 'plus' : 'minus') + '">' + (e.delta >= 0 ? '+' : '') + e.delta + '</span>' +
        '<button style="border:none;background:none;color:var(--ink-3);font-size:11px" data-undo-index="' + i + '" title="撤销">↶</button></div>';
    }).join('');
  }
  function applyScore(behavior, reason) {
    if (!ui.selectedStudents.size) { toast('请先选择学生'); return; }
    var delta = behavior ? behavior.value : (ui.scoreMode === 'plus' ? 1 : -1);
    if ((ui.scoreMode === 'plus' && delta < 0) || (ui.scoreMode === 'minus' && delta > 0)) delta = Math.abs(delta) * (ui.scoreMode === 'plus' ? 1 : -1);
    var label = behavior ? behavior.label : (reason || (ui.scoreMode === 'plus' ? '自定义加分' : '自定义扣分'));
    ui.snapshot = JSON.parse(JSON.stringify(state));
    var names = [];
    state.students.forEach(function (s) {
      if (!ui.selectedStudents.has(s.id)) return;
      s.points += delta;
      if (delta > 0) s.positive += delta; else s.negative += Math.abs(delta);
      s.dim[ui.selectedDim] = (s.dim[ui.selectedDim] || 0) + delta;
      s.trend[6] += delta;
      state.groups.forEach(function (g) { if (g.members.indexOf(s.name) >= 0) g.points += delta; });
      state.events.unshift({ time: fmtClock(new Date()).slice(0, 5), name: s.name, label: label, delta: delta, dim: ui.selectedDim });
      names.push(s.name);
    });
    state.weekNet[6] += delta * names.length;
    save(); renderAll();
    toast(names.length + ' 人已' + (delta > 0 ? '加 +' : '扣 ') + delta + ' 分 · ' + label, true);
    ui.selectedStudents.clear();
    renderStudentPicker();
  }
  function undoScore() {
    if (!ui.snapshot) { toast('没有可撤销的操作'); return; }
    state = ui.snapshot; ui.snapshot = null;
    save(); renderAll(); renderRecentLog();
    toast('已撤销上一步点评');
  }
  function undoEvent(index) {
    var e = state.events[index];
    if (!e) return;
    ui.snapshot = null;
    e.name && state.students.forEach(function (s) {
      if (s.name !== e.name) return;
      s.points -= e.delta;
      if (e.delta > 0) s.positive -= e.delta; else s.negative -= Math.abs(e.delta);
      if (e.dim) s.dim[e.dim] = (s.dim[e.dim] || 0) - e.delta;
      s.trend[6] -= e.delta;
      state.groups.forEach(function (g) { if (g.members.indexOf(s.name) >= 0) g.points -= e.delta; });
    });
    state.weekNet[6] -= e.delta;
    state.events.splice(index, 1);
    save(); renderAll();
    toast('已撤销：' + e.name + ' · ' + e.label);
  }

  /* ---------------- 提示 ---------------- */
  function toast(msg, undo) {
    var root = $('#toastRoot');
    root.innerHTML = '<div class="toast"><span>' + esc(msg) + '</span>' + (undo ? '<button id="toastUndo">撤销</button>' : '') + '</div>';
    if (undo) $('#toastUndo').onclick = undoScore;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(function () { root.innerHTML = ''; }, 6000);
  }

  /* ---------------- 事件绑定 ---------------- */
  $('#btnEdit').addEventListener('click', function () { ui.editing ? exitEdit() : enterEdit(); });
  $('#btnSaveEdit').addEventListener('click', exitEdit);
  // 重置布局：所有板块回到默认矩形（不影响课程内容/标题样式）
  var resetLayoutBtn = $('#btnResetLayout');
  if (resetLayoutBtn) resetLayoutBtn.addEventListener('click', function () {
    if (!confirm('确定把板块位置与大小恢复默认？（不影响课程、积分、标题样式等数据）')) return;
    state.panelRects = window.defaultPanelRects ? window.defaultPanelRects() : {};
    applyPanelRects();
    save();
    toast('布局已恢复默认');
  });
  $('#btnFull').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (screen.requestFullscreen) screen.requestFullscreen().catch(function () {});
  });
  $('#btnScore').addEventListener('click', function () { ui.editing ? null : openDrawer('scoreDrawer'); });
  $('#drawerMask').addEventListener('click', closeDrawers);
  $$('.drawer-close').forEach(function (b) { b.addEventListener('click', closeDrawers); });

  $('#deskIcons').addEventListener('click', function (e) {
    var b = e.target.closest('.desk-icon'); if (!b) return;
    var act = b.dataset.act;
    if (act === 'score') openDrawer('scoreDrawer');
    else if (act === 'settings') { enterEdit(); }
    else if (act === 'reset') { if (confirm('确定恢复演示数据？当前修改会被覆盖。')) resetData(); }
    else if (act === 'homework' || act === 'duty' || act === 'notice' || act === 'schedule') {
      enterEdit(); openConfig(act);
    } else if (act === 'home') closeDrawers();
  });

  $('#hwTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.hw-tab'); if (!b) return;
    ui.hwSubject = +b.dataset.hw; renderHomework();
  });

  $('#settingsTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.dtab'); if (b) switchSettingsTab(b.dataset.tab);
  });
  ['Left','Right','Top','Bottom'].forEach(function (k) {
    $('#margin' + k).addEventListener('input', function (e) {
      state.margins[k.toLowerCase()] = +e.target.value;
      $('#val' + k).textContent = e.target.value + '%';
      applyLayout(); save();
    });
  });
  $('#zoomRange').addEventListener('input', function (e) { state.zoom = +e.target.value; $('#valZoom').textContent = state.zoom + '%'; applyLayout(); save(); });
  $('#btnClearMargin').addEventListener('click', function () {
    state.margins = { left: 0, right: 0, top: 0, bottom: 0 };
    syncSettingsInputs(); applyLayout(); save(); toast('已清除留白');
  });
  $('#moduleToggles').addEventListener('change', function (e) {
    var m = e.target.dataset.moduleToggle; if (!m) return;
    var i = state.hiddenModules.indexOf(m);
    if (e.target.checked && i >= 0) state.hiddenModules.splice(i, 1);
    if (!e.target.checked && i < 0) state.hiddenModules.push(m);
    applyModuleVisibility(); save();
  });
  $('#themeSwatches').addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme]'); if (!b) return;
    state.theme = b.dataset.theme; applyTheme(); renderThemeChoices(); save();
  });
  $('#wallpaperChoices').addEventListener('click', function (e) {
    var b = e.target.closest('[data-wall]'); if (!b) return;
    state.wallpaper = b.dataset.wall; applyTheme(); renderThemeChoices(); save();
  });
  [['#inputClassName','className'],['#inputSlogan','slogan'],['#inputQuote','quote']].forEach(function (pair) {
    $(pair[0]).addEventListener('input', function (e) { state[pair[1]] = e.target.value; renderShell(); save(); });
  });

  $('#btnExport').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '班级班务大屏-' + state.className + '.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('数据已导出');
  });
  $('#fileImport').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(reader.result);
        state = deepMerge(createDefaultState(), obj);
        save(); syncSettingsInputs(); renderAll(); toast('数据导入成功');
      } catch (err) { toast('导入失败：文件格式不正确'); }
    };
    reader.readAsText(f); e.target.value = '';
  });
  $('#btnResetData').addEventListener('click', function () {
    if (confirm('确定恢复演示数据？当前修改会被覆盖。')) resetData();
  });
  function resetData() { state = createDefaultState(); localStorage.removeItem(KEY); syncSettingsInputs(); renderAll(); toast('已恢复演示数据'); }

  $('#btnAddModule').addEventListener('click', function () {
    var root = $('#modalRoot');
    var labels = { schedule:'今日课程表', current:'当前课程', homework:'今日作业', duty:'今日值日', countdown:'事件倒计时', overview:'积分总览', radar:'六维画像', groups:'小组积分榜', models:'今日榜样', fun:'今日消消乐', notice:'公告栏', leave:'请假通报', attention:'关注与流水' };
    root.innerHTML = '<div class="modal"><h3>添加 / 显示模块</h3><p class="hint">勾选要显示在大屏上的模块。</p>' +
      state.moduleOrder.map(function (m) {
        return '<label class="module-toggle" style="display:inline-flex;width:48%;margin:3px"><input type="checkbox" data-add-module="' + m + '"' + (state.hiddenModules.indexOf(m) < 0 ? ' checked' : '') + '><span>' + labels[m] + '</span></label>';
      }).join('') + '<div class="modal-actions"><button class="et-btn primary" data-modal="save">确定</button></div></div>';
    root.classList.add('show');
  });

  grid.addEventListener('click', function (e) {
    var gear = e.target.closest('[data-gear]');
    if (gear) { openConfig(gear.dataset.gear); return; }
    var hide = e.target.closest('[data-hide]');
    if (hide) {
      var m = hide.dataset.hide, i = state.hiddenModules.indexOf(m);
      if (i >= 0) state.hiddenModules.splice(i, 1); else state.hiddenModules.push(m);
      applyModuleVisibility(); renderToggles(); save();
    }
  });

  $('#modalRoot').addEventListener('click', function (e) {
    var b = e.target.closest('[data-modal]'); if (!b) return;
    if (b.dataset.modal === 'cancel') { closeModal(); return; }
    var root = $('#modalRoot');
    if (root.dataset.config) {
      var cfg = MODAL_CONFIG[root.dataset.config];
      try { cfg.set($('#modalText').value); } catch (err) { toast('内容格式有误，请检查'); return; }
      save(); renderAll(); closeModal(); toast('配置已保存');
    } else {
      var hidden = [];
      $$('[data-add-module]', root).forEach(function (c) { if (!c.checked) hidden.push(c.dataset.addModule); });
      state.hiddenModules = hidden; applyModuleVisibility(); renderToggles(); save(); closeModal(); toast('模块显示已更新');
    }
    root.dataset.config = '';
  });

  $('#studentSearch').addEventListener('input', renderStudentPicker);
  $('#studentPicker').addEventListener('click', function (e) {
    var b = e.target.closest('[data-stu]'); if (!b) return;
    if (ui.selectedStudents.has(b.dataset.stu)) ui.selectedStudents.delete(b.dataset.stu); else ui.selectedStudents.add(b.dataset.stu);
    renderStudentPicker();
  });
  $('.score-mode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b) return;
    ui.scoreMode = b.dataset.mode;
    $$('.mode-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
    renderBehaviors();
  });
  $('#dimTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-dim]'); if (!b) return;
    ui.selectedDim = b.dataset.dim; renderDimTabs(); renderBehaviors();
  });
  $('#behaviorChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-behavior]'); if (!b) return;
    var list = (state.behaviors[ui.selectedDim] || []).filter(function (x) { return ui.scoreMode === 'plus' ? x.value > 0 : x.value < 0; });
    applyScore(list[+b.dataset.behavior], $('#customReason').value.trim());
  });
  $('#btnSubmitScore').addEventListener('click', function () { applyScore(null, $('#customReason').value.trim()); });
  $('#recentLog').addEventListener('click', function (e) {
    var b = e.target.closest('[data-undo-index]'); if (b) undoEvent(+b.dataset.undoIndex);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if ($('#modalRoot').classList.contains('show')) closeModal();
      else if (ui.editing) exitEdit();
      else closeDrawers();
    }
  });
  window.addEventListener('resize', applyLayout);

  /* ---------------- 启动 ---------------- */
  function applyChrome() {
    document.body.classList.add(MODE === 'admin' ? 'mode-admin' : 'mode-display');
    if (MODE === 'display' || MODE === 'layout') {
      // 编辑按钮保留：班主任需要在教室大屏上直接拖动板块调整自由布局
      $('#btnScore').style.display = 'none';
      // 编辑工具条不用 display:none 隐藏：CSS 已用 transform 在非编辑态滑出屏幕，
      // 若这里设为 none，进编辑态后「重置布局」按钮将无法出现。
      var rail = $('#deskIcons');
      if (rail) rail.style.display = 'none';
    } else {
      var btn = $('#btnScore');
      if (btn) btn.style.display = 'none'; // 管理端统一用侧栏点评入口
      var bar = document.querySelector('.top-right');
      if (bar && !$('#btnCloudSave')) {
        var b = document.createElement('button');
        b.className = 'top-btn'; b.id = 'btnCloudSave';
        b.innerHTML = '<span>☁</span> 保存到云端';
        bar.insertBefore(b, $('#btnFull'));
      }
    }
  }
  function showLogin(forceMessage) {
    var box = $('#loginOverlay');
    if (!box) return;
    box.classList.add('show');
    if (forceMessage) $('#loginError').textContent = forceMessage;
  }
  function hideLogin() {
    var box = $('#loginOverlay');
    if (box) box.classList.remove('show');
  }
  function showAdminApp() {
    var app = $('#adminApp');
    if (app) app.style.display = 'block';
    hideLogin();
  }

  function wireLogin() {
    var loginMode = 'password'; // password | code
    var loginOtp = null;
    var switchBtn = $('#btnSwitchLogin');
    if (switchBtn) switchBtn.addEventListener('click', function () {
      loginMode = loginMode === 'password' ? 'code' : 'password';
      var pwd = $('#pwdField'), cf = $('#codeField');
      if (pwd) pwd.hidden = loginMode !== 'password';
      if (cf) cf.hidden = loginMode !== 'code';
      switchBtn.textContent = loginMode === 'password'
        ? '无密码？改用验证码登录 →' : '已有密码？改用密码登录 →';
      $('#loginError').textContent = '';
    });
    var sendCodeBtn = $('#btnSendVerifyCode');
    if (sendCodeBtn) sendCodeBtn.addEventListener('click', async function () {
      $('#loginError').textContent = '';
      var phone = $('#loginPhone').value.trim();
      if (!/^1\d{10}$/.test(phone)) { $('#loginError').textContent = '请输入正确的 11 位手机号'; return; }
      try {
        var r = await CloudAPI.sendPhoneCode(phone);
        loginOtp = { phone: phone, verificationId: r.verificationId, isExistingUser: r.isExistingUser };
        $('#loginError').style.color = 'var(--positive)';
        $('#loginError').textContent = '验证码已发送，请查收短信';
        setTimeout(function () { $('#loginError').style.color = ''; }, 3000);
      } catch (e) { $('#loginError').textContent = e.message; }
    });
    var login = $('#btnPhoneLogin');
    if (login) login.addEventListener('click', async function () {
      $('#loginError').textContent = '';
      try {
        var phone = $('#loginPhone').value.trim();
        var s;
        if (loginMode === 'code') {
          if (!loginOtp || loginOtp.phone !== phone) { $('#loginError').textContent = '请先获取验证码'; return; }
          var code = ($('#loginVerifyCode') && $('#loginVerifyCode').value.trim()) || '';
          if (!code) { $('#loginError').textContent = '请输入验证码'; return; }
          if (!loginOtp.isExistingUser) { $('#loginError').textContent = '该手机号尚未注册，请前往管理端完成注册'; return; }
          s = await CloudAPI.verifyPhoneCode(loginOtp.phone, loginOtp.verificationId, true, code);
        } else {
          s = await CloudAPI.signInWithPassword(phone, $('#loginPassword').value);
        }
        remoteSession = s;
        showAdminApp();
        await loadCloud();
      } catch (e) { $('#loginError').textContent = e.message; }
    });
    var out = $('#btnLogout');
    if (out) out.addEventListener('click', async function () {
      await CloudAPI.signOut();
      remoteSession = null;
      var app = $('#adminApp'); if (app) app.style.display = 'none';
      showLogin();
      toast('已退出登录');
    });
    var saveBtn = $('#btnCloudSave');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      clearTimeout(saveTimer);
      saveNow();
    });
  }

  /* ---------------- 手机喊话（展示端） ---------------- */
  // 语音逻辑统一由 voice.js 提供：微软 Edge 神经音（唯一在线音源）→ 本地系统音兜底
  // 关键修复：每次播报前重新读取音色列表，避免神经音晚到导致选不中。
  function stopSpeech() {
    if (window.ClassScreenVoice) window.ClassScreenVoice.stop();
  }
  function speakShout(text, cfg, onDone) {
    if (window.ClassScreenVoice) {
      window.ClassScreenVoice.speakShout(text, cfg, onDone);
      return;
    }
    // voice.js 未加载：保持静默，绝不用本地系统语音（机械音）
    if (onDone) onDone(0);
  }
  function hideShout() {
    clearTimeout(shoutTimers.hide);
    clearInterval(shoutTimers.tick);
    var ov = $('#shoutOverlay');
    if (ov) ov.classList.remove('show');
    // 同步给桌面悬浮控制台：它读取此属性弹出真正置顶的喊话蒙版
    try { if (document.body) document.body.removeAttribute('data-live-shout'); } catch (e) {}
    stopSpeech();
  }
  /* 把当前 shoutStyle 应用到网页喊话蒙版，返回解析好的样式（桌面端也要用） */
  function applyShoutStyleToOverlay() {
    var overlay = $('#shoutOverlay');
    var shoutStyle = window.resolveShoutStyle ? window.resolveShoutStyle(state) : null;
    if (overlay && shoutStyle) {
      overlay.setAttribute('data-template', shoutStyle.template);
      overlay.style.setProperty('--shout-bg', shoutStyle.bg);
      overlay.style.setProperty('--shout-fg', shoutStyle.fg);
      overlay.style.setProperty('--shout-accent', shoutStyle.accent);
      overlay.style.setProperty('--shout-size', shoutStyle.size + 'px');
      var iconEl = document.getElementById('shoutIcon');
      if (iconEl) iconEl.textContent = shoutStyle.icon;
    }
    return shoutStyle;
  }
  function showShout(s) {
    var text = (s && s.text || '').trim();
    if (!text) return;
    var duration = Math.max(3, +s.duration || 12);
    var overlay = $('#shoutOverlay');
    var textEl = $('#shoutTextDisplay');
    var fromEl = $('#shoutFrom');
    var bar = $('#shoutProgressBar');
    if (!overlay || !textEl) return;
    textEl.textContent = text;
    if (fromEl) fromEl.textContent = (s.from || '班主任') + ' · ' + ((s.createdAt && new Date(s.createdAt).toTimeString().slice(0, 5)) || new Date().toTimeString().slice(0, 5));
    hideShout();
    // 班主任在后台选的模板与背景色：网页蒙版用 CSS 变量应用，
    // 同时把解析好的样式塞进 data-live-shout 让桌面置顶蒙版照着画。
    var shoutStyle = applyShoutStyleToOverlay();
    overlay.classList.add('show');
    // 暴露实时喊话状态给桌面端 CDP 读取。网页蒙版在浏览器窗口内无法置顶于
    // 其他软件之上；桌面控制台读到这里后弹 TopMost 蒙版，保证喊话总被看到。
    // ★必须放在 hideShout() 之后★：hideShout 会 removeAttribute，若放在它之前
    // 属性会被立刻清掉，桌面控制台永远读不到 → 强制置顶蒙版不弹（2026-11-24 修复）。
    try {
      if (document.body) document.body.setAttribute('data-live-shout', JSON.stringify({
        id: s.id || (text + '|' + Date.now()),
        text: text,
        from: s.from || '班主任',
        duration: duration,
        startedAt: Date.now(),
        style: shoutStyle
      }));
    } catch (e) {}
    var hideMs = duration * 1000;
    var shoutCfg = { voice: s.voice, voiceSpeed: s.voiceSpeed };
    // 若浏览器尚未由用户手势激活语音，显示“点击开启声音”引导；
    // 点击弹层任意位置 = 真实用户手势 → 解锁并立即重播（这是大屏无人值守时的兜底）。
    var activated = !window.ClassScreenVoice || !window.ClassScreenVoice.isUnlocked || window.ClassScreenVoice.isUnlocked();
    var hint = document.getElementById('shoutUnlockHint');
    if (hint) hint.style.display = activated ? 'none' : 'block';
    overlay.onclick = function () {
      if (window.ClassScreenVoice && window.ClassScreenVoice.unlock) window.ClassScreenVoice.unlock();
      if (hint) hint.style.display = 'none';
      // 若当前是因未激活而静默，点击后立即重播一次
      if (window.ClassScreenVoice && window.ClassScreenVoice.getLastSource &&
          window.ClassScreenVoice.getLastSource() === 'none') {
        speakShout(text, shoutCfg, function () {});
      }
    };
    if (s.speak !== false) {
      // 神经人声优先，自动按语音长度延长停留时间
      speakShout(text, shoutCfg, function (audioSec) {
        if (audioSec > 0) {
          var need = (audioSec + 1.2) * 1000;
          if (need > hideMs) {
            hideMs = need;
            clearTimeout(shoutTimers.hide);
            shoutTimers.hide = setTimeout(hideShout, hideMs);
          }
        }
      });
    }
    // 进度条动画（按当前 hideMs 走）
    var start = Date.now();
    clearInterval(shoutTimers.tick);
    shoutTimers.tick = setInterval(function () {
      var p = Math.min(1, (Date.now() - start) / hideMs);
      if (bar) bar.style.transform = 'scaleX(' + (1 - p) + ')';
    }, 80);
    clearTimeout(shoutTimers.hide);
    shoutTimers.hide = setTimeout(hideShout, hideMs);
  }
  function checkShout(s) {
    if (!s || !s.id || !s.text) return;
    var last = lastShoutId;
    try { last = localStorage.getItem(SHOUT_SEEN_KEY) || last; } catch (e) { /* 忽略 */ }
    if (s.id === last) return; // 已播报过，避免刷新/轮询重复
    lastShoutId = s.id; // 内存兜底：即使 localStorage 不可用也不会每 5 秒重复播
    // 只播报近 3 分钟内的喊话：避免一体机刚开机弹出昨天/上周的旧消息
    if (s.createdAt && (Date.now() - new Date(s.createdAt).getTime()) > 3 * 60 * 1000) {
      try { localStorage.setItem(SHOUT_SEEN_KEY, s.id); } catch (e) { /* 忽略 */ }
      return;
    }
    try { localStorage.setItem(SHOUT_SEEN_KEY, s.id); } catch (e) { /* 忽略 */ }
    showShout(s);
  }

  async function loadCloud() {
    try {
      var row = await CloudAPI.loadBoard();
      if (row && row.data && Object.keys(row.data).length) {
        state = normalizeState(deepMerge(createDefaultState(), row.data));
        // 云端布局版本变新（教师端刚保存）→ 强制采用云端，清掉本机旧草稿。
        // 避免教室电脑时钟偏快时，本机草稿版本号压过云端导致新布局推不过去。
        try {
          var cloudVer = +state.layoutVersion || 0;
          var seen = +localStorage.getItem(CLOUD_SEEN_KEY) || 0;
          if (cloudVer > seen) {
            localStorage.removeItem(LAYOUT_KEY);
            localStorage.setItem(CLOUD_SEEN_KEY, String(cloudVer));
          }
        } catch (e) {}
        applyLocalLayoutOverride(); // 本机布局优先，避免教室端拖拽被轮询覆盖
        syncSettingsInputs();
        renderAll();
        lastCloudOk = Date.now();
        writeSnapshot(); // 同步成功即落地快照，供云端故障时兜底
        setSync((window.CLOUD_CONFIG && window.CLOUD_CONFIG.local ? '本地已同步 · ' : '云端已同步 · ') + (row.updated_at ? new Date(row.updated_at).toLocaleString('zh-CN', { hour12: false }) : ''));
        if (MODE === 'display') checkShout(state.shout);
      } else if (MODE === 'admin') {
        setSync((window.CLOUD_CONFIG && window.CLOUD_CONFIG.local ? '本地暂无数据 · 修改后点「保存」初始化' : '云端暂无数据 · 修改后点「保存到云端」初始化'));
      } else {
        setSync('等待班主任配置');
      }
    } catch (e) {
      if (MODE === 'display' && restoreFromSnapshot()) {
        // 云端故障（如环境暂停/欠费）：保持最后一份数据继续展示，不清屏不退回默认
      } else {
        setSync((window.CLOUD_CONFIG && window.CLOUD_CONFIG.local ? '本地服务器连接失败' : '云端连接失败'));
      }
      if (MODE === 'admin') toast((window.CLOUD_CONFIG && window.CLOUD_CONFIG.local ? '读取本地数据失败：' : '读取云端数据失败：') + e.message);
    }
  }

  async function bootCloud() {
    cloudReady = CloudAPI.init();
    if (!cloudReady) {
      // 未部署/无网络时保持本地演示模式
      setSync('本地演示模式');
      return;
    }
    if (MODE === 'admin') {
      var r = await CloudAPI.restoreAuth();
      if (r.callbackError) { showLogin(r.callbackError); return; }
      if (!r.session) { showLogin(); return; }
      remoteSession = r.session;
      showAdminApp();
      await loadCloud();
      // 展示端轮询保持数据同步
    } else {
      // 启动先用本地快照渲染，云端失败/未配置时也不会退回默认演示数据
      restoreFromSnapshot();
      await loadCloud();
      // 教师端布局预览只读一次云端：拖拽过程中不能被轮询重绘打断。
      // 大屏轮询 5s→20s：教室机常开时请求量降到 1/4，显著节省云端资源点。
      if (MODE === 'display') setInterval(loadCloud, POLL_MS);
    }
  }

  // 语音解锁统一由 voice.js 处理（autoUnlock 自动探测 + 首次交互兜底），此处不重复绑定。

  // 缓存自愈：如果加载到旧版语音模块（浏览器缓存了旧 voice.js），
  // 自动硬刷新一次让带版本号的脚本生效；用 sessionStorage 标记防止死循环。
  (function ensureFreshVoice() {
    var EXPECT = '20261123k';
    if (MODE !== 'display') return; // 只在大屏端做，避免影响后台
    try {
      var v = window.ClassScreenVoice && window.ClassScreenVoice.version ? window.ClassScreenVoice.version : '';
      if (v.indexOf(EXPECT) >= 0) return; // 已是最新版
      var k = 'csVoiceReload';
      if (sessionStorage.getItem(k) === EXPECT) return; // 本会话已刷新过一次，不再重试
      sessionStorage.setItem(k, EXPECT);
      logVoice('检测到旧版语音模块(' + (v || '缺失') + ')，自动刷新以加载新版');
      location.reload(true);
    } catch (e) { /* 无 sessionStorage 时跳过 */ }
  })();
  function logVoice(m) { try { console.log('[班务大屏] ' + m); } catch (e) { /* 忽略 */ } }

  /* ---------------- 随机点名（桌面悬浮条 / 后台教学工具共用） ---------------- */
  var rollTimer = null;          // 快速滚动名字的定时器
  var rollStopTimer = null;      // 自动停止的兜底定时器
  var rollRunning = false;
  var rollPickIndex = -1;        // 本轮最终点到的学生下标
  function rollList() {
    var arr = (state.students || []).map(function (s) { return String((s && s.name) || '').trim(); })
      .filter(function (n) { return !!n; });
    return arr;
  }
  function rollStop() {
    if (!rollRunning) return;
    rollRunning = false;
    clearInterval(rollTimer); rollTimer = null;
    clearTimeout(rollStopTimer); rollStopTimer = null;
    var ov = $('#rollOverlay');
    if (ov) ov.classList.remove('rolling');
    var list = rollList();
    var hint = $('#rollHint');
    if (!list.length) { if (hint) hint.textContent = '暂无学生名单，请先在后台导入'; return; }
    // 让最终名字均匀落在名单内，避免连续滚动恰好停在最后一个
    if (rollPickIndex < 0 || rollPickIndex >= list.length) rollPickIndex = Math.floor(Math.random() * list.length);
    var nameEl = $('#rollName');
    if (nameEl) nameEl.textContent = list[rollPickIndex];
    if (hint) hint.textContent = '本次点到 · 再次点击关闭';
    // 用班车人声读出被点到的同学（无语音模块时静默，不影响展示）
    speakShout('这次点到的是，' + list[rollPickIndex] + '同学', {}, function () {});
  }
  function rollStart() {
    var list = rollList();
    var ov = $('#rollOverlay');
    var nameEl = $('#rollName');
    var hint = $('#rollHint');
    if (!ov || !nameEl) return;
    if (!list.length) {
      toast('暂无学生名单，请先在后台导入');
      return;
    }
    if (rollRunning) return; // 滚动中点第二次 = 停止点名（见 toggle）
    rollRunning = true;
    rollPickIndex = Math.floor(Math.random() * list.length);
    ov.classList.add('show');
    ov.classList.add('rolling');
    if (hint) hint.textContent = '正在随机点名 · 再次点击停止';
    clearInterval(rollTimer);
    rollTimer = setInterval(function () {
      nameEl.textContent = list[Math.floor(Math.random() * list.length)];
    }, 70);
    // 兜底：3.2 秒后自动定格，防止悬浮条连点导致一直滚
    clearTimeout(rollStopTimer);
    rollStopTimer = setTimeout(rollStop, 3200);
  }
  function rollToggle() {
    if (rollRunning) { rollStop(); return 'stopped'; }
    // 弹层已显示但处于定格态 → 再点一次关闭
    var ov = $('#rollOverlay');
    if (ov && ov.classList.contains('show')) {
      ov.classList.remove('show');
      return 'closed';
    }
    rollStart();
    return 'started';
  }
  function rollHide() {
    rollRunning = false;
    clearInterval(rollTimer); rollTimer = null;
    clearTimeout(rollStopTimer); rollStopTimer = null;
    var ov = $('#rollOverlay');
    if (ov) { ov.classList.remove('show'); ov.classList.remove('rolling'); }
  }
  // 暴露给桌面悬浮控制台通过 CDP 调用（展示端始终可用，与登录态无关）
  window.ClassScreenRollCall = {
    toggle: rollToggle,
    start: rollStart,
    stop: rollStop,
    hide: rollHide,
    version: '20261126roll1'
  };
  /* 自由布局：教师端预览通过同源 localStorage 读草稿，这里提供只读接口便于核对与测试 */
  window.ClassScreenFreeLayout = {
    mode: MODE,
    getRects: function () { return JSON.parse(JSON.stringify(state.panelRects || {})); },
    getVersion: function () { return +state.layoutVersion || 0; },
    save: function () { markLayoutEdited(); return +state.layoutVersion || 0; },
    version: '20261126sync3'
  };
  // 教师端可主动拉取当前预览布局，避免「完成」通知因 iframe 缓存旧脚本而丢失
  if (MODE === 'layout' && window.parent && window.parent !== window) {
    window.addEventListener('message', function (e) {
      if (!e || !e.data || e.data.type !== 'classScreenRequestLayout') return;
      if (e.origin && e.origin !== location.origin) return;
      try {
        window.parent.postMessage({
          type: 'classScreenLayoutData',
          panelRects: state.panelRects,
          version: +state.layoutVersion || 0
        }, '*');
      } catch (err) {}
    });
    try { window.parent.postMessage({ type: 'classScreenLayoutReady' }, '*'); } catch (e) {}
  }
  /* 喊话控制：桌面端/自动化测试可通过 CDP 驱动；桌面端实际走 data-live-shout 轮询 */
  window.ClassScreenShout = {
    show: function (s) { showShout(s); },
    hide: hideShout,
    setStyle: function (cfg) {
      state.shoutStyle = state.shoutStyle || {};
      if (cfg && cfg.template) state.shoutStyle.template = cfg.template;
      if (cfg && cfg.bgColor != null) state.shoutStyle.bgColor = cfg.bgColor;
      return applyShoutStyleToOverlay();
    },
    getStyle: function () { return window.resolveShoutStyle ? window.resolveShoutStyle(state) : null; },
    version: '20261126shout1'
  };

  setupEditActions();
  syncSettingsInputs();
  applyChrome();
  wireLogin();
  renderAll();
  renderClock();
  applyLayout();
  setInterval(renderClock, 1000);
  setInterval(function () { renderSchedule(); renderCurrent(); renderCountdown(); }, 30000);
  if (window.ClassScreenVoice) window.ClassScreenVoice.refreshVoices(); // 语音模块自带持续刷新
  bootCloud();
})();
