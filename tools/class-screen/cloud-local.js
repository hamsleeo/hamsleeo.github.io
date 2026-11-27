/* 本地服务器适配层：实现与 cloud.js 相同的 CloudAPI 接口，但数据走本机 /api */
(function (global) {
  'use strict';
  var cfg = global.CLOUD_CONFIG || {};
  if (!cfg.local) return; // 线上域名继续用原 WorkBuddy 云端实现

  var TOKEN_KEY = 'classScreenLocalToken';
  var BOARD_KEY_STORE = 'classScreenBoardKey';
  var DEFAULT_BOARD_KEY = 'main';
  var isAdminPage = /admin\.html/i.test(global.location ? global.location.pathname : '');

  var boardKey = (function () {
    var q = global.location ? new URLSearchParams(global.location.search) : null;
    var fromUrl = q && (q.get('class') || q.get('board'));
    if (fromUrl) {
      try { localStorage.setItem(BOARD_KEY_STORE, fromUrl); } catch (e) {}
      return fromUrl;
    }
    if (isAdminPage) {
      try { return localStorage.getItem(BOARD_KEY_STORE) || DEFAULT_BOARD_KEY; } catch (e) { return DEFAULT_BOARD_KEY; }
    }
    return DEFAULT_BOARD_KEY;
  })();

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    try {
      var token = localStorage.getItem(TOKEN_KEY);
      if (token) headers.Authorization = 'Bearer ' + token;
    } catch (e) {}
    return global.fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (res) {
      if (res.status === 404 && opts.allow404) return null;
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('请求失败 HTTP ' + res.status));
        return data;
      });
    });
  }

  function getBoardKey() { return boardKey || DEFAULT_BOARD_KEY; }
  function setBoardKey(key) {
    boardKey = key || DEFAULT_BOARD_KEY;
    try { localStorage.setItem(BOARD_KEY_STORE, boardKey); } catch (e) {}
    return boardKey;
  }
  function boardUrl(key) {
    var u = new URL(global.location.href);
    u.pathname = u.pathname.replace(/admin\.html$/i, 'index.html');
    u.search = '?class=' + encodeURIComponent(key || getBoardKey());
    u.hash = '';
    return u.toString();
  }

  function blankState() {
    if (typeof global.createDefaultState !== 'function') return {};
    var s = global.createDefaultState();
    s.students = []; s.groups = []; s.events = []; s.shoutHistory = [];
    s.models = []; s.fun = []; s.announcements = []; s.homework = []; s.schedule = []; s.duty = [];
    if (s.weeklySchedule) for (var d = 1; d <= 7; d++) s.weeklySchedule[d] = [];
    s.leaves = [];
    s.attendance = {}; s.weekNet = [0, 0, 0, 0, 0, 0, 0]; s.shout = null;
    return s;
  }

  /* ---------- 班级数据 ---------- */
  function loadBoard(key) {
    return api('/api/boards/' + encodeURIComponent(key || getBoardKey()), { allow404: true });
  }
  function saveBoard(state, session, key) {
    if (!session) return Promise.reject(new Error('请先登录本地服务器'));
    return api('/api/boards/' + encodeURIComponent(key || getBoardKey()), { method: 'PUT', body: { data: state } });
  }

  /* ---------- 权限与用户 ---------- */
  function getMyAccess(session, customName) {
    if (!session) return Promise.resolve({ role: 'blocked', classes: [], displayName: '' });
    return api('/api/access', { method: 'POST', body: { displayName: customName || '' } });
  }
  function listClasses() { return api('/api/classes'); }
  function listUsers() { return api('/api/users'); }
  function updateMyName(session, newName) {
    return api('/api/users/me', { method: 'PATCH', body: { displayName: newName } })
      .then(function (r) { return r.display_name; });
  }
  function assignTeacher(userId, key) {
    return api('/api/users/' + encodeURIComponent(userId) + '/assign', { method: 'POST', body: { boardKey: key } });
  }
  function removeAssignment(userId, key) {
    return api('/api/users/' + encodeURIComponent(userId) + '/assign/' + encodeURIComponent(key), { method: 'DELETE' });
  }
  function setUserRole(userId, role) {
    return api('/api/users/' + encodeURIComponent(userId) + '/role', { method: 'PATCH', body: { role: role } });
  }
  function createClass(key, className) {
    return api('/api/classes', { method: 'POST', body: { key: key, className: className } });
  }
  function listBlocked() { return api('/api/blocked'); }
  function deleteTeacher(userId, name, phone) {
    return api('/api/users/' + encodeURIComponent(userId), { method: 'DELETE' });
  }
  function restoreTeacher(userId) {
    return api('/api/blocked/' + encodeURIComponent(userId) + '/restore', { method: 'POST', body: {} });
  }

  /* ---------- 登录 ---------- */
  function getSession() {
    var token = null;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
    if (!token) return Promise.resolve(null);
    return api('/api/auth/session').catch(function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      return null;
    });
  }
  function restoreAuth() {
    return getSession().then(function (session) {
      return { session: session, callbackError: null };
    });
  }
  function signInWithPassword(phone, password) {
    return api('/api/auth/login', { method: 'POST', body: { phone: phone, password: password } })
      .then(function (r) {
        try { localStorage.setItem(TOKEN_KEY, r.access_token); } catch (e) {}
        return { access_token: r.access_token, user: r.user };
      });
  }
  function signOut() {
    return api('/api/auth/logout', { method: 'POST', body: {} }).catch(function () {})
      .then(function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} });
  }
  function changePassword(oldPassword, newPassword) {
    return api('/api/auth/change-password', { method: 'POST', body: { oldPassword: oldPassword, newPassword: newPassword } });
  }
  function localOnlyError() {
    return Promise.reject(new Error('本地服务器版请使用「密码登录」。如需重置密码，请联系管理员。'));
  }
  function signInWithWorkBuddy() { return localOnlyError(); }
  function sendPhoneCode() { return localOnlyError(); }
  function verifyPhoneCode() { return localOnlyError(); }
  function sendPasswordResetCode() { return localOnlyError(); }
  function verifyPasswordResetCode() { return localOnlyError(); }
  function confirmPasswordReset() { return localOnlyError(); }

  function hideCloudOnlyAuth() {
    // 本地服务器版：登录即注册，完全没有短信验证码流程。
    // 隐藏「验证码登录 / 首次注册 / 忘记密码」入口，只保留「密码登录」。
    var sels = [
      '[data-auth="code"]', '[data-auth="register"]', '[data-auth="reset"]',
      '[data-auth-pane="code"]', '[data-auth-pane="register"]', '[data-auth-pane="reset"]',
      '#btnSwitchLogin', '#codeToLogin', '#resetToLogin',
      '#toCode', '#toResetPwd', '#toRegister', '#toLogin'
    ];
    sels.forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        el.hidden = true;
        el.style.display = 'none';
      });
    });
    var loginPane = document.querySelector('[data-auth-pane="login"]');
    if (loginPane && !document.getElementById('localAuthTip')) {
      var tip = document.createElement('p');
      tip.id = 'localAuthTip';
      tip.className = 'auth-tip';
      tip.textContent = '本地版无需短信验证码：输入手机号和至少 6 位密码直接登录，首次登录自动注册；第一位用户为管理员。';
      var btn = loginPane.querySelector('#pwdLogin');
      if (btn && btn.parentNode) btn.parentNode.insertBefore(tip, btn.nextSibling);
      else loginPane.appendChild(tip);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideCloudOnlyAuth);
  } else {
    hideCloudOnlyAuth();
  }

  global.CloudAPI = {
    init: function () { return true; },
    ready: function () { return true; },
    local: true,
    BOARD_KEY: DEFAULT_BOARD_KEY,
    getBoardKey: getBoardKey, setBoardKey: setBoardKey, boardUrl: boardUrl,
    blankState: blankState,
    loadBoard: loadBoard, saveBoard: saveBoard,
    getMyAccess: getMyAccess, listClasses: listClasses, listUsers: listUsers,
    updateMyName: updateMyName,
    assignTeacher: assignTeacher, removeAssignment: removeAssignment,
    setUserRole: setUserRole, createClass: createClass,
    listBlocked: listBlocked, deleteTeacher: deleteTeacher, restoreTeacher: restoreTeacher,
    getSession: getSession, restoreAuth: restoreAuth,
    signInWithWorkBuddy: signInWithWorkBuddy,
    sendPhoneCode: sendPhoneCode, verifyPhoneCode: verifyPhoneCode,
    signInWithPassword: signInWithPassword, changePassword: changePassword,
    sendPasswordResetCode: sendPasswordResetCode,
    verifyPasswordResetCode: verifyPasswordResetCode,
    confirmPasswordReset: confirmPasswordReset,
    signOut: signOut
  };
})(window);
