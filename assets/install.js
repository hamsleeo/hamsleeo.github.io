/* 一键添加到手机 / 电脑桌面
   平台边界（重要）：网页不能静默把自己写进桌面，这是浏览器的安全限制。
   能做到的上限：
   - 安卓 Chrome / Edge、桌面 Chrome / Edge：捕获 beforeinstallprompt，点击后调起系统安装弹窗（真一键）。
   - iOS Safari：只能引导「分享 → 添加到主屏幕」，系统没有对应的 JS 接口。
   - 微信 / QQ 等内置浏览器：必须先引导「在浏览器中打开」。
   - 电脑：额外提供可直接下载的 .url / .webloc / .desktop 快捷方式，以及可拖到桌面的链接。
   所有生成的地址都带上 sharecode —— 网关对不带访问码的请求返回 403，桌面图标必须自带码。 */
(function () {
  'use strict';

  var FALLBACK_ORIGIN = 'https://teacher-toolbox-65453.app.workbuddy.host';
  var FALLBACK_CODE = 'HBCTGCOQOW';
  var $ = function (id) { return document.getElementById(id); };
  var ua = navigator.userAgent || '';
  var plt = navigator.platform || '';

  var ICO = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
    desktop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0 4 4m-4-4L8 7"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h8v8H8z"/></svg>'
  };

  /* ---------- 环境识别 ---------- */
  var env = {
    ios: /iPad|iPhone|iPod/.test(ua) || (plt === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1),
    android: /Android/i.test(ua),
    wechat: /MicroMessenger/i.test(ua),
    inapp: /MicroMessenger|QQBrowser|QQ\/|Weibo|DingTalk|AlipayClient|Feishu/i.test(ua),
    mobile: /iPad|iPhone|iPod|Android|Mobile|Windows Phone/i.test(ua) ||
      (plt === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1),
    chromium: /EdgA?\/|EdgiOS\/|Chrome\/|Chromium\//.test(ua),
    linux: /Linux/i.test(ua) && !/Android/i.test(ua),
    mac: /Mac OS X|Macintosh/i.test(ua) && !/iPad|iPhone|iPod/.test(ua),
    win: /Windows NT/i.test(ua),
    standalone: (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
  };

  /* ---------- 地址：必须带访问码 ---------- */
  function origin() {
    return (location.origin && location.origin !== 'null' && /^https?:/.test(location.origin))
      ? location.origin : FALLBACK_ORIGIN;
  }
  function currentCode() {
    var m = /[?&]sharecode=([^&#]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : FALLBACK_CODE;
  }
  function siteUrl() {
    return origin() + '/?sharecode=' + encodeURIComponent(currentCode());
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ---------- 快捷方式文件 ---------- */
  function buildShortcut() {
    var url = siteUrl();
    if (env.mac) {
      return {
        name: '教师工具箱.webloc', mime: 'application/xml',
        text: '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
          '<plist version="1.0">\n<dict>\n  <key>URL</key>\n  <string>' + esc(url) + '</string>\n</dict>\n</plist>\n'
      };
    }
    if (env.linux) {
      return {
        name: '教师工具箱.desktop', mime: 'application/x-desktop',
        text: '[Desktop Entry]\nVersion=1.0\nType=Application\nName=教师工具箱\n' +
          'Comment=自用教学小程序集\nExec=xdg-open "' + url + '"\nTerminal=false\nCategories=Education;\n'
      };
    }
    return {
      name: '教师工具箱.url', mime: 'application/octet-stream',
      text: '[InternetShortcut]\r\nURL=' + url + '\r\nIconIndex=0\r\n'
    };
  }
  function downloadShortcut() {
    var s = buildShortcut();
    var blob = new Blob([s.text], { type: s.mime + ';charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href; a.download = s.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(href); }, 1500);
    status('已下载「' + s.name + '」，把它拖到桌面，双击即可打开。', true);
  }

  /* ---------- 系统安装弹窗 ---------- */
  var deferred = null;
  var installed = false;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    refreshButtons();
    if (modal && !modal.hidden) render();
  });
  window.addEventListener('appinstalled', function () {
    installed = true; deferred = null;
    refreshButtons();
    status('已添加到桌面，之后从图标一点即开。', true);
    if (modal && !modal.hidden) render();
  });
  function doInstall() {
    if (!deferred) {
      status('当前浏览器没有提供安装弹窗，请按下面的步骤操作，或下载桌面快捷方式。');
      return;
    }
    var p = deferred;
    deferred = null;
    try { p.prompt(); } catch (e) {
      status('安装弹窗没能打开，请用下面的手动步骤。');
      refreshButtons(); render();
      return;
    }
    if (p.userChoice && typeof p.userChoice.then === 'function') {
      p.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') status('正在添加到桌面，稍后就能看到「教师工具箱」图标。', true);
        else status('已取消安装，随时可以再试；也可以下载快捷方式。');
        refreshButtons(); render();
      }).catch(function () { refreshButtons(); render(); });
    } else {
      refreshButtons(); render();
    }
  }

  /* ---------- HTML 片段 ---------- */
  function note(cls, html) {
    return '<div class="install-note' + (cls ? ' ' + cls : '') + '">' + html + '</div>';
  }
  function steps(arr) {
    return '<ol class="install-steps">' + arr.map(function (s) {
      return '<li>' + s + '</li>';
    }).join('') + '</ol>';
  }
  function block(title, inner) {
    return '<div class="install-block"><p class="install-block-title">' + title + '</p>' + inner + '</div>';
  }

  function phoneHtml() {
    var h = '';
    if (env.standalone) h += note('ok', '<b>已经是从桌面图标打开的</b>，不用重复添加。');
    if (deferred) {
      h += '<button class="install-primary" data-act="install" type="button">' + ICO.check + '一键安装到手机桌面</button>';
    }
    if (env.inapp) {
      h += note('warn', '<b>当前在' + (env.wechat ? '微信' : 'App 内置浏览器') + '里</b>，系统不允许从这里添加桌面图标。' +
        '请先点右上角「…」→「在浏览器中打开」，再回到本页面操作。');
    }
    if (env.ios) {
      h += block('iPhone / iPad（用 Safari）', steps([
        '点屏幕底部中间的「分享」按钮 ' + ICO.share,
        '在弹出菜单里向下滑，找到「添加到主屏幕」',
        '点右上角「添加」，桌面就会出现「教师工具箱」图标'
      ]));
      h += note('', '只有 <b>Safari</b> 提供这个菜单。iPhone 上的 Chrome、微信、QQ 浏览器找不到「添加到主屏幕」是正常的，请切回 Safari。');
    } else if (env.android) {
      h += block('安卓手机（Chrome / Edge）', steps([
        deferred ? '点上面的「一键安装」，在系统弹窗里选「安装」' : '点浏览器右上角「⋮」菜单',
        '选择「安装应用」或「添加到主屏幕」',
        '确认名称后点「安装」，图标会出现在桌面'
      ]));
      h += note('', '若菜单里没有「安装应用」，先确认是用 <b>Chrome 或 Edge</b> 打开本站且网络正常；国产浏览器请用自带的「添加到桌面」。');
    } else {
      h += block('其他手机浏览器', steps([
        '打开浏览器菜单（一般是「⋮」或「☰」）',
        '找「添加到主屏幕 / 安装应用 / 添加到桌面」',
        '确认后返回桌面查看图标'
      ]));
    }
    h += note('', '桌面图标打开的就是本站首页，<b>已带上访问码</b>，不会提示「链接已失效」。');
    return h;
  }

  function desktopHtml() {
    var h = '';
    if (env.standalone) h += note('ok', '<b>已经是安装后的独立窗口</b>，桌面快捷方式通常也已创建。');
    if (deferred) {
      h += '<button class="install-primary" data-act="install" type="button">' + ICO.check + '一键安装为桌面应用</button>';
      h += '<p class="install-block-title">安装后会在桌面与开始菜单生成图标，并以独立窗口打开。</p>';
    }
    h += '<div class="install-block"><button class="install-secondary" data-act="shortcut" type="button">' +
      ICO.download + '下载桌面快捷方式</button></div>';
    h += block('下载后两步到位', steps([
      '把下载好的「' + esc(buildShortcut().name) + '」拖到桌面（或剪切粘贴过去）',
      '双击图标，直接打开教师工具箱首页'
    ]));
    h += '<a class="install-drag" href="' + esc(siteUrl()) + '" draggable="true" data-act="drag">也可以按住这个链接，直接拖到桌面</a>';
    h += note('', '按当前系统自动选格式：Windows 是 <b>.url</b>、macOS 是 <b>.webloc</b>、Linux 是 <b>.desktop</b>' +
      '（Linux 下载后需右键「允许启动」）。快捷方式与拖拽链接<b>都已带上访问码</b>。');
    h += block('手动方式（Chrome / Edge）', steps([
      '点地址栏右侧的「安装」图标，或打开右上角「⋮」菜单',
      '选「保存并分享」→「安装此站点为应用」',
      '确认后系统会自动在桌面创建图标'
    ]));
    if (!env.chromium && !deferred) {
      h += note('warn', '当前浏览器不是 Chrome / Edge，无法弹出系统安装窗口；<b>下载快捷方式</b>这条路径仍然可用。');
    }
    return h;
  }

  /* ---------- 弹窗 ---------- */
  var tab = 'phone';
  var statusText = '', statusOk = false;
  var modal = null;

  function status(text, good) {
    statusText = text; statusOk = !!good;
    var el = $('installStatus');
    if (el) { el.textContent = text; el.className = 'install-status' + (statusOk ? ' ok' : ''); }
  }
  function render() {
    if (!modal) return;
    Array.prototype.forEach.call(modal.querySelectorAll('.install-tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    $('installBody').innerHTML = (tab === 'phone' ? phoneHtml() : desktopHtml()) +
      '<div class="install-status" id="installStatus"></div>';
    status(statusText, statusOk);
  }
  function open(kind) {
    if (!modal) return;
    tab = kind;
    statusText = ''; statusOk = false;
    render();
    modal.hidden = false;
    var first = modal.querySelector('.install-tab.active');
    if (first && first.focus) first.focus();
  }
  function close() { if (modal) modal.hidden = true; }

  function closest(el, sel) {
    if (!el) return null;
    if (el.closest) return el.closest(sel);
    while (el && el !== document) {
      if (el.matches && el.matches(sel)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function refreshButtons() {
    var defaults = {
      installPhone: '像 App 一样一点即开',
      installDesktop: '生成快捷方式或安装为应用'
    };
    Object.keys(defaults).forEach(function (id) {
      var b = $(id);
      if (!b) return;
      b.classList.toggle('ready', !!deferred);
      var sm = b.querySelector('small');
      if (!sm) return;
      sm.textContent = installed ? '已添加到桌面' :
        (deferred ? '当前浏览器支持一键安装' : defaults[id]);
    });
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'install-modal';
    modal.id = 'installModal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '添加到桌面');
    modal.innerHTML =
      '<div class="install-sheet">' +
        '<div class="install-head">' +
          '<div class="ib-ico">' + ICO.pin + '</div>' +
          '<div><h3>把工具箱放到桌面</h3><p>以后一点图标就能打开，不用再翻收藏夹或找链接。</p></div>' +
          '<button class="install-x" id="installClose" type="button" aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="install-tabs">' +
          '<button class="install-tab" data-tab="phone" type="button">添加到手机桌面</button>' +
          '<button class="install-tab" data-tab="desktop" type="button">添加到电脑桌面</button>' +
        '</div>' +
        '<div class="install-body" id="installBody"></div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) { close(); return; }
      var t = closest(e.target, '.install-tab');
      if (t) { tab = t.getAttribute('data-tab'); statusText = ''; render(); return; }
      if (closest(e.target, '#installClose')) { close(); return; }
      var act = closest(e.target, '[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'install') doInstall();
      else if (a === 'shortcut') downloadShortcut();
      else if (a === 'drag') {
        e.preventDefault();
        status('按住这个链接拖到桌面再松开，浏览器会生成快捷方式。', true);
      }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && !modal.hidden) close();
    });
  }

  /* ---------- 启动 ---------- */
  buildModal();
  var bp = $('installPhone'), bd = $('installDesktop');
  if (bp) bp.addEventListener('click', function () { open('phone'); });
  if (bd) bd.addEventListener('click', function () { open('desktop'); });
  refreshButtons();

  /* 深链接：?install=phone / ?install=desktop 直接打开对应引导，
     方便把「怎么装到桌面」这一步单独发给同事，不用口头解释。 */
  var auto = /[?&]install=(phone|desktop)/.exec(location.search);
  if (auto) open(auto[1]);

  /* Service Worker：让站点满足 Chrome / Edge 的可安装判定，并做离线兜底 */
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    var reg = function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    };
    if (document.readyState === 'complete') reg();
    else window.addEventListener('load', reg);
  }

  /* ---------- 结构自检（?selftest=1） ---------- */
  if (/[?&]selftest=1/.test(location.search)) {
    var ck = [];
    function ok(n, c) { ck.push((c ? 'PASS ' : 'FAIL ') + n); }
    ok('手机与电脑两个入口按钮存在', !!bp && !!bd);
    ok('安装弹窗与双页签齐全', !!$('installModal') && modal.querySelectorAll('.install-tab').length === 2);
    ok('manifest 已声明', !!document.querySelector('link[rel="manifest"]'));
    ok('iOS 触控图标已声明', !!document.querySelector('link[rel="apple-touch-icon"]'));
    ok('站点地址保留访问码', /sharecode=[A-Za-z0-9]+/.test(siteUrl()));
    ok('快捷方式内容可生成', !!buildShortcut().text && /\.(url|webloc|desktop)$/.test(buildShortcut().name));
    ok('环境识别结果有效', typeof env.ios === 'boolean' && typeof env.mobile === 'boolean');
    open('phone');
    ok('手机引导可渲染', $('installBody').innerHTML.indexOf('install-steps') >= 0);
    open('desktop');
    ok('电脑引导含下载按钮', $('installBody').innerHTML.indexOf('data-act="shortcut"') >= 0);
    close();
    var fails = ck.filter(function (x) { return x.indexOf('FAIL') === 0; });
    document.body.setAttribute('data-install-selftest',
      (ck.length - fails.length) + '/' + ck.length +
      (fails.length ? ' FAIL: ' + fails.join(' | ') : ' ALL PASS'));
  }
})();
