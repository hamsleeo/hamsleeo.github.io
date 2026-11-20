// 认证与身份：微信网页登录、会话恢复、身份绑定、带班关系
(function () {
    'use strict';

    var App = window.App;

    var TEACHER_KEY = 'xiuxian_teacher_name';
    var CLASS_KEY = 'xiuxian_current_class_id';

    App.store = {
        profile: null,
        classes: [],
        myClass: null,
        canEdit: false,
        isAdmin: false,
        role: 'guest',
        signedIn: false
    };

    function normalizeProfile(raw) {
        var value = raw;
        if (Array.isArray(value)) value = value[0];
        var empty = { role: 'guest', teacher: null, student: null, classes: [] };
        if (!value || typeof value !== 'object') return empty;
        var list = Array.isArray(value.classes) ? value.classes : [];
        return {
            role: value.role === 'teacher' || value.role === 'student' ? value.role : 'guest',
            teacher: value.teacher || null,
            student: value.student || null,
            classes: list.filter(function (c) {
                return c && typeof c.id === 'number';
            })
        };
    }

    function primaryClass(profile) {
        var list = (profile && profile.classes) || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].role === 'homeroom') return list[i];
        }
        return list[0] || null;
    }

    function canEditClass(profile, classId) {
        if (!profile) return false;
        if (profile.role === 'teacher') {
            if (profile.teacher && profile.teacher.isAdmin) return true;
            return (profile.classes || []).some(function (c) {
                return c.id === classId && c.role === 'homeroom';
            });
        }
        return false;
    }

    function getTeacherName() {
        try {
            return localStorage.getItem(TEACHER_KEY) || '';
        } catch (error) {
            return '';
        }
    }

    function setTeacherName(name) {
        var clean = String(name || '').trim().slice(0, 12);
        try {
            localStorage.setItem(TEACHER_KEY, clean);
        } catch (error) {
            /* 忽略存储失败 */
        }
        App.store.teacherName = clean;
        return clean;
    }

    function getCachedClassId() {
        try {
            return Number(localStorage.getItem(CLASS_KEY)) || 0;
        } catch (error) {
            return 0;
        }
    }

    function setCachedClassId(id) {
        try {
            localStorage.setItem(CLASS_KEY, String(Number(id) || 0));
        } catch (error) {
            /* 忽略 */
        }
    }

    // 记功过时把操作人姓名随行写入，共享模式下才知道是谁记的
    async function ensureTeacherName() {
        var saved = getTeacherName();
        if (saved) return saved;
        var value = await App.ui.prompt({
            title: '填写老师姓名',
            body: '记功过时会记下操作人，方便同班老师追溯。',
            placeholder: '如：张老师',
            cancelText: '跳过'
        });
        if (value === null) return '';
        return setTeacherName(value);
    }

    // ---- 会话 ----
    async function getSession() {
        try {
            var res = await App.cloud.auth.getSession();
            return res && res.data ? res.data : null;
        } catch (error) {
            return null;
        }
    }

    // 微信网页授权回调：必须在任何路由守卫之前处理
    async function handleCallback() {
        var url = new URL(window.location.href);
        var hasCode = url.searchParams.has('code');
        var hasError = url.searchParams.has('error');
        if (!hasCode && !hasError) return { handled: false };

        var provider = url.searchParams.get('provider');
        if (provider !== 'wechat' && provider !== 'workbuddy') {
            return { handled: true, error: '授权回调缺少有效的登录方式，请重新登录' };
        }
        var handler = provider === 'workbuddy' ? App.cloud.auth.handleWorkBuddyCallback : App.cloud.auth.handleWechatWebCallback;
        if (typeof handler !== 'function') {
            return { handled: true, error: '当前环境暂不支持这种登录方式' };
        }
        var res;
        try {
            res = await handler.call(App.cloud.auth);
        } catch (error) {
            return { handled: true, error: (error && error.message) || '登录失败' };
        }
        if (res && res.error) return { handled: true, error: res.error.message || '登录失败' };

        ['code', 'state', 'provider'].forEach(function (key) {
            url.searchParams.delete(key);
        });
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        return { handled: true, signedIn: !!(res && res.data) };
    }

    async function signInWechat() {
        var res = await App.cloud.auth.signInWithOAuth({
            provider: 'wechat',
            redirectTo: App.siteRoot()
        });
        if (res && res.error) {
            throw new Error(res.error.message || '发起微信登录失败');
        }
        if (!res || !res.data || !res.data.url) {
            throw new Error('未能获取微信授权地址');
        }
        window.location.assign(res.data.url);
    }

    async function signOut() {
        try {
            await App.cloud.auth.signOut();
        } catch (error) {
            /* 忽略 */
        }
        App.store.profile = null;
        App.store.signedIn = false;
        App.store.classes = [];
        App.store.myClass = null;
    }

    async function loadProfile(force) {
        if (!force && App.store.profile) return App.store.profile;
        var res = await App.data.rpc('my_profile');
        if (res.error) {
            var fallback = normalizeProfile(null);
            fallback.error = res.error;
            return fallback;
        }
        App.store.profile = normalizeProfile(res.data);
        return App.store.profile;
    }

    // 带班关系：老师取主班级，学生取自己所在班
    async function ensureMyClass(force) {
        var profile = await loadProfile(force);
        var res = await App.data.classes.list();
        if (res.error) {
            return {
                mine: null,
                list: [],
                myClasses: [],
                canEdit: false,
                isAdmin: false,
                role: profile.role,
                error: res.error
            };
        }
        var list = (res.data || []).slice().sort(function (a, b) {
            return a.id - b.id;
        });
        App.store.classes = list;
        App.store.role = profile.role;

        if (profile.role === 'teacher') {
            var primary = primaryClass(profile);
            var mine = null;
            if (primary) {
                for (var i = 0; i < list.length; i++) {
                    if (list[i].id === primary.id) mine = list[i];
                }
                if (!mine) mine = { id: primary.id, name: primary.name || '' };
                setCachedClassId(mine.id);
            }
            App.store.myClass = mine;
            App.store.canEdit = canEditClass(profile, mine ? mine.id : 0);
            App.store.isAdmin = !!(profile.teacher && profile.teacher.isAdmin);
            return {
                mine: mine,
                list: list,
                myClasses: profile.classes || [],
                canEdit: App.store.canEdit,
                isAdmin: App.store.isAdmin,
                role: 'teacher',
                error: mine ? null : { message: '还没有绑定班级，请到「天机」绑定你带的班' }
            };
        }

        if (profile.role === 'student') {
            var classId = profile.student ? profile.student.classId : 0;
            var target = null;
            for (var j = 0; j < list.length; j++) {
                if (list[j].id === classId) target = list[j];
            }
            App.store.myClass = target;
            App.store.canEdit = false;
            App.store.isAdmin = false;
            return {
                mine: target,
                list: list,
                myClasses: [],
                canEdit: false,
                isAdmin: false,
                role: 'student',
                error: target ? null : { message: '你的班级还没设置，请联系班主任' }
            };
        }

        App.store.myClass = null;
        return {
            mine: null,
            list: list,
            myClasses: [],
            canEdit: false,
            isAdmin: false,
            role: 'guest',
            error: { message: '身份未绑定' }
        };
    }

    // ---- 验证码登录（手机号 / 邮箱）----
    // 微信扫码只出二维码，手机端不可用，所以手机优先走验证码。
    var pendingLogin = null;
    var PWD_PREFIX = 'xiuxian_pwd_';

    function friendlyAuthError(error) {
        var raw = (error && (error.message || error.error_description || error.code)) || '';
        var text = String(raw);
        if (/invalid_client|credential is invalid/i.test(text)) {
            return '云端凭证无效，请联系管理员检查应用配置';
        }
        if (/not.?enabled|disabled|未开启|not supported/i.test(text)) {
            return '这个登录方式还没开启，请换一种方式或联系管理员';
        }
        if (/LimitExceeded|daily ?limit|too many/i.test(text)) {
            return '发送太频繁或已达每日上限，请稍后再试';
        }
        if (/expired|invalid.*code|code.*invalid|验证码/i.test(text)) {
            return '验证码不正确或已过期，请重新获取';
        }
        return text || '操作失败，请重试';
    }

    // 新用户首次验证码登录需要一个密码占位；随机生成并本地留存，后续仍可用验证码登录
    function placeholderPassword(identity) {
        var key = PWD_PREFIX + identity.kind + '_' + identity.value;
        var saved = '';
        try {
            saved = localStorage.getItem(key) || '';
        } catch (error) {
            /* 忽略存储失败 */
        }
        if (saved) return saved;
        var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var random = '';
        for (var i = 0; i < 24; i++) random += chars.charAt(Math.floor(Math.random() * chars.length));
        var pwd = 'Wb' + random;
        try {
            localStorage.setItem(key, pwd);
        } catch (error) {
            /* 忽略 */
        }
        return pwd;
    }

    async function sendCode(identity) {
        var payload = identity.kind === 'phone' ? { phone: identity.value } : { email: identity.value };
        var res = await App.cloud.auth.signInWithOtp(payload);
        if (res.error) throw new Error(friendlyAuthError(res.error));
        var data = res.data || {};
        if (typeof data.verify !== 'function') {
            throw new Error('验证码已发出，但会话初始化失败，请重试');
        }
        pendingLogin = { verify: data.verify, identity: identity };
        return { sent: true };
    }

    async function verifyCode(token) {
        if (!pendingLogin) throw new Error('请先获取验证码');
        var res = await pendingLogin.verify({
            token: String(token || '').trim(),
            password: placeholderPassword(pendingLogin.identity)
        });
        if (res.error) throw new Error(friendlyAuthError(res.error));
        pendingLogin = null;
        App.store.signedIn = true;
        App.store.profile = null;
        return true;
    }

    function resetPendingLogin() {
        pendingLogin = null;
    }

    async function bindStudent(no, name) {
        var res = await App.data.rpc('bind_student', { p_no: no, p_name: name });
        if (res.error) return { ok: false, message: res.error.message || '绑定失败' };
        var value = res.data;
        if (!value || value.ok !== true) return { ok: false, message: (value && value.message) || '绑定失败' };
        App.store.profile = null;
        return { ok: true };
    }

    async function bindTeacher(payload) {
        var res = await App.data.rpc('bind_teacher', {
            p_token: payload.token || '',
            p_name: payload.name,
            p_class_id: payload.classId || null,
            p_role: payload.role || 'homeroom',
            p_subject: payload.subject || ''
        });
        if (res.error) return { ok: false, message: res.error.message || '绑定失败' };
        var value = res.data;
        if (!value || value.ok !== true) return { ok: false, message: (value && value.message) || '绑定失败' };
        App.store.profile = null;
        return { ok: true, isAdmin: !!value.isAdmin };
    }

    App.auth = {
        restoreState: async function () {
            var callback = await handleCallback();
            if (callback.handled && callback.error) {
                return { state: 'signed-out', error: callback.error };
            }
            var session = await getSession();
            App.store.signedIn = !!session;
            return { state: session ? 'signed-in' : 'signed-out', error: null };
        },
        signInWechat: signInWechat,
        sendCode: sendCode,
        verifyCode: verifyCode,
        resetPendingLogin: resetPendingLogin,
        signOut: signOut,
        loadProfile: loadProfile,
        ensureMyClass: ensureMyClass,
        bindStudent: bindStudent,
        bindTeacher: bindTeacher,
        ensureTeacherName: ensureTeacherName,
        getTeacherName: getTeacherName,
        setTeacherName: setTeacherName,
        getCachedClassId: getCachedClassId,
        setCachedClassId: setCachedClassId,
        canEditClass: canEditClass,
        primaryClass: primaryClass
    };
})();
