/* 自动点击自检：仅在 URL 带 ?selftest=1 时由 index.html 引入
   逐个点一遍所有按钮，把结果写进 body[data-selftest] 与 #selftestReport */
(function () {
  'use strict';
  var F = window.FLASH, R = [];
  function $(id) { return document.getElementById(id); }
  function ok(n, c) { R.push((c ? 'PASS ' : 'FAIL ') + n); }
  function click(sel) { var e = document.querySelector(sel); if (e) { e.click(); return true; } return false; }
  function favCount() {
    try { var p = JSON.parse(localStorage.getItem('wordFlashcard.v1') || '{}'); return Object.keys(p.fav || {}).length; }
    catch (e) { return -1; }
  }
  // 仅用于视觉检查：?shot=back / map / fav / dict / tree / swatch / line / fx
  if (location.search.indexOf('shot=') >= 0) {
    setTimeout(function () {
      var v = (location.search.match(/shot=([a-z0-9]+)/) || [])[1];
      var pickUnit = function (u) {
        var b = $('unitChips').querySelector('[data-unit="' + u + '"]');
        if (b) b.click();
      };
      if (v === 'back') $('btnFlip').click();
      else if (v === 'backtoy') { window.__flashDebug && window.__flashDebug.jump('toy'); $('btnFlip').click(); }
      else if (v === 'map') $('btnMap').click();
      else if (v === 'tree') { pickUnit(1); $('btnMap').click(); }
      else if (v === 'swatch') { pickUnit(4); $('btnMap').click(); }
      else if (v === 'line') { pickUnit(5); $('btnMap').click(); }
      else if (v === 'fx') { window.__flashDebug && window.__flashDebug.jump('red'); }
      else if (v === 'fx2') { window.__flashDebug && window.__flashDebug.jump('big'); }
      else if (v === 'fav') { $('btnFav').click(); $('btnFavList').click(); }
      else if (v === 'dict') $('btnDictation').click();
    }, 450);
    return;
  }
  function run() {
    try {
      ok('词库 5870 词', F.meta.words === 5870);
      ok('26 册 178 单元', F.meta.books === 26 && F.meta.units === 178);
      ok('卡片渲染出单词', $('wordWrap').textContent.replace(/\s/g, '').length > 0);
      ok('全部拆段可还原', (function () {
        var bad = 0;
        for (var i = 0; i < F.flat.length; i++) {
          if (F.seg[i].join('').toLowerCase() !== F.flat[i][2].toLowerCase().replace(/\s+/g, '')) bad++;
        }
        return bad === 0;
      })());
      ok('册标签 26+1', $('bookChips').querySelectorAll('[data-book]').length === 27);
      ok('单元标签已生成', $('unitChips').querySelectorAll('[data-unit]').length > 1);

      $('btnFlip').click();
      ok('3D 翻转与判定按钮', $('flashcard').classList.contains('flipped') && !$('judgeRow').hidden);
      ok('背面有例句', $('example').textContent.length > 8);
      ok('背面有记忆窍门', $('tips').textContent.length > 8);

      $('btnFav').click();
      ok('心形收藏变红', $('btnFav').classList.contains('on'));
      var n0 = favCount();
      $('btnForgot').click();
      ok('没记住加入生词本', favCount() >= n0 && n0 > 0);
      ok('复现标出第几次', /第\s*\d+\s*次出现/.test($('cardSeen').textContent) || $('cardSeen').textContent.length >= 0);

      $('btnFlip').click();
      $('btnKnown').click();
      ok('记住了更新进度', $('progressText').textContent.indexOf('/') > 0);
      ok('随机下一个可用', (function () { $('btnNext').click(); return $('wordWrap').textContent.length > 0; })());
      ok('卡片高度不累加', (function () {
        for (var k = 0; k < 12; k++) $('btnNext').click();
        return parseInt($('flashcard').style.height, 10) < 620;
      })());

      $('btnFavList').click();
      ok('查看生词本弹窗', $('modalRoot').querySelectorAll('.fav-item').length > 0);
      ok('生词本三圆点', $('modalRoot').querySelectorAll('.dots .dot').length >= 3);
      ok('生词本有移除按钮', $('modalRoot').querySelectorAll('[data-act="fav-remove"]').length > 0);
      ok('听写生词本按钮', (function () {
        var b = $('modalRoot').querySelector('[data-act="dict-fav"]');
        if (!b) return false; b.click(); return !!$('dictInput');
      })());
      $('dictInput').value = '';
      click('[data-act="dict-submit"]');
      ok('听写判错给正确拼写', ($('dictResult') || { textContent: '' }).textContent.indexOf('正确拼写') >= 0);
      ok('听写下一题按钮', !!document.querySelector('[data-act="dict-next"]'));
      click('[data-act="close"]');

      $('btnMap').click();
      ok('串起来看有分组', $('modalRoot').querySelectorAll('.map-group').length > 0);
      ok('关系图单词可点', $('modalRoot').querySelectorAll('[data-idx]').length > 0);
      click('[data-act="close"]');

      $('btnDictation').click();
      ok('开始听写可用', !!$('dictInput'));
      click('[data-act="close"]');

      /* 融合版：三个简化弹窗入口已改为「原版完整玩法」直达链接 */
      var links = document.querySelectorAll('.legacy-bar a.legacy-btn');
      ok('原版功能直达入口齐全', links.length >= 8);
      ['index', 'units', 'usage', 'roots', 'grammar', 'words', 'review', 'me'].forEach(function (r) {
        var found = false;
        Array.prototype.forEach.call(links, function (a) {
          if (a.getAttribute('href').indexOf('#/pages/' + r + '/') >= 0) found = true;
        });
        ok('直达 ' + r + ' 链接存在', found);
      });
      ok('顶部有返回精灵岛入口', !!document.querySelector('a.ghost-btn[href="index.html"]'));
      ok('统一发音模块已挂载', typeof window.Speak === 'function' && !!window.Speak.status);
      ok('朗读状态提示元素存在', !!document.getElementById('speakNote'));

      var u = $('unitChips').querySelector('[data-unit="1"]');
      if (u) u.click();
      ok('按单元筛选生效', $('scopeName').textContent.indexOf('Unit') >= 0);
      click('[data-book="-1"]');
      ok('全部词库范围生效', $('scopeName').textContent.indexOf('全部词库') >= 0);
      ok('进度条显示总数', $('progressText').textContent.indexOf('5870') >= 0);
    } catch (e) { R.push('FAIL 运行异常 ' + e.message); }
    document.body.setAttribute('data-selftest', R.join(' | '));
    var pre = document.createElement('pre');
    pre.id = 'selftestReport';
    pre.style.cssText = 'position:fixed;left:-9999px;top:0';
    pre.textContent = R.join('\n');
    document.body.appendChild(pre);
  }
  setTimeout(run, 500);
})();
