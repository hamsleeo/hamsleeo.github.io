// 全部页面视图：登录、绑定、请假、考勤、洞府、功过、仙门、乐园、修为、天机
(function () {
    'use strict';

    var App = window.App;
    var U = App.ui;
    var esc = App.esc;
    var R = App.realm;

    var STATUS_TEXT = { pending: '待审批', approved: '已批准', rejected: '已驳回', cancelled: '已撤回' };
    var TYPE_TEXT = { sick: '病假', personal: '事假', other: '其他' };
    var ATT_TEXT = { present: '到', late: '迟到', absent: '缺勤', leave: '请假' };
    var ATT_OPTIONS = [
        { key: 'present', label: '到' },
        { key: 'late', label: '迟' },
        { key: 'absent', label: '缺' },
        { key: 'leave', label: '假' }
    ];

    function stateBlock(icon, text) {
        return '<div class="state"><div class="state-icon">' + icon + '</div><div class="state-text">' + esc(text) + '</div></div>';
    }

    function classBar(list, activeId) {
        if (!list || list.length === 0) return '';
        return (
            '<div class="classbar">' +
            list
                .map(function (c) {
                    return (
                        '<button class="class-tab ' + (c.id === activeId ? 'on' : '') + '" data-class-id="' + c.id + '">' +
                        esc(c.name) +
                        '</button>'
                    );
                })
                .join('') +
            '</div>'
        );
    }

    function seg(items, active, attr) {
        return (
            '<div class="seg">' +
            items
                .map(function (item) {
                    return (
                        '<button class="seg-item ' + (item.key === active ? 'on' : '') + '" ' + attr + '="' + esc(item.key) + '">' +
                        esc(item.label) +
                        '</button>'
                    );
                })
                .join('') +
            '</div>'
        );
    }

    function emptyBox(text) {
        return '<div class="empty">' + esc(text) + '</div>';
    }

    // ================= 登录 =================
    // 微信扫码仅电脑可用（snsapi_login 只出二维码），手机端走手机号/邮箱验证码
    var login = {
        title: '修仙班级',
        tab: false,
        mode: 'phone',
        identity: '',
        error: '',
        cooldownUntil: 0,
        timer: null,

        async show(root) {
            var mode = login.mode || 'phone';
            var isPhone = mode === 'phone';
            var left = Math.max(0, Math.ceil((login.cooldownUntil - Date.now()) / 1000));

            root.innerHTML =
                '<div class="login-hero">' +
                '<div class="login-seal">修</div>' +
                '<div class="login-title">修仙班级</div>' +
                '<div class="login-sub">积分即修为 · 练气至渡劫</div>' +
                '</div>' +
                '<div class="card">' +
                '<div class="row-between" style="margin-bottom:14px">' +
                '<div class="sec-title" style="margin:0">登录</div>' +
                seg(
                    [
                        { key: 'phone', label: '手机号' },
                        { key: 'email', label: '邮箱' }
                    ],
                    mode,
                    'data-mode'
                ) +
                '</div>' +
                '<div class="field">' +
                '<div class="field-label">' + (isPhone ? '手机号' : '邮箱') + '</div>' +
                '<input class="input" id="loginId" type="' + (isPhone ? 'tel' : 'text') + '"' +
                (isPhone ? ' inputmode="numeric" maxlength="11" placeholder="11 位手机号"' : ' autocapitalize="off" autocomplete="email" placeholder="你的邮箱地址"') +
                ' value="' + esc(login.identity) + '" />' +
                '</div>' +
                '<div class="field">' +
                '<div class="field-label">验证码</div>' +
                '<div class="row">' +
                '<input class="input grow" id="loginCode" inputmode="numeric" maxlength="6" placeholder="6 位数字" />' +
                '<button class="btn btn-sm btn-ghost" id="sendCode"' + (left > 0 ? ' disabled' : '') + '>' +
                (left > 0 ? left + ' 秒后重发' : '获取验证码') +
                '</button>' +
                '</div>' +
                '</div>' +
                '<button class="btn btn-primary btn-block" id="doLogin">登录 / 注册</button>' +
                '<div class="login-error" id="loginError"' + (login.error ? '' : ' hidden') + '>' + esc(login.error) + '</div>' +
                '<div class="login-note">首次登录自动创建账号，不用设密码。<br/>老师登录后用「仙师令牌」绑定班级；学生用学号 + 姓名认领名单。<br/><b>注意：这是本工具自己的云端账号，与「教师工具箱」后台的管理员账号不通用。</b></div>' +
                '</div>' +
                '<div class="card">' +
                '<div class="sec-title">微信扫码（仅电脑）</div>' +
                '<button class="btn btn-wechat btn-block" id="wxLogin">微信扫码登录</button>' +
                '<div class="small muted" style="margin-top:10px;line-height:1.8">微信这条通道只能给出二维码，手机上没法扫自己屏幕，所以手机请用上面的验证码登录。</div>' +
                '</div>';

            login.error = '';
            if (login.timer) {
                clearInterval(login.timer);
                login.timer = null;
            }

            var input = U.qs('#loginId', root);
            var codeInput = U.qs('#loginCode', root);
            var sendBtn = U.qs('#sendCode', root);
            var loginBtn = U.qs('#doLogin', root);
            var errorBox = U.qs('#loginError', root);

            function showError(text) {
                login.error = text;
                if (!errorBox) return;
                errorBox.hidden = !text;
                errorBox.textContent = text || '';
            }

            function readIdentity() {
                var raw = (input.value || '').trim();
                if (mode === 'phone') raw = raw.replace(/[\s-]/g, '').replace(/^\+?86/, '');
                return raw;
            }

            function validateIdentity() {
                var value = readIdentity();
                if (mode === 'phone') {
                    if (!/^1\d{10}$/.test(value)) return '请输入 11 位手机号';
                } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    return '请输入正确的邮箱地址';
                }
                login.identity = value;
                return '';
            }

            function startCooldown(seconds) {
                login.cooldownUntil = Date.now() + seconds * 1000;
                if (login.timer) clearInterval(login.timer);
                login.timer = setInterval(function () {
                    var leftSec = Math.ceil((login.cooldownUntil - Date.now()) / 1000);
                    if (!sendBtn) return;
                    if (leftSec <= 0) {
                        clearInterval(login.timer);
                        login.timer = null;
                        sendBtn.disabled = false;
                        sendBtn.textContent = '重新获取';
                        return;
                    }
                    sendBtn.disabled = true;
                    sendBtn.textContent = leftSec + ' 秒后重发';
                }, 1000);
            }

            // 已冷却中：恢复倒计时显示
            if (left > 0) startCooldown(left);

            U.qsa('[data-mode]', root).forEach(function (item) {
                item.onclick = function () {
                    var next = item.getAttribute('data-mode');
                    if (next === login.mode) return;
                    login.mode = next;
                    login.identity = '';
                    login.error = '';
                    login.show(root);
                };
            });

            input.oninput = function () {
                login.identity = input.value;
            };

            sendBtn.onclick = async function () {
                var problem = validateIdentity();
                if (problem) {
                    showError(problem);
                    return;
                }
                sendBtn.disabled = true;
                var backup = sendBtn.textContent;
                sendBtn.textContent = '发送中…';
                try {
                    await App.auth.sendCode({ kind: mode, value: login.identity });
                    showError('');
                    startCooldown(60);
                    U.toast(mode === 'phone' ? '验证码已发送，请查看短信' : '验证码已发送，请查看邮箱');
                    if (codeInput) codeInput.focus();
                } catch (error) {
                    sendBtn.disabled = false;
                    sendBtn.textContent = backup;
                    var reason = (error && error.message) || '验证码发送失败';
                    if (mode === 'phone') reason += '（可切到「邮箱」，用邮箱验证码登录）';
                    showError(reason);
                }
            };

            loginBtn.onclick = async function () {
                var problem = validateIdentity();
                if (problem) {
                    showError(problem);
                    return;
                }
                var token = (codeInput.value || '').trim();
                if (!/^\d{4,8}$/.test(token)) {
                    showError('请输入收到的验证码');
                    return;
                }
                loginBtn.disabled = true;
                loginBtn.textContent = '正在登录…';
                try {
                    await App.auth.verifyCode(token);
                    U.toast('登录成功');
                    window.setTimeout(function () {
                        window.location.reload();
                    }, 300);
                } catch (error) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = '登录 / 注册';
                    showError((error && error.message) || '验证码不正确，请重新获取');
                }
            };

            U.qs('#wxLogin', root).onclick = async function (event) {
                var btn = event.currentTarget;
                btn.disabled = true;
                btn.textContent = '正在前往微信授权…';
                try {
                    await App.auth.signInWechat();
                } catch (error) {
                    btn.disabled = false;
                    btn.textContent = '微信扫码登录';
                    showError((error && error.message) || '微信登录失败');
                }
            };
        }
    };

    // ================= 绑定身份 =================
    var bind = {
        title: '绑定身份',
        tab: false,
        async show(root) {
            var classRes = await App.data.classes.list();
            var classes = (classRes.data || []).slice().sort(function (a, b) {
                return a.id - b.id;
            });
            var isFirst = classes.length === 0;

            root.innerHTML =
                '<div class="card">' +
                '<div class="sec-title">认领身份</div>' +
                '<div class="small muted" style="margin-bottom:12px">绑定后即可查看本班名单、记录功过与考勤。身份由服务端校验，不能冒充他人。</div>' +
                seg(
                    [
                        { key: 'student', label: '我是学生' },
                        { key: 'teacher', label: '我是老师' }
                    ],
                    bind.tab || 'student',
                    'data-bind-tab'
                ) +
                '<div id="bindForm" style="margin-top:14px"></div>' +
                '<div class="warn-text" id="bindError" style="margin-top:10px"></div>' +
                '</div>';

            bind.classes = classes;
            bind.isFirst = isFirst;

            var renderForm = function (tab) {
                bind.tab = tab;
                var form = U.qs('#bindForm', root);
                if (tab === 'student') {
                    form.innerHTML =
                        '<div class="field"><div class="field-label">学号</div>' +
                        '<input class="input" id="bNo" placeholder="如：20240135" inputmode="numeric" /></div>' +
                        '<div class="field"><div class="field-label">姓名</div>' +
                        '<input class="input" id="bName" placeholder="与名单一致" /></div>' +
                        '<button class="btn btn-primary btn-block" id="bSubmit">认领我的名单行</button>' +
                        '<div class="tip-box" style="margin-top:12px">学号和姓名要与老师导入的名单一致，才能认领成功。</div>';
                } else {
                    var options = classes
                        .map(function (c) {
                            return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
                        })
                        .join('');
                    form.innerHTML =
                        '<div class="field"><div class="field-label">姓名</div>' +
                        '<input class="input" id="bName" placeholder="如：张老师" /></div>' +
                        (isFirst
                            ? '<div class="tip-box">当前还没有任何班级，你绑定后将自动成为管理员，可先建班再发放令牌。</div>'
                            : '<div class="field"><div class="field-label">班级</div><select class="select" id="bClass">' + options + '</select></div>') +
                        '<div class="field"><div class="field-label">仙师令牌</div>' +
                        '<input class="input" id="bToken" placeholder="由管理员发放，如：A1B2C3" style="text-transform:uppercase" /></div>' +
                        '<div class="field"><div class="field-label">身份</div><select class="select" id="bRole">' +
                        '<option value="homeroom">班主任（可记录功过考勤）</option>' +
                        '<option value="subject">任课老师（只读）</option></select></div>' +
                        '<div class="field"><div class="field-label">学科（选填）</div>' +
                        '<input class="input" id="bSubject" placeholder="如：语文" /></div>' +
                        '<button class="btn btn-primary btn-block" id="bSubmit">绑定老师身份</button>';
                }
                U.qs('#bSubmit', form).onclick = function () {
                    submit(form, tab);
                };
            };

            var submit = async function (form, tab) {
                var errorBox = U.qs('#bindError', root);
                errorBox.textContent = '';
                var btn = U.qs('#bSubmit', form);
                var name = (U.qs('#bName', form).value || '').trim();
                btn.disabled = true;

                if (tab === 'student') {
                    var no = (U.qs('#bNo', form).value || '').trim();
                    if (!no || !name) {
                        btn.disabled = false;
                        errorBox.textContent = '请填写学号和姓名';
                        return;
                    }
                    var res = await App.auth.bindStudent(no, name);
                    btn.disabled = false;
                    if (!res.ok) {
                        errorBox.textContent = res.message;
                        return;
                    }
                    U.toast('认领成功');
                    if (App.onIdentityChanged) App.onIdentityChanged();
                    return;
                }

                if (!name) {
                    btn.disabled = false;
                    errorBox.textContent = '请填写姓名';
                    return;
                }
                var tokenInput = U.qs('#bToken', form);
                var classSelect = U.qs('#bClass', form);
                var roleSelect = U.qs('#bRole', form);
                var subjectInput = U.qs('#bSubject', form);
                var token = tokenInput ? tokenInput.value.trim().toUpperCase() : '';
                if (!isFirst && !token) {
                    btn.disabled = false;
                    errorBox.textContent = '请填写管理员发放的仙师令牌';
                    return;
                }
                var result = await App.auth.bindTeacher({
                    token: token,
                    name: name,
                    classId: classSelect ? Number(classSelect.value) : null,
                    role: roleSelect ? roleSelect.value : 'homeroom',
                    subject: subjectInput ? subjectInput.value : ''
                });
                btn.disabled = false;
                if (!result.ok) {
                    errorBox.textContent = result.message;
                    return;
                }
                U.toast(result.isAdmin ? '已绑定，你是管理员' : '绑定成功');
                if (App.onIdentityChanged) App.onIdentityChanged();
            };

            U.qsa('[data-bind-tab]', root).forEach(function (btn) {
                btn.onclick = function () {
                    U.qsa('[data-bind-tab]', root).forEach(function (b) {
                        b.classList.toggle('on', b === btn);
                    });
                    renderForm(btn.getAttribute('data-bind-tab'));
                };
            });

            renderForm(bind.tab || 'student');
        }
    };

    // ================= 请假 =================
    var qingjia = {
        title: '请假',
        tab: true,
        async show(root) {
            var profile = await App.auth.loadProfile();
            if (profile.role === 'guest') return App.navigate('bind');
            qingjia.type = qingjia.type || 'sick';
            qingjia.start = qingjia.start || App.today();
            qingjia.end = qingjia.end || App.today();
            qingjia.teacherTab = qingjia.teacherTab || 'pending';

            if (profile.role === 'student') return renderStudent(root, profile);
            return renderTeacher(root, profile);
        }
    };

    async function renderStudent(root, profile) {
        var res = await App.data.leavesMine(30);
        var list = res.data || [];
        root.innerHTML =
            '<div class="card">' +
            '<div class="sec-title">提交请假</div>' +
            '<div class="field"><div class="field-label">假别</div>' +
            '<div class="wrap" id="typeWrap">' +
            ['sick', 'personal', 'other']
                .map(function (key) {
                    return '<button class="chip ' + (qingjia.type === key ? 'on' : '') + '" data-type="' + key + '">' + TYPE_TEXT[key] + '</button>';
                })
                .join('') +
            '</div></div>' +
            '<div class="row" style="gap:10px">' +
            '<div class="field grow"><div class="field-label">开始日期</div><input class="input" type="date" id="dStart" value="' + esc(qingjia.start) + '" /></div>' +
            '<div class="field grow"><div class="field-label">结束日期</div><input class="input" type="date" id="dEnd" value="' + esc(qingjia.end) + '" /></div>' +
            '</div>' +
            '<div class="field"><div class="field-label">事由</div><input class="input" id="dReason" placeholder="如：发热需就医" maxlength="60" /></div>' +
            '<div class="field"><div class="field-label">家长联系方式（选填）</div><input class="input" id="dContact" placeholder="手机号" /></div>' +
            '<button class="btn btn-primary btn-block" id="dSubmit">提交请假</button>' +
            '</div>' +
            '<div class="card">' +
            '<div class="sec-title">我的请假（' + list.length + '）</div>' +
            (list.length === 0
                ? emptyBox('还没有请假记录')
                : '<div class="list">' +
                  list
                      .map(function (item) {
                          var badge = '<span class="badge ' +
                              (item.status === 'approved' ? 'badge-green' : item.status === 'pending' ? 'badge-gold' : 'badge-plain') +
                              '">' + esc(STATUS_TEXT[item.status] || item.status) + '</span>';
                          return (
                              '<div class="list-row">' +
                              '<div class="row-main">' +
                              '<div class="row-title">' + esc(TYPE_TEXT[item.type] || '请假') + ' · ' + esc(item.startDate === item.endDate ? item.startDate : item.startDate + ' 至 ' + item.endDate) + '</div>' +
                              '<div class="row-sub">' + esc(item.reason || '未填事由') + (item.reviewNote ? ' · 审批意见：' + esc(item.reviewNote) : '') + '</div>' +
                              '</div>' + badge +
                              (item.status === 'pending' ? '<button class="btn btn-sm" data-cancel="' + item.id + '">撤回</button>' : '') +
                              '</div>'
                          );
                      })
                      .join('') +
                  '</div>') +
            '</div>';

        U.qsa('[data-type]', root).forEach(function (btn) {
            btn.onclick = function () {
                qingjia.type = btn.getAttribute('data-type');
                U.qsa('[data-type]', root).forEach(function (b) {
                    b.classList.toggle('on', b === btn);
                });
            };
        });

        U.qs('#dStart', root).onchange = function (event) {
            qingjia.start = event.target.value;
            if (qingjia.end < qingjia.start) {
                qingjia.end = qingjia.start;
                U.qs('#dEnd', root).value = qingjia.start;
            }
        };
        U.qs('#dEnd', root).onchange = function (event) {
            qingjia.end = event.target.value;
        };

        U.qs('#dSubmit', root).onclick = async function () {
            var reason = U.qs('#dReason', root).value.trim();
            if (!reason) {
                U.toast('请简单写明请假事由');
                return;
            }
            this.disabled = true;
            var created = await App.data.createLeave({
                type: qingjia.type,
                startDate: qingjia.start,
                endDate: qingjia.end,
                reason: reason,
                contact: U.qs('#dContact', root).value
            });
            this.disabled = false;
            if (created.error) {
                U.toast(created.error.message || '提交失败');
                return;
            }
            U.toast('已提交，等班主任审批');
            qingjia.type = 'sick';
            qingjia.show(root);
        };

        U.qsa('[data-cancel]', root).forEach(function (btn) {
            btn.onclick = async function () {
                var ok = await U.confirm({ title: '撤回请假', body: '撤回后这条请假单作废，需要重新提交。', confirmText: '撤回', danger: true });
                if (!ok) return;
                var r = await App.data.cancelLeave(Number(btn.getAttribute('data-cancel')));
                if (r.error) {
                    U.toast(r.error.message || '撤回失败');
                    return;
                }
                U.toast('已撤回');
                qingjia.show(root);
            };
        });
    }

    async function renderTeacher(root, profile) {
        var homerooms = (profile.classes || []).filter(function (c) {
            return c.role === 'homeroom';
        });
        var options = homerooms.length > 0 ? homerooms : profile.classes || [];
        if (options.length === 0) {
            root.innerHTML = '<div class="card">' + stateBlock('🧭', '你还没有绑定班级，请到「天机」绑定你带的班') + '</div>';
            return;
        }
        var currentId = qingjia.classId && options.some(function (c) { return c.id === qingjia.classId; })
            ? qingjia.classId
            : options[0].id;
        qingjia.classId = currentId;

        var results = await Promise.all([
            App.data.leavesByClass(currentId, 'pending', 40),
            App.data.leavesByClass(currentId, '', 60)
        ]);
        var pending = results[0].data || [];
        var all = results[1].data || [];
        var showing = qingjia.teacherTab === 'pending' ? pending : all;

        var rowHtml = function (item) {
            var badge =
                '<span class="badge ' +
                (item.status === 'approved' ? 'badge-green' : item.status === 'pending' ? 'badge-gold' : 'badge-plain') +
                '">' + esc(STATUS_TEXT[item.status] || item.status) + '</span>';
            return (
                '<div class="list-row" style="align-items:flex-start">' +
                '<div class="row-main">' +
                '<div class="row-title">' + esc(item.studentName) + ' · ' + esc(TYPE_TEXT[item.type] || '请假') + '</div>' +
                '<div class="row-sub">' + esc(item.startDate === item.endDate ? item.startDate : item.startDate + ' 至 ' + item.endDate) + ' · ' + esc(item.reason || '未填事由') + '</div>' +
                (item.reviewerName ? '<div class="row-sub">审批：' + esc(item.reviewerName) + (item.reviewNote ? ' · ' + esc(item.reviewNote) : '') + '</div>' : '') +
                '</div>' +
                badge +
                (item.status === 'pending'
                    ? '<div class="stack" style="gap:6px">' +
                      '<button class="btn btn-sm btn-primary" data-approve="' + item.id + '">批准</button>' +
                      '<button class="btn btn-sm" data-reject="' + item.id + '">驳回</button>' +
                      '</div>'
                    : '') +
                '</div>'
            );
        };

        root.innerHTML =
            classBar(options, currentId) +
            '<div class="card">' +
            '<div class="row-between" style="margin-bottom:12px">' +
            '<div class="sec-title" style="margin:0">本班请假</div>' +
            seg(
                [
                    { key: 'pending', label: '待审批 ' + pending.length },
                    { key: 'all', label: '全部 ' + all.length }
                ],
                qingjia.teacherTab,
                'data-ttab'
            ) +
            '</div>' +
            (showing.length === 0
                ? emptyBox(qingjia.teacherTab === 'pending' ? '没有待审批的请假' : '还没有请假记录')
                : '<div class="list">' + showing.map(rowHtml).join('') + '</div>') +
            '<div class="tip-box" style="margin-top:12px">批准后，该学生在请假期间的考勤会自动记为「假」，点名时不会被记成缺勤。</div>' +
            '</div>';

        U.qsa('[data-class-id]', root).forEach(function (btn) {
            btn.onclick = function () {
                qingjia.classId = Number(btn.getAttribute('data-class-id'));
                qingjia.show(root);
            };
        });
        U.qsa('[data-ttab]', root).forEach(function (btn) {
            btn.onclick = function () {
                qingjia.teacherTab = btn.getAttribute('data-ttab');
                qingjia.show(root);
            };
        });
        U.qsa('[data-approve]', root).forEach(function (btn) {
            btn.onclick = async function () {
                var ok = await U.confirm({ title: '批准请假', body: '批准后请假期间考勤自动记为「假」。', confirmText: '批准' });
                if (!ok) return;
                var r = await App.data.reviewLeave(Number(btn.getAttribute('data-approve')), 'approved', '');
                if (r.error) {
                    U.toast(r.error.message || '审批失败');
                    return;
                }
                U.toast('已批准');
                qingjia.show(root);
            };
        });
        U.qsa('[data-reject]', root).forEach(function (btn) {
            btn.onclick = async function () {
                var note = await U.prompt({ title: '驳回请假', placeholder: '写明原因，学生能看到', cancelText: '取消' });
                if (note === null) return;
                var r = await App.data.reviewLeave(Number(btn.getAttribute('data-reject')), 'rejected', note);
                if (r.error) {
                    U.toast(r.error.message || '审批失败');
                    return;
                }
                U.toast('已驳回');
                qingjia.show(root);
            };
        });
    }

    // ================= 考勤 =================
    var kaoqin = {
        title: '考勤',
        tab: true,
        async show(root) {
            var profile = await App.auth.loadProfile();
            if (profile.role === 'guest') return App.navigate('bind');
            if (profile.role === 'student') return renderMyAttendance(root, profile);

            var options = profile.classes || [];
            if (options.length === 0) {
                root.innerHTML = '<div class="card">' + stateBlock('🧭', '你还没有绑定班级，请到「天机」绑定你带的班') + '</div>';
                return;
            }
            var currentId = kaoqin.classId && options.some(function (c) { return c.id === kaoqin.classId; })
                ? kaoqin.classId
                : options[0].id;
            kaoqin.classId = currentId;
            kaoqin.day = kaoqin.day || App.today();
            kaoqin.mode = kaoqin.mode || 'daily';
            kaoqin.period = kaoqin.period || 1;

            root.innerHTML = classBar(options, currentId) + stateBlock('🗓️', '正在读取名单…');

            var results = await Promise.all([
                App.data.students.list(),
                App.data.attendanceForDay(currentId, kaoqin.day, kaoqin.mode, kaoqin.period),
                App.data.leavesApprovedOn(currentId, kaoqin.day)
            ]);
            var roster = (results[0].data || []).filter(function (s) {
                return s.classId === currentId;
            });
            var saved = {};
            (results[1].data || []).forEach(function (r) {
                saved[r.studentId] = r;
            });
            var onLeave = {};
            (results[2].data || []).forEach(function (l) {
                onLeave[l.studentId] = l.type;
            });

            kaoqin.rows = roster
                .sort(function (a, b) {
                    return a.id - b.id;
                })
                .map(function (s) {
                    var record = saved[s.id];
                    var isLeave = !!onLeave[s.id];
                    var status = record ? record.status : 'present';
                    if (isLeave) status = 'leave';
                    return {
                        id: s.id,
                        name: s.name,
                        status: status,
                        locked: isLeave,
                        leaveType: isLeave ? (onLeave[s.id] === 'sick' ? '病假' : onLeave[s.id] === 'personal' ? '事假' : '请假') : ''
                    };
                });

            var periods = [];
            for (var i = 1; i <= 8; i++) periods.push(i);

            root.innerHTML =
                classBar(options, currentId) +
                '<div class="card">' +
                '<div class="row-between" style="margin-bottom:10px">' +
                '<div class="row" style="gap:6px">' +
                '<button class="btn btn-sm" id="prevDay">‹</button>' +
                '<input class="input" type="date" id="pickDay" value="' + esc(kaoqin.day) + '" style="width:150px;padding:6px 8px" />' +
                '<button class="btn btn-sm" id="nextDay">›</button>' +
                '</div>' +
                seg(
                    [
                        { key: 'daily', label: '日考勤' },
                        { key: 'period', label: '节次' }
                    ],
                    kaoqin.mode,
                    'data-mode'
                ) +
                '</div>' +
                '<div class="row-between" style="margin-bottom:12px">' +
                '<div class="small muted">' + esc(App.weekdayText(kaoqin.day)) + ' · 共 ' + kaoqin.rows.length + ' 人</div>' +
                (kaoqin.mode === 'period'
                    ? '<select class="select" id="periodSel" style="width:110px;padding:6px 26px 6px 10px">' +
                      periods
                          .map(function (n) {
                              return '<option value="' + n + '" ' + (n === kaoqin.period ? 'selected' : '') + '>第' + n + '节</option>';
                          })
                          .join('') +
                      '</select>'
                    : '<button class="btn btn-sm" id="allPresent">未请假的都记「到」</button>') +
                '</div>' +
                '<div id="rosterBox"></div>' +
                '<div class="stat-grid" id="countBox" style="margin-top:12px"></div>' +
                '<button class="btn btn-primary btn-block" id="saveAtt" style="margin-top:12px">保存本次点名</button>' +
                '</div>';

            var drawRoster = function () {
                var box = U.qs('#rosterBox', root);
                if (!kaoqin.rows || kaoqin.rows.length === 0) {
                    box.innerHTML = emptyBox('这个班还没有学生，请先到「洞府」添加或导入名单');
                    return;
                }
                box.innerHTML =
                    '<div class="list">' +
                    kaoqin.rows
                        .map(function (row) {
                            return (
                                '<div class="list-row">' +
                                '<div class="row-main"><div class="row-title">' + esc(row.name) + '</div>' +
                                (row.locked ? '<div class="row-sub">已批准' + esc(row.leaveType) + '，自动记为假</div>' : '') +
                                '</div>' +
                                '<div class="wrap" style="gap:4px">' +
                                ATT_OPTIONS.map(function (option) {
                                    var on = row.status === option.key;
                                    var style = on ? 'background:#a83232;border-color:#a83232;color:#fff8e7' : '';
                                    var dim = row.locked && !on ? 'opacity:.4' : '';
                                    return (
                                        '<button class="chip' + (on ? ' on' : '') + '" data-att="' + row.id + '" data-status="' + option.key + '" style="' + style + ';' + dim + ';padding:5px 11px">' +
                                        option.label +
                                        '</button>'
                                    );
                                }).join('') +
                                '</div></div>'
                            );
                        })
                        .join('') +
                    '</div>';
                var counts = { present: 0, late: 0, absent: 0, leave: 0, total: 0 };
                kaoqin.rows.forEach(function (row) {
                    if (counts[row.status] !== undefined) counts[row.status] += 1;
                    counts.total += 1;
                });
                U.qs('#countBox', root).innerHTML = [
                    ['到', counts.present],
                    ['迟', counts.late],
                    ['缺', counts.absent],
                    ['假', counts.leave],
                    ['合计', counts.total]
                ]
                    .map(function (pair) {
                        return '<div class="stat"><div class="stat-num">' + pair[1] + '</div><div class="stat-label">' + pair[0] + '</div></div>';
                    })
                    .join('');

                U.qsa('[data-att]', root).forEach(function (btn) {
                    btn.onclick = function () {
                        var id = Number(btn.getAttribute('data-att'));
                        var status = btn.getAttribute('data-status');
                        kaoqin.rows.forEach(function (row) {
                            if (row.id === id && !row.locked) row.status = status;
                        });
                        drawRoster();
                    };
                });
            };

            drawRoster();

            U.qsa('[data-class-id]', root).forEach(function (btn) {
                btn.onclick = function () {
                    kaoqin.classId = Number(btn.getAttribute('data-class-id'));
                    kaoqin.show(root);
                };
            });
            U.qsa('[data-mode]', root).forEach(function (btn) {
                btn.onclick = function () {
                    kaoqin.mode = btn.getAttribute('data-mode');
                    kaoqin.show(root);
                };
            });
            U.qs('#prevDay', root).onclick = function () {
                kaoqin.day = App.shiftDay(kaoqin.day, -1);
                kaoqin.show(root);
            };
            U.qs('#nextDay', root).onclick = function () {
                kaoqin.day = App.shiftDay(kaoqin.day, 1);
                kaoqin.show(root);
            };
            U.qs('#pickDay', root).onchange = function (event) {
                kaoqin.day = event.target.value || App.today();
                kaoqin.show(root);
            };
            var periodSel = U.qs('#periodSel', root);
            if (periodSel) {
                periodSel.onchange = function (event) {
                    kaoqin.period = Number(event.target.value) || 1;
                    kaoqin.show(root);
                };
            }
            var allBtn = U.qs('#allPresent', root);
            if (allBtn) {
                allBtn.onclick = function () {
                    kaoqin.rows.forEach(function (row) {
                        if (!row.locked) row.status = 'present';
                    });
                    drawRoster();
                    U.toast('未请假的都记为到');
                };
            }
            U.qs('#saveAtt', root).onclick = async function () {
                if (!kaoqin.rows || kaoqin.rows.length === 0) {
                    U.toast('没有可保存的名单');
                    return;
                }
                this.disabled = true;
                var res = await App.data.saveAttendance(
                    kaoqin.classId,
                    kaoqin.day,
                    kaoqin.mode,
                    kaoqin.mode === 'period' ? kaoqin.period : 0,
                    kaoqin.rows
                );
                this.disabled = false;
                if (res.error) {
                    U.toast(res.error.message || '保存失败');
                    return;
                }
                U.toast('已保存 ' + (res.data ? res.data.saved : kaoqin.rows.length) + ' 条');
            };
        }
    };

    async function renderMyAttendance(root, profile) {
        var from = App.shiftDay(App.today(), -29);
        var res = await App.data.attendanceMine(from, App.today(), 120);
        var rows = res.data || [];
        var counts = { present: 0, late: 0, absent: 0, leave: 0 };
        rows.forEach(function (r) {
            if (counts[r.status] !== undefined) counts[r.status] += 1;
        });

        root.innerHTML =
            '<div class="card">' +
            '<div class="sec-title">近 30 天考勤</div>' +
            '<div class="stat-grid">' +
            [['到', counts.present], ['迟', counts.late], ['缺', counts.absent], ['假', counts.leave]]
                .map(function (pair) {
                    return '<div class="stat"><div class="stat-num">' + pair[1] + '</div><div class="stat-label">' + pair[0] + '</div></div>';
                })
                .join('') +
            '</div></div>' +
            '<div class="card">' +
            (rows.length === 0
                ? emptyBox('这 30 天还没有考勤记录')
                : '<div class="list">' +
                  rows
                      .map(function (r) {
                          return (
                              '<div class="list-row">' +
                              '<div class="row-main"><div class="row-title">' + esc(r.day) + ' · ' + (r.slot === 'period' ? '第' + r.periodNo + '节' : '日考勤') + '</div>' +
                              '<div class="row-sub">' + (r.teacherName ? '记录：' + esc(r.teacherName) : '') + '</div></div>' +
                              '<span class="badge ' + (r.status === 'present' ? 'badge-green' : r.status === 'leave' ? 'badge-plain' : 'badge-red') + '">' + esc(ATT_TEXT[r.status] || r.status) + '</span>' +
                              '</div>'
                          );
                      })
                      .join('') +
                  '</div>') +
            '</div>';
    }

    // ================= 洞府 =================
    var dongfu = {
        title: '洞府',
        tab: true,
        async show(root) {
            var mine = await App.auth.ensureMyClass();
            if (mine.error && !mine.mine) {
                root.innerHTML = '<div class="card">' + stateBlock('🧭', mine.error.message) + '</div>';
                return;
            }
            var results = await Promise.all([App.data.students.list(), App.data.groups.list()]);
            var allStudents = results[0].data || [];
            var allGroups = results[1].data || [];
            var classList = mine.list || [];

            var viewId = dongfu.viewClassId;
            if (!viewId || !classList.some(function (c) { return c.id === viewId; })) viewId = mine.mine ? mine.mine.id : 0;
            dongfu.viewClassId = viewId;

            var myClassId = mine.mine ? mine.mine.id : 0;
            var canEdit = !!viewId && viewId === myClassId && mine.canEdit === true;
            var groups = allGroups
                .filter(function (g) {
                    return g.classId === viewId;
                })
                .sort(function (a, b) {
                    return a.id - b.id;
                });
            var students = allStudents
                .filter(function (s) {
                    return s.classId === viewId;
                })
                .map(function (s) {
                    var realm = R.realmOf(s.points);
                    return {
                        id: s.id,
                        name: s.name,
                        points: s.points,
                        groupId: s.groupId,
                        pet: s.pet,
                        petIcon: R.petIcon(s.pet),
                        realmName: realm.name,
                        realmColor: realm.color,
                        ownerName: s.ownerName
                    };
                })
                .sort(function (a, b) {
                    return b.points - a.points;
                });
            var keyword = (dongfu.keyword || '').trim();
            var shown = keyword
                ? students.filter(function (s) {
                      return s.name.indexOf(keyword) >= 0;
                  })
                : students;

            dongfu.students = students;
            dongfu.groups = groups;
            dongfu.canEdit = canEdit;
            dongfu.myClassId = myClassId;

            var total = students.reduce(function (sum, s) {
                return sum + s.points;
            }, 0);
            var topCount = students.filter(function (s) {
                return s.points >= 600;
            }).length;

            root.innerHTML =
                classBar(classList, viewId) +
                '<div class="card">' +
                '<div class="stat-grid" style="margin-bottom:12px">' +
                '<div class="stat"><div class="stat-num">' + students.length + '</div><div class="stat-label">弟子</div></div>' +
                '<div class="stat"><div class="stat-num">' + total + '</div><div class="stat-label">总修为</div></div>' +
                '<div class="stat"><div class="stat-num">' + topCount + '</div><div class="stat-label">元婴以上</div></div>' +
                '</div>' +
                '<input class="input" id="dfSearch" placeholder="搜索弟子姓名" value="' + esc(keyword) + '" />' +
                '</div>' +
                '<div class="card">' +
                '<div class="row-between" style="margin-bottom:8px">' +
                '<div class="sec-title" style="margin:0">弟子名册</div>' +
                (canEdit ? '<button class="btn btn-sm btn-primary" id="dfAdd">＋ 收徒</button>' : '<span class="tiny faint">只读</span>') +
                '</div>' +
                (shown.length === 0
                    ? emptyBox(keyword ? '没有匹配的弟子' : '洞府空空，先收一位弟子吧')
                    : '<div class="list">' +
                      shown
                          .map(function (s) {
                              return (
                                  '<div class="list-row" data-student="' + s.id + '">' +
                                  '<div class="avatar">' + s.petIcon + '</div>' +
                                  '<div class="row-main">' +
                                  '<div class="row-title">' + esc(s.name) + '</div>' +
                                  '<div class="row-sub"><span class="badge" style="background:' + s.realmColor + '">' + esc(s.realmName) + '</span> ' +
                                  (s.ownerName ? ' · ' + esc(s.ownerName) + ' 记' : '') + '</div>' +
                                  '</div>' +
                                  '<div class="row-value">' + s.points + '</div>' +
                                  '</div>'
                              );
                          })
                          .join('') +
                      '</div>') +
                '</div>' +
                (groups.length > 0
                    ? '<div class="card"><div class="sec-title">本班仙门</div><div class="wrap">' +
                      groups
                          .map(function (g) {
                              return '<span class="badge badge-plain">' + esc(g.name) + ' · ' + g.points + '</span>';
                          })
                          .join('') +
                      '</div></div>'
                    : '');

            U.qsa('[data-class-id]', root).forEach(function (btn) {
                btn.onclick = function () {
                    dongfu.viewClassId = Number(btn.getAttribute('data-class-id'));
                    dongfu.keyword = '';
                    dongfu.show(root);
                };
            });
            var search = U.qs('#dfSearch', root);
            search.oninput = function (event) {
                var kw = event.target.value;
                dongfu.keyword = kw;
                var list = kw.trim()
                    ? dongfu.students.filter(function (s) {
                          return s.name.indexOf(kw.trim()) >= 0;
                          })
                    : dongfu.students;
                var box = U.qs('.list', root);
                if (!box) return;
                if (list.length === 0) {
                    box.innerHTML = emptyBox('没有匹配的弟子');
                    return;
                }
                box.innerHTML = list
                    .map(function (s) {
                        return (
                            '<div class="list-row" data-student="' + s.id + '">' +
                            '<div class="avatar">' + s.petIcon + '</div>' +
                            '<div class="row-main"><div class="row-title">' + esc(s.name) + '</div>' +
                            '<div class="row-sub"><span class="badge" style="background:' + s.realmColor + '">' + esc(s.realmName) + '</span></div></div>' +
                            '<div class="row-value">' + s.points + '</div></div>'
                        );
                    })
                    .join('');
                bindStudentRows(box);
            };

            var bindStudentRows = function (scope) {
                U.qsa('[data-student]', scope).forEach(function (row) {
                    row.onclick = function () {
                        var id = Number(row.getAttribute('data-student'));
                        var target = null;
                        dongfu.students.forEach(function (s) {
                            if (s.id === id) target = s;
                        });
                        if (!target) return;
                        if (!dongfu.canEdit) {
                            U.toast('其他班的弟子只能查看');
                            return;
                        }
                        openEditStudent(root, target);
                    };
                });
            };

            var addBtn = U.qs('#dfAdd', root);
            if (addBtn) {
                addBtn.onclick = function () {
                    U.openLayer(
                        '<div class="sheet-title">收为弟子</div>' +
                            '<div class="field"><div class="field-label">姓名</div><input class="input" id="sName" placeholder="弟子姓名" /></div>' +
                            '<div class="sheet-actions"><button class="btn" data-x="cancel">取消</button>' +
                            '<button class="btn btn-primary" data-x="ok">入门</button></div>'
                    );
                    var box = document.getElementById('layer');
                    U.qs('[data-x="cancel"]', box).onclick = U.closeLayer;
                    U.qs('[data-x="ok"]', box).onclick = async function () {
                        var name = (U.qs('#sName', box).value || '').trim();
                        if (!name) {
                            U.toast('请输入姓名');
                            return;
                        }
                        this.disabled = true;
                        var teacherName = await App.auth.ensureTeacherName();
                        var created = await App.data.students.create({
                            name: name,
                            points: 0,
                            classId: dongfu.myClassId,
                            ownerName: teacherName
                        });
                        this.disabled = false;
                        if (created.error) {
                            U.toast(created.error.message || '保存失败');
                            return;
                        }
                        U.closeLayer();
                        U.toast('已入门');
                        dongfu.show(root);
                    };
                };
            }

            bindStudentRows(root);
        }
    };

    function openEditStudent(root, target) {
        var groups = dongfu.groups || [];
        var groupOptions =
            '<option value="0">未入仙门</option>' +
            groups
                .map(function (g) {
                    return '<option value="' + g.id + '" ' + (g.id === target.groupId ? 'selected' : '') + '>' + esc(g.name) + '</option>';
                })
                .join('');
        var petOptions = '<option value="">不结契</option>' + R.PETS.map(function (p) {
            return '<option value="' + esc(p.name) + '" ' + (p.name === target.pet ? 'selected' : '') + '>' + p.icon + ' ' + esc(p.name) + '</option>';
        }).join('');

        U.openLayer(
            '<div class="sheet-title">调整弟子</div>' +
                '<div class="field"><div class="field-label">姓名</div><input class="input" id="eName" value="' + esc(target.name) + '" /></div>' +
                '<div class="field"><div class="field-label">仙门</div><select class="select" id="eGroup">' + groupOptions + '</select></div>' +
                '<div class="field"><div class="field-label">结契灵宠</div><select class="select" id="ePet">' + petOptions + '</select></div>' +
                '<div class="sheet-actions"><button class="btn" data-x="del" style="color:#a83232">逐出</button>' +
                '<button class="btn btn-primary" data-x="ok">保存</button></div>'
        );
        var box = document.getElementById('layer');
        U.qs('[data-x="ok"]', box).onclick = async function () {
            var name = (U.qs('#eName', box).value || '').trim();
            if (!name) {
                U.toast('请输入姓名');
                return;
            }
            var groupId = Number(U.qs('#eGroup', box).value) || null;
            var petName = U.qs('#ePet', box).value;
            this.disabled = true;
            var res = await App.data.students.update(target.id, {
                name: name,
                groupId: groupId,
                pet: petName,
                petName: petName
            });
            this.disabled = false;
            if (res.error) {
                U.toast(res.error.message || '保存失败');
                return;
            }
            U.closeLayer();
            U.toast('已更新');
            dongfu.show(root);
        };
        U.qs('[data-x="del"]', box).onclick = async function () {
            var ok = await U.confirm({
                title: '逐出师门',
                body: '确定删除「' + target.name + '」吗？其功过记录会保留。',
                confirmText: '删除',
                danger: true
            });
            if (!ok) return;
            var res = await App.data.students.remove(target.id);
            if (res.error) {
                U.toast(res.error.message || '删除失败');
                return;
            }
            U.closeLayer();
            U.toast('已删除');
            dongfu.show(root);
        };
    }

    // ================= 功过 =================
    var gongguo = {
        title: '功过',
        tab: true,
        async show(root) {
            var mine = await App.auth.ensureMyClass();
            if (mine.error && !mine.mine) {
                root.innerHTML = '<div class="card">' + stateBlock('🧭', mine.error.message) + '</div>';
                return;
            }
            var profile = await App.auth.loadProfile();
            var isStudent = mine.role === 'student';
            gongguo.kind = gongguo.kind || 'add';
            gongguo.categoryIndex = gongguo.categoryIndex || 0;
            gongguo.itemIndex = gongguo.itemIndex || 0;
            gongguo.week = gongguo.week || 1;

            var myClassId = mine.mine ? mine.mine.id : 0;
            var results = await Promise.all([App.data.students.list(), App.data.groups.list(), App.data.records.list()]);
            var students = (results[0].data || [])
                .filter(function (s) {
                    return s.classId === myClassId;
                })
                .sort(function (a, b) {
                    return a.id - b.id;
                });
            var groups = (results[1].data || []).filter(function (g) {
                return g.classId === myClassId;
            });
            var myStudentId = profile && profile.student ? profile.student.id : 0;
            var classStudentIds = {};
            students.forEach(function (s) {
                classStudentIds[s.id] = true;
            });
            // 功过只由班主任（或管理员）录入；科任老师只查看并反馈给班主任
            var canRecord = mine.role === 'teacher' && mine.canEdit === true;
            var recentSource = isStudent
                ? (results[2].data || []).filter(function (r) {
                      return r.studentId === myStudentId;
                  })
                : (results[2].data || []).filter(function (r) {
                      return r.classId === myClassId || classStudentIds[r.studentId];
                  });

            gongguo.students = students;
            gongguo.groups = groups;
            gongguo.myClassId = myClassId;
            gongguo.readonly = !canRecord;

            var cats = gongguo.kind === 'add' ? R.ADD : R.SUB;
            if (gongguo.categoryIndex >= cats.length) gongguo.categoryIndex = 0;
            var category = cats[gongguo.categoryIndex];
            if (gongguo.itemIndex >= category.items.length) gongguo.itemIndex = 0;
            var item = category.items[gongguo.itemIndex];

            var studentOptions = students
                .map(function (s, index) {
                    return '<option value="' + index + '" ' + (index === (gongguo.studentIndex || 0) ? 'selected' : '') + '>' + esc(s.name) + '（' + s.points + '）</option>';
                })
                .join('');

            var recentHtml = recentSource
                .slice(0, 15)
                .map(function (r) {
                    return (
                        '<div class="list-row">' +
                        '<div class="row-main"><div class="row-title">' + esc(r.studentName || '小组') + ' · ' + esc(r.item || '') + '</div>' +
                        '<div class="row-sub">' + esc(r.category || '') + (r.ownerName ? ' · ' + esc(r.ownerName) : '') + (r.note ? ' · ' + esc(r.note) : '') + '</div></div>' +
                        '<div class="row-value" style="color:' + (r.value > 0 ? '#2f7a4a' : '#a83232') + '">' + (r.value > 0 ? '+' : '') + r.value + '</div>' +
                        '</div>'
                    );
                })
                .join('');

            var noticeBox = isStudent
                ? '<div class="tip-box">功过由班主任记录。你可以在这里查看自己的历次记录。</div>'
                : '<div class="tip-box">功过由班主任统一记录。班上的情况请反馈给班主任，由他记入功过簿。</div>';

            root.innerHTML =
                '<div class="card">' +
                '<div class="row-between" style="margin-bottom:12px">' +
                '<div class="sec-title" style="margin:0">' + (canRecord ? '记录功过' : isStudent ? '我的功过' : '班级功过') + '</div>' +
                (canRecord
                    ? seg(
                          [
                              { key: 'add', label: '加分' },
                              { key: 'sub', label: '减分' }
                          ],
                          gongguo.kind,
                          'data-kind'
                      )
                    : '') +
                '</div>' +
                (canRecord
                    ? students.length === 0
                        ? emptyBox('这个班还没有弟子，请先到「洞府」添加')
                        : '<div class="field"><div class="field-label">弟子</div><select class="select" id="gStudent">' + studentOptions + '</select></div>' +
                      '<div class="field"><div class="field-label">类别</div><select class="select" id="gCategory">' +
                      cats
                          .map(function (c, index) {
                              return '<option value="' + index + '" ' + (index === gongguo.categoryIndex ? 'selected' : '') + '>' + esc(c.name) + '</option>';
                          })
                          .join('') +
                      '</select></div>' +
                      '<div class="field"><div class="field-label">条目</div><div class="wrap" id="gItems">' +
                      category.items
                          .map(function (it, index) {
                              return '<button class="chip ' + (index === gongguo.itemIndex ? 'on' : '') + '" data-item="' + index + '">' + esc(it.label) + ' ' + (it.value > 0 ? '+' + it.value : it.value) + '</button>';
                          })
                          .join('') +
                      '</div></div>' +
                      '<div class="row" style="gap:10px">' +
                      '<div class="field grow"><div class="field-label">分值</div><input class="input" id="gValue" type="number" value="' + item.value + '" /></div>' +
                      '<div class="field grow"><div class="field-label">周次</div><select class="select" id="gWeek">' +
                      Array.from({ length: 20 })
                          .map(function (_, i) {
                              return '<option value="' + (i + 1) + '" ' + (i + 1 === gongguo.week ? 'selected' : '') + '>第' + (i + 1) + '周</option>';
                          })
                          .join('') +
                      '</select></div></div>' +
                      '<div class="field"><div class="field-label">备注（选填）</div><input class="input" id="gNote" placeholder="一句话说明" value="' + esc(gongguo.note || '') + '" /></div>' +
                      '<button class="btn btn-primary btn-block" id="gSubmit">记入功过簿</button>'
                    : noticeBox) +
                '</div>' +
                '<div class="card"><div class="sec-title">近期功过</div>' + (recentHtml ? '<div class="list">' + recentHtml + '</div>' : emptyBox('还没有记录')) + '</div>';

            U.qsa('[data-kind]', root).forEach(function (btn) {
                btn.onclick = function () {
                    gongguo.kind = btn.getAttribute('data-kind');
                    gongguo.categoryIndex = 0;
                    gongguo.itemIndex = 0;
                    gongguo.show(root);
                };
            });
            var catSel = U.qs('#gCategory', root);
            if (catSel) {
                catSel.onchange = function (event) {
                    gongguo.categoryIndex = Number(event.target.value) || 0;
                    gongguo.itemIndex = 0;
                    gongguo.show(root);
                };
            }
            var stuSel = U.qs('#gStudent', root);
            if (stuSel) {
                stuSel.onchange = function (event) {
                    gongguo.studentIndex = Number(event.target.value) || 0;
                };
            }
            U.qsa('[data-item]', root).forEach(function (btn) {
                btn.onclick = function () {
                    var index = Number(btn.getAttribute('data-item'));
                    var value = cats[gongguo.categoryIndex].items[index].value;
                    gongguo.itemIndex = index;
                    U.qsa('[data-item]', root).forEach(function (b) {
                        b.classList.toggle('on', b === btn);
                    });
                    U.qs('#gValue', root).value = value;
                };
            });
            var weekSel = U.qs('#gWeek', root);
            if (weekSel) {
                weekSel.onchange = function (event) {
                    gongguo.week = Number(event.target.value) || 1;
                };
            }
            var noteInput = U.qs('#gNote', root);
            if (noteInput) {
                noteInput.oninput = function (event) {
                    gongguo.note = event.target.value;
                };
            }
            var submitBtn = U.qs('#gSubmit', root);
            if (submitBtn && canRecord) {
                submitBtn.onclick = async function () {
                    var student = gongguo.students[gongguo.studentIndex || 0];
                    if (!student) {
                        U.toast('请先添加弟子');
                        return;
                    }
                    var value = Number(U.qs('#gValue', root).value);
                    if (!Number.isFinite(value) || value === 0) {
                        U.toast('请输入非 0 分值');
                        return;
                    }
                    if (gongguo.kind === 'add' && value < 0) {
                        U.toast('加分需为正数');
                        return;
                    }
                    if (gongguo.kind === 'sub' && value > 0) {
                        U.toast('减分需为负数');
                        return;
                    }
                    var currentCategory = cats[gongguo.categoryIndex];
                    var currentItem = currentCategory.items[gongguo.itemIndex];
                    var group = gongguo.groups.filter(function (g) {
                        return g.id === student.groupId;
                    })[0];

                    this.disabled = true;
                    var teacherName = await App.auth.ensureTeacherName();
                    var record = await App.data.records.create({
                        studentId: student.id,
                        studentName: student.name,
                        groupId: group ? group.id : null,
                        classId: gongguo.myClassId,
                        kind: gongguo.kind,
                        category: currentCategory.name,
                        item: currentItem.label,
                        value: value,
                        week: gongguo.week,
                        note: (gongguo.note || '').trim(),
                        ownerName: teacherName
                    });
                    if (record.error) {
                        this.disabled = false;
                        U.toast(record.error.message || '记录失败');
                        return;
                    }
                    var bumped = await App.data.bumpStudentPoints(student.id, value);
                    if (bumped.error || bumped.data === null) {
                        if (record.data && record.data.id) await App.data.records.remove(record.data.id);
                        this.disabled = false;
                        U.toast((bumped.error && bumped.error.message) || '该弟子不存在或不属于你带的班，未记分');
                        gongguo.show(root);
                        return;
                    }
                    if (group) {
                        await App.data.bumpGroupPoints(group.id, value);
                    }
                    this.disabled = false;
                    gongguo.note = '';
                    U.toast((value > 0 ? '+' : '') + value + ' 修为已记');
                    gongguo.show(root);
                };
            }
        }
    };

    // ================= 仙门 =================
    var xianmen = {
        title: '仙门',
        tab: false,
        async show(root) {
            var mine = await App.auth.ensureMyClass();
            if (mine.error && !mine.mine) {
                root.innerHTML = '<div class="card">' + stateBlock('🧭', mine.error.message) + '</div>';
                return;
            }
            var myClassId = mine.mine ? mine.mine.id : 0;
            var results = await Promise.all([App.data.groups.list(), App.data.students.list()]);
            var students = (results[1].data || []).filter(function (s) {
                return s.classId === myClassId;
            });
            var groups = (results[0].data || [])
                .filter(function (g) {
                    return g.classId === myClassId;
                })
                .sort(function (a, b) {
                    return b.points - a.points;
                });

            xianmen.groups = groups;
            xianmen.myClassId = myClassId;
            xianmen.canEdit = mine.canEdit;

            root.innerHTML =
                '<div class="card">' +
                '<div class="row-between" style="margin-bottom:10px">' +
                '<div class="sec-title" style="margin:0">本班仙门（' + groups.length + '）</div>' +
                (mine.canEdit ? '<button class="btn btn-sm btn-primary" id="xmAdd">＋ 立派</button>' : '') +
                '</div>' +
                (groups.length === 0
                    ? emptyBox('还没有仙门，先立一脉吧')
                    : '<div class="list">' +
                      groups
                          .map(function (g) {
                              var members = students.filter(function (s) {
                                  return s.groupId === g.id;
                              });
                              return (
                                  '<div class="list-row" style="align-items:flex-start">' +
                                  '<div class="avatar">🏯</div>' +
                                  '<div class="row-main">' +
                                  '<div class="row-title">' + esc(g.name) + '</div>' +
                                  '<div class="row-sub">' + (g.motto ? esc(g.motto) + ' · ' : '') + members.length + ' 人' + (members.length ? '：' + esc(members.map(function (m) { return m.name; }).slice(0, 6).join('、')) : '') + '</div>' +
                                  '</div>' +
                                  '<div class="row-value">' + g.points + '</div>' +
                                  (mine.canEdit
                                      ? '<div class="stack" style="gap:6px">' +
                                        '<button class="btn btn-sm" data-score="' + g.id + '">加减分</button>' +
                                        '<button class="btn btn-sm" data-edit-group="' + g.id + '">改名</button>' +
                                        '</div>'
                                      : '') +
                                  '</div>'
                              );
                          })
                          .join('') +
                      '</div>') +
                '</div>' +
                '<div class="tip-box">小组得分会随组员的功过同步累计：给某位弟子记 +2，其所在仙门也 +2。</div>';

            var addBtn = U.qs('#xmAdd', root);
            if (addBtn) addBtn.onclick = function () { openGroupSheet(root, null); };
            U.qsa('[data-edit-group]', root).forEach(function (btn) {
                btn.onclick = function () {
                    var id = Number(btn.getAttribute('data-edit-group'));
                    var target = xianmen.groups.filter(function (g) { return g.id === id; })[0];
                    openGroupSheet(root, target);
                };
            });
            U.qsa('[data-score]', root).forEach(function (btn) {
                btn.onclick = function () {
                    openScoreSheet(root, Number(btn.getAttribute('data-score')));
                };
            });
        }
    };

    function openGroupSheet(root, group) {
        var editing = !!group;
        U.openLayer(
            '<div class="sheet-title">' + (editing ? '仙门改名' : '开宗立派') + '</div>' +
                '<div class="field"><div class="field-label">名号</div><input class="input" id="gName" value="' + esc(group ? group.name : '') + '" placeholder="如：青云宗" /></div>' +
                '<div class="field"><div class="field-label">门规 / 口号（选填）</div><input class="input" id="gMotto" value="' + esc(group ? group.motto : '') + '" placeholder="如：日进一尺" /></div>' +
                '<div class="sheet-actions"><button class="btn" data-x="cancel">取消</button><button class="btn btn-primary" data-x="ok">保存</button></div>'
        );
        var box = document.getElementById('layer');
        U.qs('[data-x="cancel"]', box).onclick = U.closeLayer;
        U.qs('[data-x="ok"]', box).onclick = async function () {
            var name = (U.qs('#gName', box).value || '').trim();
            if (!name) {
                U.toast('请输入仙门名号');
                return;
            }
            this.disabled = true;
            var teacherName = await App.auth.ensureTeacherName();
            var payload = { name: name, motto: (U.qs('#gMotto', box).value || '').trim(), ownerName: teacherName, classId: xianmen.myClassId };
            var res = editing ? await App.data.groups.update(group.id, payload) : await App.data.groups.create(payload);
            this.disabled = false;
            if (res.error) {
                U.toast(res.error.message || '保存失败');
                return;
            }
            U.closeLayer();
            U.toast(editing ? '已改名' : '已立派');
            xianmen.show(root);
        };
    }

    function openScoreSheet(root, groupId) {
        var group = xianmen.groups.filter(function (g) { return g.id === groupId; })[0];
        if (!group) return;
        U.openLayer(
            '<div class="sheet-title">' + esc(group.name) + ' 加减分</div>' +
                '<div class="field"><div class="field-label">分值（正加负减）</div><input class="input" id="scValue" type="number" value="2" /></div>' +
                '<div class="tip-box">这里只调整仙门的总分；组员个人修为请在「功过」里逐人记录。</div>' +
                '<div class="sheet-actions"><button class="btn" data-x="cancel">取消</button><button class="btn btn-primary" data-x="ok">记入</button></div>'
        );
        var box = document.getElementById('layer');
        U.qs('[data-x="cancel"]', box).onclick = U.closeLayer;
        U.qs('[data-x="ok"]', box).onclick = async function () {
            var value = Number(U.qs('#scValue', box).value);
            if (!Number.isFinite(value) || value === 0) {
                U.toast('请输入非 0 分值');
                return;
            }
            this.disabled = true;
            var bumped = await App.data.bumpGroupPoints(groupId, value);
            if (bumped.error) {
                this.disabled = false;
                U.toast(bumped.error.message || '操作失败');
                return;
            }
            this.disabled = false;
            U.closeLayer();
            U.toast((value > 0 ? '+' : '') + value + ' 已记入' + group.name);
            xianmen.show(root);
        };
    }

    // ================= 乐园 =================
    var leyuan = {
        title: '乐园',
        tab: false,
        async show(root) {
            var mine = await App.auth.ensureMyClass();
            if (mine.error && !mine.mine) {
                root.innerHTML = '<div class="card">' + stateBlock('🧭', mine.error.message) + '</div>';
                return;
            }
            var myClassId = mine.mine ? mine.mine.id : 0;
            var results = await Promise.all([App.data.students.list(), App.data.settings.list()]);
            var students = (results[0].data || []).filter(function (s) {
                return s.classId === myClassId;
            });
            var setting = (results[1].data || []).slice().sort(function (a, b) { return a.id - b.id; })[0];
            var config = (setting && setting.config) || {};
            var prizePool = Array.isArray(config.prizePool) && config.prizePool.length > 0 ? config.prizePool : ['中性笔', '笔记本', '酸奶', '可乐'];

            var pets = students
                .filter(function (s) {
                    return s.pet;
                })
                .map(function (s) {
                    var realm = R.realmOf(s.points);
                    return {
                        id: s.id,
                        owner: s.name,
                        pet: s.pet,
                        icon: R.petIcon(s.pet),
                        points: s.points,
                        canSpit: s.points >= 600,
                        realmName: realm.name
                    };
                });

            root.innerHTML =
                '<div class="card">' +
                '<div class="sec-title">灵宠嬉戏（' + pets.length + '）</div>' +
                (pets.length === 0
                    ? emptyBox('还没有弟子结契灵宠，去洞府给弟子选一只')
                    : '<div class="pet-grid">' +
                      pets
                          .map(function (p) {
                              return (
                                  '<div class="pet-card">' +
                                  '<div class="pet-icon">' + p.icon + '</div>' +
                                  '<div class="pet-name">' + esc(p.pet) + '</div>' +
                                  '<div class="pet-owner">' + esc(p.owner) + ' · ' + p.points + '</div>' +
                                  (p.canSpit
                                      ? '<button class="btn btn-sm btn-primary" style="margin-top:6px" data-spit="' + p.id + '">💎 吐宝</button>'
                                      : '<div class="tiny faint" style="margin-top:6px">未至元婴</div>') +
                                  '</div>'
                              );
                          })
                          .join('') +
                      '</div>') +
                '</div>' +
                '<div class="card"><div class="sec-title">灵宠图鉴</div><div class="pet-grid">' +
                R.PETS.map(function (p) {
                    return (
                        '<div class="pet-card"><div class="pet-icon">' + p.icon + '</div>' +
                        '<div class="pet-name">' + esc(p.name) + '</div>' +
                        '<div class="tiny faint">' + esc(p.desc) + '</div></div>'
                    );
                }).join('') +
                '</div></div>';

            leyuan.prizePool = prizePool;
            leyuan.pets = pets;

            U.qsa('[data-spit]', root).forEach(function (btn) {
                btn.onclick = function () {
                    var id = Number(btn.getAttribute('data-spit'));
                    var pet = leyuan.pets.filter(function (p) { return p.id === id; })[0];
                    if (!pet) return;
                    var prize = prizePool[Math.floor(Math.random() * prizePool.length)];
                    U.openLayer(
                        '<div class="sheet-title">💎 吐宝</div>' +
                            '<div class="sheet-body center">' + pet.icon + ' ' + esc(pet.owner) + ' 的' + esc(pet.pet) + '吐出了<br/>' +
                            '<span style="font-size:22px;font-weight:700;color:#a83232">' + esc(prize) + '</span></div>' +
                            '<div class="sheet-actions"><button class="btn btn-primary" data-x="ok">收下</button></div>'
                    );
                    var box = document.getElementById('layer');
                    U.qs('[data-x="ok"]', box).onclick = U.closeLayer;
                };
            });
        }
    };

    // ================= 修为 =================
    var xiuwei = {
        title: '修为',
        tab: true,
        async show(root) {
            var mine = await App.auth.ensureMyClass();
            if (mine.error && !mine.mine) {
                root.innerHTML = '<div class="card">' + stateBlock('🧭', mine.error.message) + '</div>';
                return;
            }
            var results = await Promise.all([App.data.students.list(), App.data.records.list(), App.data.settings.list()]);
            var allStudents = results[0].data || [];
            var allRecords = results[1].data || [];
            var setting = (results[2].data || []).slice().sort(function (a, b) { return a.id - b.id; })[0];
            var config = (setting && setting.config) || {};
            var goal = typeof config.coXiuGoal === 'number' ? config.coXiuGoal : 0;

            var classList = mine.list || [];
            var classMap = {};
            classList.forEach(function (c) {
                classMap[c.id] = c.name;
            });

            if (xiuwei.scopeId === undefined || xiuwei.scopeId === null) {
                xiuwei.scopeId = mine.mine ? mine.mine.id : 0;
            }
            var scopeId = xiuwei.scopeId;
            var students = scopeId === 0
                ? allStudents
                : allStudents.filter(function (s) {
                      return s.classId === scopeId;
                  });
            var ranking = students
                .slice()
                .sort(function (a, b) {
                    return b.points - a.points;
                })
                .map(function (s, index) {
                    var realm = R.realmOf(s.points);
                    return {
                        id: s.id,
                        name: s.name,
                        points: s.points,
                        rank: index + 1,
                        realmName: realm.name,
                        realmColor: realm.color,
                        next: realm.next,
                        nextMin: realm.nextMin,
                        className: classMap[s.classId] || ''
                    };
                });
            var total = students.reduce(function (sum, s) {
                return sum + s.points;
            }, 0);
            var realmStats = R.REALMS.map(function (r) {
                return {
                    name: r.name,
                    color: R.COLORS[r.key],
                    count: students.filter(function (s) {
                        return R.realmOf(s.points).key === r.key;
                    }).length
                };
            }).filter(function (r) {
                return r.count > 0;
            });

            xiuwei.allRecords = allRecords;
            xiuwei.classMap = classMap;

            root.innerHTML =
                '<div class="classbar">' +
                '<button class="class-tab ' + (scopeId === 0 ? 'on' : '') + '" data-scope="0">全校</button>' +
                classList
                    .map(function (c) {
                        return '<button class="class-tab ' + (c.id === scopeId ? 'on' : '') + '" data-scope="' + c.id + '">' + esc(c.name) + '</button>';
                    })
                    .join('') +
                '</div>' +
                '<div class="card">' +
                '<div class="stat-grid">' +
                '<div class="stat"><div class="stat-num">' + students.length + '</div><div class="stat-label">人数</div></div>' +
                '<div class="stat"><div class="stat-num">' + total + '</div><div class="stat-label">总修为</div></div>' +
                '<div class="stat"><div class="stat-num">' + (students.length ? Math.round(total / students.length) : 0) + '</div><div class="stat-label">人均</div></div>' +
                '</div>' +
                (goal > 0
                    ? '<div style="margin-top:14px">' +
                      '<div class="row-between small muted" style="margin-bottom:6px"><span>班级共修目标</span><span>' + total + ' / ' + goal + '</span></div>' +
                      '<div class="progress"><div class="progress-inner" style="width:' + Math.min(100, Math.round((total / goal) * 100)) + '%"></div></div>' +
                      '</div>'
                    : '') +
                '<div class="wrap" style="margin-top:14px">' +
                realmStats
                    .map(function (r) {
                        return '<span class="badge" style="background:' + r.color + '">' + esc(r.name) + ' ' + r.count + '</span>';
                    })
                    .join('') +
                '</div></div>' +
                '<div class="card"><div class="sec-title">修为榜</div>' +
                (ranking.length === 0
                    ? emptyBox('还没有弟子')
                    : '<div class="list">' +
                      ranking
                          .slice(0, 60)
                          .map(function (s) {
                              return (
                                  '<div class="list-row">' +
                                  '<div class="row-rank ' + (s.rank <= 3 ? 'top' : '') + '">' + s.rank + '</div>' +
                                  '<div class="row-main"><div class="row-title">' + esc(s.name) + (s.className ? ' <span class="tiny faint">' + esc(s.className) + '</span>' : '') + '</div>' +
                                  '<div class="row-sub"><span class="badge" style="background:' + s.realmColor + '">' + esc(s.realmName) + '</span>' +
                                  (s.nextMin !== null ? ' 距' + esc(s.next) + ' ' + (s.nextMin - s.points) + ' 分' : '') + '</div></div>' +
                                  '<div class="row-value">' + s.points + '</div></div>'
                              );
                          })
                          .join('') +
                      '</div>') +
                '</div>' +
                '<div class="card"><div class="sec-title">近期功过</div>' +
                (allRecords.length === 0
                    ? emptyBox('还没有记录')
                    : '<div class="list">' +
                      allRecords
                          .slice(0, 20)
                          .map(function (r) {
                              return (
                                  '<div class="list-row"><div class="row-main">' +
                                  '<div class="row-title">' + esc(r.studentName || '小组') + ' · ' + esc(r.item || '') + '</div>' +
                                  '<div class="row-sub">' + esc(classMap[r.classId] || '') + (r.ownerName ? ' · ' + esc(r.ownerName) : '') + '</div></div>' +
                                  '<div class="row-value" style="color:' + (r.value > 0 ? '#2f7a4a' : '#a83232') + '">' + (r.value > 0 ? '+' : '') + r.value + '</div></div>'
                              );
                          })
                          .join('') +
                      '</div>') +
                '</div>';

            U.qsa('[data-scope]', root).forEach(function (btn) {
                btn.onclick = function () {
                    xiuwei.scopeId = Number(btn.getAttribute('data-scope')) || 0;
                    xiuwei.show(root);
                };
            });
        }
    };

    // ================= 天机（设置） =================
    var tianji = {
        title: '天机',
        tab: false,
        async show(root) {
            var mine = await App.auth.ensureMyClass();
            var profile = await App.auth.loadProfile();
            var settingRes = await App.data.settings.list();
            var setting = (settingRes.data || []).slice().sort(function (a, b) { return a.id - b.id; })[0];
            var config = (setting && setting.config) || {};
            var prizePool = Array.isArray(config.prizePool) ? config.prizePool : ['中性笔', '笔记本', '酸奶', '可乐'];
            var goal = typeof config.coXiuGoal === 'number' ? String(config.coXiuGoal) : '';

            tianji.settingId = setting ? setting.id : null;
            tianji.config = config;
            tianji.myClassId = mine.mine ? mine.mine.id : 0;
            tianji.isAdmin = mine.isAdmin;
            tianji.canEdit = mine.canEdit;
            tianji.role = mine.role;
            // settings 表仅班主任/管理员可写，界面同步：其余只读
            var homeroomClasses = (mine.myClasses || []).filter(function (c) {
                return c.role === 'homeroom';
            });
            tianji.canWrite = mine.role === 'teacher' && (mine.isAdmin === true || homeroomClasses.length > 0);

            var teacherName = App.auth.getTeacherName();

            root.innerHTML =
                '<div class="card">' +
                '<div class="sec-title">身份</div>' +
                '<div class="row-between"><div class="row-main">' +
                '<div class="row-title">' + esc(profile.role === 'teacher' ? (profile.teacher && profile.teacher.name) || '老师' : profile.role === 'student' ? (profile.student && profile.student.name) || '学生' : '未绑定') + '</div>' +
                '<div class="row-sub">' + (mine.role === 'teacher' ? (tianji.isAdmin ? '教师 · 管理员' : '教师') : mine.role === 'student' ? '学生' : '未绑定身份') +
                (mine.mine ? ' · ' + esc(mine.mine.name) : '') + '</div></div>' +
                (mine.role === 'guest' ? '<button class="btn btn-sm btn-primary" id="tjBind">去绑定</button>' : '') +
                '</div>' +
                '<div class="divider"></div>' +
                '<div class="field"><div class="field-label">操作人姓名（记功过时留痕）</div>' +
                '<div class="row"><input class="input grow" id="tjTeacher" value="' + esc(teacherName) + '" placeholder="如：张老师" />' +
                '<button class="btn btn-sm" id="tjSaveTeacher">保存</button></div></div>' +
                '</div>' +

                '<div class="card">' +
                '<div class="sec-title">班级设定</div>' +
                (tianji.canWrite
                    ? '<div class="field"><div class="field-label">学校</div><input class="input" id="tjSchool" value="' + esc((setting && setting.schoolName) || '屏山中学') + '" /></div>' +
                      '<div class="field"><div class="field-label">班级共修目标（总修为）</div><input class="input" id="tjGoal" type="number" value="' + esc(goal) + '" placeholder="如：5000" /></div>' +
                      '<button class="btn btn-primary btn-block" id="tjSaveInfo">保存设定</button>'
                    : '<div class="row-between"><div class="row-main"><div class="row-sub">学校</div>' +
                      '<div class="row-title">' + esc((setting && setting.schoolName) || '屏山中学') + '</div></div></div>' +
                      '<div class="divider"></div>' +
                      '<div class="row-between"><div class="row-main"><div class="row-sub">班级共修目标</div>' +
                      '<div class="row-title">' + (goal ? esc(goal) : '未设置') + '</div></div></div>' +
                      '<div class="small muted" style="margin-top:8px">班级设定由班主任维护</div>') +
                '</div>' +

                '<div class="card">' +
                '<div class="sec-title">吐宝奖池</div>' +
                '<div class="wrap" id="tjPrizes">' +
                prizePool
                    .map(function (p, index) {
                        return '<span class="prize-chip">' + esc(p) +
                            (tianji.canWrite ? '<span class="prize-del" data-prize="' + index + '">×</span>' : '') +
                            '</span>';
                    })
                    .join('') +
                '</div>' +
                (tianji.canWrite
                    ? '<div class="row" style="margin-top:10px">' +
                      '<input class="input grow" id="tjNewPrize" placeholder="新增奖品，如：冰淇淋" />' +
                      '<button class="btn btn-sm btn-primary" id="tjAddPrize">添加</button></div>'
                    : '<div class="small muted" style="margin-top:8px">吐宝奖池由班主任维护</div>') +
                '</div>' +

                '<div class="card">' +
                '<div class="sec-title">名单导入 / 导出</div>' +
                '<div class="field"><div class="field-label">每行一位学生，支持「学号,姓名」或直接姓名</div>' +
                '<textarea class="textarea" id="tjImport" placeholder="20240135,张三&#10;20240136,李四"></textarea></div>' +
                '<div class="row" style="gap:10px">' +
                '<button class="btn grow" id="tjExport">导出名单</button>' +
                '<button class="btn btn-primary grow" id="tjImportBtn">导入名单</button>' +
                '</div>' +
                '</div>' +

                '<div class="card">' +
                '<div class="sec-title">入口</div>' +
                '<div class="wrap">' +
                '<button class="btn btn-sm" id="tjXianmen">仙门管理</button>' +
                '<button class="btn btn-sm" id="tjLeyuan">灵宠乐园</button>' +
                '<button class="btn btn-sm" id="tjBackup">下载备份</button>' +
                '</div>' +
                '</div>' +

                (tianji.isAdmin
                    ? '<div class="card"><div class="sec-title">班级与令牌（管理员）</div>' +
                      '<div class="field"><div class="field-label">新建班级</div>' +
                      '<div class="row"><input class="input grow" id="tjNewClass" placeholder="如：初一（3）班" />' +
                      '<button class="btn btn-sm btn-primary" id="tjCreateClass">创建</button></div></div>' +
                      '<div class="divider"></div>' +
                      '<div class="field"><div class="field-label">仙师令牌（发给要绑定班级的老师）</div>' +
                      '<div class="row"><input class="input grow" id="tjToken" readonly placeholder="点右侧查看" />' +
                      '<button class="btn btn-sm" id="tjShowToken">查看</button>' +
                      '<button class="btn btn-sm" id="tjResetToken">重置</button></div></div>' +
                      '<div class="small muted" id="tjClasses">' + (mine.list || []).map(function (c) { return esc(c.name); }).join('、') + '</div>' +
                      '</div>'
                    : '') +

                '<div class="card">' +
                '<div class="sec-title">危险操作</div>' +
                '<div class="wrap">' +
                '<button class="btn btn-sm" id="tjUnbind" style="color:#a83232">解除我的身份绑定</button>' +
                '<button class="btn btn-sm" id="tjSignOut" style="color:#a83232">退出登录</button>' +
                '</div>' +
                '</div>';

            var bindBtn = U.qs('#tjBind', root);
            if (bindBtn) bindBtn.onclick = function () { App.navigate('bind'); };

            U.qs('#tjSaveTeacher', root).onclick = function () {
                App.auth.setTeacherName(U.qs('#tjTeacher', root).value);
                U.toast('已保存');
            };

            var saveInfoBtn = U.qs('#tjSaveInfo', root);
            if (saveInfoBtn) saveInfoBtn.onclick = async function () {
                this.disabled = true;
                var nextConfig = Object.assign({}, tianji.config);
                var goalValue = Number(U.qs('#tjGoal', root).value);
                if (Number.isFinite(goalValue) && goalValue > 0) nextConfig.coXiuGoal = goalValue;
                else delete nextConfig.coXiuGoal;
                var payload = {
                    schoolName: U.qs('#tjSchool', root).value.trim(),
                    className: mine.mine ? mine.mine.name : '',
                    teacher: mine.mine ? mine.mine.name : '',
                    config: nextConfig
                };
                var res = tianji.settingId
                    ? await App.data.settings.update(tianji.settingId, payload)
                    : await App.data.settings.create(payload);
                this.disabled = false;
                if (res.error) {
                    U.toast(res.error.message || '保存失败');
                    return;
                }
                tianji.config = nextConfig;
                tianji.settingId = res.data ? res.data.id : tianji.settingId;
                U.toast('已保存');
            };

            U.qsa('[data-prize]', root).forEach(function (node) {
                node.onclick = async function () {
                    var index = Number(node.getAttribute('data-prize'));
                    var next = prizePool.slice();
                    next.splice(index, 1);
                    await savePrizePool(next);
                };
            });

            async function savePrizePool(next) {
                var nextConfig = Object.assign({}, tianji.config, { prizePool: next });
                var schoolInput = U.qs('#tjSchool', root);
                var payload = {
                    schoolName: (schoolInput ? schoolInput.value.trim() : '') || (setting && setting.schoolName) || '屏山中学',
                    className: mine.mine ? mine.mine.name : '',
                    teacher: mine.mine ? mine.mine.name : '',
                    config: nextConfig
                };
                var res = tianji.settingId
                    ? await App.data.settings.update(tianji.settingId, payload)
                    : await App.data.settings.create(payload);
                if (res.error) {
                    U.toast(res.error.message || '保存失败');
                    return;
                }
                if (res.data) tianji.settingId = res.data.id;
                tianji.config = nextConfig;
                U.toast('奖池已更新');
                tianji.show(root);
            }

            var addPrizeBtn = U.qs('#tjAddPrize', root);
            if (addPrizeBtn) addPrizeBtn.onclick = function () {
                var input = U.qs('#tjNewPrize', root);
                var value = (input.value || '').trim();
                if (!value) {
                    U.toast('请输入奖品名');
                    return;
                }
                var next = prizePool.concat([value]);
                savePrizePool(next);
            };

            U.qs('#tjExport', root).onclick = async function () {
                var results = await Promise.all([App.data.students.list(), App.data.groups.list()]);
                var groupMap = {};
                (results[1].data || []).forEach(function (g) {
                    groupMap[g.id] = g.name;
                });
                var lines = ['姓名\t仙门\t修为'];
                (results[0].data || [])
                    .filter(function (s) {
                        return s.classId === tianji.myClassId;
                    })
                    .sort(function (a, b) {
                        return b.points - a.points;
                    })
                    .forEach(function (s) {
                        lines.push(s.name + '\t' + (s.groupId ? groupMap[s.groupId] || '' : '') + '\t' + s.points);
                    });
                var text = lines.join('\n');
                try {
                    await navigator.clipboard.writeText(text);
                    U.toast('名单已复制到剪贴板');
                } catch (error) {
                    U.openLayer(
                        '<div class="sheet-title">导出名单</div>' +
                            '<textarea class="textarea" style="min-height:180px">' + esc(text) + '</textarea>' +
                            '<div class="sheet-actions"><button class="btn btn-primary" data-x="ok">关闭</button></div>'
                    );
                    U.qs('[data-x="ok"]', document.getElementById('layer')).onclick = U.closeLayer;
                }
            };

            U.qs('#tjImportBtn', root).onclick = async function () {
                var text = (U.qs('#tjImport', root).value || '').trim();
                if (!text) {
                    U.toast('请粘贴名单');
                    return;
                }
                var rows = [];
                text.split('\n').forEach(function (line) {
                    var parts = line.split(/[,，\t]/).map(function (x) { return x.trim(); }).filter(Boolean);
                    if (parts.length === 0) return;
                    if (parts.length >= 2 && /^\d{4,}$/.test(parts[0])) rows.push({ no: parts[0], name: parts[1] });
                    else rows.push({ no: '', name: parts[0] });
                });
                if (rows.length === 0) {
                    U.toast('未解析到姓名');
                    return;
                }
                var ok = await U.confirm({
                    title: '导入名单',
                    body: '解析到 ' + rows.length + ' 位学生，确定导入吗？已存在的学号或姓名不会重复添加。',
                    confirmText: '导入'
                });
                if (!ok) return;
                var existing = await App.data.students.list();
                var have = {};
                (existing.data || [])
                    .filter(function (s) {
                        return s.classId === tianji.myClassId;
                    })
                    .forEach(function (s) {
                        have[s.studentNo || s.name] = true;
                    });
                var teacherName2 = await App.auth.ensureTeacherName();
                var added = 0;
                var skipped = 0;
                for (var i = 0; i < rows.length; i++) {
                    var key = rows[i].no || rows[i].name;
                    if (have[key]) {
                        skipped++;
                        continue;
                    }
                    var created = await App.data.students.create({
                        name: rows[i].name,
                        studentNo: rows[i].no,
                        points: 0,
                        classId: tianji.myClassId,
                        ownerName: teacherName2
                    });
                    if (!created.error) added++;
                    else skipped++;
                }
                U.toast(skipped > 0 ? '导入 ' + added + ' 人，跳过 ' + skipped + ' 人' : '已导入 ' + added + ' 人');
                U.qs('#tjImport', root).value = '';
            };

            U.qs('#tjBackup', root).onclick = async function () {
                var results = await Promise.all([App.data.students.list(), App.data.groups.list(), App.data.records.list()]);
                var payload = {
                    exportedAt: new Date().toISOString(),
                    className: mine.mine ? mine.mine.name : '',
                    students: results[0].data || [],
                    groups: results[1].data || [],
                    records: results[2].data || []
                };
                var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var link = document.createElement('a');
                link.href = url;
                link.download = '修仙班级备份-' + App.today() + '.json';
                link.click();
                setTimeout(function () {
                    URL.revokeObjectURL(url);
                }, 1000);
                U.toast('备份已开始下载');
            };

            U.qs('#tjXianmen', root).onclick = function () { App.navigate('xianmen'); };
            U.qs('#tjLeyuan', root).onclick = function () { App.navigate('leyuan'); };

            if (tianji.isAdmin) {
                U.qs('#tjCreateClass', root).onclick = async function () {
                    var name = (U.qs('#tjNewClass', root).value || '').trim();
                    if (!name) {
                        U.toast('请填写班级名称');
                        return;
                    }
                    this.disabled = true;
                    var res = await App.data.classes.create({ name: name });
                    this.disabled = false;
                    if (res.error) {
                        U.toast(res.error.message || '创建失败');
                        return;
                    }
                    U.toast('已创建班级');
                    U.qs('#tjNewClass', root).value = '';
                    tianji.show(root);
                };

                U.qs('#tjShowToken', root).onclick = async function () {
                    this.disabled = true;
                    var res = await App.data.rpc('get_teacher_token');
                    this.disabled = false;
                    if (res.error) {
                        U.toast(res.error.message || '读取失败');
                        return;
                    }
                    var token = res.data;
                    if (token && typeof token === 'object') token = token.get_teacher_token || '';
                    var input = U.qs('#tjToken', root);
                    input.value = token || '（未设置）';
                };

                U.qs('#tjResetToken', root).onclick = async function () {
                    var ok = await U.confirm({
                        title: '重置仙师令牌',
                        body: '重置后旧令牌立即失效（已绑定的老师不受影响）。确定吗？',
                        confirmText: '重置',
                        danger: true
                    });
                    if (!ok) return;
                    var next = Math.random().toString(36).slice(2, 8).toUpperCase();
                    var res = await App.data.rpc('set_teacher_token', { p_token: next });
                    if (res.error) {
                        U.toast(res.error.message || '重置失败');
                        return;
                    }
                    U.qs('#tjToken', root).value = next;
                    U.toast('已重置为 ' + next);
                };
            }

            U.qs('#tjUnbind', root).onclick = async function () {
                var ok = await U.confirm({
                    title: '解除绑定',
                    body: '解除后需要重新用令牌或学号认领身份，历史记录不受影响。确定吗？',
                    confirmText: '解除',
                    danger: true
                });
                if (!ok) return;
                var res = await App.data.rpc('unbind_self');
                if (res.error) {
                    U.toast(res.error.message || '解除失败');
                    return;
                }
                App.store.profile = null;
                U.toast('已解除');
                App.navigate('bind');
            };

            U.qs('#tjSignOut', root).onclick = async function () {
                var ok = await U.confirm({ title: '退出登录', body: '退出后需重新用手机号/邮箱验证码登录。', confirmText: '退出', danger: true });
                if (!ok) return;
                await App.auth.signOut();
                App.navigate('login');
            };
        }
    };

    App.views = {
        login: login,
        bind: bind,
        qingjia: qingjia,
        kaoqin: kaoqin,
        dongfu: dongfu,
        gongguo: gongguo,
        xianmen: xianmen,
        leyuan: leyuan,
        xiuwei: xiuwei,
        tianji: tianji
    };
})();
