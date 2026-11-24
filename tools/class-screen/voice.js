/* ============================================================
 * 班务大屏 · 统一语音模块
 * ------------------------------------------------------------
 * 关键修复：
 *  1. 不再只在页面初始化时读取一次 getVoices()；每次播报前都重新读取，
 *     并持续监听 voiceschanged —— 解决在线神经音色晚到导致选不中的问题。
 *  2. 预设音色只匹配“在线自然音”，绝不退到本地机械女声。
 *  3. 指定音色缺失时优先选同性别的在线自然音（男声不会变女声）。
 *  4. 不在 speak 前重复 cancel，避免 Chromium 把新语音一起取消掉。
 *  5. 唯一音源就是微软 Edge 神经音；已彻底移除百度/有道/本地机械音等所有兜底。
 *     百度在部分网络连不上、有道接口已下线（500）、本地机械音刺耳，都不能作为兜底。
 *  6. 神经音联网合成慢时不再用 2.5 秒短检测误判失败（长句 2.5 秒还没出声很正常），
 *     避免触发本地音造成“神经音 + 机械音”两种声音。现在只有神经音一种声音；
 *     万一神经音真不可用则保持静默，绝不叠加第二种声音。
 * ============================================================ */
(function (global) {
  'use strict';

  var VERSION = '20261123k-稳定版'; // 版本号：用于自检页确认是否加载到最新版（带缓存刷新）

  var PRESETS = {
    xiaoxiao: { label: '晓晓 · 温柔女声', gender: 'f', patterns: ['晓晓 Online', 'Xiaoxiao Online', 'Microsoft Xiaoxiao', '晓晓', 'Xiaoxiao'] },
    yunyang:  { label: '云扬 · 专业男声', gender: 'm', patterns: ['云扬 Online', 'Yunyang Online', 'Microsoft Yunyang', '云扬', 'Yunyang'] },
    xiaoyi:   { label: '晓伊 · 甜美女声', gender: 'f', patterns: ['晓伊 Online', 'Xiaoyi Online', 'Microsoft Xiaoyi', '晓伊', 'Xiaoyi'] },
    yunxi:    { label: '云希 · 阳光男声', gender: 'm', patterns: ['云希 Online', 'Yunxi Online', 'Microsoft Yunxi', '云希', 'Yunxi'] },
    yunjian:  { label: '云健 · 沉稳男声', gender: 'm', patterns: ['云健 Online', 'Yunjian Online', 'YunJian Online', 'Microsoft Yunjian', '云健', 'Yunjian', 'YunJian'] },
    xiaobei:  { label: '晓北 · 东北话女声', gender: 'f', patterns: ['晓北 Online', 'Xiaobei Online', 'Microsoft Xiaobei', '晓北', 'Xiaobei'] }
  };

  var cachedVoices = [];
  var speechToken = 0;
  var lastSource = ''; // 最近一次试听实际使用的音源：neural / none（静默）
  var debug = /[?&]voiceDebug=1\b/.test(global.location ? global.location.search : '');
  var panel = null;
  var logBuf = []; // 环形日志缓冲：跨页面诊断用（大屏写、自检页读同源 localStorage）

  function log() {
    var parts = [].slice.call(arguments);
    try { console.log.apply(console, ['[班务大屏语音]'].concat(parts)); } catch (e) { /* 忽略 */ }
    try {
      var line = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + ' ' + parts.map(function (x) {
        return (x && typeof x === 'object') ? JSON.stringify(x) : String(x);
      }).join(' ');
      logBuf.push(line);
      if (logBuf.length > 60) logBuf.shift();
      if (global.localStorage) global.localStorage.setItem('csVoiceLog', JSON.stringify(logBuf));
    } catch (e) { /* 忽略 */ }
  }

  function supported() {
    return !!(global.speechSynthesis && global.SpeechSynthesisUtterance);
  }

  // 每次调用都重新取，确保晚加载的在线音色能被看到
  function refreshVoices() {
    if (!supported()) { cachedVoices = []; return cachedVoices; }
    try { cachedVoices = global.speechSynthesis.getVoices() || []; } catch (e) { cachedVoices = []; }
    return cachedVoices;
  }

  function isChinese(v) {
    return /^zh|cmn|chinese/i.test((v.lang || '') + ' ' + (v.name || '') + ' ' + (v.voiceURI || ''));
  }

  function isNatural(v) {
    return /online\s*\(natural\)|natural|neural/i.test((v.name || '') + ' ' + (v.voiceURI || ''));
  }

  function matches(v, patterns) {
    var hay = (v.name || '') + ' ' + (v.voiceURI || '');
    for (var i = 0; i < patterns.length; i++) {
      if (hay.indexOf(patterns[i]) >= 0) return true;
    }
    return false;
  }

  function presetKeyOfVoice(v) {
    for (var key in PRESETS) {
      if (PRESETS[key].external) continue;
      if (matches(v, PRESETS[key].patterns)) return key;
    }
    return '';
  }

  /**
   * 选择真正可用的在线自然音色。
   * 优先级：指定音色精确匹配 → 同性别在线自然音 → 任意中文在线自然音 → null
   * 绝不返回本地机械音（Huihui 等）。
   */
  function pickVoice(key) {
    var voices = refreshVoices();
    var preset = PRESETS[key] || PRESETS.xiaoxiao;
    if (preset.external) return null;

    var natural = voices.filter(function (v) { return isChinese(v) && isNatural(v); });
    var exact = natural.filter(function (v) { return matches(v, preset.patterns); });
    if (exact.length) return exact[0];

    var sameGender = natural.filter(function (v) {
      var k = presetKeyOfVoice(v);
      return k && PRESETS[k].gender === preset.gender;
    });
    if (sameGender.length) return sameGender[0];
    return natural[0] || null;
  }

  function speedToRate(s) { return s === 3 ? 0.9 : (s === 5 ? 1.18 : 1.04); }

  function estimateSec(text, rate) {
    return Math.max(2, (String(text).replace(/\s/g, '').length / 4.0) / (rate || 1) + 0.8);
  }

  function stop() {
    speechToken++; // 让上一次播报的延迟回调全部失效，避免叠加到新喊话
    // 仅在确实有语音在播/排队时才 cancel。空闲状态下频繁 cancel() 会让
    // Chromium/Edge 进入“吞音”状态，紧接着的 speak() 被静默丢弃。
    try {
      if (global.speechSynthesis && speakingNow()) global.speechSynthesis.cancel();
    } catch (e) { /* 忽略 */ }
  }

  function speakingNow() {
    try {
      return !!(global.speechSynthesis && (global.speechSynthesis.speaking || global.speechSynthesis.pending));
    } catch (e) { return false; }
  }

  // ---- 浏览器自动播放解锁 ----
  // Chrome 71+/Edge 要求 speak() 必须由真实用户手势触发；轮询/定时器里自动调用会被
  // 静默拦截(not-allowed)。两条解锁路径：
  //  1) 自动：若安装包给 Edge 传了 --autoplay-policy=no-user-gesture-required，
  //     页面加载时即可自动播放静音 <audio>；探测成功后 speak 空语音完成解锁，全程无人值守。
  //  2) 手动兜底：若参数未生效，则在真实 click/touch 事件里同步解锁（见 app.js）。
  // 一旦解锁，本次页面生命周期内所有 speak()（含轮询喊话）都被允许。
  var unlocked = false;
  function speakSilentUtterance() {
    try {
      var u = new global.SpeechSynthesisUtterance(' ');
      u.volume = 0;      // 静音
      u.rate = 10;       // 尽快结束
      global.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  function unlock(reason) {
    if (unlocked || !supported()) return;
    if (speakSilentUtterance()) {
      unlocked = true;
      log('语音已解锁（' + (reason || '用户手势') + '），后续自动喊话可正常播放');
    }
  }
  function isUnlocked() {
    // 内部解锁标记优先：autoUnlock 成功后即为 true（自动播放不改变 userActivation）。
    if (unlocked) return true;
    try {
      var ua = global.navigator && global.navigator.userActivation;
      if (ua && typeof ua.hasBeenActive === 'boolean') return ua.hasBeenActive;
    } catch (e) { /* 忽略 */ }
    return false;
  }

  // 自动解锁探测：用极短静音 WAV 尝试自动播放。
  // --autoplay-policy=no-user-gesture-required 生效时会 resolve → 立即 speak 空语音解锁；
  // 未生效时会 reject → 不解锁，等待用户首次点击（app.js 的 unlock 兜底）。
  var SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  function autoUnlock() {
    try {
      var a = new global.Audio();
      a.src = SILENT_WAV;
      a.volume = 0;
      a.muted = true;
      var p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          log('自动播放探测成功（autoplay 策略允许），自动解锁语音，无需人工点击');
          unlock('自动解锁');
          try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) { /* 忽略 */ }
        }).catch(function () {
          log('自动播放探测被拦截：Edge 启动参数未生效，需首次点击激活（或在浏览器设置中允许本站声音）');
        });
      }
    } catch (e) { /* 忽略 */ }
  }

  /** 在线神经音朗读；成功回调 (估算秒数, true)，失败回调 (0, false) */
  function speakNeural(text, key, speed, onDone, token) {
    if (!supported()) return false;
    var voice = pickVoice(key);
    if (!voice) {
      log('未找到在线自然音色（requested=' + key + '），保持静默（不再用本地机械音）。当前音色数=' + refreshVoices().length);
      return false;
    }
    function current() { return token == null || token === speechToken; }

    var finished = false;
    var started = false;
    var probe = null;
    function finish(sec, ok) {
      if (finished || !current()) return;
      finished = true;
      if (probe) { clearInterval(probe); probe = null; }
      log('播放音色：' + voice.name + ' [' + voice.lang + '] ← 请求 ' + key + '（started=' + started + '）');
      if (ok) lastSource = 'neural';
      // 第三个参数把“是否真正出声”回传给 speakShout，用于探活重试（不掺第二音源）
      if (onDone) onDone(sec, ok, started);
    }

    try {
      var u = new global.SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang || 'zh-CN';
      u.rate = speedToRate(speed);
      u.pitch = 1;
      u.volume = 1;
      u.onstart = function () { if (current()) { started = true; log('神经音 onstart：' + voice.name); } };
      u.onend = function () { if (!current()) return; log('神经音 onend：' + voice.name); finish(estimateSec(text, u.rate), true); };
      u.onerror = function (ev) {
        if (!current() || finished) return;
        var code = (ev && ev.error) || 'unknown';
        // not-allowed = 浏览器因缺少用户手势拦截了自动播放。这是大屏轮询喊话无声的根因。
        // 提示需要在页面上真实点击一次激活语音（见 unlock）。
        if (/not-allowed/i.test(code)) {
          log('⚠️ 浏览器拦截了自动朗读（not-allowed：缺少用户手势）。请在屏幕上点击任意位置一次以激活语音。');
        }
        // cancel/interrupted 是“被打断”，不是启动失败。
        // 其余错误（如 synthesis-failed / network）也不再回退本地机械音：
        // 神经音是唯一音源，失败就静默，绝不叠加第二种声音。
        if (started || speakingNow()) {
          log('神经音在朗读中报错，按已完成处理：' + code);
          finish(estimateSec(text, u.rate), true);
        } else {
          log('神经音未启动即报错，保持静默（不回退机械音）：' + code);
          finish(0, false);
        }
      };
      global.speechSynthesis.speak(u);
      // 部分 Edge 版本不派发 onstart，但 speechSynthesis.speaking 已变为 true；
      // 主动探测，避免把正常播放误判成失败。
      probe = setInterval(function () {
        if (finished || !current()) { if (probe) { clearInterval(probe); probe = null; } return; }
        if (speakingNow()) started = true;
      }, 150);
      setTimeout(function () { if (probe) { clearInterval(probe); probe = null; } }, 5000);
      // 【重要】此处绝不能因“1.4 秒还没出声”就 cancel 重试：
      // 喊话长句联网合成常常超过 1.4 秒，旧版探活会把正常合成误判成吞音并 cancel，
      // 反复 cancel 导致神经音永远播不出来 —— 正是"自检短句有声、喊话长句无声"的根因。
      // 现在只观察、不打断，真正的收尾交给下方宽松超时。
      setTimeout(function () {
        if (finished || !current()) return;
        log('神经音合成中观察点(1.4s)：started=' + started + ' speakingNow=' + speakingNow() + '（不打断，继续等）');
      }, 1400);
      // 关键：神经音需联网合成，长句 2.5 秒内不出声很正常。旧版把“2.5 秒没出声”
      // 当成失败去回退本地音，导致长句喊话时先响机械音、随后神经音又响 —— 两种声音。
      // 现在删除这个短检测：只要在朗读队列里（speaking/pending 或已 onstart），
      // 就耐心等 onend；绝不在语音未结束时另起一条本地音。
      setTimeout(function () {
        if (finished || !current()) return;
        log('神经音仍在等待/播放中（' + (started ? '已 onstart' : '未 onstart') + '），保持唯一音源，不叠加本地音');
      }, 2500);
      // 宽松超时：按文本长度给足合成时间，仍未结束才静默收尾（让喊话层按时收起），
      // 且只在确认引擎已空闲时才算失败；全程不播放任何本地机械音。
      var hardTimeout = Math.max(10000, estimateSec(text, u.rate) * 1000 + 8000);
      setTimeout(function () {
        if (finished || !current()) return;
        if (speakingNow() && !started) {
          // 引擎报“在朗读”但从没 onstart：可能是卡住的假状态。给一次额外宽限，
          // 但绝不让回调无限挂起（否则喊话层永远不收起）。
          log('超时时引擎显示朗读但无 onstart，再宽限 6 秒（不打断）');
          setTimeout(function () {
            if (finished || !current()) return;
            log('宽限结束仍无 onstart，静默收尾（不 cancel，避免打断可能的慢合成）');
            finish(0, false);
          }, 6000);
          return;
        }
        if (speakingNow()) {
          log('超时时引擎仍在朗读（已 onstart），让 onend 自然收尾，不打断');
          return;
        }
        log('神经音等待超时且引擎空闲，静默收尾');
        finish(0, false);
      }, hardTimeout);
      return true;
    } catch (e) {
      log('神经音启动异常：' + e.message);
      return false;
    }
  }

  /** 统一入口：微软 Edge 神经音 —— 唯一音源，失败时保持静默，绝不叠加本地机械音 */
  function speakShout(text, cfg, onDone) {
    var key = (cfg && cfg.voice) || 'xiaoxiao';
    // 兼容旧配置：曾选过“在线女声/备用音源=baidu/youdao”的，改用默认神经音
    if (!PRESETS[key]) key = 'xiaoxiao';
    var speed = (cfg && cfg.voiceSpeed) || 4;
    // 先中断上一条（含它的所有延迟回调）。注意：调用方 showShout 里 hideShout() 已 cancel 过一次，
    // 这里再 cancel 会形成“短时间内两次 cancel”，紧接着 speak 极易被 Chromium/Edge 静默吞掉，
    // 这正是"版本正确却完全没声音"的根因。因此把 speak 延迟拉长到 450ms，并加吞音重试。
    stop();
    var token = speechToken;
    function done(sec) { if (token === speechToken && onDone) onDone(sec); }
    // 静默收尾：标记本次没有出声，仅回调让喊话层按估算时长收起，绝不播放本地音
    function silent() {
      lastSource = 'none';
      done(estimateSec(text, speedToRate(speed)));
    }

    var MAX_RETRY = 2;   // 最多重试 2 次（都还是同一个神经音，不是备用音源）
    var delays = [450, 700, 1100]; // 逐次拉长 cancel→speak 间隔，规避 Edge 吞音
    function attempt(n) {
      if (token !== speechToken) return;
      setTimeout(function () {
        if (token !== speechToken) return;
        var launched = speakNeural(text, key, speed, function (sec, ok, started) {
          if (token !== speechToken) return;
          if (ok) { done(sec); return; }
          // 确认没出声（未启动即失败 / 宽松超时仍无声）。重试同一个神经音，
          // 绝不回退本地机械音；重试耗尽后静默。
          if (n < MAX_RETRY) {
            log('神经音未出声（started=' + !!started + '），第 ' + (n + 1) + ' 次重试（仍为神经音）');
            try {
              if (global.speechSynthesis && speakingNow()) global.speechSynthesis.cancel();
            } catch (e) { /* 忽略 */ }
            attempt(n + 1);
          } else {
            log('神经音重试 ' + MAX_RETRY + ' 次仍未出声，保持静默（不用机械音）');
            silent();
          }
        }, token);
        if (!launched) {
          // pickVoice 没找到（非 Edge / 音色未加载）：重试也无意义，直接静默
          silent();
        }
      }, delays[Math.min(n, delays.length - 1)]);
    }
    attempt(0);
  }

  /** 诊断信息，供 voice-test.html 展示 */
  function diagnose() {
    var voices = refreshVoices();
    var natural = voices.filter(function (v) { return isChinese(v) && isNatural(v); });
    var picks = {};
    Object.keys(PRESETS).forEach(function (key) {
      if (PRESETS[key].external) return;
      var v = pickVoice(key);
      picks[key] = v ? (v.name + ' [' + v.lang + ']') : '未找到（将保持静默，不使用机械音）';
    });
    return {
      browser: navigator.userAgent,
      speechSupported: supported(),
      totalVoices: voices.length,
      naturalVoices: natural.map(function (v) { return v.name + ' [' + v.lang + ']'; }),
      picks: picks
    };
  }

  // 持续刷新：解决“首次只有本地音、在线音后到”的问题
  if (supported()) {
    refreshVoices();
    try {
      global.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    } catch (e) { /* 忽略 */ }
    setInterval(refreshVoices, 3000);
    // 尝试无人值守自动解锁（若 Edge 启动参数生效则无需任何人工点击）
    autoUnlock();
    // 若首次自动解锁失败，用户任何真实交互后再尝试一次（音频 play 在手势上下文中几乎必成功）
    try {
      ['pointerdown', 'click', 'keydown', 'touchstart'].forEach(function (ev) {
        global.addEventListener(ev, function once() {
          if (!unlocked) { autoUnlock(); unlock('用户交互'); }
          ['pointerdown', 'click', 'keydown', 'touchstart'].forEach(function (e2) {
            global.removeEventListener(e2, once, true);
          });
        }, { capture: true, once: true });
      });
    } catch (e) { /* 忽略 */ }
  }

  global.ClassScreenVoice = {
    autoUnlock: autoUnlock,
    presets: PRESETS,
    refreshVoices: refreshVoices,
    pickVoice: pickVoice,
    speak: speakNeural,
    speakShout: speakShout,
    stop: stop,
    unlock: unlock,
    isUnlocked: isUnlocked,
    diagnose: diagnose,
    version: VERSION,
    getLastSource: function () { return lastSource; },
    getLog: function () {
      try { return JSON.parse(global.localStorage.getItem('csVoiceLog') || '[]'); } catch (e) { return logBuf; }
    },
    debug: debug
  };

  if (debug) log('语音模块已加载。诊断：', diagnose());
})(window);
