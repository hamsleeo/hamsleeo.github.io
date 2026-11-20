// 应用外壳：路由、顶栏、底部导航、启动流程
(function () {
    'use strict';

    var App = window.App;
    var U = App.ui;

    var TABS = ['qingjia', 'kaoqin', 'dongfu', 'gongguo', 'xiuwei'];
    var TITLES = {
        login: '修仙班级',
        bind: '认领身份',
        qingjia: '请假',
        kaoqin: '考勤',
        dongfu: '洞府',
        gongguo: '功过',
        xianmen: '仙门',
        leyuan: '乐园',
        xiuwei: '修为',
        tianji: '天机'
    };

    var current = 'login';

    function viewRoot() {
        return document.getElementById('view');
    }

    function setTopbar(name) {
        var title = document.getElementById('topTitle');
        var sub = document.getElementById('topSub');
        var actions = document.getElementById('topActions');
        title.textContent = TITLES[name] || '修仙班级';

        var profile = App.store.profile;
        var parts = [];
        if (App.store.myClass && App.store.myClass.name) parts.push(App.store.myClass.name);
        if (App.store.role === 'teacher') parts.push(App.store.isAdmin ? '教师 · 管理员' : '教师');
        else if (App.store.role === 'student') parts.push('学生');
        else parts.push('未绑定身份');
        if (TABS.indexOf(name) >= 0) sub.textContent = parts.join(' · ');
        else sub.textContent = profile && profile.role === 'teacher' ? '班级管理后台' : '班级设置';
        if (name === 'login') sub.textContent = '积分即修为 · 练气至渡劫';

        actions.innerHTML = '';
        if (name === 'login' || name === 'bind') return;
        if (TABS.indexOf(name) >= 0) {
            var mineBtn = document.createElement('button');
            mineBtn.className = 'top-btn';
            mineBtn.textContent = '⚙️ 我的';
            mineBtn.onclick = function () {
                App.navigate('tianji');
            };
            actions.appendChild(mineBtn);
            return;
        }
        var backBtn = document.createElement('button');
        backBtn.className = 'top-btn';
        backBtn.textContent = '← 返回';
        backBtn.onclick = function () {
            if (window.history.length > 1) window.history.back();
            else App.navigate('dongfu');
        };
        actions.appendChild(backBtn);
    }

    function setTabbar(name) {
        var tabbar = document.getElementById('tabbar');
        if (TABS.indexOf(name) < 0) {
            tabbar.hidden = true;
            return;
        }
        tabbar.hidden = false;
        U.qsa('.tab', tabbar).forEach(function (link) {
            link.classList.toggle('on', link.getAttribute('data-nav') === name);
        });
    }

    async function show(name) {
        var view = App.views[name] || App.views.dongfu;
        current = name;
        setTopbar(name);
        setTabbar(name);
        var root = viewRoot();
        root.scrollTop = 0;
        try {
            await view.show(root);
        } catch (error) {
            root.innerHTML =
                '<div class="card"><div class="state"><div class="state-icon">⛈️</div>' +
                '<div class="state-text">' + App.esc((error && error.message) || '页面加载失败') + '</div></div></div>';
        }
        window.scrollTo(0, 0);
    }

    // 路由守卫：未登录 → 登录；已登录但未绑定身份 → 绑定
    async function guardedShow(name) {
        var open = ['login', 'bind'];
        if (!App.store.signedIn) {
            if (name !== 'login') {
                window.location.hash = '#/login';
                return show('login');
            }
            return show('login');
        }
        if (open.indexOf(name) >= 0 && name === 'login') {
            return show('dongfu');
        }
        var profile = App.store.profile;
        if (!profile) profile = await App.auth.loadProfile();
        if (profile.role === 'guest' && name !== 'bind') {
            return show('bind');
        }
        return show(name);
    }

    App.navigate = function (name) {
        var target = '#/' + name;
        if (window.location.hash === target) {
            guardedShow(name);
            return;
        }
        window.location.hash = target;
    };

    function routeFromHash() {
        var hash = window.location.hash || '';
        var name = hash.replace(/^#\/?/, '') || 'qingjia';
        if (!App.views[name]) name = 'qingjia';
        return name;
    }

    function onHashChange() {
        guardedShow(routeFromHash());
    }

    App.onIdentityChanged = async function () {
        App.store.profile = null;
        await App.auth.loadProfile(true);
        await App.auth.ensureMyClass(true);
        App.navigate('qingjia');
    };

    async function boot() {
        if (App.bootError) {
            viewRoot().innerHTML =
                '<div class="card"><div class="state"><div class="state-icon">📡</div>' +
                '<div class="state-text">' + App.esc(App.bootError) + '</div></div></div>';
            return;
        }

        // 微信授权回调必须在守卫之前处理
        var state = await App.auth.restoreState();
        App.store.signedIn = state.state === 'signed-in';
        if (state.error) {
            App.views.login.error = state.error;
        }

        if (!App.store.signedIn) {
            window.location.hash = '#/login';
            setTopbar('login');
            setTabbar('login');
            await show('login');
            window.addEventListener('hashchange', onHashChange);
            return;
        }

        await App.auth.loadProfile(true);
        await App.auth.ensureMyClass(true);

        var name = routeFromHash();
        if (App.store.profile && App.store.profile.role === 'guest') name = 'bind';
        if (name === 'login') name = 'qingjia';
        window.location.hash = '#/' + name;
        await show(name);
        window.addEventListener('hashchange', onHashChange);
    }

    // 脚本位于 body 末尾，DOM 已就绪，直接启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('./sw.js').catch(function () {
                /* 离线能力不可用不影响主功能 */
            });
        });
    }
})();
