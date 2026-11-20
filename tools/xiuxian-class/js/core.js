// 核心：云客户端、界面基础件、修仙设定常量
(function () {
    'use strict';

    var publicConfig = {
        endpoint: 'https://mp-api.app.workbuddy.host',
        oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
        publishableKey: 'wbpk_H5osN7OE0bSbfamrzYi0Zh_ssEuVOT3IZGWW70u1mWK4zjTCxCHRp00'
    };

    var App = (window.App = window.App || {});

    App.config = publicConfig;

    if (!window.WorkBuddyCloud || typeof window.WorkBuddyCloud.createWorkBuddyCloud !== 'function') {
        App.bootError = '云端 SDK 加载失败，请检查网络后刷新页面';
    } else {
        App.cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
            endpoint: publicConfig.endpoint,
            oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
            publishableKey: publicConfig.publishableKey
        });
    }

    // ---- 站点根路径（微信网页授权回调必须落在站点根）----
    // 分享链接可能带 sharecode，回调时保留它，避免授权回来后被判无访问权限
    App.siteRoot = function () {
        var url = new URL(window.location.href);
        var path = url.pathname.replace(/[^/]*$/, '');
        var sharecode = url.searchParams.get('sharecode');
        return url.origin + path + (sharecode ? '?sharecode=' + encodeURIComponent(sharecode) : '');
    };

    // ---- 修仙设定 ----
    var REALMS = [
        { key: 'lianqi', name: '练气期', min: 0 },
        { key: 'zhuji', name: '筑基期', min: 100 },
        { key: 'jindan', name: '金丹期', min: 300 },
        { key: 'yuanying', name: '元婴期', min: 600 },
        { key: 'huashen', name: '化神期', min: 1000 },
        { key: 'lianxu', name: '炼虚期', min: 1500 },
        { key: 'heti', name: '合体期', min: 2500 },
        { key: 'dasheng', name: '大乘期', min: 4000 },
        { key: 'dujie', name: '渡劫期', min: 6000 }
    ];

    var REALM_COLORS = {
        lianqi: '#7a9e7e',
        zhuji: '#4f8a5b',
        jindan: '#b8860b',
        yuanying: '#8c5bb8',
        huashen: '#2e6da4',
        lianxu: '#c0563b',
        heti: '#7a4ea8',
        dasheng: '#9c7a2e',
        dujie: '#a83232'
    };

    var ADD_CATEGORIES = [
        {
            name: '学习',
            items: [
                { label: '课堂发言 / 质疑补充', value: 1 },
                { label: '被老师当堂表扬', value: 2 },
                { label: '作业全对且工整', value: 2 },
                { label: '单元测验达标', value: 3 },
                { label: '名次进步', value: 2 }
            ]
        },
        {
            name: '纪律',
            items: [
                { label: '课间文明活动', value: 1 },
                { label: '两操规范', value: 1 },
                { label: '课前准备最快', value: 2 },
                { label: '全周无违纪', value: 10 }
            ]
        },
        {
            name: '卫生值日',
            items: [
                { label: '值日达标', value: 1 },
                { label: '主动加做', value: 2 },
                { label: '随手捡拾', value: 1 },
                { label: '桌椅工具摆放整齐', value: 1 }
            ]
        },
        {
            name: '岗位班干',
            items: [
                { label: '月度履职合格', value: 3 },
                { label: '值日班长当日无违纪', value: 2 },
                { label: '科代表收发及时', value: 2 },
                { label: '获校级表彰', value: 6 }
            ]
        },
        {
            name: '荣誉活动',
            items: [
                { label: '竞赛获奖', value: 5 },
                { label: '三好学生', value: 8 },
                { label: '好人好事', value: 2 },
                { label: '出黑板报', value: 2 },
                { label: '投稿发表', value: 3 }
            ]
        }
    ];

    var SUB_CATEGORIES = [
        {
            name: '政教处管理',
            items: [
                { label: '不带校卡', value: -1 },
                { label: '未穿整套校服', value: -1 },
                { label: '打架、喝酒、谈恋爱', value: -5 },
                { label: '携带手机吸烟', value: -5 },
                { label: '校内骑车', value: -2 },
                { label: '骂脏话传谣', value: -2 },
                { label: '其他', value: -2 }
            ]
        },
        {
            name: '班级管理',
            items: [
                { label: '迟到', value: -1 },
                { label: '请假', value: -1 },
                { label: '午休违纪', value: -2 },
                { label: '上操集合迟到', value: -1 },
                { label: '课堂违纪', value: -2 },
                { label: '逃避集体活动', value: -2 },
                { label: '其他', value: -1 }
            ]
        },
        {
            name: '学校通报',
            items: [
                { label: '宿舍违纪', value: -2 },
                { label: '晚自习违纪', value: -2 },
                { label: '课间操违纪', value: -1 },
                { label: '其他', value: -2 }
            ]
        }
    ];

    var PETS = [
        { name: '青鸾', icon: '🕊️', desc: '鸣声如笙箫，见者心境澄明', final: '化人为形' },
        { name: '白泽', icon: '🦌', desc: '通万物之情，晓天下之事', final: '言出法随' },
        { name: '玄龟', icon: '🐢', desc: '背负山河，稳如磐石', final: '甲御千钧' },
        { name: '灵狐', icon: '🦊', desc: '九尾摇曳，机敏慧黠', final: '灵韵天成' },
        { name: '墨蛟', icon: '🐉', desc: '潜渊而卧，一朝化龙', final: '兴云布雨' },
        { name: '玉兔', icon: '🐰', desc: '月宫捣药，温润可亲', final: '捣月成霜' },
        { name: '金鹏', icon: '🦅', desc: '扶摇九万里，翼展遮天', final: '乘风破霄' },
        { name: '雪蟒', icon: '🐍', desc: '通体莹白，寒气凛然', final: '冰封千里' },
        { name: '貔貅', icon: '🐾', desc: '纳四方之财，镇宅辟邪', final: '聚宝成山' },
        { name: '麒麟', icon: '🦄', desc: '仁兽临世，祥瑞所归', final: '麟趾呈祥' }
    ];

    function realmOf(points) {
        var p = typeof points === 'number' ? points : 0;
        var index = 0;
        for (var i = 0; i < REALMS.length; i++) {
            if (p >= REALMS[i].min) index = i;
        }
        var current = REALMS[index];
        var next = REALMS[index + 1] || null;
        var span = next ? next.min - current.min : 1;
        var gained = next ? p - current.min : 1;
        return {
            index: index,
            key: current.key,
            name: current.name,
            color: REALM_COLORS[current.key],
            next: next ? next.name : '已至巅峰',
            nextMin: next ? next.min : null,
            percent: next ? Math.min(100, Math.round((gained / span) * 100)) : 100
        };
    }

    function petIcon(name) {
        for (var i = 0; i < PETS.length; i++) {
            if (PETS[i].name === name) return PETS[i].icon;
        }
        return '🥚';
    }

    App.realm = {
        REALMS: REALMS,
        COLORS: REALM_COLORS,
        ADD: ADD_CATEGORIES,
        SUB: SUB_CATEGORIES,
        PETS: PETS,
        realmOf: realmOf,
        petIcon: petIcon
    };

    // ---- 基础工具 ----
    App.esc = function (value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    App.today = function () {
        var d = new Date();
        return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    };

    App.shiftDay = function (day, delta) {
        var parts = String(day).split('-').map(Number);
        var d = new Date(parts[0], parts[1] - 1, parts[2]);
        d.setDate(d.getDate() + delta);
        return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    };

    App.weekdayText = function (day) {
        var parts = String(day).split('-').map(Number);
        var d = new Date(parts[0], parts[1] - 1, parts[2]);
        var names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return names[d.getDay()];
    };

    // ---- 界面基础件 ----
    var layer = null;
    var toastTimer = null;

    function getLayer() {
        if (!layer) layer = document.getElementById('layer');
        return layer;
    }

    App.ui = {
        qs: function (sel, root) {
            return (root || document).querySelector(sel);
        },
        qsa: function (sel, root) {
            return Array.prototype.slice.call((root || document).querySelectorAll(sel));
        },
        toast: function (message) {
            var el = document.getElementById('toast');
            el.textContent = message;
            el.hidden = false;
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(function () {
                el.hidden = true;
            }, 2000);
        },
        closeLayer: function () {
            var box = getLayer();
            box.hidden = true;
            box.innerHTML = '';
        },
        openLayer: function (html) {
            var box = getLayer();
            box.innerHTML = '<div class="sheet">' + html + '</div>';
            box.hidden = false;
            box.onclick = function (event) {
                if (event.target === box) App.ui.closeLayer();
            };
            return box;
        },
        // 确认框，返回 Promise<boolean>
        confirm: function (options) {
            var opts = options || {};
            return new Promise(function (resolve) {
                var html =
                    '<div class="sheet-title">' + App.esc(opts.title || '确认') + '</div>' +
                    '<div class="sheet-body">' + App.esc(opts.body || '') + '</div>' +
                    '<div class="sheet-actions">' +
                    '<button class="btn" data-x="no">' + App.esc(opts.cancelText || '取消') + '</button>' +
                    '<button class="btn ' + (opts.danger ? 'btn-primary' : 'btn-primary') + '" data-x="yes">' +
                    App.esc(opts.confirmText || '确定') + '</button>' +
                    '</div>';
                App.ui.openLayer(html);
                var box = getLayer();
                box.querySelector('[data-x="no"]').onclick = function () {
                    App.ui.closeLayer();
                    resolve(false);
                };
                box.querySelector('[data-x="yes"]').onclick = function () {
                    App.ui.closeLayer();
                    resolve(true);
                };
            });
        },
        // 输入框，返回 Promise<string|null>
        prompt: function (options) {
            var opts = options || {};
            return new Promise(function (resolve) {
                var html =
                    '<div class="sheet-title">' + App.esc(opts.title || '输入') + '</div>' +
                    (opts.body ? '<div class="sheet-body" style="margin-bottom:10px">' + App.esc(opts.body) + '</div>' : '') +
                    '<input class="input" id="promptInput" placeholder="' + App.esc(opts.placeholder || '') + '" value="' + App.esc(opts.value || '') + '" />' +
                    '<div class="sheet-actions">' +
                    '<button class="btn" data-x="no">' + App.esc(opts.cancelText || '取消') + '</button>' +
                    '<button class="btn btn-primary" data-x="yes">确定</button>' +
                    '</div>';
                App.ui.openLayer(html);
                var box = getLayer();
                var input = box.querySelector('#promptInput');
                setTimeout(function () {
                    input.focus();
                }, 60);
                box.querySelector('[data-x="no"]').onclick = function () {
                    App.ui.closeLayer();
                    resolve(null);
                };
                box.querySelector('[data-x="yes"]').onclick = function () {
                    var value = input.value;
                    App.ui.closeLayer();
                    resolve(value);
                };
            });
        }
    };
})();
