/* ==========================================================
   后台管理：登录 → 核对管理员身份 → 管理工具入口
   ----------------------------------------------------------
   权限唯一来源是云端 RLS：admins 表只允许本人读到自己的那一行，
   tools 表的写操作由 is_admin() 把关。前端只负责把「是 / 不是 /
   没读到」这三种结果说清楚，不再提供公开的首登认领入口。
   ========================================================== */
(function () {
  'use strict';

  var cloud = window.WFC_CLOUD;
  var $ = function (id) { return document.getElementById(id); };
  var channel = 'email';
  var pendingOtp = null;
  var session = null;
  var isAdmin = false;
  var rows = [];
  var editingId = null;
  var confirmHandler = null;
  var VIEWS = ['viewLogin', 'viewChecking', 'viewDenied', 'viewAdmin'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function msg(el, text, ok) {
    el.textContent = text || '';
    el.className = 'msg' + (ok ? ' ok' : '');
  }
  function toast(text) {
    var el = $('toast');
    el.textContent = text; el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }
  function show(view) {
    VIEWS.forEach(function (id) { $(id).hidden = true; });
    $(view).hidden = false;
    $('logoutBtn').hidden = (view === 'viewLogin');
  }
  function friendly(e) {
    if (!e) return '操作失败，请重试';
    if (e.code === '23505') return '这条记录已存在';
    if (e.code === '42501') return '没有权限执行这个操作';
    return e.message || '操作失败，请重试';
  }
  function isAuthError(e) {
    var s = String((e && (e.code || '')) || '') + ' ' + String((e && (e.status || '')) || '') + ' ' + String((e && e.message) || '');
    return /401|403|JWT|token|unauthenticated|PGRST301|会话|过期/i.test(s);
  }
  function safeUrl(u) {
    var v = String(u || '').trim();
    if (!v || /^\s*(javascript|data|vbscript|file):/i.test(v)) return '';
    return v;
  }
  function urlOk(u) {
    if (!u || /^\s*(javascript|data|vbscript|file):/i.test(u)) return false;
    if (/^https?:\/\//i.test(u)) return true;
    return /^(tools\/)?[\w.\/-]+\.html?($|\?|#)/i.test(u);
  }

  /* ---------- 会话信息：用于显示「当前登录的是哪个账号」 ---------- */
  function sessionUser(s) {
    return (s && (s.user || (s.data && s.data.user))) || null;
  }
  function sessionUid(s) {
    var u = sessionUser(s);
    return String((u && (u.id || u.sub)) || (s && (s.id || s.uid || s.sub)) || '');
  }
  function mask(v) {
    v = String(v || '');
    if (/^1\d{10}$/.test(v)) return v.slice(0, 3) + '****' + v.slice(-4);
    if (v.indexOf('@') > 0) {
      var p = v.split('@');
      return (p[0].length > 2 ? p[0].slice(0, 2) + '***' : '***') + '@' + p[1];
    }
    return v.length > 12 ? v.slice(0, 8) + '…' : v;
  }
  function accountLabel(s) {
    var u = sessionUser(s) || {};
    var raw = u.raw || {};
    var v = u.email || u.phone || raw.email || raw.phone_number || raw.phone || u.name || '';
    return v ? mask(v) : '已登录账号';
  }

  /* ---------- 登录（邮箱 / 手机号验证码） ---------- */
  $('channelTabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (!tab) return;
    channel = tab.getAttribute('data-channel');
    Array.prototype.forEach.call(this.querySelectorAll('.tab'), function (t) { t.classList.toggle('active', t === tab); });
    $('accountLabel').textContent = channel === 'email' ? '邮箱地址' : '手机号';
    $('account').placeholder = channel === 'email' ? '请输入邮箱地址' : '请输入 11 位手机号';
    $('account').value = '';
    pendingOtp = null;
    msg($('loginMsg'), '');
  });
  $('account').addEventListener('input', function () { msg($('loginMsg'), ''); });

  $('sendCode').addEventListener('click', function () {
    if (!cloud) { msg($('loginMsg'), '云服务未连接，请检查网络后刷新'); return; }
    var value = $('account').value.trim();
    if (channel === 'phone' && !/^1\d{10}$/.test(value)) { msg($('loginMsg'), '请输入正确的 11 位手机号'); return; }
    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { msg($('loginMsg'), '请输入正确的邮箱地址'); return; }
    var btn = this;
    btn.disabled = true; btn.textContent = '正在发送…';
    var target = channel === 'email' ? { email: value } : { phone: value };
    cloud.auth.sendOtp(target).then(function (sent) {
      btn.disabled = false; btn.textContent = '获取验证码';
      if (sent.error) { msg($('loginMsg'), friendly(sent.error)); return; }
      pendingOtp = {
        channel: channel, value: value,
        verificationId: sent.data.verificationId,
        isExistingUser: sent.data.isExistingUser
      };
      msg($('loginMsg'), '验证码已发送，请在下方输入', true);
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '获取验证码';
      msg($('loginMsg'), friendly(e));
    });
  });

  $('verifyCode').addEventListener('click', function () {
    if (!cloud) { msg($('loginMsg'), '云服务未连接，请检查网络后刷新'); return; }
    var value = $('account').value.trim();
    var token = $('code').value.trim();
    if (!pendingOtp || pendingOtp.value !== value) { msg($('loginMsg'), '请先为当前账号获取验证码'); return; }
    if (!token) { msg($('loginMsg'), '请输入验证码'); return; }
    var args = pendingOtp.channel === 'email' ? { email: pendingOtp.value } : { phone: pendingOtp.value };
    args.verificationId = pendingOtp.verificationId;
    args.isExistingUser = pendingOtp.isExistingUser;
    args.token = token;
    var btn = this;
    btn.disabled = true; btn.textContent = '正在登录…';
    cloud.auth.verifyOtp(args).then(function (done) {
      btn.disabled = false; btn.textContent = '登录';
      if (done.error) { msg($('loginMsg'), friendly(done.error)); return; }
      pendingOtp = null;
      $('code').value = '';
      session = done.data;
      checkAdmin();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '登录';
      msg($('loginMsg'), friendly(e));
    });
  });

  function doLogout(text) {
    var reset = function () {
      session = null; isAdmin = false; rows = []; pendingOtp = null;
      $('toolList').innerHTML = '';
      $('adminWho').innerHTML = '';
      show('viewLogin');
      msg($('loginMsg'), text || '已退出登录', true);
    };
    if (!cloud) { reset(); return; }
    cloud.auth.signOut().then(reset).catch(reset);
  }
  $('logoutBtn').addEventListener('click', function () { doLogout('已退出登录'); });
  $('switchAccountBtn').addEventListener('click', function () { doLogout('已退出，请用管理员账号重新登录'); });
  $('retryBtn').addEventListener('click', checkAdmin);

  /* ---------- 管理员判断：显式比对 uid，区分「不是管理员」与「没读到」 ---------- */
  function denied(title, desc, retry, kicker) {
    $('deniedKicker').textContent = kicker || 'NO PERMISSION';
    $('deniedTitle').textContent = title;
    $('deniedDesc').textContent = desc;
    $('retryBtn').hidden = !retry;
    msg($('deniedMsg'), '');
    show('viewDenied');
  }

  function checkAdmin() {
    if (!session) { show('viewLogin'); return; }
    show('viewChecking');
    msg($('checkingMsg'), '');
    var uid = sessionUid(session);
    cloud.database.from('admins').select('uid').maybeSingle().then(function (res) {
      if (res.error) {
        denied('没能核对权限',
          '读取管理员信息失败：' + friendly(res.error) + '。通常是网络波动或登录状态已过期，可点「重试」；仍不行就换账号重新登录。',
          true, 'CHECK FAILED');
        return;
      }
      var row = res.data || null;
      /* RLS 只放行本人那一行；这里再显式比对一次 uid，避免以后策略调整时误判 */
      isAdmin = !!row && (!uid || String(row.uid) === uid);
      if (!isAdmin) {
        denied('没有管理权限',
          '当前登录的账号（' + accountLabel(session) + '）不是本应用的管理员。请先用统一账号中心的手机号登录，由超级管理员在「成员班级 → 成员审核」里分配管理员 / 超级管理员角色；前台浏览工具不受影响。',
          false);
        return;
      }
      $('adminWho').innerHTML = '<span class="who-dot"></span>当前账号 <b>' + esc(accountLabel(session)) + '</b>' +
        '<span class="who-chip">管理员</span><span class="who-tip">只有这个账号能改动前台卡片</span>';
      show('viewAdmin');
      loadRows();
    }).catch(function (e) {
      denied('没能核对权限',
        '读取管理员信息失败：' + friendly(e) + '。可点「重试」，或退出后重新登录。',
        true, 'CHECK FAILED');
    });
  }

  /* ---------- 工具列表 ---------- */
  function onDbError(e) {
    if (isAuthError(e)) { doLogout('登录状态已过期，请重新登录'); return true; }
    return false;
  }

  function loadRows() {
    cloud.database.from('tools').select('*').order('sort_order', { ascending: true }).then(function (res) {
      if (res.error) {
        if (onDbError(res.error)) return;
        $('toolList').innerHTML = '<div class="admin-empty">读取失败：' + esc(friendly(res.error)) + '　<button class="btn btn-sm" data-reload="1">重试</button></div>';
        return;
      }
      rows = Array.isArray(res.data) ? res.data : [];
      renderRows();
    }).catch(function (e) {
      if (onDbError(e)) return;
      $('toolList').innerHTML = '<div class="admin-empty">读取失败：' + esc(friendly(e)) + '　<button class="btn btn-sm" data-reload="1">重试</button></div>';
    });
  }

  function renderRows() {
    var html = '<div class="table-head"><span></span><span>工具</span><span>分类</span><span>状态</span><span>排序</span><span style="text-align:right">操作</span></div>';
    if (!rows.length) {
      html += '<div class="admin-empty">还没有工具入口，点右上角「＋ 新增工具」添加。</div>';
    } else {
      rows.forEach(function (r) {
        html += '<div class="tool-row" data-id="' + esc(r.id) + '">' +
          '<div class="e">' + esc(r.icon || '◈') + '</div>' +
          '<div><div class="nm">' + esc(r.name) + '</div><div class="sub">' + esc(r.note || r.tagline || r.url) + '</div></div>' +
          '<div class="cat">' + esc(r.category) + '</div>' +
          '<div><span class="status' + (r.enabled ? '' : ' off') + '"><i></i>' + (r.enabled ? '已上架' : '已停用') + '</span></div>' +
          '<div class="sort">' + esc(r.sort_order) + '</div>' +
          '<div class="row-actions">' +
            '<button data-act="open" title="在新窗口打开这个工具">打开</button>' +
            '<button data-act="edit">编辑</button>' +
            '<button data-act="toggle">' + (r.enabled ? '停用' : '上架') + '</button>' +
            '<button data-act="del" class="danger">删除</button>' +
          '</div></div>';
      });
    }
    $('toolList').innerHTML = html;
    var on = rows.filter(function (r) { return r.enabled; }).length;
    $('adminSummary').textContent = '共 ' + rows.length + ' 条入口，' + on + ' 条在前台显示 · 保存后前台刷新即可看到';
  }

  function rowById(id) {
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  $('toolList').addEventListener('click', function (e) {
    if (e.target.closest('[data-reload]')) { loadRows(); return; }
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var rowEl = e.target.closest('.tool-row');
    if (!rowEl) return;
    var r = rowById(rowEl.getAttribute('data-id'));
    if (!r) return;
    var act = btn.getAttribute('data-act');
    if (act === 'open') {
      var u = safeUrl(r.url);
      if (!u) { toast('这个工具的链接为空或无效，请先编辑'); return; }
      window.open(u, '_blank', 'noopener');
    } else if (act === 'edit') openEdit(r);
    else if (act === 'toggle') {
      cloud.database.from('tools').update({ enabled: !r.enabled, updated_at: new Date().toISOString() })
        .eq('id', r.id).select().then(function (res) {
          if (res.error) { if (!onDbError(res.error)) toast(friendly(res.error)); return; }
          if (!res.data || !res.data.length) { toast('没有权限或记录不存在'); return; }
          loadRows();
          toast(r.enabled ? '已停用，前台将不再显示' : '已上架，前台刷新可见');
        }).catch(function (err) { if (!onDbError(err)) toast(friendly(err)); });
    } else if (act === 'del') {
      confirmBox('删除工具入口', '确定删除「' + r.name + '」吗？只会删除入口记录，不会删除 tools/ 里的工具文件。', function () {
        cloud.database.from('tools').delete().eq('id', r.id).select().then(function (res) {
          if (res.error) { if (!onDbError(res.error)) toast(friendly(res.error)); return; }
          if (!res.data || !res.data.length) { toast('没有权限或记录不存在'); return; }
          loadRows(); toast('已删除');
        }).catch(function (err) { if (!onDbError(err)) toast(friendly(err)); });
      });
    }
  });

  $('reloadBtn').addEventListener('click', function () { loadRows(); toast('已刷新'); });
  $('addBtn').addEventListener('click', function () { openEdit(null); });

  /* ---------- 新增 / 编辑表单 ---------- */
  function openEdit(r) {
    editingId = r ? r.id : null;
    $('editTitle').textContent = r ? '编辑工具' : '新增工具';
    $('fId').value = r ? r.id : '';
    $('fId').readOnly = !!r;
    $('fName').value = r ? r.name : '';
    $('fTagline').value = r ? (r.tagline || '') : '';
    $('fDesc').value = r ? (r.description || '') : '';
    $('fIcon').value = r ? (r.icon || '◈') : '◈';
    $('fCategory').value = r ? (r.category || '其他') : '其他';
    $('fTags').value = r && Array.isArray(r.tags) ? r.tags.join(', ') : '';
    $('fBadge').value = r ? (r.badge || '') : '';
    var c = r && Array.isArray(r.colors) ? r.colors : ['#1b5e46', '#3f9d78', '#43e08a'];
    $('fC1').value = c[0] || '#1b5e46';
    $('fC2').value = c[1] || '#3f9d78';
    $('fC3').value = c[2] || '#43e08a';
    $('fUrl').value = r ? r.url : '';
    $('fMode').value = r ? (r.mode || 'embed') : 'embed';
    $('fSort').value = r ? r.sort_order : (rows.length + 1) * 10;
    $('fNote').value = r ? (r.note || '') : '';
    $('fEnabled').checked = r ? !!r.enabled : true;
    $('advancedBox').open = false;   // 常用项优先，高级项默认收起
    $('editOverlay').classList.add('show');
  }
  function closeEdit() { $('editOverlay').classList.remove('show'); }
  $('editClose').addEventListener('click', closeEdit);
  $('editCancel').addEventListener('click', closeEdit);
  $('editOverlay').addEventListener('click', function (e) { if (e.target === this) closeEdit(); });

  $('editForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('fId').value.trim();
    var url = $('fUrl').value.trim();
    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(id)) { toast('ID 只能用字母、数字、连字符和下划线'); return; }
    if (!urlOk(url)) { toast('链接需为 tools/ 下的 .html 相对路径，或 https:// 完整网址'); return; }
    if (!editingId && rows.some(function (r) { return r.id === id; })) {
      toast('这个 ID 已存在，请回到列表直接编辑它'); return;
    }
    var payload = {
      name: $('fName').value.trim(),
      tagline: $('fTagline').value.trim(),
      description: $('fDesc').value.trim(),
      icon: $('fIcon').value.trim() || '◈',
      category: $('fCategory').value.trim() || '其他',
      tags: $('fTags').value.split(/[,，、\s]+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4),
      badge: $('fBadge').value.trim(),
      colors: [$('fC1').value, $('fC2').value, $('fC3').value],
      url: url,
      /* 外部网址一律新窗口，避免把别人的站点套进自己的 iframe */
      mode: /^https?:\/\//i.test(url) ? 'window' : $('fMode').value,
      note: $('fNote').value.trim(),
      sort_order: parseInt($('fSort').value, 10) || 0,
      enabled: $('fEnabled').checked,
      updated_at: new Date().toISOString()
    };
    if (!payload.name) { toast('请填工具名称'); return; }
    var btn = this.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = '正在保存…';
    var query = editingId
      ? cloud.database.from('tools').update(payload).eq('id', editingId).select()
      : cloud.database.from('tools').insert(Object.assign({ id: id }, payload)).select();
    query.then(function (res) {
      btn.disabled = false; btn.textContent = '保存到云端';
      if (res.error) { if (!onDbError(res.error)) toast(friendly(res.error)); return; }
      if (!res.data || !res.data.length) { toast('保存未生效：没有管理权限或记录不存在'); return; }
      closeEdit();
      loadRows();
      toast(editingId ? '已保存，前台刷新可见' : '已上架，前台刷新可见');
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = '保存到云端';
      if (!onDbError(err)) toast(friendly(err));
    });
  });

  /* ---------- 自定义确认 ---------- */
  function confirmBox(title, text, onOk) {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    confirmHandler = onOk;
    $('confirmOverlay').classList.add('show');
  }
  function closeConfirm() { $('confirmOverlay').classList.remove('show'); confirmHandler = null; }
  $('confirmClose').addEventListener('click', closeConfirm);
  $('confirmCancel').addEventListener('click', closeConfirm);
  $('confirmOverlay').addEventListener('click', function (e) { if (e.target === this) closeConfirm(); });
  $('confirmOk').addEventListener('click', function () {
    var fn = confirmHandler;
    closeConfirm();
    if (fn) fn();
  });

  /* ---------- 启动 ---------- */
  if (!cloud) {
    msg($('loginMsg'), window.WFC_CLOUD_ERROR || '云服务未连接，请检查网络后刷新页面');
    $('sendCode').disabled = true;
    $('verifyCode').disabled = true;
  } else {
    cloud.auth.getSession().then(function (res) {
      if (res.error || !res.data) { show('viewLogin'); return; }
      session = res.data;
      checkAdmin();
    }).catch(function () { show('viewLogin'); });
  }

  /* 轻量自检：?selftest=1 时输出页面结构检查结果 */
  if (location.search.indexOf('selftest=1') >= 0) {
    var checks = [];
    ['sendCode', 'verifyCode', 'retryBtn', 'switchAccountBtn', 'addBtn', 'reloadBtn',
      'logoutBtn', 'editForm', 'confirmOk', 'viewChecking', 'viewDenied', 'adminWho',
      'fId', 'fName', 'fUrl', 'fCategory', 'fNote', 'fEnabled', 'advancedBox'].forEach(function (id) {
      checks.push($(id) ? 'PASS ' + id : 'FAIL missing ' + id);
    });
    checks.push($('viewClaim') ? 'FAIL claim-still-exists' : 'PASS claim-removed');
    checks.push(window.WFC_CLOUD ? 'PASS cloud-client' : 'FAIL cloud-client');
    var out = document.createElement('div');
    out.id = 'selfcheck'; out.hidden = true; out.textContent = checks.join(' | ');
    document.body.appendChild(out);
    document.body.setAttribute('data-admin-selftest', checks.some(function (c) { return c.indexOf('FAIL') === 0; }) ? 'FAIL' : 'PASS');
  }
})();
