/* 工具页统一身份条 · 零侵入：只插入一条顶部状态栏，不改工具原有逻辑
   用法：<script src="assets/account-bar.js" data-tool="attendance"></script>
   可选 data-gate="teacher"：非「已审核教师」时显示醒目提示（不强制拦截，避免破坏原工具）。 */
(function () {
  'use strict';
  var A = window.TBAccount;
  if (!A) return;
  var script = document.currentScript;
  var toolName = (script && script.getAttribute('data-tool')) || '';
  var gate = (script && script.getAttribute('data-gate')) || '';

  var bar = document.createElement('div');
  bar.className = 'tba-bar';
  bar.innerHTML = '<span>账号状态加载中…</span>';
  document.body.insertBefore(bar, document.body.firstChild);

  function link(text, url) { return '<a href="' + A.share(url) + '">' + text + '</a>'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function render(html) { bar.innerHTML = html; }

  function showGuest() {
    render('<span>未登录</span><span class="tba-tag dim">数据仅存本机浏览器</span>' +
      '<span class="tba-grow"></span>' +
      '<span>工具箱统一账号：</span>' + link('登录 / 注册', 'account.html') +
      (toolName ? '<span>· ' + esc(toolName) + '</span>' : ''));
  }

  function showIdentity(d) {
    var tags = '';
    if (d.status === 'pending') tags += '<span class="tba-tag warn">教师身份待管理员确认</span>';
    else if (d.status === 'rejected') tags += '<span class="tba-tag warn">身份未通过</span>';
    else tags += '<span class="tba-tag">' + esc(A.IDENTITY[d.identity] || '') + (d.role && d.role !== 'none' ? ' · ' + esc(A.ROLE[d.role] || '') : '') + '</span>';
    if (d.class_name) tags += '<span class="tba-tag dim">' + esc(d.class_name) + '</span>';
    if (d.student_name && d.identity !== 'teacher') tags += '<span class="tba-tag dim">' + esc(d.student_name) + '</span>';

    var actions = link('我的账号', 'account.html');
    if (A.isApprovedTeacher(d)) actions += '<span>·</span>' + link('本班考勤 / 背诵跟进', 'staff.html');
    if (A.isStaffAdmin(d)) actions += '<span>·</span>' + link('成员审核', 'staff.html');

    var gateTip = '';
    if (gate === 'teacher' && !A.canUseXiuxian(d)) {
      gateTip = '<span class="tba-tag warn">班级修仙管理仅向已审核教师开放</span>';
    }
    render('<span class="tba-name">' + esc(d.name || '未完善资料') + '</span>' + tags + gateTip +
      '<span class="tba-grow"></span>' + actions);
  }

  A.getSession().then(function (r) {
    if (!r || !r.data) { showGuest(); return; }
    return A.myIdentity().then(function (id) {
      if (id.error || !id.data || !id.data.registered) {
        render('<span class="tba-name">已登录，但账号资料未完善</span><span class="tba-tag warn">请补充身份与班级信息</span>' +
          '<span class="tba-grow"></span>' + link('去完善资料', 'account.html'));
        return;
      }
      showIdentity(id.data);
    });
  }).catch(function () { showGuest(); });
})();
