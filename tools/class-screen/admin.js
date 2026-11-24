/* 班级管理中心：云端读写 + 行为簿式班级管理（免费版） */
(function () {
  'use strict';
  var state = createDefaultState();
  var session = null;
  var access = null;
  var allClasses = [];
  var pendingOtp = null;
  var codeOtp = null;
  var resetOtp = null;
  var registerName = '';
  var selectedStudents = new Set();
  var selectedAtt = new Set();
  var scoreMode = 'plus';
  var activeDim = state.dims[0];
  var activePage = 'home';
  var rollTimer = null;
  var rollNameText = '';
  var timerHandle = null, timerLeft = 0;

  var QUICK_SHOUTS = [
    '请安静下来，准备上课', '请各组组长收齐作业', '请坐端正，认真听讲',
    '下课了，请整理好桌面', '放学请关好门窗、带走垃圾', '请大家准备好课本和笔记',
    '距离考试还有一周，加油！', '请排好队，有序离开教室'
  ];

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var cloudReady = CloudAPI.init();
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var todayKey = dayKey();

  function msg(t) { $('#authMsg').textContent = t || ''; }
  function toast(t) {
    var el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }
  function sync(t) { $('#sync').textContent = t; }
  function initials(name) { var s = String(name || '?').trim(); return s ? s.charAt(0) : '?'; }

  /* ---------- 页面导航 ---------- */
  function goto(page, subTab) {
    activePage = page;
    $$('.side-item').forEach(function (b) { b.classList.toggle('active', b.dataset.page === page); });
    $$('.page').forEach(function (p) { p.classList.toggle('active', p.dataset.pane === page); });
    if (page === 'home') renderHome();
    if (page === 'stats') renderStats();
    if (page === 'tools') { renderAttendance(); }
    if (page === 'manage') {
      if (subTab) switchManageTab(subTab);
      renderManageLists();
    }
    if (page === 'access') renderAdminPanel();
    if (page === 'me') renderProfile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function switchManageTab(tab) {
    $$('#manageTabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.mtab === tab); });
    $$('.subpane').forEach(function (p) { p.classList.toggle('active', p.dataset.spane === tab); });
  }

  /* ---------- 角色与班级权限 ---------- */
  function availableClasses() {
    if (!access) return [];
    if (access.role === 'admin') return allClasses;
    return allClasses.filter(function (c) { return access.classes.indexOf(c.board_key) >= 0; });
  }
  function renderClassOptions() {
    var list = availableClasses();
    var current = CloudAPI.getBoardKey();
    if (!list.some(function (c) { return c.board_key === current; })) {
      current = list.length ? list[0].board_key : current;
      CloudAPI.setBoardKey(current);
    }
    $('#classSelect').innerHTML = list.map(function (c) {
      return '<option value="' + esc(c.board_key) + '">' + esc(c.class_name) + '（' + esc(c.board_key) + '）</option>';
    }).join('') || '<option value="' + esc(current) + '">当前班级</option>';
    $('#classSelect').value = current;
  }
  function applyAccessUI() {
    var isAdmin = !!(access && access.role === 'admin');
    var isBlocked = !!(access && access.role === 'blocked');
    $$('.admin-only').forEach(function (el) { el.hidden = !isAdmin; });
    $('#blockedView').hidden = !isBlocked;
    var hasClass = !isBlocked && !!(access && (isAdmin || access.classes.length));
    $('#noAccess').hidden = hasClass || isBlocked;
    $('#mainContent').hidden = !hasClass;
    $$('.side-item').forEach(function (b) {
      var adminItem = b.classList.contains('admin-only');
      b.hidden = (!hasClass && b.dataset.page !== 'me') || (adminItem && !isAdmin);
    });
    $('#openScreen').hidden = isBlocked;
    if (!hasClass) { $('#myName').textContent = access ? access.displayName : '班主任'; return; }
    $('#who').textContent = access.displayName + ' · ' + (isAdmin ? '管理员' : '班主任');
    renderClassOptions();
    renderProfile();
  }
  async function initAccess() {
    var name = registerName || null;
    access = await CloudAPI.getMyAccess(session, name);
    registerName = '';
    if (access.role !== 'blocked') allClasses = await CloudAPI.listClasses();
    applyAccessUI();
  }

  /* ---------- 管理员面板 ---------- */
  async function renderAdminPanel() {
    if (!access || access.role !== 'admin') return;
    try {
      allClasses = await CloudAPI.listClasses();
      $('#classLinks').innerHTML = allClasses.map(function (c) {
        return '<a class="class-link" href="' + esc(CloudAPI.boardUrl(c.board_key)) + '" target="_blank">' +
          esc(c.class_name) + ' · 大屏 ↗</a>';
      }).join('') || '<span class="hint">还没有班级，请先创建一个。</span>';

      var users = await CloudAPI.listUsers();
      var adminCount = users.filter(function (u) { return u.role === 'admin'; }).length;
      // 是否待分配：非管理员且没有任何班级授权
      function isPending(u) { return u.role !== 'admin' && !(u.classes && u.classes.length); }
      var pending = users.filter(isPending);
      var assigned = users.filter(function (u) { return !isPending(u); });
      var pendingCount = pending.length;

      function renderUser(u) {
        var checks = allClasses.map(function (c) {
          var on = u.classes.indexOf(c.board_key) >= 0;
          return '<label class="class-check"><input type="checkbox" data-assign-user="' + esc(u.user_id) +
            '" data-assign-class="' + esc(c.board_key) + '"' + (on ? ' checked' : '') + ' />' + esc(c.class_name) + '</label>';
        }).join('');
        var isAdmin = u.role === 'admin';
        var pendingUser = isPending(u);
        var roleCls = isAdmin ? ' admin' : (pendingUser ? ' pending' : '');
        var roleTxt = isAdmin ? '管理员' : (pendingUser ? '待分配' : '班主任');
        return '<div class="user-row' + (pendingUser ? ' pending-row' : '') + '">' +
          '<div class="user-top"><span class="user-name">' + esc(u.display_name) + '</span>' +
          '<span class="user-role' + roleCls + '">' + roleTxt + '</span>' +
          '<span class="user-id">' + esc(u.user_id) + '</span></div>' +
          '<div class="user-classes">' + (checks || '<span class="hint">尚未分配班级，勾选下方班级即成为该班班主任</span>') + '</div>' +
          '<div class="user-actions">' + (isAdmin && adminCount <= 1
            ? '<button class="mini" disabled title="至少保留一名管理员">最后管理员不可降级</button>'
            : '<button class="mini" data-set-role="' + esc(u.user_id) +
              '" data-next-role="' + (isAdmin ? 'teacher' : 'admin') + '">' + (isAdmin ? '降为班主任' : '设为管理员') + '</button>') +
          (isAdmin ? '' : '<button class="mini" style="color:#e05a5a" data-delete-user="' + esc(u.user_id) +
           '" data-delete-name="' + esc(u.display_name) + '">删除班主任</button>') + '</div>' +
          '</div>';
      }
      var html = '';
      if (pendingCount) {
        html += '<div class="user-group-title pending-title">待分配（' + pendingCount + ' 人 · 已注册但未授权班级，登录后将等待分配）</div>';
        html += pending.map(renderUser).join('');
        html += '<div class="user-group-title">已授权班主任 / 管理员</div>';
      }
      html += assigned.map(renderUser).join('');
      $('#userList').innerHTML = html || '<span class="hint">还没有注册用户。老师注册后会出现在这里。</span>';

      var blocked = await CloudAPI.listBlocked();
      $('#blockedList').innerHTML = blocked.map(function (b) {
        return '<div class="user-row"><div class="user-top"><span class="user-name">' + esc(b.display_name || '班主任') + '</span>' +
          (b.phone ? '<span class="user-id">' + esc(b.phone) + '</span>' : '') + '</div>' +
          '<div class="user-actions"><button class="mini" data-restore="' + esc(b.user_id) + '">恢复注册</button></div></div>';
      }).join('') || '<span class="hint">没有被删除的班主任。</span>';
    } catch (e) { toast('加载权限面板失败：' + e.message); }
  }

  /* ---------- 表单序列化与回填 ---------- */
  function lines(k) { var el = $('[data-key="' + k + '"]'); return ((el && el.value) || '').split('\n').filter(function (x) { return x.trim(); }); }
  function serialize() {
    var schedule = lines('schedule').map(function (l) { var p = l.split('|'); return { subject: p[0] || '自习', start: p[1] || '08:00', end: p[2] || '08:40' }; });
    var homework = lines('homework').map(function (l) { var p = l.split('|'); return { subject: p[0] || '其他', title: p[1] || '作业', detail: p[2] || '' }; });
    var by = {}; homework.forEach(function (h) { (by[h.subject] = by[h.subject] || []).push({ title: h.title, detail: h.detail }); });
    state.className = ($('[data-key="className"]').value || '').trim() || '班级';
    state.slogan = $('[data-key="slogan"]').value || '';
    state.quote = $('[data-key="quote"]').value || '';
    state.countdown = { title: $('[data-key="countdownTitle"]').value || '班级活动', date: $('[data-key="countdownDate"]').value || state.countdown.date };
    state.schedule = schedule;
    state.homework = Object.keys(by).map(function (k) { return { subject: k, items: by[k] }; });
    state.duty = lines('duty').map(function (l) { var p = l.split('|'); return { task: p[0] || '值日', names: p[1] || '' }; });
    state.announcements = lines('notices').map(function (l, i) { var p = l.split('|'); return { title: p[0] || '公告', text: p[1] || '', accent: p[2] || ['#ffc97a', '#7fd6c0', '#9db8ff'][i % 3] }; });
    state.models = lines('models').map(function (l) { var p = l.split('|'); return { name: p[0] || '', role: p[1] || '优秀学生', score: +p[2] || 0, emoji: p[3] || '🌟' }; });
    state.fun = lines('fun').map(function (l) { var p = l.split('|'); return { subject: p[0] || '其他', title: p[1] || '任务', total: +p[2] || 45, done: +p[3] || 0, unfinished: p[4] || '' }; });
  }
  function set(k, v) { var el = $('[data-key="' + k + '"]'); if (el) el.value = v == null ? '' : v; }
  function fillForm() {
    set('className', state.className); set('slogan', state.slogan); set('quote', state.quote);
    set('countdownTitle', state.countdown.title); set('countdownDate', state.countdown.date);
    set('schedule', state.schedule.map(function (c) { return [c.subject, c.start, c.end].join('|'); }).join('\n'));
    var hw = []; state.homework.forEach(function (h) { h.items.forEach(function (it) { hw.push([h.subject, it.title, it.detail].join('|')); }); });
    set('homework', hw.join('\n'));
    set('duty', state.duty.map(function (d) { return [d.task, d.names].join('|'); }).join('\n'));
    set('notices', state.announcements.map(function (a) { return [a.title, a.text, a.accent].join('|'); }).join('\n'));
    set('models', state.models.map(function (m) { return [m.name, m.role, m.score, m.emoji].join('|'); }).join('\n'));
    set('fun', state.fun.map(function (f) { return [f.subject, f.title, f.total, f.done, f.unfinished].join('|'); }).join('\n'));
    renderChips(); renderShout(); renderHome();
  }

  /* ---------- 保存 / 读取 ---------- */
  async function save() {
    try {
      serialize();
      await CloudAPI.saveBoard(state, session);
      sync('已保存 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      toast('已同步到大屏');
      return true;
    } catch (e) { sync('保存失败'); toast('保存失败：' + e.message); return false; }
  }
  async function load() {
    try {
      var row = await CloudAPI.loadBoard();
      if (row && row.data && Object.keys(row.data).length) state = Object.assign(createDefaultState(), row.data);
      else state = CloudAPI.blankState();
      state.attendance = state.attendance || {};
      fillForm(); renderStudents(); renderDims(); renderLog(); renderManageLists(); renderStats(); renderAttendance();
      sync(row && row.updated_at ? '已同步 · ' + new Date(row.updated_at).toLocaleString('zh-CN', { hour12: false }) : '云端暂无数据，修改后点保存初始化');
      return true;
    } catch (e) { sync('读取失败：' + e.message); toast('读取失败：' + e.message); return false; }
  }

  /* ---------- 工作台 ---------- */
  function renderHome() {
    $('#heroClass').textContent = state.className || '班级';
    $('#heroSlogan').textContent = state.slogan || '今天也要元气满满';
    $('#stStudents').textContent = state.students.length;
    $('#stGroups').textContent = state.groups.length;
    $('#stPoints').textContent = state.students.reduce(function (a, s) { return a + (s.points || 0); }, 0);
    var today = dayKey();
    $('#stToday').textContent = (state.events || []).filter(function (e) { return e.date === today; }).length;
    var evs = (state.events || []).slice(0, 6);
    $('#homeFeed').innerHTML = evs.length ? evs.map(function (e) {
      return '<div class="feed-row"><div class="feed-avatar">' + esc(initials(e.name)) + '</div>' +
        '<div class="feed-main"><span class="feed-name">' + esc(e.name) + '</span> <span class="feed-label">' + esc(e.label) + '</span></div>' +
        '<span class="feed-time">' + esc(e.time || '') + '</span>' +
        '<span class="delta ' + (e.delta >= 0 ? 'plus' : 'minus') + '">' + (e.delta > 0 ? '+' : '') + e.delta + '</span></div>';
    }).join('') : '<div class="empty">还没有点评记录，去「行为点评」添加第一条吧</div>';
  }

  /* ---------- 喊话 ---------- */
  function renderShout() {
    var quick = $('#shoutQuick');
    if (quick && !quick.dataset.done) {
      quick.innerHTML = QUICK_SHOUTS.map(function (t) { return '<button type="button" data-quick="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
      quick.dataset.done = '1';
    }
    var hist = $('#shoutHistory');
    if (!hist) return;
    var list = (state.shoutHistory || []).slice(0, 8);
    hist.innerHTML = list.length ? list.map(function (h) {
      return '<div class="h-row"><span class="h-time">' + esc(h.time || '') + '</span><span>' + esc(h.text || '') + '</span></div>';
    }).join('') : '<div class="empty">还没有喊话记录</div>';
  }
  async function sendShoutText(text, opts) {
    text = (text || '').trim();
    if (!text) { toast('请先输入喊话内容'); return false; }
    opts = opts || {};
    var duration = opts.duration || +($('#shoutDuration').value) || 12;
    var speak = opts.speak == null ? $('#shoutSpeak').checked : opts.speak;
    var voice = opts.voice || (($('#shoutVoice') && $('#shoutVoice').value) || 'xiaoxiao');
    var voiceSpeed = opts.voiceSpeed || +($('#shoutSpeed').value) || 4;
    var now = new Date();
    var prevShout = state.shout;
    var prevHistory = (state.shoutHistory || []).slice();
    var id = 'shout_' + now.getTime() + '_' + Math.floor(Math.random() * 1000);
    state.shout = {
      id: id, text: text, from: (session && session.user && (session.user.name || session.user.email)) || (access && access.displayName) || '班主任',
      duration: duration, speak: speak, voice: voice, voiceSpeed: voiceSpeed, createdAt: now.toISOString()
    };
    state.shoutHistory = state.shoutHistory || [];
    state.shoutHistory.unshift({ time: now.toTimeString().slice(0, 5), text: text });
    state.shoutHistory = state.shoutHistory.slice(0, 30);
    try {
      await CloudAPI.saveBoard(state, session);
      sync('喊话已发送 · ' + now.toLocaleTimeString('zh-CN', { hour12: false }));
      renderShout(); toast('📢 已喊话到大屏');
      return true;
    } catch (e) {
      state.shout = prevShout; state.shoutHistory = prevHistory;
      toast('喊话失败：' + e.message); return false;
    }
  }
  function sendShout() {
    var text = $('#shoutText').value;
    sendShoutText(text).then(function (ok) {
      if (ok) { $('#shoutText').value = ''; $('#shoutCount').textContent = '0'; }
    });
  }

  /* ---------- 行为点评 ---------- */
  function renderStudents() {
    var q = ($('#searchStu').value || '').trim();
    var list = state.students.filter(function (s) { return !q || s.name.indexOf(q) >= 0 || String(s.no).indexOf(q) >= 0; });
    $('#stuGrid').innerHTML = list.map(function (s) {
      return '<button class="stu' + (selectedStudents.has(s.id) ? ' on' : '') + '" data-id="' + esc(s.id) + '">' + esc(s.name) + '</button>';
    }).join('') || '<div class="empty">没有匹配的学生，或还没有添加学生</div>';
    $('#selTip').textContent = '已选 ' + selectedStudents.size + ' 人';
  }
  function renderDims() {
    $('#dimChips').innerHTML = state.dims.map(function (d) {
      return '<button class="chip' + (activeDim === d ? ' active' : '') + '" data-dim="' + esc(d) + '">' + esc(d) + '</button>';
    }).join('');
    renderBehaviors();
  }
  function renderBehaviors() {
    var list = (state.behaviors[activeDim] || []).filter(function (b) { return scoreMode === 'plus' ? b.value > 0 : b.value < 0; });
    $('#behaviorChips').innerHTML = list.map(function (b, i) {
      return '<button class="chip" data-bi="' + i + '">' + esc(b.label) + ' ' + (b.value > 0 ? '+' : '') + b.value + '</button>';
    }).join('') || '<span class="hint">该分类下暂无' + (scoreMode === 'plus' ? '加分' : '扣分') + '细则，可在「班级管理 → 行为细则」添加</span>';
  }
  function renderLog() {
    $('#recentLog').innerHTML = (state.events || []).slice(0, 12).map(function (e) {
      return '<div class="log-row"><span class="log-time">' + esc(e.time || '') + '</span><span>' + esc(e.name) + ' · ' + esc(e.label) + '</span>' +
        '<span class="log-delta ' + (e.delta >= 0 ? 'plus' : 'minus') + '">' + (e.delta > 0 ? '+' : '') + e.delta + '</span></div>';
    }).join('') || '<div class="empty">暂无流水</div>';
  }
  async function applyScore(behavior) {
    if (!selectedStudents.size) { toast('请先选择学生'); return; }
    var delta = behavior ? behavior.value : (scoreMode === 'plus' ? 1 : -1);
    var label = behavior ? behavior.label : (($('#reason').value || '').trim() || (scoreMode === 'plus' ? '自定义加分' : '自定义扣分'));
    var nowScore = new Date();
    var time = nowScore.toTimeString().slice(0, 5);
    var dayIdx = (nowScore.getDay() + 6) % 7;
    var names = [];
    state.students.forEach(function (s) {
      if (!selectedStudents.has(s.id)) return;
      s.points = (s.points || 0) + delta;
      if (delta > 0) s.positive = (s.positive || 0) + delta; else s.negative = (s.negative || 0) + Math.abs(delta);
      s.dim[activeDim] = (s.dim[activeDim] || 0) + delta;
      s.trend = s.trend || [0, 0, 0, 0, 0, 0, 0]; s.trend[dayIdx] = (s.trend[dayIdx] || 0) + delta;
      state.groups.forEach(function (g) { if (g.members.indexOf(s.name) >= 0) g.points = (g.points || 0) + delta; });
      state.events.unshift({ time: time, date: dayKey(nowScore), idx: dayIdx, name: s.name, label: label, delta: delta, dim: activeDim });
      names.push(s.name);
    });
    state.weekNet = state.weekNet || [0, 0, 0, 0, 0, 0, 0];
    state.weekNet[dayIdx] = (state.weekNet[dayIdx] || 0) + delta * names.length;
    selectedStudents.clear();
    renderStudents(); renderLog(); renderHome(); renderStats();
    var scored = await save();
    if (scored) toast(names.length + ' 人已' + (delta > 0 ? '加' : '扣') + Math.abs(delta) + '分 · ' + label);
  }
  async function undoLast() {
    var e = state.events[0];
    if (!e) { toast('没有可撤销的记录'); return; }
    state.students.forEach(function (s) {
      if (s.name !== e.name) return;
      s.points -= e.delta;
      if (e.delta > 0) s.positive = Math.max(0, (s.positive || 0) - e.delta);
      else s.negative = Math.max(0, (s.negative || 0) - Math.abs(e.delta));
      s.dim[e.dim] = (s.dim[e.dim] || 0) - e.delta;
      var idx = typeof e.idx === 'number' ? e.idx : 6;
      if (s.trend) s.trend[idx] = (s.trend[idx] || 0) - e.delta;
      state.groups.forEach(function (g) { if (g.members.indexOf(s.name) >= 0) g.points -= e.delta; });
    });
    var undoIdx = typeof e.idx === 'number' ? e.idx : 6;
    state.weekNet[undoIdx] = (state.weekNet[undoIdx] || 0) - e.delta;
    state.events.shift();
    renderLog(); renderHome(); renderStats();
    if (await save()) toast('已撤销：' + e.name + ' ' + (e.delta > 0 ? '+' : '') + e.delta);
  }

  /* ---------- 统计 ---------- */
  function renderStats() {
    var type = ($('#statSeg .active') || {}).dataset ? $('#statSeg .active').dataset.stat : 'person';
    var max = 1, rows = [];
    var dimPanel = $('#dimPanel');
    if (dimPanel) dimPanel.hidden = type !== 'dim';
    if (type === 'person') {
      var ss = state.students.slice().sort(function (a, b) { return (b.points || 0) - (a.points || 0); });
      max = Math.max.apply(null, ss.map(function (s) { return s.points || 0; }).concat([1]));
      rows = ss.slice(0, 20).map(function (s, i) {
        return rankRow(i, initials(s.name), s.name, '学号 ' + (s.no || '-'), s.points || 0, max);
      });
    } else if (type === 'group') {
      var gs = state.groups.slice().sort(function (a, b) { return (b.points || 0) - (a.points || 0); });
      max = Math.max.apply(null, gs.map(function (g) { return g.points || 0; }).concat([1]));
      rows = gs.map(function (g, i) {
        return rankRow(i, '组', g.name, g.members.length + ' 人', g.points || 0, max);
      });
    } else {
      var avgs = state.dims.map(function (d) {
        return state.students.length ? state.students.reduce(function (a, s) { return a + (s.dim[d] || 0); }, 0) / state.students.length : 0;
      });
      var dimMax = Math.max.apply(null, avgs.concat([1]));
      rows = state.dims.map(function (d, i) {
        return '<div class="rank-row"><div class="rank-avatar">' + esc(initials(d)) + '</div><div class="rank-main">' +
          '<div class="rank-name">' + esc(d) + '</div><div class="rank-bar"><i style="width:' + Math.max(0, Math.min(100, Math.round((avgs[i] / dimMax) * 100))) + '%"></i></div></div>' +
          '<div class="rank-val">' + avgs[i].toFixed(1) + '</div></div>';
      }).join('');
      renderDimRadar(avgs, dimMax);
    }
    $('#statList').innerHTML = rows.join('') || '<div class="empty">暂无数据</div>';
    var net = state.weekNet || [0, 0, 0, 0, 0, 0, 0];
    var mx = Math.max.apply(null, net.map(function (x) { return Math.abs(x); }).concat([1]));
    $('#trendBox').innerHTML = net.map(function (v, i) {
      var h = Math.max(4, Math.round(Math.abs(v) / mx * 100));
      return '<div class="trend-col"><div class="trend-bar" style="height:' + h + '%"></div><div class="trend-lab">' + ['一','二','三','四','五','六','日'][i] + '</div></div>';
    }).join('');
  }
  function renderDimRadar(avgs, dimMax) {
    var host = $('#dimRadar');
    if (!host) return;
    var n = state.dims.length || 1, cx = 115, cy = 104, r = 68;
    function pt(i, ratio) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / n;
      return [cx + Math.cos(a) * r * ratio, cy + Math.sin(a) * r * ratio];
    }
    function poly(ratio) {
      return state.dims.map(function (_, i) { return pt(i, ratio).join(','); }).join(' ');
    }
    var grid = [0.25, 0.5, 0.75, 1].map(function (t) {
      return '<polygon points="' + poly(t) + '" fill="none" stroke="#dce4f0" stroke-width="1"/>';
    }).join('');
    var axes = state.dims.map(function (_, i) {
      var p = pt(i, 1);
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="#e6ecf5" stroke-width="1"/>';
    }).join('');
    var ratios = avgs.map(function (v) { return Math.max(0.04, Math.min(1, v / (dimMax || 1))); });
    var points = ratios.map(function (v, i) { return pt(i, v); });
    var dots = points.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="#3f8dff"/>'; }).join('');
    var labels = state.dims.map(function (d, i) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / n;
      var x = cx + Math.cos(a) * 88, y = cy + Math.sin(a) * 88;
      var anchor = Math.cos(a) > 0.3 ? 'start' : (Math.cos(a) < -0.3 ? 'end' : 'middle');
      var label = (state.dimShort && state.dimShort[i]) || d.slice(0, 2);
      return '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="' + anchor + '" font-size="11" fill="#71809b">' + esc(label) + '</text>';
    }).join('');
    host.innerHTML = '<svg viewBox="0 0 230 210">' + grid + axes +
      '<polygon points="' + points.map(function (p) { return p.join(','); }).join(' ') + '" fill="#e9f2ff" fill-opacity=".85" stroke="#3f8dff" stroke-width="2"/>' +
      dots + labels + '</svg>';
    var legend = $('#dimLegend');
    if (legend) legend.innerHTML = state.dims.map(function (d, i) {
      return '<span>' + esc(d) + ' <b>' + avgs[i].toFixed(1) + '</b></span>';
    }).join('');
  }
  function rankRow(i, avatar, name, sub, val, max) {
    var cls = i < 3 ? ' top' + (i + 1) : '';
    return '<div class="rank-row"><div class="rank-no' + cls + '">' + (i + 1) + '</div>' +
      '<div class="rank-avatar">' + esc(avatar) + '</div><div class="rank-main"><div class="rank-name">' + esc(name) + '</div>' +
      '<div class="rank-sub">' + esc(sub) + '</div><div class="rank-bar"><i style="width:' + Math.max(0, Math.min(100, Math.round((val / max) * 100))) + '%"></i></div></div>' +
      '<div class="rank-val">' + val + '</div></div>';
  }

  /* ---------- 主题 ---------- */
  function renderChips() {
    $('#themeChips').innerHTML = Object.keys(THEMES).map(function (k) {
      return '<button class="chip' + (state.theme === k ? ' active' : '') + '" data-theme="' + k + '">' + THEMES[k].name + '</button>';
    }).join('');
    $('#wallChips').innerHTML = Object.keys(WALLPAPERS).map(function (k) {
      return '<button class="chip' + (state.wallpaper === k ? ' active' : '') + '" data-wall="' + k + '">' + WALLPAPERS[k].name + '</button>';
    }).join('');
  }

  /* ---------- 教学工具：点名 / 计时 / 考勤 ---------- */
  function renderAttendance() {
    $('#attDate').textContent = todayKey;
    var rec = (state.attendance || {})[todayKey] || {};
    var counts = { present: 0, late: 0, leave: 0, absent: 0 };
    Object.keys(rec).forEach(function (k) { if (counts[rec[k]] != null) counts[rec[k]]++; });
    $('#attSummary').innerHTML = '<span class="att-chip">出勤 ' + counts.present + '</span><span class="att-chip">迟到 ' + counts.late +
      '</span><span class="att-chip">请假 ' + counts.leave + '</span><span class="att-chip">缺勤 ' + counts.absent + '</span>';
    var q = ($('#attSearch').value || '').trim();
    var list = state.students.filter(function (s) { return !q || s.name.indexOf(q) >= 0; });
    $('#attGrid').innerHTML = list.map(function (s) {
      var st = rec[s.id];
      return '<button class="stu' + (selectedAtt.has(s.id) ? ' on' : '') + '" data-id="' + esc(s.id) + '">' + esc(s.name) +
        (st ? '<div style="font-size:10px;opacity:.7">' + ({ present: '出勤', late: '迟到', leave: '请假', absent: '缺勤' }[st] || '') + '</div>' : '') + '</button>';
    }).join('') || '<div class="empty">暂无学生</div>';
  }
  function rollTick() {
    var list = state.students;
    if (!list.length) return;
    rollNameText = list[Math.floor(Math.random() * list.length)].name;
    $('#rollName').textContent = rollNameText;
  }
  function startRoll() {
    if (rollTimer) return;
    $('#rollStart').textContent = '点名中…';
    rollTimer = setInterval(rollTick, 70);
  }
  function stopRoll() {
    if (!rollTimer) return;
    clearInterval(rollTimer); rollTimer = null;
    $('#rollStart').textContent = '开始点名';
    $('#rollSub').textContent = rollNameText ? '本次点到：' + rollNameText : '';
  }
  function fmtTimer(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function startTimer() {
    if (timerHandle) return;
    timerLeft = Math.max(1, Math.min(120, +$('#timerMin').value || 5)) * 60;
    $('#timerNum').textContent = fmtTimer(timerLeft);
    timerHandle = setInterval(function () {
      timerLeft--;
      $('#timerNum').textContent = fmtTimer(Math.max(0, timerLeft));
      if (timerLeft <= 0) {
        clearInterval(timerHandle); timerHandle = null;
        toast('倒计时结束');
        if ($('#timerSpeak').checked) sendShoutText('倒计时结束，请同学们注意时间。', { speak: true, duration: 8 });
      }
    }, 1000);
  }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
  function resetTimer() {
    stopTimer();
    timerLeft = Math.max(1, Math.min(120, +$('#timerMin').value || 5)) * 60;
    $('#timerNum').textContent = fmtTimer(timerLeft);
  }

  /* ---------- 班级管理：学生 / 小组 / 细则 ---------- */
  function newStudent(name, no) {
    var dim = {}; state.dims.forEach(function (d) { dim[d] = 0; });
    return { id: 'S' + Date.now() + Math.floor(Math.random() * 100), no: +no || state.students.length + 1, name: name, points: 0, positive: 0, negative: 0, dim: dim, trend: [0, 0, 0, 0, 0, 0, 0] };
  }
  function renderManageLists() {
    // 学生
    var ss = state.students.slice().sort(function (a, b) { return (a.no || 0) - (b.no || 0); });
    $('#stuCount').textContent = '共 ' + ss.length + ' 人';
    $('#stuManageList').innerHTML = ss.map(function (s) {
      return '<div class="m-row"><div class="m-no">' + esc(s.no || '-') + '</div><div class="m-name">' + esc(s.name) + '</div>' +
        '<div class="m-pts">' + (s.points || 0) + ' 分</div><div class="m-ops">' +
        '<button data-rename-stu="' + esc(s.id) + '">改名</button><button class="del" data-del-stu="' + esc(s.id) + '">删除</button></div></div>';
    }).join('') || '<div class="empty">还没有学生，请在上方添加</div>';
    // 小组
    $('#groupManageList').innerHTML = state.groups.map(function (g, gi) {
      var checks = state.students.map(function (s) {
        return '<label><input type="checkbox" data-gmember="' + gi + '" data-stu="' + esc(s.id) + '"' + (g.members.indexOf(s.name) >= 0 ? ' checked' : '') + ' />' + esc(s.name) + '</label>';
      }).join('');
      return '<div class="m-row" style="display:block"><div class="m-row" style="border:0;padding:0">' +
        '<div class="m-name">' + esc(g.name) + '</div><div class="m-pts">' + (g.points || 0) + ' 分</div><div class="m-ops">' +
        '<button data-rename-group="' + gi + '">改名</button><button class="del" data-del-group="' + gi + '">删除</button></div></div>' +
        '<div class="group-members">' + (checks || '<span class="hint">暂无学生</span>') + '</div></div>';
    }).join('') || '<div class="empty">还没有小组，请在上方添加</div>';
    // 行为细则
    var sel = $('#ruleDim');
    if (!sel.options.length) {
      sel.innerHTML = state.dims.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }).join('');
      sel.value = activeDim;
    }
    var rows = [];
    state.dims.forEach(function (d) {
      (state.behaviors[d] || []).forEach(function (b, i) {
        rows.push('<div class="rule-row"><span class="rule-cat">' + esc(d) + '</span><span class="rule-label">' + esc(b.label) + '</span>' +
          '<span class="rule-val ' + (b.value >= 0 ? 'plus' : 'minus') + '">' + (b.value > 0 ? '+' : '') + b.value + '</span>' +
          '<button class="mini" data-del-rule="' + esc(d) + '|' + i + '">删除</button></div>');
      });
    });
    $('#ruleList').innerHTML = rows.join('') || '<div class="empty">暂无细则</div>';
  }

  /* ---------- 我的 ---------- */
  function renderProfile() {
    if (!access) return;
    var name = access.displayName || '班主任';
    $('#avatarLetter').textContent = initials(name);
    $('#profileName').textContent = name;
    var myClasses = availableClasses().map(function (c) { return c.class_name; }).join('、');
    var role = access.role === 'admin' ? '管理员 · 可管理所有班级'
      : (access.role === 'blocked' ? '账号已被移除'
      : (myClasses ? '班主任 · ' + myClasses : '待分配 · 尚未获得班级权限'));
    $('#profileRole').textContent = role;
  }

  /* ---------- 事件绑定 ---------- */
  $('#sideNav').addEventListener('click', function (e) {
    var b = e.target.closest('[data-page]'); if (!b) return;
    goto(b.dataset.page);
  });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-goto]');
    if (g) { goto(g.dataset.goto, g.dataset.mtab); return; }
    if (e.target.matches('[data-save]')) save();
    var th = e.target.closest('[data-theme]');
    if (th) { state.theme = th.dataset.theme; renderChips(); save(); return; }
    var w = e.target.closest('[data-wall]');
    if (w) { state.wallpaper = w.dataset.wall; renderChips(); save(); }
  });
  $('#manageTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mtab]'); if (!b) return;
    switchManageTab(b.dataset.mtab); renderManageLists();
  });
  $('#statSeg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-stat]'); if (!b) return;
    $$('#statSeg button').forEach(function (x) { x.classList.toggle('active', x === b); });
    renderStats();
  });

  // 登录 / 注册
  function switchAuth(mode) {
    $$('.auth-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.auth === mode); });
    $$('.auth-pane').forEach(function (p) { p.classList.toggle('active', p.dataset.authPane === mode); });
    msg('');
  }
  $$('.auth-tab').forEach(function (b) { b.addEventListener('click', function () { switchAuth(b.dataset.auth); }); });
  $('#toRegister').addEventListener('click', function () { switchAuth('register'); });
  $('#toLogin').addEventListener('click', function () { switchAuth('login'); });
  $('#toCode').addEventListener('click', function () { switchAuth('code'); });
  $('#codeToLogin').addEventListener('click', function () { switchAuth('login'); });
  // 短信验证码设置密码：兼容早期验证码创建、未设密码的账号
  $('#toResetPwd').addEventListener('click', function () { switchAuth('resetpwd'); });
  $('#resetToLogin').addEventListener('click', function () { switchAuth('login'); });
  $('#sendResetCode').addEventListener('click', async function () {
    msg(''); var phone = $('#resetPhone').value.trim();
    if (!/^1\d{10}$/.test(phone)) { msg('请输入正确的 11 位手机号'); return; }
    try {
      var r = await CloudAPI.sendPasswordResetCode(phone);
      resetOtp = { phone: phone, verificationId: r.verificationId };
      msg('验证码已发送，请在 5 分钟内输入');
    } catch (e) { msg(e.message); }
  });
  $('#resetSubmit').addEventListener('click', async function () {
    msg('');
    if (!resetOtp) { msg('请先获取验证码'); return; }
    if (resetOtp.phone !== $('#resetPhone').value.trim()) { msg('手机号已修改，请重新获取验证码'); return; }
    var code = $('#resetCode').value.trim();
    if (!code) { msg('请输入验证码'); return; }
    var pwd = $('#resetNewPwd').value;
    if (!pwd || pwd.length < 6) { msg('密码至少 6 位'); return; }
    if (pwd !== $('#resetNewPwd2').value) { msg('两次密码不一致'); return; }
    try {
      var resetPhone = resetOtp.phone;
      var v = await CloudAPI.verifyPasswordResetCode(resetOtp.verificationId, code);
      await CloudAPI.confirmPasswordReset(resetPhone, pwd, v.verificationToken);
      resetOtp = null;
      $('#resetNewPwd').value = ''; $('#resetNewPwd2').value = ''; $('#resetCode').value = '';
      switchAuth('login');
      $('#loginPhone').value = resetPhone;
      msg('密码设置成功，请用密码登录');
    } catch (e) { msg('设置失败：' + e.message); }
  });
  // 验证码登录：兼容早期用验证码创建、未设置密码的历史账号
  $('#sendCodeCode').addEventListener('click', async function () {
    msg(''); var phone = $('#codePhone').value.trim();
    if (!/^1\d{10}$/.test(phone)) { msg('请输入正确的 11 位手机号'); return; }
    try {
      var r = await CloudAPI.sendPhoneCode(phone);
      codeOtp = { phone: phone, verificationId: r.verificationId, isExistingUser: r.isExistingUser };
      msg('验证码已发送，请在 5 分钟内输入');
    } catch (e) { msg(e.message); }
  });
  $('#codeLogin').addEventListener('click', async function () {
    msg('');
    if (!codeOtp) { msg('请先获取验证码'); return; }
    if (codeOtp.phone !== $('#codePhone').value.trim()) { msg('手机号已修改，请重新获取验证码'); return; }
    var code = $('#codeCode').value.trim();
    if (!code) { msg('请输入验证码'); return; }
    try {
      // 已注册账号验证码直接登录；未注册账号走首次注册（需密码）
      if (codeOtp.isExistingUser) {
        session = await CloudAPI.verifyPhoneCode(codeOtp.phone, codeOtp.verificationId, true, code);
      } else {
        pendingOtp = codeOtp;
        switchAuth('register');
        $('#regPhone').value = codeOtp.phone;
        msg('该手机号尚未注册，请设置密码完成注册');
        return;
      }
      codeOtp = null; await afterLogin();
    } catch (e) { msg(e.message); }
  });
  $('#sendRegCode').addEventListener('click', async function () {
    msg(''); var phone = $('#regPhone').value.trim();
    if (!/^1\d{10}$/.test(phone)) { msg('请输入正确的 11 位手机号'); return; }
    try {
      var r = await CloudAPI.sendPhoneCode(phone);
      if (r.isExistingUser) { switchAuth('code'); $('#codePhone').value = phone; msg('该手机号已注册，请切换到「验证码登录」'); return; }
      pendingOtp = { phone: phone, verificationId: r.verificationId, isExistingUser: r.isExistingUser };
      msg('验证码已发送，请在 5 分钟内完成注册');
    } catch (e) { msg(e.message); }
  });
  $('#regSubmit').addEventListener('click', async function () {
    msg('');
    if (!pendingOtp) { msg('请先获取验证码'); return; }
    if (pendingOtp.phone !== $('#regPhone').value.trim()) { msg('手机号已修改，请重新获取验证码'); return; }
    var pwd = $('#regPassword').value;
    if (!pwd || pwd.length < 6) { msg('密码至少 6 位'); return; }
    if (pwd !== $('#regPassword2').value) { msg('两次密码不一致'); return; }
    var code = $('#regCode').value.trim();
    if (!code) { msg('请输入验证码'); return; }
    try {
      var wantedName = $('#regName').value.trim();
      session = await CloudAPI.verifyPhoneCode(pendingOtp.phone, pendingOtp.verificationId, false, code, pwd);
      registerName = wantedName;
      pendingOtp = null; await afterLogin();
    } catch (e) { msg(e.message); }
  });
  $('#pwdLogin').addEventListener('click', async function () {
    msg('');
    try {
      session = await CloudAPI.signInWithPassword($('#loginPhone').value.trim(), $('#loginPassword').value);
      await afterLogin();
    } catch (e) { msg(e.message); }
  });
  $('#logout').addEventListener('click', async function () {
    await CloudAPI.signOut();
    session = null; access = null; allClasses = []; registerName = ''; pendingOtp = null; codeOtp = null;
    selectedStudents.clear(); selectedAtt.clear();
    state = createDefaultState(); state.attendance = {}; activeDim = state.dims[0];
    rollNameText = ''; $('#rollSub').textContent = ''; stopTimer();
    fillForm();
    $('#loginPassword').value = '';
    $('#appView').hidden = true; $('#authView').hidden = false; switchAuth('login');
  });
  $('#openScreen').addEventListener('click', function () { window.open(CloudAPI.boardUrl(), '_blank'); });
  $('#openScreen2').addEventListener('click', function () { window.open(CloudAPI.boardUrl(), '_blank'); });
  $('#changePwd').addEventListener('click', async function () {
    var oldPwd = prompt('请输入当前密码'); if (oldPwd === null) return;
    var newPwd = prompt('请输入新密码（至少 6 位）'); if (newPwd === null) return;
    if (!newPwd || newPwd.length < 6) { toast('新密码至少 6 位'); return; }
    if (newPwd !== prompt('请再输入一次新密码')) { toast('两次输入不一致，已取消'); return; }
    try { await CloudAPI.changePassword(oldPwd, newPwd); toast('密码已修改，请用新密码登录'); }
    catch (e) { toast('修改失败：' + e.message); }
  });
  $('#classSelect').addEventListener('change', async function (e) {
    var prevKey = CloudAPI.getBoardKey();
    var nextKey = e.target.value;
    var label = e.target.selectedOptions[0] ? e.target.selectedOptions[0].text : '该班级';
    stopTimer();
    CloudAPI.setBoardKey(nextKey);
    state = createDefaultState(); state.attendance = {};
    selectedStudents.clear(); selectedAtt.clear();
    rollNameText = ''; $('#rollSub').textContent = '';
    var ok = await load();
    if (ok === false) { CloudAPI.setBoardKey(prevKey); await load(); toast('切换班级失败，已恢复原班级'); return; }
    toast('已切换到 ' + label);
  });

  // 喊话
  $('#shoutText').addEventListener('input', function () { $('#shoutCount').textContent = ($('#shoutText').value || '').length; });
  $('#shoutText').addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendShout(); } });
  $('#shoutQuick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-quick]'); if (!b) return;
    $('#shoutText').value = b.dataset.quick; $('#shoutCount').textContent = b.dataset.quick.length;
  });
  $('#shoutSend').addEventListener('click', sendShout);

  // 点评
  $('#searchStu').addEventListener('input', renderStudents);
  $('#selectAllStu').addEventListener('click', function () {
    var q = ($('#searchStu').value || '').trim();
    state.students.forEach(function (s) { if (!q || s.name.indexOf(q) >= 0 || String(s.no).indexOf(q) >= 0) selectedStudents.add(s.id); });
    renderStudents();
  });
  $('#clearStu').addEventListener('click', function () { selectedStudents.clear(); renderStudents(); });
  $('#stuGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]'); if (!b) return;
    if (selectedStudents.has(b.dataset.id)) selectedStudents.delete(b.dataset.id); else selectedStudents.add(b.dataset.id);
    renderStudents();
  });
  $('.score-mode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b) return;
    scoreMode = b.dataset.mode;
    $$('.mode').forEach(function (x) { x.classList.toggle('active', x === b); });
    renderBehaviors();
  });
  $('#dimChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-dim]'); if (!b) return;
    activeDim = b.dataset.dim; renderDims();
  });
  $('#behaviorChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-bi]'); if (!b) return;
    var list = (state.behaviors[activeDim] || []).filter(function (x) { return scoreMode === 'plus' ? x.value > 0 : x.value < 0; });
    applyScore(list[+b.dataset.bi]);
  });
  $('#submitScore').addEventListener('click', function () { applyScore(null); });
  $('#undoLast').addEventListener('click', undoLast);

  // 工具
  $('#rollStart').addEventListener('click', startRoll);
  $('#rollStop').addEventListener('click', stopRoll);
  $('#rollShout').addEventListener('click', function () {
    if (!rollNameText) { toast('请先点名'); return; }
    sendShoutText('本次点到：' + rollNameText + '，请回答问题。');
  });
  $('#timerStart').addEventListener('click', startTimer);
  $('#timerPause').addEventListener('click', stopTimer);
  $('#timerReset').addEventListener('click', resetTimer);
  $('#attSearch').addEventListener('input', renderAttendance);
  $('#attAll').addEventListener('click', function () { state.students.forEach(function (s) { selectedAtt.add(s.id); }); renderAttendance(); });
  $('#attNone').addEventListener('click', function () { selectedAtt.clear(); renderAttendance(); });
  $('#attGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]'); if (!b) return;
    if (selectedAtt.has(b.dataset.id)) selectedAtt.delete(b.dataset.id); else selectedAtt.add(b.dataset.id);
    renderAttendance();
  });
  $$('.att-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!selectedAtt.size) { toast('请先选择学生'); return; }
      state.attendance = state.attendance || {};
      var rec = state.attendance[todayKey] = state.attendance[todayKey] || {};
      selectedAtt.forEach(function (id) { rec[id] = btn.dataset.att; });
      renderAttendance(); if (await save()) toast('已标记 ' + selectedAtt.size + ' 人');
    });
  });
  $('#attSave').addEventListener('click', save);

  // 学生管理
  $('#addStu').addEventListener('click', async function () {
    var name = ($('#newStuName').value || '').trim();
    if (!name) { toast('请输入学生姓名'); return; }
    state.students.push(newStudent(name, $('#newStuNo').value));
    $('#newStuName').value = ''; $('#newStuNo').value = '';
    renderManageLists(); renderStudents(); renderHome(); renderStats(); if (await save()) toast('已添加学生');
  });
  $('#batchAddStu').addEventListener('click', async function () {
    var text = ($('#batchStu').value || '').trim();
    if (!text) { toast('请填写批量名单'); return; }
    var added = 0;
    text.split('\n').forEach(function (l) {
      var p = l.trim().split('|'); var name = (p[0] || '').trim(); if (!name) return;
      state.students.push(newStudent(name, p[1] || state.students.length + 1)); added++;
    });
    $('#batchStu').value = '';
    renderManageLists(); renderStudents(); renderHome(); renderStats(); if (await save()) toast('已导入 ' + added + ' 名学生');
  });
  $('#stuManageList').addEventListener('click', async function (e) {
    var del = e.target.closest('[data-del-stu]');
    if (del) {
      var s = state.students.filter(function (x) { return x.id === del.dataset.delStu; })[0];
      if (!s || !confirm('确定删除学生「' + s.name + '」吗？其积分记录也会一并移除。')) return;
      state.students = state.students.filter(function (x) { return x.id !== s.id; });
      state.groups.forEach(function (g) { g.members = g.members.filter(function (n) { return n !== s.name; }); });
      renderManageLists(); renderStudents(); renderHome(); renderStats(); if (await save()) toast('已删除学生'); return;
    }
    var ren = e.target.closest('[data-rename-stu]');
    if (ren) {
      var s2 = state.students.filter(function (x) { return x.id === ren.dataset.renameStu; })[0]; if (!s2) return;
      var name = prompt('修改学生姓名', s2.name); if (name === null || !(name = name.trim())) return;
      var old = s2.name; s2.name = name;
      state.groups.forEach(function (g) { g.members = g.members.map(function (n) { return n === old ? name : n; }); });
      (state.events || []).forEach(function (ev) { if (ev.name === old) ev.name = name; });
      (state.models || []).forEach(function (m) { if (m.name === old) m.name = name; });
      (state.fun || []).forEach(function (f) { if (f.unfinished === old) f.unfinished = name; });
      renderManageLists(); renderStudents(); renderHome(); if (await save()) toast('已改名');
    }
  });

  // 小组管理
  $('#addGroup').addEventListener('click', async function () {
    var name = ($('#newGroupName').value || '').trim(); if (!name) { toast('请输入小组名称'); return; }
    state.groups.push({ name: name, points: 0, members: [] });
    $('#newGroupName').value = ''; renderManageLists(); renderHome(); renderStats(); if (await save()) toast('已添加小组');
  });
  $('#groupManageList').addEventListener('click', async function (e) {
    var del = e.target.closest('[data-del-group]');
    if (del) {
      var g = state.groups[+del.dataset.delGroup]; if (!g) return;
      if (!confirm('确定删除小组「' + g.name + '」吗？')) return;
      state.groups.splice(+del.dataset.delGroup, 1);
      renderManageLists(); renderHome(); renderStats(); if (await save()) toast('已删除小组'); return;
    }
    var ren = e.target.closest('[data-rename-group]');
    if (ren) {
      var g2 = state.groups[+ren.dataset.renameGroup]; if (!g2) return;
      var name = prompt('修改小组名称', g2.name); if (name === null || !(name = name.trim())) return;
      g2.name = name; renderManageLists(); renderStats(); if (await save()) toast('已改名');
    }
  });
  $('#groupManageList').addEventListener('change', async function (e) {
    var cb = e.target.closest('[data-gmember]'); if (!cb) return;
    var g = state.groups[+cb.dataset.gmember]; if (!g) return;
    var s = state.students.filter(function (x) { return x.id === cb.dataset.stu; })[0]; if (!s) return;
    // 互斥：同一学生只在一个组
    state.groups.forEach(function (grp) { grp.members = grp.members.filter(function (n) { return n !== s.name; }); });
    if (cb.checked) g.members.push(s.name);
    renderManageLists(); if (await save()) toast('已更新分组');
  });

  // 行为细则
  $('#addRule').addEventListener('click', async function () {
    var dim = $('#ruleDim').value;
    var label = ($('#newRuleLabel').value || '').trim();
    var value = +$('#newRuleValue').value;
    if (!label || !isFinite(value) || value === 0) { toast('请填写细则名称和非零分值'); return; }
    state.behaviors[dim] = state.behaviors[dim] || [];
    state.behaviors[dim].push({ label: label, value: value });
    $('#newRuleLabel').value = ''; $('#newRuleValue').value = '';
    renderDims(); renderManageLists(); if (await save()) toast('已添加细则');
  });
  $('#batchAddRules').addEventListener('click', async function () {
    var text = ($('#batchRules').value || '').trim(); if (!text) { toast('请填写批量细则'); return; }
    var added = 0;
    text.split('\n').forEach(function (l) {
      var p = l.split('|'); var dim = (p[0] || '').trim(), label = (p[1] || '').trim(), value = +p[2];
      if (!dim || !label || !isFinite(value) || !value) return;
      state.dims.indexOf(dim) < 0 && state.dims.push(dim);
      state.behaviors[dim] = state.behaviors[dim] || [];
      state.behaviors[dim].push({ label: label, value: value }); added++;
    });
    $('#batchRules').value = ''; renderDims(); renderManageLists(); if (await save()) toast('已导入 ' + added + ' 条细则');
  });
  $('#ruleList').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-del-rule]'); if (!b) return;
    var p = b.dataset.delRule.split('|'), dim = p[0], i = +p[1];
    if (!confirm('确定删除细则「' + (state.behaviors[dim][i] || {}).label + '」吗？')) return;
    state.behaviors[dim].splice(i, 1);
    renderDims(); renderManageLists(); if (await save()) toast('已删除细则');
  });

  // 管理员权限
  $('#createClass').addEventListener('click', async function () {
    var key = ($('#newClassKey').value || '').trim();
    var name = ($('#newClassName').value || '').trim() || key;
    if (!key) { toast('请填写班级代码'); return; }
    try {
      await CloudAPI.createClass(key, name);
      $('#newClassKey').value = ''; $('#newClassName').value = '';
      await initAccess(); await renderAdminPanel(); toast('班级已创建');
    } catch (e) { toast('创建失败：' + e.message); }
  });
  $('#reloadUsers').addEventListener('click', renderAdminPanel);
  $('#userList').addEventListener('change', async function (e) {
    var cb = e.target.closest('[data-assign-user]'); if (!cb) return;
    try {
      if (cb.checked) await CloudAPI.assignTeacher(cb.dataset.assignUser, cb.dataset.assignClass);
      else await CloudAPI.removeAssignment(cb.dataset.assignUser, cb.dataset.assignClass);
      toast(cb.checked ? '已授权该班级' : '已取消该班级授权');
      await renderAdminPanel();
    } catch (err) { cb.checked = !cb.checked; toast('操作失败：' + err.message); }
  });
  $('#userList').addEventListener('click', async function (e) {
    var roleBtn = e.target.closest('[data-set-role]');
    if (roleBtn) {
      var toAdmin = roleBtn.dataset.nextRole === 'admin';
      if (!confirm(toAdmin ? '确定把该用户设为管理员吗？管理员可管理所有班级。' : '确定把该用户降为班主任吗？')) return;
      try {
        await CloudAPI.setUserRole(roleBtn.dataset.setRole, roleBtn.dataset.nextRole);
        await initAccess(); await renderAdminPanel(); toast(toAdmin ? '已设为管理员' : '已降为班主任');
      } catch (err) { toast('操作失败：' + err.message); }
      return;
    }
    var delBtn = e.target.closest('[data-delete-user]');
    if (delBtn) {
      var id = delBtn.dataset.deleteUser, name = delBtn.dataset.deleteName || '该班主任';
      if (!confirm('确定删除班主任「' + name + '」吗？\n\n将清除其班主任角色、班级授权和注册信息，该账号将无法再登录管理端。此操作不可撤销（可从下方列表恢复）。')) return;
      try { await CloudAPI.deleteTeacher(id, name, delBtn.dataset.deletePhone || ''); await renderAdminPanel(); toast('已删除班主任并清除注册信息'); }
      catch (err) { toast('删除失败：' + err.message); }
    }
  });
  $('#blockedList').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-restore]'); if (!b) return;
    if (!confirm('恢复后，该用户可以重新用手机号验证码注册。确定恢复吗？')) return;
    try { await CloudAPI.restoreTeacher(b.dataset.restore); await renderAdminPanel(); toast('已恢复，可让其重新注册'); }
    catch (err) { toast('恢复失败：' + err.message); }
  });

  async function afterLogin() {
    $('#authView').hidden = true; $('#appView').hidden = false;
    fillForm();
    try {
      await initAccess();
      if (!$('#noAccess').hidden || !$('#blockedView').hidden) return;
      await load();
      goto('home');
    } catch (e) { sync('权限读取失败：' + e.message); toast('权限读取失败：' + e.message); }
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    if (!cloudReady) { msg('云服务未就绪，请检查网络'); return; }
    var r = await CloudAPI.restoreAuth();
    if (r.callbackError) { msg(r.callbackError); return; }
    if (!r.session) return;
    session = r.session; await afterLogin();
  }
  boot();
})();
