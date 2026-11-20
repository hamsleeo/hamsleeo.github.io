/* ==========================================================
   统一发音模块（融合版 · 修复「浏览器内点击喇叭没有声音」）
   ----------------------------------------------------------
   旧版只依赖 speechSynthesis：在不少 Windows 浏览器 / iframe /
   无英文语音包的环境里会静默失败，表现为「点了没反应」。
   现改为三级音源自动级联：
     1. 有道词典发音（美音 type=2）
     2. 百度翻译 TTS（备用）
     3. 浏览器 speechSynthesis（en-US，语速 0.72）
   任何一级失败（error / play() 被拒 / 4 秒无响应）自动切下一级；
   全部失败时给出可见提示，不再静默。
   另含：首次用户手势解锁、自动朗读排队、voiceschanged 监听、
        诊断状态 status()，供「我的」页与自检脚本使用。
   ========================================================== */
(function () {
  'use strict';

  var PROVIDERS = [
    {
      key: 'youdao', label: '有道美音',
      url: function (w) { return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=2'; }
    },
    {
      key: 'baidu', label: '百度 TTS',
      url: function (w) { return 'https://fanyi.baidu.com/gettts?lan=en&text=' + encodeURIComponent(w) + '&spd=3&source=web'; }
    }
  ];

  var el = null;                       // 复用的 <audio> 实例
  var token = 0;                       // 防止过期回调干扰
  var timer = null;
  var unlocked = false;
  var pendingWord = '';                // 未解锁前的自动朗读排队
  var pendingSeq = 0;                  // 待补播任务的代次，用户点击后作废
  var lastGestureAt = 0;               // 最近一次用户手势时间
  var lastPlayAt = 0;
  var voiceList = [];
  var state = {
    word: '', source: '', ok: false, error: '', at: 0,
    attempts: [], calls: 0, unlocked: false, tts: false, voices: 0
  };

  /* ---------- 提示（不使用 alert / confirm） ---------- */
  function notify(msg) {
    try { if (window.App && window.App.toast) { window.App.toast(msg); return; } } catch (e) { }
    try { if (window.Toast) { window.Toast(msg); return; } } catch (e) { }
    var n = document.getElementById('speakNote');
    if (n) {
      n.textContent = msg;
      n.hidden = false;
      clearTimeout(n._hideTimer);
      n._hideTimer = setTimeout(function () { n.hidden = true; }, 3600);
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 词条清洗：congratulate sb. on / take…seriously 这类占位符会让音源报错 */
  function normalize(t) {
    return String(t == null ? '' : t)
      .replace(/\b(sb|sth)\b\.?/gi, ' ')
      .replace(/[…]+/g, ' ')
      .replace(/[（(][^)）]*[)）]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- 浏览器语音包 ---------- */
  function refreshVoices() {
    try {
      if ('speechSynthesis' in window) voiceList = window.speechSynthesis.getVoices() || [];
    } catch (e) { voiceList = []; }
    state.voices = voiceList.length;
  }
  function pickVoice() {
    for (var i = 0; i < voiceList.length; i++) if (/en[-_]US/i.test(voiceList[i].lang)) return voiceList[i];
    for (var j = 0; j < voiceList.length; j++) if (/^en/i.test(voiceList[j].lang)) return voiceList[j];
    return null;
  }
  function ttsAvailable() {
    try { return ('speechSynthesis' in window) && typeof window.SpeechSynthesisUtterance === 'function'; }
    catch (e) { return false; }
  }
  if (ttsAvailable()) {
    refreshVoices();
    try {
      window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    } catch (e) { }
  }
  state.tts = ttsAvailable();

  /* ---------- 用户手势解锁 ----------
     注意：监听器不能用 once。点击喇叭、切换单词、翻卡等后续手势都要刷新时间戳，
     否则「用户主动点击」会被识别成自动朗读，进而被去重逻辑拦掉（点击无声的根因）。 */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    state.unlocked = true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        var ctx = new AC();
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(0); osc.stop(ctx.currentTime + 0.01);
        setTimeout(function () { try { ctx.close(); } catch (e) { } }, 300);
      }
    } catch (e) { }
    refreshVoices();
    if (pendingWord) {
      var w = pendingWord;
      var seq = ++pendingSeq;
      pendingWord = '';
      /* 若 60ms 内用户已主动点击喇叭播放，这次补播作废，避免抢播/静音 */
      setTimeout(function () {
        if (seq !== pendingSeq) return;
        speak(w, { fromPending: true });
      }, 60);
    }
  }

  function onGesture() {
    lastGestureAt = Date.now();
    unlock();
  }
  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, onGesture, { passive: true, capture: true });
  });

  /* ---------- 音源播放 ---------- */
  function getEl() {
    if (el) return el;
    el = new Audio();
    el.preload = 'auto';
    try { el.volume = 1; } catch (e) { }
    return el;
  }

  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

  function fallbackTts(w, myToken, reason) {
    if (myToken !== token) return;
    clearTimer();
    if (!ttsAvailable()) {
      finish(false, 'tts', '无网络音源且浏览器不支持朗读 · ' + reason);
      notify('朗读失败：请检查网络，或更换支持英语朗读的浏览器');
      return;
    }
    try {
      refreshVoices();
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(w);
      u.lang = 'en-US';
      u.rate = 0.72;
      u.pitch = 1;
      u.volume = 1;
      var v = pickVoice();
      if (v) u.voice = v;
      u.onerror = function () {
        if (myToken !== token) return;
        finish(false, 'tts', '浏览器语音播放失败');
        notify('朗读失败：请检查网络或浏览器语音设置');
      };
      u.onstart = function () { if (myToken === token) finish(true, '浏览器语音', ''); };
      window.speechSynthesis.speak(u);
      /* Chrome 偶发 bug：长文本或后台标签页会挂起， watchdog 兜底 */
      timer = setTimeout(function () {
        if (myToken !== token) return;
        try { window.speechSynthesis.resume(); } catch (e) { }
      }, 1200);
    } catch (e) {
      finish(false, 'tts', e && e.message);
      notify('朗读失败：浏览器语音不可用，请检查网络');
    }
  }

  function playNetwork(w, idx, myToken) {
    if (myToken !== token) return;
    if (idx >= PROVIDERS.length) { fallbackTts(w, myToken, '网络音源均不可用'); return; }

    var p = PROVIDERS[idx];
    var a = getEl();
    clearTimer();
    try { a.pause(); } catch (e) { }
    try { a.removeAttribute('src'); a.load(); } catch (e) { }

    var moved = false;
    function next(reason) {
      if (moved || myToken !== token) return;
      moved = true;
      state.attempts.push(p.key + ':' + reason);
      try { a.onerror = null; a.oncanplay = null; a.onplaying = null; } catch (e) { }
      playNetwork(w, idx + 1, myToken);
    }

    /* 多事件判据：onplay / onplaying 任一触发即视为已开始播放，
       部分浏览器只发其中一个；play() 的 Promise resolve 也作为兜底成功信号。 */
    function success() {
      if (moved || myToken !== token) return;
      clearTimer();
      finish(true, p.label, '');
      moved = true;
    }
    a.onerror = function () { next('error'); };
    a.onplay = success;
    a.onplaying = success;
    a.oncanplay = function () { /* 可播放，等待 play/playing 确认 */ };
    a.src = p.url(w);

    /* 4 秒无任何响应 → 判定失败，切下一个音源 */
    timer = setTimeout(function () { next('timeout'); }, 4000);

    try {
      var pr = a.play();
      if (pr && typeof pr.then === 'function') {
        pr.then(function () {
          if (moved || myToken !== token) return;
          clearTimer();
          finish(true, p.label, '');
          moved = true;
        }, function (err) { next('blocked:' + ((err && err.name) || 'play')); });
      } else if (pr && typeof pr.catch === 'function') {
        pr.catch(function (err) { next('blocked:' + ((err && err.name) || 'play')); });
      }
    } catch (e) { next('throw'); }
  }

  function finish(ok, source, error) {
    state.ok = ok;
    state.source = source;
    state.error = error || '';
    state.at = Date.now();
    state.unlocked = unlocked;
  }

  /* ---------- 对外主入口 ---------- */
  function speak(text, opts) {
    var w = normalize(text);
    if (!w) return false;
    opts = opts || {};

    var now = Date.now();
    /* 识别「用户主动点击」：显式标记 / 最近用户手势 / 浏览器 User Activation。
       主动点击一律真正播放，绝不能被自动朗读的去重逻辑吞掉。 */
    var byUser = !!(opts.force || opts.user ||
      (now - lastGestureAt < 1200) ||
      (navigator.userActivation && navigator.userActivation.isActive));

    if (byUser) {
      /* 用户已经点过喇叭，页面加载时排队的自动朗读不再补播 */
      pendingWord = '';
      pendingSeq++;
      if (!unlocked) { unlocked = true; state.unlocked = true; refreshVoices(); }
    } else if (w.toLowerCase() === state.word.toLowerCase() && now - lastPlayAt < 400) {
      /* 仅自动朗读之间去重（例如导航后重复触发同一词） */
      return true;
    }
    lastPlayAt = now;

    state.word = w;
    state.calls++;
    state.attempts = [];
    state.ok = false;
    state.source = '';
    state.error = '';
    state.at = now;

    /* 尚未产生用户手势：排队，等首次点击后补播，避免静默失败 */
    if (!unlocked && !opts.fromPending) {
      pendingWord = w;
      state.source = '等待用户交互';
      return true;
    }

    token++;
    var myToken = token;
    playNetwork(w, 0, myToken);
    return true;
  }

  function stop() {
    token++;
    clearTimer();
    try { if (el) el.pause(); } catch (e) { }
    try { if (ttsAvailable()) window.speechSynthesis.cancel(); } catch (e) { }
  }

  function status() {
    return {
      ok: state.ok,
      word: state.word,
      source: state.source,
      error: state.error,
      attempts: state.attempts.slice(),
      calls: state.calls,
      unlocked: unlocked,
      tts: ttsAvailable(),
      voices: voiceList.length,
      enVoices: voiceList.filter(function (v) { return /^en/i.test(v.lang); }).length,
      providers: PROVIDERS.map(function (p) { return p.label; }),
      /* 兼容原版「我的 → 测试发音」弹窗读取的字段 */
      failCount: state.ok ? 0 : state.attempts.length,
      lastError: state.error || state.attempts.join(' → ')
    };
  }

  window.Speak = speak;
  window.Speak.stop = stop;
  window.Speak.status = status;
  window.Speak.unlock = unlock;
  window.Speak.probe = function () {
    refreshVoices();
    return status();
  };

  /* 覆盖原版 WI.audio（对象属性覆盖，pages.js 中的引用会同步生效） */
  function attachWI() {
    if (!window.WI || !window.WI.audio) return;
    window.WI.audio.speak = speak;
    window.WI.audio.stop = stop;
    window.WI.audio.status = status;
    window.WI.audio.available = function () { return true; };
  }
  attachWI();
  /* core.js 若晚于本脚本加载，再兜一次 */
  setTimeout(attachWI, 0);
  document.addEventListener('DOMContentLoaded', attachWI);
})();
