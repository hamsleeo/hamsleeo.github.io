/* 自动生成：来自小程序 utils/*.js（store/quiz/audio/checkin_code/qr），逻辑未改。
 * 前置依赖：js/shim.js 提供 window.wx；js/data.js 提供 window.__DATA。 */
window.WI = {};
/* ===================== store.js ===================== */
(function () {
/* 数据层：本地存储（后续可无缝升级云同步） */
const VOCAB = __DATA.VOCAB

const KEY = 'engpet_mp_save'
const todayStr = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function load() {
  try {
    const s = wx.getStorageSync(KEY)
    if (s && s.v === 1) return s
  } catch (e) { }
  return null
}

function defaultSave() {
  return {
    v: 1,
    profile: { name: '', classCode: '', className: '', isTeacher: false, roster: [] },
    pet: { name: '豆豆', xp: 0, level: 1, stage: 0 },
    progress: {},        // 'book|unit' -> 1 通关
    grammar: {},         // 语法关 id -> {correct, total, pass, at}
    usage: {},           // 词汇运用 'book|unit' -> {correct, total, at}
    roots: {},           // 词根/拼读：word -> 1 已掌握
    checkins: {},        // date -> {count, xp, correct, total}
    streak: 0,
    lastCheckin: '',
    errors: {},          // word -> {m, unit, count, lastAt}
    stats: { total: 0, correct: 0 }
  }
}

let _cache = null
function get() {
  if (!_cache) _cache = load() || defaultSave()
  return _cache
}
function save() {
  try { wx.setStorageSync(KEY, get()) } catch (e) { }
}

/* ---------- 关卡 ---------- */
function books() { return Object.keys(VOCAB).sort((a, b) => VOCAB[a].order - VOCAB[b].order) }

/* 主线教材册（不含「拓展·」旧版词库） */
function mainBooks() { return books().filter(bk => !VOCAB[bk].extra) }
function extraBooks() { return books().filter(bk => !!VOCAB[bk].extra) }

/* 主线闯关关卡：仅新教材各册；旧版词库只用于词表浏览与词汇运用 */
function levels() {
  const out = []
  mainBooks().forEach(bk => {
    VOCAB[bk].units.forEach((u, i) => {
      out.push({ book: bk, bookOrder: VOCAB[bk].order, unit: u.title, idx: i, words: u.words })
    })
  })
  return out
}

/* 取某单元词汇（含拓展册），词汇运用页使用 */
function unitWords(book, unit) {
  const b = VOCAB[book]
  if (!b) return null
  const u = b.units.find(x => x.title === unit)
  return u ? u.words : null
}

/* 关卡已全部放开：任何单元都可直接闯，顺序闯关只是"推荐路线" */
function isUnlocked(L, idx) { return true }

/* 下一个未通关单元（顺序闯关的当前位置） */
function nextLevel() {
  const L = levels()
  const p = get().progress
  for (let i = 0; i < L.length; i++) {
    if (!p[L[i].book + '|' + L[i].unit]) return { idx: i, level: L[i] }
  }
  return null
}

/* ---------- 打卡 ---------- */
/* unitKey：'册|单元'，传入则该单元记为已通关（逐单元解锁的依据） */
function recordQuiz(correct, total, xp, unitKey) {
  const s = get()
  const d = todayStr()
  if (!s.checkins[d]) s.checkins[d] = { count: 0, xp: 0, correct: 0, total: 0 }
  const c = s.checkins[d]
  c.count += 1; c.xp += xp; c.correct += correct; c.total += total
  s.pet.xp += xp
  s.stats.total += total; s.stats.correct += correct
  if (unitKey && !s.progress[unitKey]) {
    s.progress[unitKey] = { at: d, correct: correct, total: total }
  }
  // 连续打卡
  if (s.lastCheckin !== d) {
    const y = new Date(); y.setDate(y.getDate() - 1)
    const ys = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0')
    s.streak = (s.lastCheckin === ys) ? (s.streak || 0) + 1 : 1
    s.lastCheckin = d
  }
  // 升级：每 100 xp 一级
  while (s.pet.xp >= s.pet.level * 100) {
    s.pet.xp -= s.pet.level * 100
    s.pet.level += 1
    if (s.pet.level % 3 === 0) s.pet.stage = Math.min(4, s.pet.stage + 1)
  }
  save()
  return s
}

function recordError(w, m, where) {
  const s = get()
  if (!s.errors[w]) s.errors[w] = { m: m, where: where, count: 0, lastAt: '' }
  s.errors[w].count += 1
  s.errors[w].lastAt = todayStr()
  save()
}

/* ---------- 语法闯关 ---------- */
function grammarState() {
  const s = get()
  if (!s.grammar) s.grammar = {}   // 兼容旧存档
  return s.grammar
}

/* 记录一次语法关挑战，返回是否通关（>=80%）；通关记录永久保留 */
function recordGrammar(id, correct, total) {
  const g = grammarState()
  const prev = g[id]
  const pass = !!(prev && prev.pass) || correct * 10 >= total * 8
  g[id] = { correct: prev ? Math.max(prev.correct || 0, correct) : correct, total: total, pass: pass, at: todayStr() }
  save()
  return pass
}

function grammarPassed(id) { const g = grammarState(); return !!(g[id] && g[id].pass) }

/* ---------- 词汇运用 ---------- */
function usageState() {
  const s = get()
  if (!s.usage) s.usage = {}   // 兼容旧存档
  return s.usage
}

function recordUsage(key, correct, total) {
  const u = usageState()
  const prev = u[key]
  u[key] = { correct: prev ? Math.max(prev.correct || 0, correct) : correct, total: total, at: todayStr() }
  save()
}

/* ---------- 词根/拼读：已掌握标记 ---------- */
function rootState() {
  const s = get()
  if (!s.roots) s.roots = {}   // 兼容旧存档
  return s.roots
}

/* 切换某个词的「已掌握」，返回切换后的状态 */
function toggleRoot(w) {
  const r = rootState()
  const k = String(w || '').toLowerCase()
  if (!k) return false
  if (r[k]) delete r[k]
  else r[k] = 1
  save()
  return !!r[k]
}

function rootMastered(w) { return !!rootState()[String(w || '').toLowerCase()] }
function rootCount() { return Object.keys(rootState()).length }

function clearError(w) {
  const s = get()
  delete s.errors[w]
  save()
}

/* 今日复习组：错题 + 近 3 天所学 */
function reviewWords() {
  const s = get()
  const L = levels()
  const map = {}
  L.forEach(l => { map[l.book + '|' + l.unit] = l })
  const out = []
  Object.keys(s.errors).forEach(w => {
    const e = s.errors[w]
    const l = map[e.where]
    if (l) {
      const wd = l.words.find(x => x.w === w)
      if (wd) out.push({ word: wd, from: '错题本' })
    }
  })
  // 补充近通关单元抽样
  const dates = Object.keys(s.checkins).sort().slice(-3)
  if (out.length < 10 && dates.length) {
    const done = Object.keys(s.progress)
    const sample = done.slice(-3)
    sample.forEach(k => {
      const l = map[k]
      if (l) l.words.slice(0, 5).forEach(wd => {
        if (!out.find(x => x.word.w === wd.w)) out.push({ word: wd, from: '已学' })
      })
    })
  }
  return out.slice(0, 20)
}

function hasReview() { return reviewWords().length > 0 }

/* 班级（本地版） */
function joinClass(name, code, className, roster) {
  const s = get()
  s.profile.name = name
  s.profile.classCode = code
  if (className !== undefined) s.profile.className = className
  if (roster && roster.length) s.profile.roster = roster.slice(0, 300)
  save()
}

/* 单独更新已保存的班级名单（换班/老师更新名单后可覆盖） */
function setRoster(roster) {
  const s = get()
  s.profile.roster = (roster || []).slice(0, 300)
  save()
}
function setTeacher(v) { const s = get(); s.profile.isTeacher = v; save() }

function setPetName(n) { const s = get(); s.pet.name = n; save() }

WI.store = {
  VOCAB, get, save, todayStr, books, mainBooks, extraBooks, levels, unitWords, isUnlocked, nextLevel,
  recordQuiz, recordError, clearError, reviewWords, hasReview,
  recordGrammar, grammarPassed, grammarState,
  recordUsage, usageState,
  toggleRoot, rootMastered, rootCount, rootState,
  joinClass, setRoster, setTeacher, setPetName
}

})();
/* ===================== audio.js ===================== */
(function () {
/* 单词读音（2.0 版：不依赖任何小程序插件，发布即可用）
 *
 * 背景：旧版依赖「微信同声传译」插件(WechatSI)，需要在 mp 后台手动添加插件才会生效；
 *      未添加时 requirePlugin 抛错 → 所有读音静默失败（表现为"没声音"）。
 *
 * 现行方案：网络 TTS 双音源 + 共享音频实例
 *   1) 有道词典发音（美音，最稳）
 *   2) 百度翻译 TTS（备用）
 * 任一失败自动切下一个音源。
 *
 * 另：obeyMuteSwitch=false 解决「手机开了静音开关就没声音」的常见问题。
 */

const PROVIDERS = [
  function (w) { return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=2' },
  function (w) { return 'https://fanyi.baidu.com/gettts?lan=en&text=' + encodeURIComponent(w) + '&spd=3&source=web' }
]

let ctx = null
let optionSet = false
let current = { text: '', idx: 0 }
let lastError = ''
let speakCount = 0
let failCount = 0

function ensureOption() {
  if (optionSet) return
  optionSet = true
  try {
    // 不遵循静音开关：手机静音时也能出声（这是很多"没声音"的真正原因）
    if (wx.setInnerAudioOption) {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        mixWithOther: true,
        success: function () { },
        fail: function () { }
      })
    }
  } catch (e) { }
}

function getCtx() {
  if (ctx) return ctx
  ctx = wx.createInnerAudioContext()
  try { ctx.volume = 1 } catch (e) { }
  // 失败 → 换下一个音源重试
  ctx.onError(function (err) {
    lastError = (err && (err.errMsg || err.errCode)) || 'play error'
    failCount++
    const c = current
    if (c && c.idx + 1 < PROVIDERS.length) {
      playWith(c.text, c.idx + 1)
    }
  })
  ctx.onEnded(function () { })
  return ctx
}

function playWith(text, idx) {
  const c = getCtx()
  current = { text: text, idx: idx }
  try {
    c.stop()
  } catch (e) { }
  c.src = PROVIDERS[idx](text)
  try {
    c.play()
  } catch (e) {
    lastError = 'play throw: ' + (e && e.message)
    failCount++
  }
}

/* 词条清洗：congratulate sb. on / take…seriously 这类占位符会让音源报错 */
function normalize(text) {
  return String(text)
    .replace(/\b(sb|sth)\b\.?/gi, ' ')
    .replace(/[…]+/g, ' ')
    .replace(/[（(][^)）]*[)）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function speak(text) {
  if (!text) return
  const w = normalize(text)
  if (!w) return
  ensureOption()
  speakCount++
  playWith(w, 0)
}

function stop() {
  if (ctx) {
    try { ctx.stop() } catch (e) { }
  }
}

/* 自检用：返回读音运行状态，方便在「我的」页排查 */
function status() {
  return {
    ok: failCount === 0 && speakCount > 0,
    speakCount: speakCount,
    failCount: failCount,
    lastError: lastError
  }
}

/* 兼容旧调用：始终可用（不再依赖插件） */
function available() { return true }

WI.audio = { speak, stop, status, available }

})();
/* ===================== quiz.js ===================== */
(function () {
/* 出题引擎：选择/拼写/听音选词 */
const store = WI.store
const audio = WI.audio

function shuffle(a) {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = r[i]; r[i] = r[j]; r[j] = t
  }
  return r
}

function allWords() {
  const out = []
  store.levels().forEach(l => l.words.forEach(w => out.push(w)))
  return out
}

/* 一关覆盖单元全部词汇：学词=全部；题目=每词至少 1 题（不足 10 题补随机复习题） */
function makeQuiz(unitWords, allPool) {
  const ordered = shuffle(unitWords)
  const n = ordered.length
  const qCount = Math.max(n, 10)
  const seq = ordered.slice()
  while (seq.length < qCount) {
    seq.push(ordered[Math.floor(Math.random() * n)])
  }
  const types = ['mc', 'spell', 'sound']
  const qs = seq.map(w => {
    let t = types[Math.floor(Math.random() * types.length)]
    // 词组不适合拼写题，换成英选义
    if (t === 'spell' && /\s/.test(w.w)) t = 'mc'
    if (t === 'mc') {
      // 英选义
      const ds = shuffle(allPool.filter(x => x.w !== w.w)).slice(0, 3).map(x => x.m)
      const opts = shuffle(ds.concat([w.m]))
      return { type: 'mc', word: w, options: opts, answer: w.m }
    } else if (t === 'spell') {
      return { type: 'spell', word: w, answer: w.w, hint: w.m }
    }
    // 听音选词
    const ds = shuffle(allPool.filter(x => x.w !== w.w)).slice(0, 3).map(x => x.w)
    const opts = shuffle(ds.concat([w.w]))
    return { type: 'sound', word: w, options: opts, answer: w.w }
  })
  return { words: ordered, qs }
}

function playWord(w) { audio.speak(w) }

WI.quiz = { shuffle, makeQuiz, allWords, playWord }

})();
/* ===================== checkin_code.js ===================== */
(function () {
const store = WI.store

/* 学生端：导出打卡码（近 7 天数据，文本复制给老师）
   编码：PET1: + base64(UTF-8 JSON)，纯 JS 实现，不依赖 wx 废弃 API */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function str2bytes(s) {
  const out = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(i + 1)
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
        i++
        continue
      }
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

function bytes2str(a) {
  let s = ''
  for (let i = 0; i < a.length;) {
    const c = a[i]
    if (c < 0x80) { s += String.fromCharCode(c); i++ }
    else if (c < 0xe0) { s += String.fromCharCode(((c & 31) << 6) | (a[i + 1] & 63)); i += 2 }
    else if (c < 0xf0) { s += String.fromCharCode(((c & 15) << 12) | ((a[i + 1] & 63) << 6) | (a[i + 2] & 63)); i += 3 }
    else {
      const cp = ((c & 7) << 18) | ((a[i + 1] & 63) << 12) | ((a[i + 2] & 63) << 6) | (a[i + 3] & 63)
      const v = cp - 0x10000
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023))
      i += 4
    }
  }
  return s
}

function b64encode(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i], b2 = bytes[i + 1], b3 = bytes[i + 2]
    out += B64[b1 >> 2]
    out += B64[((b1 & 3) << 4) | ((b2 === undefined ? 0 : b2) >> 4)]
    out += b2 === undefined ? '=' : B64[((b2 & 15) << 2) | ((b3 === undefined ? 0 : b3) >> 6)]
    out += b3 === undefined ? '=' : B64[b3 & 63]
  }
  return out
}

function b64decode(str) {
  const s = String(str).replace(/[^A-Za-z0-9+/=]/g, '')
  const out = []
  for (let i = 0; i < s.length; i += 4) {
    const n1 = B64.indexOf(s[i]), n2 = B64.indexOf(s[i + 1])
    const n3 = s[i + 2] === '=' ? -1 : B64.indexOf(s[i + 2])
    const n4 = s[i + 3] === '=' ? -1 : B64.indexOf(s[i + 3])
    if (n1 < 0 || n2 < 0) break
    out.push((n1 << 2) | (n2 >> 4))
    if (n3 >= 0) out.push(((n2 & 15) << 4) | (n3 >> 2))
    if (n4 >= 0) out.push(((n3 & 3) << 6) | n4)
  }
  return out
}

function encodeCheckin() {
  const s = store.get()
  const days = []
  const d = new Date()
  for (let i = 0; i < 7; i++) {
    const dd = new Date(); dd.setDate(d.getDate() - i)
    const k = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0')
    const c = s.checkins[k]
    days.push(c ? { c: c.count, x: c.xp, cr: c.correct, t: c.total } : null)
  }
  const doneKeys = Object.keys(s.progress || {})
  const all = store.levels()
  const lastKey = doneKeys[doneKeys.length - 1] || ''
  const payload = {
    n: s.profile.name || '未命名',
    cc: s.profile.classCode || '',
    cn: s.profile.className || '',
    lv: s.pet.level,
    days: days,
    // 以下为闯关情况（教师导出用）
    u: doneKeys.length,                 // 已通关单元数
    tu: all.length,                     // 总单元数
    l: lastKey.replace('|', ' '),       // 最近通关单元
    st: s.streak || 0,                  // 连续打卡
    acc: s.stats.total ? Math.round(s.stats.correct * 100 / s.stats.total) : 0,
    at: store.todayStr()
  }
  return 'PET1:' + b64encode(str2bytes(JSON.stringify(payload)))
}

function decodeCheckin(code) {
  try {
    const b64 = String(code).trim().replace(/^PET1:/, '')
    const data = JSON.parse(bytes2str(b64decode(b64)))
    if (!data || typeof data.n !== 'string' || !Array.isArray(data.days)) return null
    return data
  } catch (e) { return null }
}

/* ---------------- 班级邀请码（教师 → 学生，含名单） ----------------
   格式：PETC2|班级码|班级名|教师名|姓名1,姓名2,...
   直接文本而非 base64：二维码更小、更好扫。 */
function cleanField(x, max) {
  return String(x == null ? '' : x).replace(/[|,;；，、\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 20)
}

function encodeInvite(t) {
  const code = String((t && t.classCode) || '').replace(/\D/g, '').slice(0, 6)
  const cn = cleanField(t && t.className, 16)
  const tn = cleanField(t && t.teacherName, 12)
  const names = ((t && t.roster) || []).map(function (x) { return cleanField(x, 12) })
    .filter(function (x) { return !!x })
  return 'PETC2|' + code + '|' + cn + '|' + tn + '|' + names.join(',')
}

function decodeInvite(str) {
  const s = String(str == null ? '' : str).trim()
  if (s.indexOf('PETC2|') !== 0) return null
  const parts = s.split('|')
  if (parts.length < 5) return null
  const classCode = String(parts[1] || '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(classCode)) return null
  const roster = String(parts[4] || '').split(',')
    .map(function (x) { return cleanField(x, 12) })
    .filter(function (x) { return !!x })
  return {
    classCode: classCode,
    className: cleanField(parts[2], 16),
    teacherName: cleanField(parts[3], 12),
    roster: roster
  }
}

WI.code = { encodeCheckin, decodeCheckin, encodeInvite, decodeInvite, cleanField }

})();
/* ===================== qr_tables.js + qr.js ===================== */
(function () {
/* 自动生成：QR 标准表（L 级 RS 分块 + 对齐图案位置），请勿手改 */
const __QRT = {
  RS_L: {
    1: [7, [[1,19]]],
    2: [10, [[1,34]]],
    3: [15, [[1,55]]],
    4: [20, [[1,80]]],
    5: [26, [[1,108]]],
    6: [18, [[2,68]]],
    7: [20, [[2,78]]],
    8: [24, [[2,97]]],
    9: [30, [[2,116]]],
    10: [18, [[2,68],[2,69]]],
    11: [20, [[4,81]]],
    12: [24, [[2,92],[2,93]]],
    13: [26, [[4,107]]],
    14: [30, [[3,115],[1,116]]],
    15: [22, [[5,87],[1,88]]],
    16: [24, [[5,98],[1,99]]],
    17: [28, [[1,107],[5,108]]],
    18: [30, [[5,120],[1,121]]],
    19: [28, [[3,113],[4,114]]],
    20: [28, [[3,107],[5,108]]],
    21: [28, [[4,116],[4,117]]],
    22: [28, [[2,111],[7,112]]],
    23: [30, [[4,121],[5,122]]],
    24: [30, [[6,117],[4,118]]],
    25: [26, [[8,106],[4,107]]],
    26: [28, [[10,114],[2,115]]],
    27: [30, [[8,122],[4,123]]],
    28: [30, [[3,117],[10,118]]],
    29: [30, [[7,116],[7,117]]],
    30: [30, [[5,115],[10,116]]],
    31: [30, [[13,115],[3,116]]],
    32: [30, [[17,115]]],
    33: [30, [[17,115],[1,116]]],
    34: [30, [[13,115],[6,116]]],
    35: [30, [[12,121],[7,122]]],
    36: [30, [[6,121],[14,122]]],
    37: [30, [[17,122],[4,123]]],
    38: [30, [[4,122],[18,123]]],
    39: [30, [[20,117],[4,118]]],
    40: [30, [[19,118],[6,119]]],
  },
  ALIGN: {
    1: [],
    2: [6,18],
    3: [6,22],
    4: [6,26],
    5: [6,30],
    6: [6,34],
    7: [6,22,38],
    8: [6,24,42],
    9: [6,26,46],
    10: [6,28,50],
    11: [6,30,54],
    12: [6,32,58],
    13: [6,34,62],
    14: [6,26,46,66],
    15: [6,26,48,70],
    16: [6,26,50,74],
    17: [6,30,54,78],
    18: [6,30,56,82],
    19: [6,30,58,86],
    20: [6,34,62,90],
    21: [6,28,50,72,94],
    22: [6,26,50,74,98],
    23: [6,30,54,78,102],
    24: [6,28,54,80,106],
    25: [6,32,58,84,110],
    26: [6,30,58,86,114],
    27: [6,34,62,90,118],
    28: [6,26,50,74,98,122],
    29: [6,30,54,78,102,126],
    30: [6,26,52,78,104,130],
    31: [6,30,56,82,108,134],
    32: [6,34,60,86,112,138],
    33: [6,30,58,86,114,142],
    34: [6,34,62,90,118,146],
    35: [6,30,54,78,102,126,150],
    36: [6,24,50,76,102,128,154],
    37: [6,28,54,80,106,132,158],
    38: [6,32,58,84,110,136,162],
    39: [6,26,54,82,110,138,166],
    40: [6,30,58,86,114,142,170],
  }
}

/* 轻量 QR 码生成器（Byte 模式 + 纠错等级 L）
 * 无第三方依赖，供教师端生成「班级邀请二维码」。
 * 输出 0/1 二维数组，由页面用 canvas 绘制。
 * 标准表见 qr_tables.js（自动生成自 ISO/IEC 18004 标准值）。
 */
const { RS_L, ALIGN } = __QRT

/* ---------- 通用 ---------- */
function utf8Bytes(str) {
  const out = []
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c < 0x80) out.push(c)
    else if (c < 0x800) {
      out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F))
    } else if (c >= 0xD800 && c <= 0xDBFF) {
      const c2 = str.charCodeAt(++i)
      const cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00)
      out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F))
    } else {
      out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F))
    }
  }
  return out
}

function dataCodewords(v) {
  const g = RS_L[v][1]
  let n = 0
  for (let i = 0; i < g.length; i++) n += g[i][0] * g[i][1]
  return n
}

/* ---------- GF(256) ---------- */
const EXP = new Array(512)
const LOG = new Array(256)
;(function () {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11D
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gmul(a, b) {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

function genPoly(n) {
  let poly = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gmul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

function rsEncode(data, ecLen) {
  const gen = genPoly(ecLen)
  const res = data.concat(new Array(ecLen).fill(0))
  for (let i = 0; i < data.length; i++) {
    const coef = res[i]
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef)
    }
  }
  return res.slice(data.length)
}

/* ---------- 位流 → 数据码字 ---------- */
function buildCodewords(text) {
  const bytes = utf8Bytes(text)
  let version = 0
  for (let v = 1; v <= 40; v++) {
    const cbits = v <= 9 ? 8 : 16
    if (dataCodewords(v) * 8 >= 4 + cbits + bytes.length * 8) { version = v; break }
  }
  if (!version) return null

  const capBits = dataCodewords(version) * 8
  const bits = []
  const push = function (val, len) {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  push(4, 4)
  push(bytes.length, version <= 9 ? 8 : 16)
  for (let i = 0; i < bytes.length; i++) push(bytes[i], 8)
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const data = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]
    data.push(b)
  }
  const total = dataCodewords(version)
  let pad = 0xEC
  while (data.length < total) {
    data.push(pad)
    pad = pad === 0xEC ? 0x11 : 0xEC
  }
  return { version: version, data: data }
}

/* ---------- 分块 + 交织 ---------- */
function interleave(version, data) {
  const ecLen = RS_L[version][0]
  const groups = RS_L[version][1]
  const blocks = []
  let off = 0
  for (let gi = 0; gi < groups.length; gi++) {
    const n = groups[gi][0]
    const dlen = groups[gi][1]
    for (let i = 0; i < n; i++) {
      const d = data.slice(off, off + dlen)
      off += dlen
      blocks.push({ d: d, e: rsEncode(d, ecLen) })
    }
  }
  const out = []
  let maxD = 0
  for (let i = 0; i < blocks.length; i++) maxD = Math.max(maxD, blocks[i].d.length)
  for (let i = 0; i < maxD; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < blocks[b].d.length) out.push(blocks[b].d[i])
    }
  }
  for (let i = 0; i < ecLen; i++) {
    for (let b = 0; b < blocks.length; b++) out.push(blocks[b].e[i])
  }
  return out
}

/* ---------- 格式 / 版本信息 ---------- */
const G15 = 0x537
const G15_MASK = 0x5412
const G18 = 0x1F25

function bchDigit(d) {
  let n = 0
  while (d !== 0) { n++; d >>>= 1 }
  return n
}
function bchTypeInfo(data) {
  let d = data << 10
  while (bchDigit(d) - bchDigit(G15) >= 0) d ^= (G15 << (bchDigit(d) - bchDigit(G15)))
  return ((data << 10) | d) ^ G15_MASK
}
function bchVersion(data) {
  let d = data << 12
  while (bchDigit(d) - bchDigit(G18) >= 0) d ^= (G18 << (bchDigit(d) - bchDigit(G18)))
  return (data << 12) | d
}

/* ---------- 掩码 ---------- */
const MASK_FN = [
  function (i, j) { return (i + j) % 2 === 0 },
  function (i, j) { return i % 2 === 0 },
  function (i, j) { return j % 3 === 0 },
  function (i, j) { return (i + j) % 3 === 0 },
  function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0 },
  function (i, j) { return (i * j) % 2 + (i * j) % 3 === 0 },
  function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 === 0 },
  function (i, j) { return ((i + j) % 2 + (i * j) % 3) % 2 === 0 }
]

/* ---------- 矩阵 ---------- */
function makeMatrix(version, codewords, mask) {
  const size = 17 + 4 * version
  const m = []
  for (let i = 0; i < size; i++) m.push(new Array(size).fill(null))

  function finder(r0, c0) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue
        const ring = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6))
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        m[rr][cc] = (ring || core) ? 1 : 0
      }
    }
  }
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0)

  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0
    m[i][6] = i % 2 === 0 ? 1 : 0
  }

  const pos = ALIGN[version] || []
  for (let a = 0; a < pos.length; a++) {
    for (let b = 0; b < pos.length; b++) {
      const r0 = pos[a], c0 = pos[b]
      if ((r0 === 6 && c0 === 6) || (r0 === 6 && c0 === size - 7) || (r0 === size - 7 && c0 === 6)) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc))
          m[r0 + dr][c0 + dc] = (ring === 2 || ring === 0) ? 1 : 0
        }
      }
    }
  }

  // 格式信息（L 级 = 01）
  const fmt = bchTypeInfo((1 << 3) | mask)
  for (let i = 0; i < 15; i++) {
    const bit = ((fmt >> i) & 1) === 1 ? 1 : 0
    if (i < 6) m[i][8] = bit
    else if (i < 8) m[i + 1][8] = bit
    else m[size - 15 + i][8] = bit
  }
  for (let i = 0; i < 15; i++) {
    const bit = ((fmt >> i) & 1) === 1 ? 1 : 0
    if (i < 8) m[8][size - i - 1] = bit
    else if (i < 9) m[8][15 - i - 1 + 1] = bit
    else m[8][15 - i - 1] = bit
  }
  m[size - 8][8] = 1

  if (version >= 7) {
    const vi = bchVersion(version)
    for (let i = 0; i < 18; i++) {
      const bit = ((vi >> i) & 1) === 1 ? 1 : 0
      m[Math.floor(i / 3)][i % 3 + size - 8 - 3] = bit
      m[i % 3 + size - 8 - 3][Math.floor(i / 3)] = bit
    }
  }

  // 数据区
  const maskFn = MASK_FN[mask]
  let inc = -1
  let row = size - 1
  let bitIndex = 7
  let byteIndex = 0
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (; ;) {
      for (let c = 0; c < 2; c++) {
        if (m[row][col - c] === null) {
          let dark = false
          if (byteIndex < codewords.length) {
            dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1
          }
          if (maskFn(row, col - c)) dark = !dark
          m[row][col - c] = dark ? 1 : 0
          bitIndex--
          if (bitIndex === -1) { byteIndex++; bitIndex = 7 }
        }
      }
      row += inc
      if (row < 0 || row >= size) {
        row -= inc
        inc = -inc
        break
      }
    }
  }
  return m
}

/* ---------- 惩罚评分（ISO 四条规则） ---------- */
function penalty(m) {
  const size = m.length
  let lost = 0

  // 规则1：行/列连续同色 >= 5
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < size; i++) {
      let run = 1
      for (let j = 1; j < size; j++) {
        const cur = pass === 0 ? m[i][j] : m[j][i]
        const prev = pass === 0 ? m[i][j - 1] : m[j - 1][i]
        if (cur === prev) {
          run++
        } else {
          if (run >= 5) lost += 3 + (run - 5)
          run = 1
        }
      }
      if (run >= 5) lost += 3 + (run - 5)
    }
  }

  // 规则2：2x2 同色块
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c]
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) lost += 3
    }
  }

  // 规则3：1:1:3:1:1 类定位图形
  const pat = [1, 0, 1, 1, 1, 0, 1]
  function matchAt(get, i) {
    for (let k = 0; k < 7; k++) if (get(i + k) !== pat[k]) return false
    return true
  }
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= size - 7; j++) {
      if (matchAt(function (k) { return m[i][k] }, j)) {
        let before = true, after = true
        for (let k = 1; k <= 4; k++) { if (j - k >= 0 && m[i][j - k] === 1) before = false }
        for (let k = 7; k < 11; k++) { if (j + k < size && m[i][j + k] === 1) after = false }
        if (before || after) lost += 40
      }
      if (matchAt(function (k) { return m[k][i] }, j)) {
        let before = true, after = true
        for (let k = 1; k <= 4; k++) { if (j - k >= 0 && m[j - k][i] === 1) before = false }
        for (let k = 7; k < 11; k++) { if (j + k < size && m[j + k][i] === 1) after = false }
        if (before || after) lost += 40
      }
    }
  }

  // 规则4：深色比例偏离 50%
  let dark = 0
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c] === 1) dark++
  const ratio = dark * 100 / (size * size)
  lost += Math.floor(Math.abs(ratio - 50) / 5) * 10

  return lost
}

/* ---------- 对外 ---------- */
function build(text, forceMask) {
  const built = buildCodewords(text)
  if (!built) return null
  const codes = interleave(built.version, built.data)

  if (typeof forceMask === 'number' && forceMask >= 0 && forceMask <= 7) {
    return { version: built.version, mask: forceMask, size: 17 + 4 * built.version, modules: makeMatrix(built.version, codes, forceMask) }
  }
  let best = null
  for (let mask = 0; mask < 8; mask++) {
    const m = makeMatrix(built.version, codes, mask)
    const p = penalty(m)
    if (!best || p < best.p) best = { p: p, mask: mask, m: m }
  }
  return { version: built.version, mask: best.mask, size: 17 + 4 * built.version, modules: best.m }
}

function capacityBytes() {
  const out = []
  for (let v = 1; v <= 40; v++) out.push(dataCodewords(v) - (v <= 9 ? 2 : 3))
  return out
}

WI.qr = { build: build, utf8Bytes: utf8Bytes, capacityBytes: capacityBytes }

})();
