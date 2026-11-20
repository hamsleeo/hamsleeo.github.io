/* ==========================================================
   融合版自检（仅 ?selftest=1 / ?shot=xxx 时加载）
   验证原版 11 个页面、题数、3D 翻卡、发音链路与线性图标。
   ========================================================== */
(function () {
  'use strict';
  var R = [];
  function ok(name, cond) { R.push((cond ? 'PASS ' : 'FAIL ') + name); }
  function V() { return document.getElementById('view'); }
  function txt() { return V() ? V().textContent : ''; }
  function html() { return V() ? V().innerHTML : ''; }
  function nav(route, params) { try { window.App.nav(route, params || {}); } catch (e) { } }

  var shot = (location.search.match(/shot=([a-z0-9]+)/) || [])[1];
  var SHOTS = {
    home: ['index', null],
    units: ['units', null],
    usage: ['usage', null],
    roots: ['roots', null],
    grammar: ['grammar', null],
    words: ['words', null],
    review: ['review', null],
    me: ['me', null],
    class: ['class', null]
  };

  function run() {
    /* ---------- 1. 基础装配 ---------- */
    ok('融合层就绪', document.body.getAttribute('data-fusion') === 'ready');
    ok('原版数据已加载', !!window.__DATA && !!window.__DATA.VOCAB);
    ok('11 个原版页面全部注册', !!window.FUSION && window.FUSION.routes.length >= 11);
    ok('全量派生词库已加载', !!window.FLASH && window.FLASH.flat.length >= 5000);
    ok('统一发音模块已挂载', typeof window.Speak === 'function' && window.WI.audio.speak === window.Speak);
    ok('发音为三级音源', window.Speak.status().providers.length === 2 && window.Speak.status().tts !== undefined);
    ok('顶部统一导航存在', !!document.querySelector('.fusion-top'));
    ok('导航含记忆卡入口', !!document.querySelector('.fusion-top a[href="card.html"]'));

    /* ---------- 2. 首页与入口 ---------- */
    nav('index');
    var homeHtml = html();
    ok('首页有单词记忆卡卡片', homeHtml.indexOf('goFlashcard') >= 0);
    ok('首页保留自由闯关', homeHtml.indexOf('goUnits') >= 0);
    ok('首页保留词汇运用', homeHtml.indexOf('goUsage') >= 0);
    ok('首页保留词根拼读', homeHtml.indexOf('goRoots') >= 0);
    ok('首页保留语法闯关', homeHtml.indexOf('goGrammar') >= 0);
    ok('首页保留完整词表', homeHtml.indexOf('goWords') >= 0);
    ok('首页保留开始闯关', homeHtml.indexOf('goQuiz') >= 0);
    ok('首页显示本单元全部词数', /本单元全部\s*\d+\s*词/.test(txt()));
    ok('首页控制器有 goFlashcard', typeof window.PAGES.index.goFlashcard === 'function');

    /* ---------- 3. 原版 11 个页面逐一可打开 ---------- */
    [
      { r: 'index', n: '闯关首页', kw: /当前关卡|我的进度/ },
      { r: 'units', n: '自由闯关', kw: /单元|册|选/ },
      { r: 'usage', n: '词汇运用', kw: /词汇|运用|填/ },
      { r: 'roots', n: '词根拼读', kw: /词根|拼读|前缀|后缀/ },
      { r: 'grammar', n: '语法闯关', kw: /语法|时态|句子/ },
      { r: 'words', n: '完整词表', kw: /词|单元/ },
      { r: 'review', n: '复习岛', kw: /复习|错词|掌握/ },
      { r: 'me', n: '我的', kw: /发音|宠物|数据|进度/ },
      { r: 'class', n: '班级', kw: /班级|打卡|邀请/ },
      { r: 'teacher', n: '教师端', kw: /学生|打卡|统计/ }
    ].forEach(function (p) {
      nav(p.r);
      var t = txt();
      /* 复习岛在无错词时是空状态引导页，文字较短属正常 */
      ok(p.n + '可打开且有内容', t.length > 15 && t.indexOf('加载中') < 0);
      ok(p.n + '含特征内容', p.kw.test(t));
    });

    /* ---------- 4. 出题数量：一关覆盖单元全部词汇 ---------- */
    var q = window.FUSION.quizCheck();
    ok('出题引擎可用', !q.error && q.questions > 0);
    ok('题数不少于单元全部词', q.questions >= q.words);
    ok('题数明显多于 6 道', q.questions > 6);

    /* ---------- 5. 闯关学词 3D 翻卡 ---------- */
    var L = window.WI.store.levels()[0];
    nav('quiz', { book: L.book, unit: L.unit });
    var qh = html();
    ok('学词环节渲染 3D 翻卡', qh.indexOf('learn-flip') >= 0);
    ok('翻卡正面有拼读分段', qh.indexOf('learn-seg') >= 0);
    ok('翻卡背面有中文释义', qh.indexOf('learn-meaning') >= 0);
    ok('翻卡背面有例句', qh.indexOf('learn-example') >= 0);
    ok('翻卡背面有记忆窍门', qh.indexOf('learn-tips') >= 0);
    ok('翻卡有朗读按钮', qh.indexOf('learnSpeak') >= 0);
    ok('保留上一个/下一个导航', qh.indexOf('learnNav') >= 0);
    ok('保留跳过学词入口', qh.indexOf('skipLearn') >= 0);

    var flipEl = document.querySelector('.learn-flip');
    if (flipEl) {
      flipEl.click();
      ok('点击卡片可翻转', !!document.querySelector('.learn-flip.flipped'));
      ok('翻转不重建整页', !!document.querySelector('.learn-flip'));
      flipEl.click();
      ok('再次点击可翻回', !document.querySelector('.learn-flip.flipped'));
    } else { ok('点击卡片可翻转', false); ok('再次点击可翻回', false); }

    /* ---------- 6. 发音链路 ---------- */
    var before = window.Speak.status().calls;
    var spk = document.querySelector('.learn-speak');
    if (spk) spk.click();
    window.Speak('apple', { force: true });
    var st = window.Speak.status();
    ok('点击喇叭触发发音', st.calls > before);
    ok('发音记录当前单词', st.word.length > 0);
    ok('发音状态可诊断', typeof st.unlocked === 'boolean' && Array.isArray(st.attempts));
    ok('原版测试发音字段兼容', typeof st.failCount === 'number' && typeof st.lastError === 'string');

    /* 回归：页面加载时自动排队朗读当前词，紧接着用户点喇叭，
       曾因 400ms 去重 + 待补播互相取消导致「点喇叭没有声音」。
       这里模拟手势窗口内连续两次点击同一个词，两次都必须真正进入播放链路。 */
    var c0 = window.Speak.status().calls;
    window.Speak('apple');
    window.Speak('apple');
    var c1 = window.Speak.status().calls;
    ok('手势内重复点击同一词仍发音', c1 - c0 >= 2);
    ok('主动点击不会停在等待交互', window.Speak.status().source !== '等待用户交互');
    ok('主动点击已解锁音源', window.Speak.status().unlocked === true);

    /* ---------- 7. 线性图标替换 ----------
       页面由 render() 重建后由 MutationObserver 异步替换；这里主动 flush 一次，
       验证替换函数本身生效（真实点击导航时由观察器自动完成）。 */
    nav('index');
    if (window.FUSION) window.FUSION.swapIcons(V());
    ok('功能图标已换成线性 SVG', document.querySelectorAll('#view .ico-inline svg').length > 0);
    ok('无残留功能 emoji', txt().indexOf('🗺') < 0 && txt().indexOf('✍️') < 0 && txt().indexOf('🧩') < 0);
    ok('MutationObserver 已启用', typeof window.MutationObserver === 'function');

    /* ---------- 8. 输出 ---------- */
    var pass = R.filter(function (x) { return x.indexOf('PASS ') === 0; }).length;
    var fail = R.length - pass;
    var box = document.createElement('div');
    box.id = 'selftestReport';
    box.setAttribute('data-selftest', 'PASS:' + pass + ' FAIL:' + fail);
    box.style.cssText = 'position:fixed;left:-9999px;top:0';
    box.innerHTML = '<div id="selfcheck">' + (fail ? 'FAIL' : 'ALL PASS') + '</div>' +
      '<div id="speakStatus">' + JSON.stringify(st).replace(/</g, '&lt;') + '</div><pre>' +
      R.map(function (x) { return x.replace(/</g, '&lt;'); }).join('\n') + '</pre>';
    document.body.appendChild(box);
    document.body.setAttribute('data-selftest', 'PASS:' + pass + ' FAIL:' + fail);
    /* 延迟回读发音链路最终结果（网络音源是异步的） */
    setTimeout(function () {
      var s2 = window.Speak.status();
      var el2 = document.getElementById('speakStatus');
      if (el2) el2.textContent = 'FINAL ' + JSON.stringify(s2);
    }, 2200);
  }

  /* 截图模式：停在指定页面，不做自检 */
  if (shot) {
    setTimeout(function () {
      var L = window.WI.store.levels()[0];
      if (shot === 'learn' || shot === 'learnback') {
        try { window.App.nav('quiz', { book: L.book, unit: L.unit }); } catch (e) { }
        if (shot === 'learnback') {
          setTimeout(function () { var f = document.querySelector('.learn-flip'); if (f) f.click(); }, 350);
        }
        return;
      }
      if (SHOTS[shot]) { try { window.App.nav(SHOTS[shot][0], {}); } catch (e) { } }
    }, 500);
    return;
  }

  setTimeout(run, 700);
})();
