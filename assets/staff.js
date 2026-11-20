/* 成员与班级管理后台 · 仅超级管理员 / 管理员可用（数据库侧再次校验） */
(function () {
  'use strict';
  var A = window.TBAccount;
  var $ = function (id) { return document.getElementById(id); };
  var ROLES = ['super_admin', 'admin', 'head_teacher', 'subject_teacher'];
  var who = null;
  var canManage = false;                 // 超级管理员 / 管理员：可审核、维护名册、分配任课
  var members = [], classes = [], students = [], teachers = [], follow = [];
  var modalHandler = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function toast(text, err) {
    var t = $('toast');
    t.textContent = text; t.className = 'staff-toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function shareLinks() {
    var code = new URLSearchParams(location.search).get('sharecode');
    if (!code) return;
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) === '#' || /^https?:/.test(h)) return;
      a.setAttribute('href', A.share(h));
    });
  }
  function gate(kicker, title, desc, actions) {
    $('gateKicker').textContent = kicker;
    $('gateTitle').textContent = title;
    $('gateDesc').textContent = desc;
    $('gateActions').innerHTML = actions || '';
    $('viewGate').hidden = false; $('viewMain').hidden = true; $('logoutBtn').hidden = true;
    shareLinks();
  }
  function showMain() {
    $('viewGate').hidden = true; $('viewMain').hidden = false; $('logoutBtn').hidden = false;
    $('staffWho').innerHTML = '<span>当前账号 <b>' + esc(who.name || who.phone || '教师') + '</b></span>' +
      '<span class="who-chip">' + esc(A.ROLE[who.role] || '已审核教师') + '</span>' +
      '<span class="who-tip">' + esc(A.ROLE_DESC[who.role] || '可查看并跟进本班考勤与单词背诵打卡') + '</span>';
    applyRoleView();
    shareLinks();
  }
  /* 四级权限的前端呈现：班主任 / 任课老师只看得到跟进与只读名册，
     真正的写权限仍由数据库 SECURITY DEFINER 函数二次校验。 */
  function applyRoleView() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-admin-only]'), function (el) {
      el.hidden = !canManage;
    });
    if (!canManage) switchTab('follow');
  }
  function switchTab(name) {
    if (!canManage && (name === 'review' || name === 'assign')) name = 'follow';
    Array.prototype.forEach.call($('staffTabs').querySelectorAll('.stab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    ['review', 'classes', 'assign', 'follow'].forEach(function (n) {
      $('panel' + n.charAt(0).toUpperCase() + n.slice(1)).hidden = (n !== name);
    });
    return name;
  }
  function cols(spec) { return 'style="grid-template-columns:' + spec + '"'; }
  function table(el, spec, head, rows, empty) {
    var h = '<div class="staff-tr head" ' + cols(spec) + '>' + head.map(function (x) { return '<div class="cell">' + x + '</div>'; }).join('') + '</div>';
    el.innerHTML = h + (rows.length ? rows.join('') : '<div class="staff-empty">' + (empty || '暂无数据') + '</div>');
  }
  function pill(text, kind) { return '<span class="pill ' + (kind || '') + '">' + esc(text) + '</span>'; }

  /* ---------- 通用弹窗 ---------- */
  function openModal(title, body, okText, onOk) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = body + '<p class="msg" id="modalMsg"></p>';
    $('modalOk').textContent = okText || '保存';
    modalHandler = onOk;
    $('modalOverlay').hidden = false;
  }
  function closeModal() { $('modalOverlay').hidden = true; modalHandler = null; }
  $('modalClose').addEventListener('click', closeModal);
  $('modalCancel').addEventListener('click', closeModal);
  $('modalOverlay').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  $('modalOk').addEventListener('click', function () {
    if (!modalHandler) return;
    var btn = this; btn.disabled = true;
    var out = modalHandler($('modalBody'));
    Promise.resolve(out).then(function (err) {
      btn.disabled = false;
      if (err) { $('modalMsg').textContent = err; return; }
      closeModal();
    }).catch(function (e) { btn.disabled = false; $('modalMsg').textContent = A.friendly(e); });
  });

  /* ---------- 成员审核 ---------- */
  function loadMembers() {
    var only = $('onlyPending').checked;
    return A.listProfiles(only).then(function (r) {
      if (r.error) { $('memberList').innerHTML = '<div class="staff-empty">' + esc(A.friendly(r.error)) + '</div>'; return; }
      members = Array.isArray(r.data) ? r.data : [];
      $('pendingCount').textContent = members.filter(function (m) { return m.status === 'pending'; }).length || '';
      var spec = 'minmax(96px,1.1fr) minmax(96px,1fr) 74px 78px minmax(90px,1fr) minmax(190px,1.7fr)';
      var rows = members.map(function (m) {
        var dt = m.created_at ? String(m.created_at).slice(0, 10) : '—';
        var ops = '';
        if (m.status === 'pending') {
          ops += '<button class="mini primary" data-act="approve" data-uid="' + esc(m.uid) + '">通过并分配角色</button>' +
            '<button class="mini danger" data-act="reject" data-uid="' + esc(m.uid) + '">不通过</button>';
        } else if (m.status === 'approved') {
          ops += '<button class="mini" data-act="role" data-uid="' + esc(m.uid) + '">改角色</button>' +
            '<button class="mini danger" data-act="reject" data-uid="' + esc(m.uid) + '">停用</button>';
        } else {
          ops += '<button class="mini" data-act="approve" data-uid="' + esc(m.uid) + '">重新通过</button>';
        }
        return '<div class="staff-tr" ' + cols(spec) + '>' +
          '<div class="cell"><b>' + esc(m.name) + '</b><br>' + esc(m.phone || '—') + '</div>' +
          '<div class="cell">' + esc(m.school || '—') + (m.subject ? ' / ' + esc(m.subject) : '') + '</div>' +
          '<div class="cell">' + esc(A.IDENTITY[m.identity] || m.identity) + '</div>' +
          '<div class="cell">' + pill(A.STATUS[m.status] || m.status, m.status === 'approved' ? 'ok' : (m.status === 'pending' ? 'wait' : 'no')) + '</div>' +
          '<div class="cell">' + esc(m.class_name || '—') + '<br>' + dt + '</div>' +
          '<div class="cell ops">' + ops + '</div></div>';
      });
      table($('memberList'), spec, ['姓名 / 手机', '学校 / 学科', '身份', '状态', '班级 / 申请日', '审核操作'], rows,
        only ? '没有待审核的成员' : '暂无成员，老师注册后会显示在这里');
    });
  }

  function roleOptions(cur) {
    return ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === cur ? ' selected' : '') + '>' + A.ROLE[r] + '</option>';
    }).join('');
  }
  $('memberList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    var m = members.filter(function (x) { return x.uid === b.getAttribute('data-uid'); })[0] || {};
    if (act === 'approve' || act === 'role') {
      openModal(act === 'approve' ? '确认身份并分配角色' : '调整角色',
        '<p class="acct-desc">申请人：<b>' + esc(m.name) + '</b>（' + esc(m.phone || '—') + '）· ' + esc(m.school || '未填学校') + '</p>' +
        '<div class="field"><label for="mRole">四级角色</label><select id="mRole">' + roleOptions(m.role) + '</select></div>' +
        '<div class="field"><label for="mNote">备注（可选，会显示在申请人账号里）</label><input id="mNote" placeholder="例：已核实在校教师身份"></div>',
        '确认', function (body) {
          var role = body.querySelector('#mRole').value;
          var note = body.querySelector('#mNote').value.trim();
          return A.reviewProfile({ uid: m.uid, action: act === 'approve' ? 'approve' : 'role', role: role, note: note })
            .then(function (r) {
              if (r.error) return A.friendly(r.error);
              toast('已保存：' + A.ROLE[role]); loadMembers(); loadTeachers(); return null;
            });
        });
    } else if (act === 'reject') {
      openModal('不通过 / 停用账号',
        '<p class="acct-desc">确认后该账号将不能进入教师功能；可随时重新审核通过。</p>' +
        '<div class="field"><label for="mNote">原因（会显示给申请人）</label><input id="mNote" placeholder="例：无法核实教师身份，请联系管理员"></div>',
        '确认不通过', function (body) {
          var note = body.querySelector('#mNote').value.trim();
          return A.reviewProfile({ uid: m.uid, action: 'reject', note: note }).then(function (r) {
            if (r.error) return A.friendly(r.error);
            toast('已更新状态'); loadMembers(); loadTeachers(); return null;
          });
        });
    }
  });
  $('onlyPending').addEventListener('change', loadMembers);
  $('refreshMembers').addEventListener('click', function () { loadMembers(); toast('已刷新'); });

  /* ---------- 班级 ---------- */
  function loadClasses() {
    return A.hub('list_classes', {}).then(function (r) {
      if (r.error) { $('classList').innerHTML = '<div class="staff-empty">' + esc(A.friendly(r.error)) + '</div>'; return; }
      classes = Array.isArray(r.data) ? r.data : [];
      var spec = 'minmax(120px,1.4fr) 66px 150px';
      table($('classList'), spec, ['班级', '学生数', '操作'], classes.map(function (c) {
        return '<div class="staff-tr" ' + cols(spec) + '>' +
          '<div class="cell"><b>' + esc(c.name) + '</b><br>' + esc([c.school, c.grade].filter(Boolean).join(' · ') || '—') + '</div>' +
          '<div class="cell">' + (c.student_count || 0) + '</div>' +
          '<div class="cell ops">' + (canManage
            ? '<button class="mini" data-act="edit" data-id="' + esc(c.id) + '">编辑</button>' +
              (who.role === 'super_admin' ? '<button class="mini danger" data-act="del" data-id="' + esc(c.id) + '">删除</button>' : '')
            : '<span class="pill">只读</span>') + '</div></div>';
      }), '还没有班级，点右上角新增');
      var opts = '<option value="">全部班级</option>' + classes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
      $('rosterClass').innerHTML = opts;
      $('asClass').innerHTML = classes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
      $('foClass').innerHTML = classes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    });
  }
  $('classList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var c = classes.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0] || {};
    if (b.getAttribute('data-act') === 'del') {
      openModal('删除班级', '<p class="acct-desc">删除「' + esc(c.name) + '」会同时删除该班学生名册和打卡记录，且不可恢复。确认？</p>', '确认删除', function () {
        return A.hub('delete_class', { id: c.id }).then(function (r) {
          if (r.error) return A.friendly(r.error);
          toast('已删除'); loadClasses(); loadStudents(); return null;
        });
      });
    } else {
      openModal('编辑班级', classForm(c), '保存', function (body) {
        return saveClass(c, body);
      });
    }
  });
  $('addClass').addEventListener('click', function () {
    openModal('新增班级', classForm({}), '创建班级', function (body) { return saveClass({}, body); });
  });
  function classForm(c) {
    return '<div class="field"><label for="mName">班级名称 *</label><input id="mName" value="' + esc(c.name || '') + '" placeholder="例：七（2）班"></div>' +
      '<div class="field"><label for="mSchool">学校</label><input id="mSchool" value="' + esc(c.school || '') + '" placeholder="例：石城县屏山中学"></div>' +
      '<div class="field"><label for="mGrade">年级</label><input id="mGrade" value="' + esc(c.grade || '') + '" placeholder="例：七年级"></div>' +
      '<div class="field"><label for="mCode">班级邀请码（可选）</label><input id="mCode" value="' + esc(c.invite_code || '') + '" placeholder="便于线下核对"></div>';
  }
  function saveClass(c, body) {
    var name = body.querySelector('#mName').value.trim();
    if (!name) return '请填写班级名称';
    return A.hub('save_class', {
      id: c.id || null, name: name,
      school: body.querySelector('#mSchool').value.trim(),
      grade: body.querySelector('#mGrade').value.trim(),
      invite_code: body.querySelector('#mCode').value.trim()
    }).then(function (r) {
      if (r.error) return A.friendly(r.error);
      toast('班级已保存'); loadClasses(); return null;
    });
  }

  /* ---------- 学生名册 ---------- */
  function loadStudents() {
    var cid = $('rosterClass').value || null;
    return A.hub('list_students', { class_id: cid }).then(function (r) {
      if (r.error) { $('studentList').innerHTML = '<div class="staff-empty">' + esc(A.friendly(r.error)) + '</div>'; return; }
      students = Array.isArray(r.data) ? r.data : [];
      var spec = 'minmax(80px,1fr) 70px minmax(90px,1fr) 110px';
      table($('studentList'), spec, ['姓名', '学号', '班级', '操作'], students.map(function (s) {
        var cn = (classes.filter(function (c) { return c.id === s.class_id; })[0] || {}).name || '—';
        return '<div class="staff-tr" ' + cols(spec) + '>' +
          '<div class="cell"><b>' + esc(s.name) + '</b></div><div class="cell">' + esc(s.student_no || '—') + '</div>' +
          '<div class="cell">' + esc(cn) + '</div>' +
          '<div class="cell ops">' + (canManage
            ? '<button class="mini" data-act="edit" data-id="' + esc(s.id) + '">编辑</button>' +
              '<button class="mini danger" data-act="del" data-id="' + esc(s.id) + '">删除</button>'
            : '<span class="pill">只读</span>') + '</div></div>';
      }), '名册为空；学生 / 家长注册时会按这里的姓名核对');
    });
  }
  $('rosterClass').addEventListener('change', loadStudents);
  $('addStudent').addEventListener('click', function () {
    if (!classes.length) { toast('请先新增班级', true); return; }
    openModal('添加学生', studentForm({}), '添加', function (body) { return saveStudent({}, body); });
  });
  $('studentList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var s = students.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0] || {};
    if (b.getAttribute('data-act') === 'del') {
      openModal('删除学生', '<p class="acct-desc">删除「' + esc(s.name) + '」会同时删除其打卡记录，不可恢复。确认？</p>', '确认删除', function () {
        return A.hub('delete_student', { id: s.id }).then(function (r) {
          if (r.error) return A.friendly(r.error);
          toast('已删除'); loadStudents(); loadClasses(); return null;
        });
      });
    } else openModal('编辑学生', studentForm(s), '保存', function (body) { return saveStudent(s, body); });
  });
  function studentForm(s) {
    return '<div class="field"><label for="mStuClass">班级 *</label><select id="mStuClass">' +
      classes.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.class_id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="mStuName">学生姓名 *</label><input id="mStuName" value="' + esc(s.name || '') + '" placeholder="须与注册时填写的一致"></div>' +
      '<div class="field"><label for="mStuNo">学号（可选）</label><input id="mStuNo" value="' + esc(s.student_no || '') + '"></div>';
  }
  function saveStudent(s, body) {
    var name = body.querySelector('#mStuName').value.trim();
    if (!name) return '请填写学生姓名';
    return A.hub('save_student', {
      id: s.id || null, class_id: body.querySelector('#mStuClass').value,
      name: name, student_no: body.querySelector('#mStuNo').value.trim()
    }).then(function (r) {
      if (r.error) return A.friendly(r.error);
      toast('名册已保存'); loadStudents(); loadClasses(); return null;
    });
  }

  /* ---------- 教师与任课分配 ---------- */
  function loadTeachers() {
    return A.hub('list_teachers', {}).then(function (r) {
      if (r.error) { $('teacherList').innerHTML = '<div class="staff-empty">' + esc(A.friendly(r.error)) + '</div>'; return; }
      teachers = Array.isArray(r.data) ? r.data : [];
      $('asTeacher').innerHTML = teachers.length
        ? teachers.map(function (t) { return '<option value="' + esc(t.uid) + '">' + esc(t.name || t.phone || t.uid) + ' · ' + A.ROLE[t.role] + '</option>'; }).join('')
        : '<option value="">（暂无已审核教师）</option>';
      var spec = 'minmax(90px,1fr) minmax(90px,1fr) 80px minmax(120px,1.4fr) 90px';
      table($('teacherList'), spec, ['教师', '角色', '学科', '已分配班级', '操作'], teachers.map(function (t) {
        return '<div class="staff-tr" ' + cols(spec) + '>' +
          '<div class="cell"><b>' + esc(t.name || '—') + '</b><br>' + esc(t.phone || '') + '</div>' +
          '<div class="cell">' + pill(A.ROLE[t.role] || t.role, 'ok') + '</div>' +
          '<div class="cell">' + esc(t.subject || '—') + '</div>' +
          '<div class="cell" data-classes="' + esc(t.uid) + '">加载中…</div>' +
          '<div class="cell ops"><button class="mini" data-act="pick" data-uid="' + esc(t.uid) + '">选为分配对象</button></div></div>';
      }), '暂无教师角色；请先在「成员审核」里通过教师申请');
      teachers.forEach(function (t) {
        A.hub('list_classes_by_teacher', { uid: t.uid }).then(function (res) {
          var cell = document.querySelector('[data-classes="' + t.uid + '"]');
          if (!cell) return;
          var list = Array.isArray(res.data) ? res.data : [];
          cell.textContent = list.length ? list.map(function (c) { return c.name + (c.subject ? '(' + c.subject + ')' : ''); }).join('、') : '未分配';
        });
      });
    });
  }
  $('teacherList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act="pick"]'); if (!b) return;
    $('asTeacher').value = b.getAttribute('data-uid');
    toast('已选定教师，请选择班级与学科后保存');
  });
  $('assignBtn').addEventListener('click', function () {
    var uid = $('asTeacher').value, cid = $('asClass').value;
    if (!uid) { toast('请先选择教师', true); return; }
    if (!cid) { toast('请先新增班级', true); return; }
    A.hub('assign_class', { uid: uid, class_id: cid, subject: $('asSubject').value.trim() }).then(function (r) {
      if (r.error) { toast(A.friendly(r.error), true); return; }
      toast('任课班级已保存'); loadTeachers();
    });
  });

  /* ---------- 考勤 / 背诵跟进 ---------- */
  function loadFollow() {
    var cid = $('foClass').value, day = $('foDay').value || today();
    if (!cid) { $('followList').innerHTML = '<div class="staff-empty">请先新增班级</div>'; return; }
    return A.hub('followup', { class_id: cid, day: day }).then(function (r) {
      if (r.error) { $('followList').innerHTML = '<div class="staff-empty">' + esc(A.friendly(r.error)) + '</div>'; return; }
      follow = Array.isArray(r.data) ? r.data : [];
      var spec = 'minmax(80px,1fr) 90px 90px 70px minmax(160px,1.6fr)';
      table($('followList'), spec, ['学生', '今日考勤', '最近背诵', '累计', '登记'], follow.map(function (s) {
        return '<div class="staff-tr" ' + cols(spec) + '>' +
          '<div class="cell"><b>' + esc(s.name) + '</b><br>' + esc(s.student_no || '') + '</div>' +
          '<div class="cell">' + (s.attendance ? pill(s.attendance, s.attendance === 'present' ? 'ok' : 'wait') : '<span class="pill">未登记</span>') + '</div>' +
          '<div class="cell">' + (s.recitation ? esc(s.recitation_day || '') + ' ' + pill(s.recitation, 'ok') : '<span class="pill">无</span>') + '</div>' +
          '<div class="cell">' + (s.recitation_count || 0) + ' 次</div>' +
          '<div class="cell ops"><button class="mini" data-act="att" data-sid="' + esc(s.student_id) + '">考勤</button>' +
          '<button class="mini" data-act="rec" data-sid="' + esc(s.student_id) + '">背诵</button></div></div>';
      }), '这个班还没有学生，请先在「班级与学生」里录入名册');
    });
  }
  $('followList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var kind = b.getAttribute('data-act') === 'rec' ? 'recitation' : 'attendance';
    var sid = b.getAttribute('data-sid');
    var options = kind === 'attendance'
      ? [['present', '出勤'], ['late', '迟到'], ['absent', '缺勤'], ['leave', '请假']]
      : [['done', '已完成'], ['review', '需复习'], ['none', '未打卡']];
    openModal(kind === 'attendance' ? '登记今日考勤' : '登记单词背诵打卡',
      '<div class="field"><label for="mStatus">状态</label><select id="mStatus">' +
      options.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="mNote">备注（可选）</label><input id="mNote" placeholder="例：Unit 3 已过关"></div>',
      '保存记录', function (body) {
        return A.hub('save_checkin', {
          student_id: sid, kind: kind, day: $('foDay').value || today(),
          status: body.querySelector('#mStatus').value,
          note: body.querySelector('#mNote').value.trim()
        }).then(function (r) {
          if (r.error) return A.friendly(r.error);
          toast('已登记'); loadFollow(); return null;
        });
      });
  });
  $('foClass').addEventListener('change', loadFollow);
  $('foDay').addEventListener('change', loadFollow);
  $('refreshFollow').addEventListener('click', function () { loadFollow(); toast('已刷新'); });

  /* ---------- 启动 ---------- */
  $('staffTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.stab'); if (!b) return;
    var n = switchTab(b.getAttribute('data-tab'));
    if (n === 'review') loadMembers();
    if (n === 'classes') { loadClasses(); loadStudents(); }
    if (n === 'assign') { loadClasses(); loadTeachers(); }
    if (n === 'follow') { loadClasses().then(loadFollow); }
  });
  $('logoutBtn').addEventListener('click', function () {
    A.signOut().then(function () { location.href = A.share('account.html'); });
  });
  /* 首次初始化按钮由 gate 动态插入，用事件委托绑定 */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#bootBtn');
    if (!b) return;
    b.disabled = true;
    A.bootstrapSuperAdmin().then(function (r) {
      b.disabled = false;
      if (r.error) { toast(A.friendly(r.error), true); return; }
      toast('已设为超级管理员，正在刷新…');
      setTimeout(function () { location.reload(); }, 700);
    });
  });

  shareLinks();
  $('foDay').value = today();
  A.getSession().then(function (r) {
    if (!r || !r.data) {
      gate('NOT SIGNED IN', '请先登录',
        '成员与班级管理只对超级管理员 / 管理员开放。请先用管理员账号登录统一账号中心。',
        '<a class="btn btn-primary" href="' + A.share('account.html') + '">去登录 →</a> <a class="btn" href="' + A.share('index.html') + '">返回工具箱</a>');
      return;
    }
    return A.myIdentity().then(function (id) {
      if (id.error) { gate('CHECK FAILED', '没能核对权限', A.friendly(id.error), ''); return; }
      var d = id.data || {};
      canManage = A.isStaffAdmin(d);
      var approvedTeacher = A.isApprovedTeacher(d);
      if (!canManage && !approvedTeacher) {
        gate('NO PERMISSION', '暂不能查看班级数据',
          '当前账号角色是「' + (A.ROLE[d.role] || '未分配') + '」' + (d.status === 'pending' ? '（教师身份还在待审核）' : '') +
          '。班主任与任课老师需由管理员确认身份并分配角色后，才能跟进本班考勤与背诵打卡。',
          '<a class="btn btn-primary" href="' + A.share('account.html') + '">查看我的账号</a> ' +
          '<button class="btn btn-sm" id="bootBtn" type="button">系统尚无管理员？初始化</button> ' +
          '<a class="btn" href="' + A.share('index.html') + '">返回工具箱</a>' +
          '<p class="field-hint" style="margin-top:10px">本系统已预置 1 名超级管理员，即 2026-11-18 认领后台时使用的那个账号。请用<b>那个账号</b>登录；用新手机号注册的教师，需由超级管理员在「成员审核」里分配角色后才可跟进班级数据。下方按钮只在系统一个角色都没有时才生效。</p>');
        return;
      }
      who = d; showMain();
      if (canManage) {
        loadMembers(); loadClasses(); loadStudents(); loadTeachers();
      } else {
        loadClasses().then(function () { loadStudents(); loadFollow(); });
      }
    });
  });

  /* ---------- 结构自检（?selftest=1） ---------- */
  if (new URLSearchParams(location.search).get('selftest') === '1') {
    var ck = [];
    function ok(n, c) { ck.push((c ? 'PASS ' : 'FAIL ') + n); }
    ok('统一账号 SDK 已挂载', !!window.TBAccount && !!A.cloud);
    ok('四个管理页签齐全', $('staffTabs').querySelectorAll('.stab').length === 4);
    ok('四级角色选项齐全', ROLES.length === 4 && ROLES.every(function (r) { return !!A.ROLE[r]; }));
    ok('成员审核列表存在', !!$('memberList') && !!$('onlyPending'));
    ok('班级与学生名册存在', !!$('classList') && !!$('studentList'));
    ok('任课分配表单存在', !!$('asTeacher') && !!$('asClass') && !!$('asSubject'));
    ok('考勤 / 背诵跟进存在', !!$('followList') && !!$('foClass') && !!$('foDay'));
    ok('四级角色受控接口存在', typeof A.reviewProfile === 'function' && typeof A.hub === 'function');
    ok('不使用系统 alert/confirm', !/\balert\(|\bconfirm\(/.test(String(window.TBAccount.friendly)));
    var f = ck.filter(function (x) { return x.indexOf('FAIL') === 0; });
    document.body.setAttribute('data-staff-selftest', (ck.length - f.length) + '/' + ck.length + (f.length ? ' FAIL: ' + f.join(' | ') : ' ALL PASS'));
  }
})();
