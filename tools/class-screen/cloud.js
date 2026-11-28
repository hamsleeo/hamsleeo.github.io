/* 云端数据层：展示端匿名读指定班级，管理端登录后只能读写自己被授权的班级 */
(function (global) {
  'use strict';
  var cloud = null;
  var cfg = global.CLOUD_CONFIG || null;
  var DEFAULT_BOARD_KEY = 'main';
  var STORE_KEY = 'classScreenBoardKey';
  var isAdminPage = /admin\.html/i.test(global.location ? global.location.pathname : '');

  // 当前班级 key：展示端看 URL ?class=，管理端记住上次选择
  var boardKey = (function () {
    var q = global.location ? new URLSearchParams(global.location.search) : null;
    var fromUrl = q && (q.get('class') || q.get('board'));
    if (fromUrl) {
      try { localStorage.setItem(STORE_KEY, fromUrl); } catch (e) { /* 忽略 */ }
      return fromUrl;
    }
    if (isAdminPage) {
      try { return localStorage.getItem(STORE_KEY) || DEFAULT_BOARD_KEY; } catch (e) { return DEFAULT_BOARD_KEY; }
    }
    return DEFAULT_BOARD_KEY;
  })();

  // 应用网关会无条件覆盖浏览器发出的 authorization 头（替换成沙箱 JWT），
  // 导致 SDK 的 access_token 到不了云端 API。这里用自定义 fetch 把 SDK 设置的
  // Authorization 改名为 X-SDK-Auth（网关不碰自定义头），由代理端还原。
  function makeProxyFetch() {
    var nativeFetch = global.fetch.bind(global);
    return function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var isProxy = cfg && cfg.endpoint && url.indexOf(cfg.endpoint.split('?')[0]) === 0;
      if (!isProxy || !init || !init.headers) return nativeFetch(input, init);
      var headers = new Headers(init.headers);
      var auth = headers.get('Authorization') || headers.get('authorization');
      if (auth) {
        headers.set('X-SDK-Auth', auth);
        headers.delete('Authorization');
        headers.delete('authorization');
        init = Object.assign({}, init, { headers: headers });
      }
      return nativeFetch(input, init);
    };
  }

  function init() {
    if (!cfg || !global.WorkBuddyCloud) return null;
    cloud = global.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: cfg.endpoint,
      oauthRelayBaseUrl: cfg.oauthRelayBaseUrl,
      publishableKey: cfg.publishableKey,
      fetch: makeProxyFetch()
    });
    return cloud;
  }

  function ready() { return !!cloud; }

  /* ---------- 短信验证码设置密码（SDK 未暴露，走原生 fetch 直连代理）----------
     云端 resetPassword 只支持邮件；但底层 /v1/verification 允许手机号 + usage=PASSWORD_RESET，
     /v1/reset 接受 phone_number + verification_token + new_password。实测三条链路可用。 */
  function authApiUrl(path) {
    // cfg.endpoint 形如 https://host/?sharecode=X&p=/api
    return cfg.endpoint + '/.cloud/auth' + path;
  }
  async function authApi(path, body) {
    if (!cfg) throw new Error('云服务配置未加载');
    var res = await global.fetch(authApiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wb-webapp-access-key': cfg.publishableKey
      },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || (data && (data.error || data.error_code))) {
      var m = data && (data.error_description || data.message || data.error) || ('请求失败 HTTP ' + res.status);
      throw new Error(m);
    }
    return data || {};
  }
  // 第1步：发送「重设密码」用途的短信验证码
  async function sendPasswordResetCode(phone) {
    if (!/^1\d{10}$/.test(phone)) throw new Error('请输入正确的 11 位手机号');
    var data = await authApi('/v1/verification', {
      phone_number: '+86 ' + phone, target: 'ANY', usage: 'PASSWORD_RESET'
    });
    if (!data.verification_id) throw new Error('验证码发送失败，请稍后重试');
    return { verificationId: data.verification_id };
  }
  // 第2步：用验证码换取 verification_token
  async function verifyPasswordResetCode(verificationId, code) {
    if (!code) throw new Error('请输入验证码');
    var data = await authApi('/v1/verification/verify', {
      verification_id: verificationId, verification_code: code
    });
    if (!data.verification_token) throw new Error('验证码无效或已过期');
    return { verificationToken: data.verification_token };
  }
  // 第3步：用 verification_token 设置新密码
  async function confirmPasswordReset(phone, newPassword, verificationToken) {
    if (!/^1\d{10}$/.test(phone)) throw new Error('请输入正确的 11 位手机号');
    if (!newPassword || newPassword.length < 6) throw new Error('密码至少 6 位');
    var data = await authApi('/v1/reset', {
      phone_number: '+86 ' + phone, new_password: newPassword, verification_token: verificationToken
    });
    return data;
  }

  function getBoardKey() { return boardKey || DEFAULT_BOARD_KEY; }
  function setBoardKey(key) {
    boardKey = (key || DEFAULT_BOARD_KEY);
    try { localStorage.setItem(STORE_KEY, boardKey); } catch (e) { /* 忽略 */ }
    return boardKey;
  }
  function boardUrl(key) {
    // 大屏展示页是 tools/class-screen/index.html（不是站点根路径首页）。
    // 从当前 admin.html 所在目录推导同级 index.html，保证指向真正的大屏页。
    var u = new URL(global.location.href);
    u.pathname = u.pathname.replace(/admin\.html$/i, 'index.html');
    u.search = '?class=' + encodeURIComponent(key || getBoardKey());
    u.hash = '';
    return u.toString();
  }

  /* ---------- 班级数据读写 ---------- */
  async function loadBoard(key) {
    if (!cloud) throw new Error('云服务未初始化');
    var k = key || getBoardKey();
    var res = await cloud.database.from('class_boards')
      .select('data, updated_at, owner_name')
      .eq('board_key', k)
      .maybeSingle();
    if (res.error) throw new Error(res.error.message || '读取云端数据失败');
    if (!res.data || !res.data.data || !Object.keys(res.data.data).length) return null;
    return res.data;
  }

  // 大屏端免密作业编辑（云端版降级实现）：
  // 云端 class_boards 受 RLS 保护，匿名无法写入。有登录态时读取整份数据、
  // 只替换 homework 后整体保存；无登录态则明确提示（本地版一体机不受此限制）。
  async function saveHomework(homework, key) {
    if (!cloud) throw new Error('云服务未初始化');
    var session = await getSession();
    if (!session) throw new Error('线上大屏需班主任先登录管理端才能保存作业；本机一体机无此限制');
    var k = key || getBoardKey();
    var row = await loadBoard(k);
    var full = (row && row.data) ? row.data : {};
    full.homework = homework;
    return saveBoard(full, session, k);
  }

  async function saveBoard(state, session, key) {
    if (!cloud) throw new Error('云服务未初始化');
    var k = key || getBoardKey();
    var payload = {
      data: state,
      updated_at: new Date().toISOString(),
      owner_name: (session && session.user && (session.user.name || session.user.email)) || '班主任'
    };
    var res = await cloud.database.from('class_boards')
      .update(payload).eq('board_key', k).select();
    if (res.error) throw new Error(res.error.message || '保存到云端失败');
    if (!res.data || !res.data.length) throw new Error('没有权限修改本班数据，请确认管理员已把你设为该班班主任');
    return res.data[0];
  }

  /* ---------- 角色与班级管理 ---------- */
  function displayName(session) {
    var u = session && session.user;
    return (u && (u.name || u.email || u.phone)) || '班主任';
  }

  // 首次登录自动登记：系统中尚无管理员时，首位注册人自动成为管理员
  // 返回 'blocked' 表示管理员已删除该班主任，禁止再进入
  async function registerUser(session, customName) {
    if (!cloud) throw new Error('云服务未初始化');
    if (!session) throw new Error('请先登录');
    var name = customName || displayName(session);
    var res = await cloud.database.rpc('register_class_user', { p_display_name: name });
    if (res.error) throw new Error(res.error.message || '登记用户失败');
    return res.data;
  }

  async function listClasses() {
    if (!cloud) throw new Error('云服务未初始化');
    var res = await cloud.database.from('classes').select('board_key, class_name').order('board_key');
    if (res.error) throw new Error(res.error.message || '读取班级列表失败');
    return res.data || [];
  }

  async function getMyAccess(session, customName) {
    var role = await registerUser(session, customName);
    if (role === 'blocked') {
      return { role: 'blocked', classes: [], displayName: displayName(session) };
    }
    var classes = [];
    if (role === 'admin') {
      classes = await listClasses();
    } else {
      var res = await cloud.database.from('teacher_classes').select('board_key');
      if (res.error) throw new Error(res.error.message || '读取班级授权失败');
      classes = (res.data || []).map(function (r) { return r.board_key; });
    }
    // 优先显示用户在数据库里登记的姓名（可在"我的"页修改），
    // 读不到（RLS 拦截/字段为空）时回退 session 里的手机号/邮箱。
    var realName = null;
    try {
      var uid = session && session.user && session.user.id;
      if (uid) {
        var mine = await cloud.database.from('class_roles')
          .select('display_name').eq('user_id', uid).limit(1);
        if (!mine.error && mine.data && mine.data.length && mine.data[0].display_name) {
          realName = mine.data[0].display_name;
        }
      }
    } catch (e) { /* 回退 session 名 */ }
    return {
      role: role,
      classes: classes,
      displayName: realName || displayName(session)
    };
  }

  // 修改自己的姓名（class_roles.display_name），注册后可随时更改
  async function updateMyName(session, newName) {
    if (!cloud) throw new Error('云服务未初始化');
    if (!session) throw new Error('请先登录');
    var name = String(newName || '').trim();
    if (!name) throw new Error('姓名不能为空');
    if (name.length > 20) throw new Error('姓名不能超过 20 个字');
    var uid = session && session.user && session.user.id;
    if (!uid) throw new Error('未获取到用户标识，请重新登录');
    var res = await cloud.database.from('class_roles')
      .update({ display_name: name })
      .eq('user_id', uid)
      .select('user_id, display_name');
    if (res.error) throw new Error(res.error.message || '修改姓名失败');
    if (!res.data || !res.data.length) throw new Error('没有权限修改姓名');
    return res.data[0].display_name;
  }

  async function listUsers() {
    if (!cloud) throw new Error('云服务未初始化');
    var roles = await cloud.database.from('class_roles')
      .select('user_id, role, display_name, created_at').order('created_at');
    if (roles.error) throw new Error(roles.error.message || '读取用户列表失败');
    var assigns = await cloud.database.from('teacher_classes').select('user_id, board_key');
    if (assigns.error) throw new Error(assigns.error.message || '读取授权列表失败');
    var map = {};
    (assigns.data || []).forEach(function (a) {
      (map[a.user_id] = map[a.user_id] || []).push(a.board_key);
    });
    return (roles.data || []).map(function (r) {
      return {
        user_id: r.user_id,
        role: r.role,
        display_name: r.display_name || '未命名用户',
        created_at: r.created_at,
        classes: map[r.user_id] || []
      };
    });
  }

  async function assignTeacher(userId, key) {
    if (!cloud) throw new Error('云服务未初始化');
    var res = await cloud.database.from('teacher_classes')
      .upsert({ user_id: userId, board_key: key }).select();
    if (res.error) throw new Error(res.error.message || '分配班级失败');
    return res.data;
  }

  async function removeAssignment(userId, key) {
    if (!cloud) throw new Error('云服务未初始化');
    var res = await cloud.database.from('teacher_classes')
      .delete().eq('user_id', userId).eq('board_key', key).select();
    if (res.error) throw new Error(res.error.message || '取消授权失败');
    return res.data;
  }

  async function setUserRole(userId, role) {
    if (!cloud) throw new Error('云服务未初始化');
    var res = await cloud.database.from('class_roles')
      .update({ role: role }).eq('user_id', userId).select();
    if (res.error) throw new Error(res.error.message || '设置角色失败');
    if (!res.data || !res.data.length) throw new Error('没有权限修改该用户角色');
    return res.data[0];
  }

  async function listBlocked() {
    if (!cloud) throw new Error('云服务未初始化');
    var res = await cloud.database.from('teacher_blocklist')
      .select('user_id, display_name, phone, blocked_at').order('blocked_at');
    if (res.error) throw new Error(res.error.message || '读取停用名单失败');
    return res.data || [];
  }

  // 删除班主任：移除角色与班级授权，并加入停用名单，防止再次注册进入
  async function deleteTeacher(userId, name, phone) {
    if (!cloud) throw new Error('云服务未初始化');
    var res = await cloud.database.rpc('admin_delete_teacher', {
      p_user_id: userId, p_display_name: name || '', p_phone: phone || ''
    });
    if (res.error) throw new Error(res.error.message || '删除班主任失败');
    return true;
  }

  async function restoreTeacher(userId) {
    if (!cloud) throw new Error('云服务未初始化');
    var res = await cloud.database.rpc('admin_restore_teacher', { p_user_id: userId });
    if (res.error) throw new Error(res.error.message || '恢复班主任失败');
    return true;
  }

  // 新班级使用空白数据，避免把内置演示学生写入正式班级
  function blankState() {
    if (typeof createDefaultState !== 'function') return {};
    var s = createDefaultState();
    s.students = []; s.groups = []; s.events = []; s.shoutHistory = [];
    s.models = []; s.fun = []; s.announcements = []; s.homework = []; s.schedule = []; s.duty = [];
    // 新班级不继承演示课表与请假：整周清空、请假清空
    if (s.weeklySchedule) for (var d = 1; d <= 7; d++) s.weeklySchedule[d] = [];
    s.leaves = [];
    s.attendance = {}; s.weekNet = [0, 0, 0, 0, 0, 0, 0]; s.shout = null;
    return s;
  }

  async function createClass(key, className) {
    if (!cloud) throw new Error('云服务未初始化');
    key = (key || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,32}$/.test(key)) throw new Error('班级代码需 2-32 位字母、数字、下划线或短横线');
    var c = await cloud.database.from('classes')
      .insert({ board_key: key, class_name: className || key }).select();
    if (c.error) {
      if (c.error.code === '23505') throw new Error('该班级代码已存在');
      throw new Error(c.error.message || '创建班级失败');
    }
    var b = await cloud.database.from('class_boards')
      .insert({ board_key: key, data: blankState() }).select();
    if (b.error) throw new Error(b.error.message || '创建大屏数据失败');
    return c.data[0];
  }

  /* ---------- 登录 ---------- */
  async function getSession() {
    if (!cloud) return null;
    var res = await cloud.auth.getSession();
    return res.error ? null : res.data;
  }

  async function signInWithWorkBuddy(opts) {
    if (!cloud) throw new Error('云服务未初始化');
    var back = new URL(location.href);
    back.pathname = '/';
    ['code', 'state', 'provider'].forEach(function (k) { back.searchParams.delete(k); });
    if (opts && opts.adminReturn) back.searchParams.set('view', 'admin');
    var res = await cloud.auth.signInWithOAuth({
      provider: 'workbuddy',
      redirectTo: back.toString()
    });
    if (res.error) throw new Error(res.error.message || '登录发起失败');
    if (!res.data || !res.data.url) throw new Error('登录地址获取失败');
    location.assign(res.data.url);
  }

  async function sendPhoneCode(phone) {
    if (!/^1\d{10}$/.test(phone)) throw new Error('请输入正确的 11 位手机号');
    var res = await cloud.auth.sendOtp({ phone: phone });
    if (res.error) throw new Error(res.error.message || '验证码发送失败');
    return res.data;
  }

  async function verifyPhoneCode(phone, verificationId, isExistingUser, token, password) {
    var payload = {
      phone: phone, verificationId: verificationId,
      isExistingUser: isExistingUser, token: token
    };
    // 新用户在验证码通过后设置密码；老用户验证码登录时不改密码
    if (!isExistingUser && password) payload.password = password;
    var res = await cloud.auth.verifyOtp(payload);
    if (res.error) throw new Error(res.error.message || '验证码错误');
    return res.data;
  }

  // 密码登录：手机号 + 密码
  async function signInWithPassword(phone, password) {
    if (!cloud) throw new Error('云服务未初始化');
    if (!/^1\d{10}$/.test(phone)) throw new Error('请输入正确的 11 位手机号');
    if (!password) throw new Error('请输入密码');
    var res = await cloud.auth.signInWithPassword({ phone: phone, password: password });
    if (res.error) throw new Error(res.error.message || '手机号或密码错误');
    return res.data;
  }

  // 已登录状态下修改密码
  async function changePassword(oldPassword, newPassword) {
    if (!cloud) throw new Error('云服务未初始化');
    var res = await cloud.auth.resetPasswordForOld({
      oldPassword: oldPassword, newPassword: newPassword
    });
    if (res.error) throw new Error(res.error.message || '修改密码失败');
    return res.data;
  }

  async function restoreAuth() {
    if (!cloud) return { session: null, callbackError: null };
    var url = new URL(location.href);
    if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
      return { session: await getSession(), callbackError: null };
    }
    var provider = url.searchParams.get('provider');
    if (provider !== 'workbuddy' && provider !== 'wechat') {
      return { session: null, callbackError: '授权回调无效，请重新登录。' };
    }
    var handler = provider === 'workbuddy'
      ? cloud.auth.handleWorkBuddyCallback
      : cloud.auth.handleWechatWebCallback;
    if (typeof handler !== 'function') {
      return { session: null, callbackError: '当前环境暂不支持该登录方式。' };
    }
    var res = await handler.call(cloud.auth);
    if (res.error) return { session: null, callbackError: res.error.message || '登录失败' };
    if (!res.data) return { session: null, callbackError: null };
    ['code', 'state', 'provider'].forEach(function (k) { url.searchParams.delete(k); });
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    return { session: res.data, callbackError: null };
  }

  async function signOut() {
    if (!cloud) return;
    await cloud.auth.signOut();
  }

  global.CloudAPI = {
    init: init, ready: ready,
    BOARD_KEY: DEFAULT_BOARD_KEY,
    getBoardKey: getBoardKey, setBoardKey: setBoardKey, boardUrl: boardUrl,
    blankState: blankState,
    loadBoard: loadBoard, saveBoard: saveBoard, saveHomework: saveHomework,
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
