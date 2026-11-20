/* 统一账号中心 · 前端公共层
   门户、后台、学生考勤请假、单词精灵岛共用同一个云应用、同一套 auth 会话、同一份身份档案。
   班级修仙管理目前仍挂在另一个云应用（mp-api），账号尚未打通，需单独登录。
   依赖：先加载 workbuddy-cloud-sdk 与 assets/cloud-config.js（window.WFC_CLOUD）。 */
(function () {
  'use strict';

  var cloud = window.WFC_CLOUD || null;

  var ROLE = {
    super_admin: '超级管理员',
    admin: '管理员',
    head_teacher: '班主任',
    subject_teacher: '任课老师',
    none: '未分配角色',
    guest: '未登录'
  };
  var IDENTITY = { teacher: '教师', student: '学生', parent: '家长' };
  var STATUS = { pending: '待审核', approved: '已通过', rejected: '未通过' };
  var ROLE_DESC = {
    super_admin: '全部权限：审核身份、分配角色、维护班级与学生名册、管理工具箱入口',
    admin: '审核教师身份、维护班级与学生名册、查看全校跟进数据',
    head_teacher: '查看并跟进本班考勤与单词背诵打卡',
    subject_teacher: '查看并登记所任教班级的考勤与单词背诵打卡'
  };

  function friendly(e) {
    if (!e) return '操作失败，请重试';
    var m = e.message || (typeof e === 'string' ? e : '') || e.error_description || '';
    m = String(m);
    if (/请先登录|unauthenticated|JWT|token/i.test(m)) return '登录状态已过期，请重新登录';
    if (/recursion|infinite/i.test(m)) return '权限配置异常，请联系管理员';
    if (/验证码|verification|otp|code/i.test(m)) return '验证码不正确或已过期，请重新获取';
    if (/password|密码/i.test(m)) return m.indexOf('密码') >= 0 ? m : '密码不符合要求（至少 6 位）';
    if (/network|fetch|Failed to fetch|timeout/i.test(m)) return '网络连接失败，请检查网络后重试';
    return m.replace(/^.*?:\s*/, '').slice(0, 120) || '操作失败，请重试';
  }

  function share(url) {
    var code = new URLSearchParams(location.search).get('sharecode');
    if (!code) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + encodeURIComponent(code);
  }

  function unwrap(v) {
    if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } }
    return v;
  }

  function ensureCloud() {
    if (!cloud) return { error: { message: '云服务组件未加载，请检查网络后刷新页面' } };
    return null;
  }

  /* ---------- 会话 ---------- */
  function getSession() {
    var bad = ensureCloud(); if (bad) return Promise.resolve(bad);
    var auth = cloud.auth;
    var fn = auth && (auth.getSession || auth.session);
    if (typeof fn !== 'function') return Promise.resolve({ data: null, error: null });
    return fn.call(auth).then(function (res) {
      if (res && res.error) return { data: null, error: res.error };
      var d = res && (res.data !== undefined ? res.data : res);
      return { data: d || null, error: null };
    }).catch(function (e) { return { data: null, error: { message: friendly(e) } }; });
  }

  function sessionUid(s) {
    var u = (s && (s.user || (s.data && s.data.user))) || null;
    return String((u && (u.id || u.sub)) || (s && (s.uid || s.sub || s.id)) || '');
  }
  function sessionPhone(s) {
    var u = (s && (s.user || (s.data && s.data.user))) || {};
    return String(u.phone || u.phone_number || (u.raw && (u.raw.phone || u.raw.phone_number)) || '');
  }

  /* ---------- 注册 / 登录 ----------
     云 SDK 的注册链路：sendOtp -> verifyOtp({password})；
     verifyOtp 对新用户会自动 signUp 并把 password 写入账号，
     对已有用户则按验证码直接登录。之后可用 signInWithPassword 密码登录。 */
  function sendCode(phone) {
    var bad = ensureCloud(); if (bad) return Promise.resolve(bad);
    if (!/^1\d{10}$/.test(phone)) return Promise.resolve({ error: { message: '请输入正确的 11 位手机号' } });
    return cloud.auth.sendOtp({ phone: phone }).then(function (r) {
      if (r && r.error) return { error: r.error };
      var d = (r && r.data) || {};
      if (!d.verificationId) return { error: { message: '验证码发送失败，请稍后重试' } };
      return { data: { verificationId: d.verificationId, isExistingUser: !!d.isExistingUser } };
    }).catch(function (e) { return { error: { message: friendly(e) } }; });
  }

  function verifyCode(phone, otp, token, password) {
    var bad = ensureCloud(); if (bad) return Promise.resolve(bad);
    var args = {
      phone: phone,
      verificationId: otp.verificationId,
      isExistingUser: otp.isExistingUser,
      token: token
    };
    if (!otp.isExistingUser && password) args.password = password;
    return cloud.auth.verifyOtp(args).then(function (r) {
      if (r && r.error) return { error: r.error };
      return { data: (r && (r.data !== undefined ? r.data : r)) || null, error: null };
    }).catch(function (e) { return { error: { message: friendly(e) } }; });
  }

  function signInWithPassword(phone, password) {
    var bad = ensureCloud(); if (bad) return Promise.resolve(bad);
    if (!/^1\d{10}$/.test(phone)) return Promise.resolve({ error: { message: '请输入正确的 11 位手机号' } });
    if (typeof cloud.auth.signInWithPassword !== 'function') {
      return Promise.resolve({ error: { message: '当前云服务组件不支持密码登录，请用验证码登录' } });
    }
    return cloud.auth.signInWithPassword({ phone: phone, password: password }).then(function (r) {
      if (r && r.error) return { error: r.error };
      return { data: (r && (r.data !== undefined ? r.data : r)) || null, error: null };
    }).catch(function (e) { return { error: { message: friendly(e) } }; });
  }

  function signOut() {
    if (!cloud) return Promise.resolve();
    return cloud.auth.signOut().catch(function () {});
  }

  /* ---------- 数据库受控接口（全部经 SECURITY DEFINER 函数校验权限） ---------- */
  function rpc(fn, params) {
    var bad = ensureCloud(); if (bad) return Promise.resolve(bad);
    return cloud.database.rpc(fn, params || {}).then(function (res) {
      if (res && res.error) return { data: null, error: res.error };
      var d = res && (res.data !== undefined ? res.data : res);
      return { data: unwrap(d), error: null };
    }).catch(function (e) { return { data: null, error: { message: friendly(e) } }; });
  }

  function myIdentity() { return rpc('my_identity', {}); }
  function registerProfile(p) {
    return rpc('register_profile', {
      p_phone: p.phone || '', p_name: p.name || '', p_identity: p.identity || 'teacher',
      p_school: p.school || '', p_subject: p.subject || '',
      p_class_id: p.classId || null, p_student_name: p.studentName || ''
    });
  }
  function listProfiles(pendingOnly) { return rpc('list_profiles', { p_only_pending: !!pendingOnly }); }
  function reviewProfile(p) {
    return rpc('review_profile', {
      p_uid: p.uid, p_action: p.action, p_role: p.role || '', p_note: p.note || ''
    });
  }
  function hub(action, payload) { return rpc('hub', { p_action: action, p_payload: payload || {} }); }
  /* 首次初始化：仅当系统还没有任何角色时，允许第一个已完善资料的账号成为超级管理员 */
  function bootstrapSuperAdmin() { return rpc('bootstrap_super_admin', {}); }

  /* ---------- 角色能力：前端只做展示，真正的拦截在数据库 RLS ---------- */
  function isStaffAdmin(id) { return id && (id.role === 'super_admin' || id.role === 'admin'); }
  function isApprovedTeacher(id) { return !!(id && id.identity === 'teacher' && id.status === 'approved'); }
  function canUseXiuxian(id) { return isApprovedTeacher(id); }

  window.TBAccount = {
    cloud: cloud,
    ROLE: ROLE, ROLE_DESC: ROLE_DESC, IDENTITY: IDENTITY, STATUS: STATUS,
    friendly: friendly, share: share,
    getSession: getSession, sessionUid: sessionUid, sessionPhone: sessionPhone,
    sendCode: sendCode, verifyCode: verifyCode, signInWithPassword: signInWithPassword, signOut: signOut,
    myIdentity: myIdentity, registerProfile: registerProfile,
    listProfiles: listProfiles, reviewProfile: reviewProfile, hub: hub,
    bootstrapSuperAdmin: bootstrapSuperAdmin,
    isStaffAdmin: isStaffAdmin, isApprovedTeacher: isApprovedTeacher, canUseXiuxian: canUseXiuxian
  };
})();
