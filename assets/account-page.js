/* 统一账号中心 · 页面逻辑 */
(function () {
  'use strict';
  var A = window.TBAccount;
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ['viewLogin', 'viewReg1', 'viewReg2', 'viewProfile'];
  var loginMode = 'password';
  var otpLogin = null, otpReg = null;
  var classes = [];
  var session = null;

  function show(v) {
    VIEWS.forEach(function (id) { $(id).hidden = (id !== v); });
    $('logoutBtn').hidden = (v === 'viewLogin' || v === 'viewReg1');
  }
  function msg(el, text, ok) {
    el.textContent = text || '';
    el.className = 'msg' + (ok ? ' ok' : '');
  }
  function identity() {
    var el = document.querySelector('input[name="identity"]:checked');
    return el ? el.value : 'teacher';
  }
  function applyShare() {
    var code = new URLSearchParams(location.search).get('sharecode');
    if (!code) return;
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) === '#' || /^https?:/.test(h)) return;
      a.setAttribute('href', A.share(h));
    });
  }

  /* ---------- 登录 ---------- */
  $('loginTabs').addEventListener('click', function (e) {
    var t = e.target.closest('.tab'); if (!t) return;
    loginMode = t.getAttribute('data-mode');
    Array.prototype.forEach.call(this.querySelectorAll('.tab'), function (x) { x.classList.toggle('active', x === t); });
    $('passWrap').hidden = loginMode !== 'password';
    $('codeWrap').hidden = loginMode !== 'code';
    otpLogin = null;
    msg($('loginMsg'), '');
  });

  $('loginSend').addEventListener('click', function () {
    var phone = $('loginPhone').value.trim();
    var btn = this;
    if (!/^1\d{10}$/.test(phone)) { msg($('loginMsg'), '请先输入正确的 11 位手机号'); return; }
    btn.disabled = true; btn.textContent = '发送中…';
    A.sendCode(phone).then(function (r) {
      btn.disabled = false; btn.textContent = '获取验证码';
      if (r.error) { msg($('loginMsg'), A.friendly(r.error)); return; }
      otpLogin = { phone: phone, verificationId: r.data.verificationId, isExistingUser: r.data.isExistingUser };
      $('newPassWrap').hidden = otpLogin.isExistingUser;
      msg($('loginMsg'), otpLogin.isExistingUser
        ? '验证码已发送，输入后即可登录'
        : '验证码已发送。这个手机号还没注册，请顺便设置密码完成注册', true);
    });
  });

  $('loginBtn').addEventListener('click', function () {
    var phone = $('loginPhone').value.trim();
    if (!/^1\d{10}$/.test(phone)) { msg($('loginMsg'), '请输入正确的 11 位手机号'); return; }
    var btn = this; btn.disabled = true;
    var p;
    if (loginMode === 'password') {
      var pass = $('loginPass').value;
      if (!pass) { btn.disabled = false; msg($('loginMsg'), '请输入密码'); return; }
      p = A.signInWithPassword(phone, pass);
    } else {
      var code = $('loginCode').value.trim();
      if (!otpLogin || otpLogin.phone !== phone) { btn.disabled = false; msg($('loginMsg'), '请先获取验证码'); return; }
      if (!code) { btn.disabled = false; msg($('loginMsg'), '请输入验证码'); return; }
      var np = $('loginNewPass').value;
      if (!otpLogin.isExistingUser && np.length < 6) { btn.disabled = false; msg($('loginMsg'), '新手机号请设置至少 6 位密码'); return; }
      p = A.verifyCode(phone, otpLogin, code, np);
    }
    btn.textContent = '正在登录…';
    p.then(function (r) {
      btn.disabled = false; btn.textContent = '登录';
      if (r.error) { msg($('loginMsg'), A.friendly(r.error)); return; }
      session = r.data; otpLogin = null;
      $('loginPass').value = ''; $('loginCode').value = ''; $('loginNewPass').value = '';
      msg($('loginMsg'), '');
      afterAuth();
    });
  });

  /* ---------- 注册：第一步 ---------- */
  $('regSend').addEventListener('click', function () {
    var phone = $('regPhone').value.trim();
    var btn = this;
    if (!/^1\d{10}$/.test(phone)) { msg($('reg1Msg'), '请先输入正确的 11 位手机号'); return; }
    btn.disabled = true; btn.textContent = '发送中…';
    A.sendCode(phone).then(function (r) {
      btn.disabled = false; btn.textContent = '获取验证码';
      if (r.error) { msg($('reg1Msg'), A.friendly(r.error)); return; }
      otpReg = { phone: phone, verificationId: r.data.verificationId, isExistingUser: r.data.isExistingUser };
      $('regPassWrap').hidden = otpReg.isExistingUser;
      $('regPass2Wrap').hidden = otpReg.isExistingUser;
      msg($('reg1Msg'), otpReg.isExistingUser
        ? '这个手机号已有账号，验证后将直接登录；如已有资料会跳到「我的账号」'
        : '验证码已发送，请填写验证码并设置密码', true);
    });
  });

  $('regNext').addEventListener('click', function () {
    var phone = $('regPhone').value.trim();
    var code = $('regCode').value.trim();
    var p1 = $('regPass').value, p2 = $('regPass2').value;
    var btn = this;
    if (!otpReg || otpReg.phone !== phone) { msg($('reg1Msg'), '请先为当前手机号获取验证码'); return; }
    if (!code) { msg($('reg1Msg'), '请输入短信验证码'); return; }
    if (!otpReg.isExistingUser) {
      if (p1.length < 6) { msg($('reg1Msg'), '密码至少 6 位'); return; }
      if (p1 !== p2) { msg($('reg1Msg'), '两次输入的密码不一致'); return; }
    }
    btn.disabled = true; btn.textContent = '验证中…';
    A.verifyCode(phone, otpReg, code, p1).then(function (r) {
      btn.disabled = false; btn.textContent = '验证并下一步';
      if (r.error) { msg($('reg1Msg'), A.friendly(r.error)); return; }
      session = r.data; otpReg = null;
      msg($('reg1Msg'), '');
      A.myIdentity().then(function (id) {
        if (id.data && id.data.registered) { renderProfile(id.data); show('viewProfile'); return; }
        loadClasses(); show('viewReg2');
      });
    });
  });

  $('identityPick').addEventListener('change', function () {
    var t = identity() === 'teacher';
    $('teacherFields').hidden = !t;
    $('studentFields').hidden = t;
    $('roleNote').hidden = !t;
    $('classHint').textContent = t ? '教师可稍后由管理员分配班级' : '学生 / 家长必须选择所在班级';
  });

  function loadClasses() {
    A.hub('list_classes', {}).then(function (r) {
      var sel = $('regClass');
      if (r.error || !Array.isArray(r.data)) {
        sel.innerHTML = '<option value="">（暂未建立班级，可先留空）</option>';
        return;
      }
      classes = r.data;
      sel.innerHTML = '<option value="">' + (classes.length ? '请选择班级' : '（暂未建立班级，可先留空）') + '</option>' +
        classes.map(function (c) {
          var label = [c.school, c.grade, c.name].filter(Boolean).join(' · ');
          return '<option value="' + c.id + '">' + label + '</option>';
        }).join('');
    });
  }

  $('regSubmit').addEventListener('click', function () {
    var id = identity();
    var name = $('regName').value.trim();
    var btn = this;
    if (name.length < 2) { msg($('reg2Msg'), '请填写真实姓名（至少 2 个字）'); return; }
    if (id !== 'teacher' && !$('regClass').value) { msg($('reg2Msg'), '学生 / 家长必须选择班级'); return; }
    if (id !== 'teacher' && !$('regStudent').value.trim()) { msg($('reg2Msg'), '请填写学生姓名'); return; }
    btn.disabled = true; btn.textContent = '提交中…';
    A.registerProfile({
      phone: $('regPhone').value.trim(),
      name: name, identity: id,
      school: $('regSchool').value.trim(), subject: $('regSubject').value.trim(),
      classId: $('regClass').value || null,
      studentName: $('regStudent').value.trim()
    }).then(function (r) {
      btn.disabled = false; btn.textContent = '提交资料';
      if (r.error) { msg($('reg2Msg'), A.friendly(r.error)); return; }
      msg($('reg2Msg'), '');
      renderProfile(r.data || {});
      show('viewProfile');
    });
  });

  /* ---------- 登录后的分流 ---------- */
  function afterAuth() {
    A.myIdentity().then(function (r) {
      if (r.error) { show('viewLogin'); msg($('loginMsg'), A.friendly(r.error)); return; }
      var d = r.data || {};
      if (!d.registered) { loadClasses(); show('viewReg2'); return; }
      renderProfile(d); show('viewProfile');
    });
  }

  /* ---------- 我的账号 ---------- */
  function stat(k, v) { return '<div class="acct-stat"><span>' + k + '</span><b>' + (v || '—') + '</b></div>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function renderProfile(d) {
    $('pName').textContent = d.name || '未完善资料';
    $('pMeta').textContent = '手机号 ' + (d.phone || '—') + '　·　身份 ' + (A.IDENTITY[d.identity] || '—');

    var st = $('pStatus');
    var cls = d.status === 'approved' ? 'ok' : (d.status === 'pending' ? 'wait' : 'no');
    st.className = 'acct-status ' + cls;
    st.textContent = A.STATUS[d.status] || '未注册';

    var stats = [
      stat('账号状态', A.STATUS[d.status]),
      stat('身份', A.IDENTITY[d.identity]),
      stat('角色', A.ROLE[d.role] || '—'),
      stat('班级', d.class_name || '未分配'),
      stat('学校', d.school || '—')
    ];
    if (d.identity === 'teacher') stats.push(stat('任教学科', d.subject || '—'));
    else stats.push(stat('关联学生', d.student_name || '—'));
    $('pStats').innerHTML = stats.join('');

    var alert = $('pAlert');
    if (d.identity === 'teacher' && d.status === 'pending') {
      alert.hidden = false; alert.className = 'acct-alert';
      alert.innerHTML = '<b>等待身份确认</b>　教师账号需由超级管理员或管理员在后台核对后分配角色。审核通过前，班级修仙管理暂不可用；考勤与单词精灵岛可先浏览。';
    } else if (d.status === 'rejected') {
      alert.hidden = false; alert.className = 'acct-alert';
      alert.innerHTML = '<b>身份未通过</b>　' + esc(d.note || '请联系管理员核实后重新提交。');
    } else if (d.identity === 'teacher') {
      alert.hidden = false; alert.className = 'acct-alert ok';
      alert.innerHTML = '<b>' + esc(A.ROLE[d.role] || '教师') + '</b>　' + esc(A.ROLE_DESC[d.role] || '身份已确认，可以使用教师功能。');
    } else { alert.hidden = true; }

    var xiuxian = A.canUseXiuxian(d);
    $('pTools').innerHTML =
      toolRow(xiuxian ? true : null, '班级修仙管理', xiuxian ? '教师专用 · 身份已确认，需在工具内用它自己的账号登录' : (d.identity === 'teacher' ? '需管理员确认教师身份；且工具内需单独登录' : '仅向教师开放，学生 / 家长不可使用')) +
      toolRow(true, '学生考勤请假', '可登记 / 查看本班考勤') +
      toolRow(true, '单词精灵岛', '可登记 / 查看单词背诵打卡');

    $('toStaff').hidden = !A.isStaffAdmin(d);
    $('pClassSection').hidden = !(d.identity === 'teacher' && d.status === 'approved');
    $('pCheckinSection').hidden = (d.identity === 'teacher');

    if (!$('pClassSection').hidden) {
      A.hub('list_classes_by_teacher', {}).then(function (r) {
        var list = Array.isArray(r.data) ? r.data : [];
        $('pClasses').innerHTML = list.length
          ? list.map(function (c) { return '<span class="acct-chip">' + esc(c.name) + (c.subject ? ' · <b>' + esc(c.subject) + '</b>' : '') + '</span>'; }).join('')
          : '<span class="acct-chip">尚未分配任教班级，请联系管理员</span>';
      });
    }
    if (!$('pCheckinSection').hidden) {
      A.hub('my_checkins', {}).then(function (r) {
        var list = Array.isArray(r.data) ? r.data : [];
        $('pCheckins').innerHTML = list.length
          ? list.slice(0, 20).map(function (k) { return '<span class="acct-chip">' + esc(k.day) + ' · ' + (k.kind === 'recitation' ? '背诵' : '考勤') + ' <b>' + esc(k.status) + '</b></span>'; }).join('')
          : '<span class="acct-chip">暂无打卡记录</span>';
      });
    }
  }
  function toolRow(ok, name, desc) {
    var cls = ok === true ? '' : (ok === null && name === '班级修仙管理' ? 'wait' : 'no');
    return '<div class="acct-tool"><i class="dot ' + cls + '"></i><b>' + name + '</b><span>' + desc + '</span></div>';
  }

  /* ---------- 退出与视图跳转 ---------- */
  $('logoutBtn').addEventListener('click', function () {
    A.signOut().then(function () {
      session = null; otpLogin = null; otpReg = null;
      show('viewLogin'); msg($('loginMsg'), '已退出登录', true);
    });
  });
  $('goRegister').addEventListener('click', function (e) { e.preventDefault(); show('viewReg1'); });
  $('goLogin1').addEventListener('click', function (e) { e.preventDefault(); show('viewLogin'); });
  $('goLogin2').addEventListener('click', function (e) { e.preventDefault(); show('viewLogin'); });

  /* ---------- 启动 ---------- */
  applyShare();
  A.getSession().then(function (r) {
    session = (r && r.data) || null;
    if (!session) { show('viewLogin'); return; }
    A.myIdentity().then(function (id) {
      if (id.error) { show('viewLogin'); return; }
      var d = id.data || {};
      if (!d.registered) { loadClasses(); show('viewReg2'); return; }
      renderProfile(d); show('viewProfile');
    });
  });

  /* ---------- 结构自检（?selftest=1） ---------- */
  if (new URLSearchParams(location.search).get('selftest') === '1') {
    var checks = [];
    function ok(name, cond) { checks.push((cond ? 'PASS ' : 'FAIL ') + name); }
    ok('统一账号 SDK 已挂载', !!window.TBAccount);
    ok('云客户端已初始化', !!A.cloud);
    ok('注册 / 登录 / 我的账号四视图齐全', VIEWS.every(function (v) { return !!$(v); }));
    ok('手机号 + 验证码 + 自设密码字段齐全', !!$('regPhone') && !!$('regCode') && !!$('regPass') && !!$('regPass2'));
    ok('密码登录与验证码登录双通道', !!$('loginPass') && !!$('loginCode') && $('loginTabs').querySelectorAll('.tab').length === 2);
    ok('三级身份可选', document.querySelectorAll('input[name="identity"]').length === 3);
    ok('班级与学生姓名字段存在', !!$('regClass') && !!$('regStudent'));
    ok('四级角色说明存在', /超级管理员/.test($('roleNote').textContent) && /任课老师/.test($('roleNote').textContent));
    ok('仅教师可用班级修仙的规则存在', typeof A.canUseXiuxian === 'function');
    ok('受控数据接口存在', typeof A.hub === 'function' && typeof A.reviewProfile === 'function');
    ok('分享码透传', typeof A.share === 'function');
    var fails = checks.filter(function (x) { return x.indexOf('FAIL') === 0; });
    document.body.setAttribute('data-acct-selftest', (checks.length - fails.length) + '/' + checks.length + (fails.length ? ' FAIL: ' + fails.join(' | ') : ' ALL PASS'));
  }
})();
