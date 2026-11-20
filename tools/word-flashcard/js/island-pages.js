/* 页面控制器：从小程序 pages 目录下各页面 js 移植，逻辑保持一致。
 * 视图由 js/views.js 提供；this.setData 由 app.js 框架注入。
 * 与原版的差异（均为 H5 适配，不影响业务逻辑）：
 *  - 输入框 input 类回调 setData 加 {silent:true}，避免重渲染丢焦点；
 *  - teacher.showQR 改为浏览器 canvas 绘制（原为小程序 canvas 节点）；
 *  - class 增加 applyPaste（textarea 粘贴邀请码），扫码按钮不展示。 */
window.PAGES = (function () {
  const store = WI.store
  const quizUtil = WI.quiz
  const codeUtil = WI.code
  const audio = WI.audio
  const R = __DATA.ROOTS
  const GRAMMAR = __DATA.GRAMMAR
  const USAGE = __DATA.USAGE
  const STAGES = ['🥚', '🐣', '🐥', '🐤', '🦅']

  /* ---------- 首页 ---------- */
  const index = {
    data: { pet: {}, streak: 0, checkedToday: false, books: [], cur: null, today: { count: 0, xp: 0 }, stages: STAGES, doneCount: 0, totalUnits: 0, joined: false, inClass: '', myName: '' },
    onShow() {
      const s = store.get()
      const L = store.levels()
      let cur = null
      for (let i = 0; i < L.length; i++) {
        if (!store.get().progress[L[i].book + '|' + L[i].unit]) { cur = { idx: i, book: L[i].book, unit: L[i].unit, words: L[i].words.length }; break }
      }
      const doneCount = Object.keys(s.progress).length
      const t = s.checkins[store.todayStr()] || { count: 0, xp: 0 }
      const books = store.mainBooks().map(bk => {
        const us = store.VOCAB[bk].units
        const done = us.filter(u => s.progress[bk + '|' + u.title]).length
        return { name: bk, done: done, total: us.length }
      })
      this.setData({
        pet: s.pet, streak: s.streak || 0, checkedToday: t.count > 0, books: books, cur: cur, today: t,
        doneCount: doneCount, totalUnits: L.length,
        joined: !!s.profile.classCode,
        inClass: s.profile.className || '',
        myName: s.profile.name || ''
      })
    },
    sendCode() {
      const code = codeUtil.encodeCheckin()
      wx.setClipboardData({
        data: code,
        success: function () { wx.showToast({ title: '打卡码已复制，发给老师吧', icon: 'none' }) }
      })
    },
    goQuiz() {
      const c = this.data.cur
      if (!c) { wx.showToast({ title: '全部通关啦！', icon: 'success' }); return }
      wx.navigateTo({ url: '/pages/quiz/quiz?book=' + encodeURIComponent(c.book) + '&unit=' + encodeURIComponent(c.unit) })
    },
    goGrammar() { wx.navigateTo({ url: '/pages/grammar/grammar' }) },
    goUnits() { wx.navigateTo({ url: '/pages/units/units' }) },
    goUsage() { wx.navigateTo({ url: '/pages/usage/usage' }) },
    goWords() { wx.navigateTo({ url: '/pages/words/words' }) },
    goRoots() { wx.navigateTo({ url: '/pages/roots/roots' }) },
    /* 融合版新增：跳到独立的单词记忆卡页（同源，共享本机进度） */
    goFlashcard() { location.href = 'card.html' },
    rename() {
      const s = store.get()
      wx.showModal({
        title: '给宠物改名', editable: true, placeholderText: s.pet.name,
        success: (r) => { if (r.confirm && r.content) { store.setPetName(r.content.trim()); this.onShow() } }
      })
    }
  }

  /* ---------- 闯关答题 ---------- */
  const quiz = {
    data: { stages: STAGES, mode: 'learn', book: '', unit: '', learnWords: [], li: 0, learnFlipped: false, q: null, qi: 0, qs: [], correct: 0, picked: -1, spellVal: '', checked: false, ok: false, finished: null, nextName: '', nextIdx: 0, totalLv: 0 },
    onLoad(op) {
      const book = decodeURIComponent(op.book || '')
      const unit = decodeURIComponent(op.unit || '')
      const lvl = store.levels().find(l => l.book === book && l.unit === unit)
      if (!lvl) { wx.navigateBack(); return }
      const made = quizUtil.makeQuiz(lvl.words, quizUtil.allWords())
      this.lvl = lvl
      const all = store.levels()
      const ci = all.findIndex(l => l.book === book && l.unit === unit)
      this.nextLvl = (ci >= 0 && ci + 1 < all.length) ? all[ci + 1] : null
      this.setData({
        book: book, unit: unit,
        learnWords: made.words, qs: made.qs,
        li: 0, qi: 0, mode: 'learn', learnFlipped: false,
        nextName: this.nextLvl ? (this.nextLvl.book + ' · ' + this.nextLvl.unit) : '',
        nextIdx: ci + 2, totalLv: all.length
      })
      this.speakCur()
    },
    speakCur() {
      if (this.data.mode === 'learn' && this.data.learnWords[this.data.li]) {
        quizUtil.playWord(this.data.learnWords[this.data.li].w)
      } else if (this.data.mode === 'quiz' && this.data.q && this.data.q.type === 'sound') {
        quizUtil.playWord(this.data.q.word.w)
      }
    },
    learnSpeak() { this.speakCur() },
    /* 融合版：直接切 class，不触发整页重渲染，保证 3D 翻转动画可见 */
    learnFlip() {
      this.data.learnFlipped = !this.data.learnFlipped
      const el = document.querySelector('.learn-flip')
      if (el) el.classList.toggle('flipped', !!this.data.learnFlipped)
    },
    learnNav(e) {
      const d = parseInt(e.currentTarget.dataset.d)
      const ni = this.data.li + d
      if (ni < 0) return
      if (ni >= this.data.learnWords.length) { this.startQuiz(); return }
      this.setData({ li: ni, learnFlipped: false })
      setTimeout(() => this.speakCur(), 200)
    },
    skipLearn() { this.startQuiz() },
    startQuiz() {
      const qs = this.data.qs || []
      this.setData({ mode: 'quiz', qi: 0, correct: 0, learnFlipped: false, q: qs[0] || null, picked: -1, checked: false, ok: false, spellVal: '' })
      setTimeout(() => this.speakCur(), 300)
    },
    pick(e) {
      if (this.data.checked) return
      const q = this.data.q
      if (!q || !q.options) return
      const i = parseInt(e.currentTarget.dataset.i)
      const ok = q.options[i] === q.answer
      this.setData({ picked: i, checked: true, ok: ok })
      if (ok) { this.setData({ correct: this.data.correct + 1 }) }
      else { store.recordError(q.word.w, q.word.m, this.lvl.book + '|' + this.lvl.unit) }
      this.playResult(ok)
    },
    playResult(ok) {
      try { wx.vibrateShort({ type: ok ? 'light' : 'medium' }) } catch (e) { }
      if (!ok && this.data.q && this.data.q.word) quizUtil.playWord(this.data.q.word.w)
    },
    spellInput(e) { this.setData({ spellVal: e.detail.value }, { silent: true }) },
    spellCheck() {
      const q = this.data.q
      if (!q || this.data.checked) return
      const ok = this.data.spellVal.trim().toLowerCase() === String(q.answer).toLowerCase()
      this.setData({ checked: true, ok: ok })
      if (ok) this.setData({ correct: this.data.correct + 1 })
      else store.recordError(q.word.w, q.word.m, this.lvl.book + '|' + this.lvl.unit)
      this.playResult(ok)
    },
    soundReplay() { if (this.data.q) quizUtil.playWord(this.data.q.word.w) },
    replayWord() { const q = this.data.q; if (q && q.word) quizUtil.playWord(q.word.w) },
    next() {
      if (!this.data.checked) return
      const n = this.data.qi + 1
      if (n >= this.data.qs.length) {
        const total = this.data.qs.length
        const c = this.data.correct
        const first = !store.get().progress[this.lvl.book + '|' + this.lvl.unit]
        const xp = c * 10 + (c === total && first ? 30 : 0)
        store.recordQuiz(c, total, xp, this.lvl.book + '|' + this.lvl.unit)
        const s = store.get()
        this.setData({
          mode: 'done', finished: {
            correct: c, total: total, xp: xp, level: s.pet.level, stage: s.pet.stage,
            petName: s.pet.name
          }
        })
        return
      }
      this.setData({ qi: n, q: this.data.qs[n], picked: -1, checked: false, ok: false, spellVal: '' })
      setTimeout(() => this.speakCur(), 300)
    },
    back() { wx.navigateBack() },
    goNextUnit() {
      if (!this.nextLvl) { wx.showToast({ title: '全部单元通关啦 🎉', icon: 'success' }); return }
      wx.redirectTo({
        url: '/pages/quiz/quiz?book=' + encodeURIComponent(this.nextLvl.book) +
          '&unit=' + encodeURIComponent(this.nextLvl.unit)
      })
    },
    again() {
      const made = quizUtil.makeQuiz(this.lvl.words, quizUtil.allWords())
      this.setData({ mode: 'learn', learnWords: made.words, qs: made.qs, li: 0, learnFlipped: false, qi: 0, correct: 0, picked: -1, checked: false, spellVal: '', finished: null })
    },
    goUnits() { wx.redirectTo({ url: '/pages/units/units' }) }
  }

  /* ---------- 自由闯关 ---------- */
  const units = {
    data: { bookNames: [], bookIdx: 0, book: '', units: [], done: 0, total: 0, seqName: '', hasSeq: false },
    onLoad() {
      const names = store.mainBooks()
      this.setData({ bookNames: names })
      this.pickBook(this.defaultIdx(names))
    },
    onShow() { if (this.data.book) this.pickBook(this.data.bookIdx) },
    defaultIdx(names) {
      const n = store.nextLevel()
      if (!n) return 0
      const i = names.indexOf(n.level.book)
      return i < 0 ? 0 : i
    },
    pickBook(i) {
      const names = this.data.bookNames
      if (!names.length) return
      if (i < 0) i = 0
      if (i >= names.length) i = names.length - 1
      const bk = names[i]
      const p = store.get().progress
      const next = store.nextLevel()
      const nextKey = next ? (next.level.book + '|' + next.level.unit) : ''
      let done = 0
      const units = store.VOCAB[bk].units.map((u, k) => {
        const key = bk + '|' + u.title
        const pr = p[key]
        if (pr) done++
        return { key: key, no: k + 1, name: u.title, count: u.words.length, passed: !!pr, best: pr ? (pr.correct + '/' + pr.total) : '', isNext: key === nextKey }
      })
      this.setData({
        bookIdx: i, book: bk, units: units, done: done, total: units.length,
        seqName: next ? (next.level.book + ' · ' + next.level.unit) : '',
        hasSeq: !!next
      })
    },
    onPickBook(e) { this.pickBook(Number(e.detail.value)) },
    goUnit(e) {
      const key = e.currentTarget.dataset.k
      const i = key.indexOf('|')
      if (i < 0) return
      wx.navigateTo({ url: '/pages/quiz/quiz?book=' + encodeURIComponent(key.slice(0, i)) + '&unit=' + encodeURIComponent(key.slice(i + 1)) })
    },
    goSeq() {
      const n = store.nextLevel()
      if (!n) { wx.showToast({ title: '全部单元都通关啦 🎉', icon: 'success' }); return }
      wx.navigateTo({ url: '/pages/quiz/quiz?book=' + encodeURIComponent(n.level.book) + '&unit=' + encodeURIComponent(n.level.unit) })
    },
    goUsage() { wx.navigateTo({ url: '/pages/usage/usage' }) }
  }

  /* ---------- 语法闯关 ---------- */
  const grammar = {
    data: { mode: 'map', groups: [], passedCount: 0, total: GRAMMAR.length, lv: null, points: [], qs: [], qi: 0, correct: 0, picked: -1, checked: false, ok: false, passed: false, rate: 8 },
    onShow() { this.buildMap() },
    buildMap() {
      const groups = []
      GRAMMAR.forEach((lv, idx) => {
        const unlocked = idx === 0 || store.grammarPassed(GRAMMAR[idx - 1].id)
        const st = store.grammarState()[lv.id]
        const item = { id: lv.id, title: lv.title, icon: lv.icon, desc: lv.desc, idx: idx, unlocked: unlocked, passed: !!(st && st.pass), best: st ? (st.correct + '/' + st.total) : '' }
        let g = groups.find(x => x.name === lv.stage)
        if (!g) { g = { name: lv.stage, levels: [] }; groups.push(g) }
        g.levels.push(item)
      })
      const passedCount = GRAMMAR.filter(lv => store.grammarPassed(lv.id)).length
      this.setData({ groups: groups, passedCount: passedCount })
    },
    openLevel(e) {
      const id = e.currentTarget.dataset.id
      const lv = GRAMMAR.find(x => x.id === id)
      if (!lv) return
      const idx = GRAMMAR.indexOf(lv)
      if (idx > 0 && !store.grammarPassed(GRAMMAR[idx - 1].id)) {
        wx.showToast({ title: '先通关「' + GRAMMAR[idx - 1].title + '」哦', icon: 'none' })
        return
      }
      this.setData({ mode: 'learn', lv: { id: lv.id, title: lv.title, icon: lv.icon, desc: lv.desc }, points: lv.points })
    },
    startQuiz() {
      const lv = GRAMMAR.find(x => x.id === this.data.lv.id)
      this.setData({ mode: 'quiz', qs: lv.qs, qi: 0, correct: 0, picked: -1, checked: false, ok: false, passed: false })
    },
    pick(e) {
      if (this.data.checked) return
      const i = parseInt(e.currentTarget.dataset.i)
      const q = this.data.qs[this.data.qi]
      const ok = i === q.a
      this.setData({ picked: i, checked: true, ok: ok })
      if (ok) this.setData({ correct: this.data.correct + 1 })
    },
    next() {
      if (!this.data.checked) return
      const n = this.data.qi + 1
      if (n >= this.data.qs.length) {
        const pass = store.recordGrammar(this.data.lv.id, this.data.correct, this.data.qs.length)
        store.recordQuiz(this.data.correct, this.data.qs.length, this.data.correct * 5)
        this.setData({ mode: 'done', passed: pass })
        return
      }
      this.setData({ qi: n, picked: -1, checked: false, ok: false })
    },
    backToMap() { this.setData({ mode: 'map', lv: null, qs: [], qi: 0 }); this.buildMap() },
    nextLevel() {
      const idx = GRAMMAR.findIndex(x => x.id === this.data.lv.id)
      const nxt = GRAMMAR[idx + 1]
      if (!nxt) { this.backToMap(); return }
      this.setData({ mode: 'learn', lv: { id: nxt.id, title: nxt.title, icon: nxt.icon, desc: nxt.desc }, points: nxt.points, qs: [], qi: 0 })
    }
  }

  /* ---------- 词汇运用 ---------- */
  function makeFills(words) {
    const out = []
    words.forEach(wd => {
      const w = wd.w
      if (!/^[a-z]+$/.test(w) || w.length < 3) return
      const L = w.length
      const nb = L <= 4 ? 1 : (L <= 7 ? 2 : 3)
      const pos = []
      for (let i = 1; i <= nb; i++) {
        let p = Math.round(i * L / (nb + 1)) - 1
        if (p < 1) p = 1
        if (p > L - 1) p = L - 1
        while (pos.indexOf(p) >= 0) p = (p + 1) % L
        pos.push(p)
      }
      let disp = ''
      for (let i = 0; i < L; i++) disp += pos.indexOf(i) >= 0 ? '_' : w[i]
      out.push({ t: 'fill', q: disp + '（' + wd.m + '）', a: [w], exp: w + '：' + wd.m })
    })
    return out
  }

  const usage = {
    data: { view: 'books', books: [], units: [], group: null, qs: [], qi: 0, correct: 0, val: '', picked: -1, checked: false, ok: false, okIdx: -1, finished: false, total: 0 },
    onShow() { this.buildBooks() },
    buildBooks() {
      const gmap = {}
      USAGE.groups.forEach(g => { gmap[g.key] = g })
      let total = 0
      const books = store.books().map(bk => {
        let count = 0, done = 0
        store.VOCAB[bk].units.forEach(u => {
          const key = bk + '|' + u.title
          const g = gmap[key]
          count += (g ? g.qs.length : 0) + makeFills(u.words).length
          if (store.usageState()[key]) done++
        })
        total += count
        return { book: bk, count: count, done: done, units: store.VOCAB[bk].units.length, extra: !!store.VOCAB[bk].extra, tag: store.VOCAB[bk].extra ? '旧版·拓展' : '' }
      })
      const gsum = USAGE.groups.filter(g => !g.book)
      if (gsum.length) {
        const count = gsum.reduce((n, g) => n + g.qs.length, 0)
        total += count
        books.push({ book: '综合运用', count: count, done: gsum.filter(g => store.usageState()[g.key]).length, units: gsum.length })
      }
      this.setData({ view: 'books', books: books, units: [], group: null, qs: [], total: total })
    },
    openBook(e) {
      const bk = e.currentTarget.dataset.b
      const gmap = {}
      USAGE.groups.forEach(g => { gmap[g.key] = g })
      const units = []
      if (store.VOCAB[bk]) {
        store.VOCAB[bk].units.forEach(u => {
          const key = bk + '|' + u.title
          const g = gmap[key]
          const st = store.usageState()[key]
          units.push({ key: key, name: u.title, count: (g ? g.qs.length : 0) + makeFills(u.words).length, best: st ? (st.correct + '/' + st.total) : '' })
        })
      } else {
        USAGE.groups.filter(g => !g.book).forEach(g => {
          const st = store.usageState()[g.key]
          units.push({ key: g.key, name: '综合运用', count: g.qs.length, best: st ? (st.correct + '/' + st.total) : '' })
        })
      }
      this.setData({ view: 'units', units: units })
    },
    startGroup(e) {
      const key = e.currentTarget.dataset.k
      const g = USAGE.groups.find(x => x.key === key)
      let bank = g ? g.qs.slice() : []
      let name = g ? g.unit : ''
      if (key !== '综合运用') {
        const bi = key.indexOf('|')
        const bk = key.slice(0, bi), unit = key.slice(bi + 1)
        const words = store.unitWords(bk, unit)
        if (words) bank = bank.concat(makeFills(words))
        name = bk + ' ' + unit
      }
      if (!bank.length) return
      this.setData({ view: 'quiz', group: { key: key, name: name }, qs: bank, qi: 0, correct: 0, val: '', picked: -1, checked: false, ok: false, okIdx: -1, finished: false })
    },
    input(e) { this.setData({ val: e.detail.value }, { silent: true }) },
    submit() {
      if (this.data.checked || this.data.qs[this.data.qi].o) return
      const q = this.data.qs[this.data.qi]
      const val = (this.data.val || '').trim().toLowerCase().replace(/[.。!?！？]$/, '')
      const ok = q.a.map(x => x.toLowerCase()).indexOf(val) >= 0
      this.setData({ checked: true, ok: ok })
      if (ok) this.setData({ correct: this.data.correct + 1 })
    },
    pick(e) {
      if (this.data.checked) return
      const i = parseInt(e.currentTarget.dataset.i)
      const q = this.data.qs[this.data.qi]
      if (!q.o) return
      const al = q.a.map(x => x.toLowerCase())
      const ok = al.indexOf(q.o[i].toLowerCase()) >= 0
      const okIdx = q.o.findIndex(x => al.indexOf(x.toLowerCase()) >= 0)
      this.setData({ picked: i, checked: true, ok: ok, okIdx: okIdx })
      if (ok) this.setData({ correct: this.data.correct + 1 })
    },
    next() {
      if (!this.data.checked) return
      const n = this.data.qi + 1
      if (n >= this.data.qs.length) {
        store.recordUsage(this.data.group.key, this.data.correct, this.data.qs.length)
        store.recordQuiz(this.data.correct, this.data.qs.length, this.data.correct * 5)
        this.setData({ finished: true })
        return
      }
      this.setData({ qi: n, val: '', picked: -1, checked: false, ok: false, okIdx: -1 })
    },
    backToBooks() { this.buildBooks() },
    backToUnits() { this.setData({ view: 'units', qs: [], finished: false }) }
  }

  /* ---------- 词根 & 拼读 ---------- */
  const AFFIX_DEFS = [
    { key: 'prefix', name: '常用前缀', desc: '放在词首，改变词义：un- / re- / dis- …' },
    { key: 'suffix', name: '常用后缀', desc: '放在词尾，改变词性：-er / -tion / -ful …' },
    { key: 'root', name: '高频词根', desc: '词的核心含义：port / spect / form …' }
  ]
  const PHONIC_DEFS = [
    { key: 'vowel', name: '元音字母组合', desc: 'ai / ea / oo / ow …' },
    { key: 'magic', name: '魔法 e（开音节）', desc: 'a…e / i…e / o…e / u…e' },
    { key: 'consonant', name: '辅音字母组合', desc: 'sh / ch / th / ph …' },
    { key: 'cluster', name: '辅音连缀', desc: 'bl / tr / sp / sw …' }
  ]
  const AFFIX_LABEL = { prefix: '前缀', suffix: '后缀', root: '词根' }
  const PHONIC_LABEL = { vowel: '元音组合', magic: '魔法 e', consonant: '辅音组合', cluster: '辅音连缀' }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = a[i]; a[i] = a[j]; a[j] = t
    }
    return a
  }
  function lcs(a, b) {
    let best = 0
    let prev = new Array(b.length + 1).fill(0)
    for (let i = 1; i <= a.length; i++) {
      const cur = new Array(b.length + 1).fill(0)
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          cur[j] = prev[j - 1] + 1
          if (cur[j] > best) best = cur[j]
        }
      }
      prev = cur
    }
    return best
  }
  const KEY_WORDS = ['人', '不', '使', '无']
  function clash(a, b) { return KEY_WORDS.some(c => a.indexOf(c) >= 0 && b.indexOf(c) >= 0) }
  function wrongMeans(pool, correct, need) {
    const out = []
    shuffle(pool.slice()).forEach(x => {
      if (out.length >= need) return
      if (x === correct || out.indexOf(x) >= 0) return
      if (lcs(x, correct) >= 2 || clash(x, correct)) return
      if (out.some(o => lcs(o, x) >= 2 || clash(o, x))) return
      out.push(x)
    })
    return out
  }
  function ipaCore(s) { return String(s).replace(/[\/\s]/g, '') }
  function wrongIpa(pool, correct, need) {
    const c = ipaCore(correct)
    const out = []
    shuffle(pool.slice()).forEach(x => {
      if (out.length >= need) return
      const k = ipaCore(x)
      if (!k || k === c) return
      if (k.indexOf(c) >= 0 || c.indexOf(k) >= 0) return
      if (out.some(o => {
        const q = ipaCore(o)
        return q === k || q.indexOf(k) >= 0 || k.indexOf(q) >= 0
      })) return
      out.push(x)
    })
    return out
  }
  function broken(seg) {
    if (!seg) return ''
    return seg.map(s => s.h ? '「' + s.t + '」' : s.t).join(' + ')
  }

  const roots = {
    data: { tab: 'affix', groups: [], totalWords: 0, doneWords: 0, ruleCount: 0, affixRules: 0, phonicRules: 0, openCount: 0, quiz: { on: false, kind: 'affix', qs: [], qi: 0, q: null, correct: 0, finished: false } },
    onLoad() { this._open = {}; this.rebuild() },
    onShow() { this.rebuild() },
    setTab(e) {
      const t = e.currentTarget.dataset.t
      if (t === this.data.tab) return
      this.setData({ tab: t, quiz: { on: false, kind: t, qs: [], qi: 0, q: null, correct: 0, finished: false } })
      this.rebuild()
      wx.pageScrollTo({ scrollTop: 0 })
    },
    rebuild() {
      const tab = this.data.tab
      const src = tab === 'affix' ? R.affix : R.phonics
      const defs = tab === 'affix' ? AFFIX_DEFS : PHONIC_DEFS
      const open = this._open || (this._open = {})
      let tw = 0, dw = 0, oc = 0, rc = 0
      const groups = defs.map(d => {
        const items = (src[d.key] || []).map(it => {
          let done = 0
          const words = it.words.map(w => {
            const m = store.rootMastered(w.w)
            if (m) done++
            return { w: w.w, m: w.m, p: w.p || '', seg: w.seg, done: m }
          })
          tw += words.length
          dw += done
          rc++
          const isOpen = !!open[it.id]
          if (isOpen) oc++
          return {
            id: it.id, t: it.t, mean: it.mean || '', say: it.say || '', tip: it.tip || '',
            hint: it.hint || '', pair: it.pair || '', eg: it.eg || '',
            tts: it.tts || '',
            demo: it.demo || (words[0] && words[0].w) || '', demoP: it.demoP || '',
            n: words.length, words: words, mastered: done, open: isOpen
          }
        })
        return { key: d.key, name: d.name, desc: d.desc, items: items, done: items.reduce((s, x) => s + x.mastered, 0), total: items.reduce((s, x) => s + x.n, 0) }
      })
      this.setData({
        groups: groups, totalWords: tw, doneWords: dw, ruleCount: rc, openCount: oc,
        affixRules: R.affix.prefix.length + R.affix.suffix.length + R.affix.root.length,
        phonicRules: R.phonics.vowel.length + R.phonics.magic.length + R.phonics.consonant.length + R.phonics.cluster.length
      })
    },
    toggle(e) {
      const gi = parseInt(e.currentTarget.dataset.g)
      const ii = parseInt(e.currentTarget.dataset.i)
      const it = this.data.groups[gi].items[ii]
      const v = !it.open
      this._open[it.id] = v
      this.setData({ ['groups[' + gi + '].items[' + ii + '].open']: v, openCount: this.data.openCount + (v ? 1 : -1) })
    },
    expandAll() {
      let n = 0
      this.data.groups.forEach(g => g.items.forEach(it => { if (!it.open) { this._open[it.id] = true; n++ } }))
      this.rebuild()
      wx.showToast({ title: '已展开 ' + n + ' 条规则', icon: 'none' })
    },
    collapseAll() { this._open = {}; this.rebuild() },
    mark(e) {
      const ds = e.currentTarget.dataset
      const gi = parseInt(ds.g), ii = parseInt(ds.i), wi = parseInt(ds.j)
      const wd = this.data.groups[gi].items[ii].words[wi]
      const now = store.toggleRoot(wd.w)
      const delta = now ? 1 : -1
      const item = this.data.groups[gi].items[ii]
      const group = this.data.groups[gi]
      this.setData({
        ['groups[' + gi + '].items[' + ii + '].words[' + wi + '].done']: now,
        ['groups[' + gi + '].items[' + ii + '].mastered']: item.mastered + delta,
        ['groups[' + gi + '].done']: group.done + delta,
        doneWords: this.data.doneWords + delta
      })
      if (now) wx.vibrateShort({ type: 'light' })
    },
    speak(e) { audio.speak(e.currentTarget.dataset.w) },
    speakRule(e) {
      const ds = e.currentTarget.dataset
      const w = ds.w
      if (!w) return
      audio.speak(w)
      const label = ds.t || ''
      const ipa = ds.s || ''
      wx.showToast({ title: '读 ' + label + (ipa ? ' ' + ipa : ''), icon: 'none' })
    },
    buildAffixQuiz() {
      const rules = [], means = [], wordMeans = []
      Object.keys(R.affix).forEach(k => {
        R.affix[k].forEach(it => {
          rules.push({ id: it.id, t: it.t, say: it.say, mean: it.mean, hint: it.hint, demo: it.demo, demoP: it.demoP, eg: it.eg, tts: it.tts, label: AFFIX_LABEL[k], words: it.words })
          means.push(it.mean)
          it.words.forEach(w => wordMeans.push(w.m))
        })
      })
      const qs = []
      const order = shuffle(rules.slice())
      let step = 0
      while (qs.length < 10 && step < rules.length * 3) {
        const r = order[step % order.length]
        step++
        const kind = step % 3 === 0 ? 'guess' : (step % 3 === 2 ? 'inword' : 'tag')
        const wd = r.words[step % r.words.length]
        if (!wd) continue
        if (kind === 'tag') {
          const wrong = wrongMeans(means, r.mean, 3)
          if (wrong.length < 3) continue
          const opts = shuffle([r.mean].concat(wrong))
          qs.push({ kind: 'mean', tag: r.t, say: r.say, label: r.label, word: '', seg: null, speak: r.tts, demoP: r.demoP, ask: '这个' + r.label + '是什么意思？', opts: opts, ans: opts.indexOf(r.mean), picked: -1, checked: false, ok: false, exp: r.t + ' ' + r.say + ' 表示「' + r.mean + '」。' + r.hint })
        } else if (kind === 'inword') {
          const wrong = wrongMeans(means, r.mean, 3)
          if (wrong.length < 3) continue
          const opts = shuffle([r.mean].concat(wrong))
          qs.push({ kind: 'word', tag: r.t, say: r.say, label: r.label, word: wd.w, seg: wd.seg, wp: wd.p || '', speak: wd.w, mean: wd.m, ask: '高亮部分是什么意思？', opts: opts, ans: opts.indexOf(r.mean), picked: -1, checked: false, ok: false, exp: wd.w + ' 里的 ' + r.t + ' ' + r.say + ' 表示「' + r.mean + '」，所以 ' + wd.w + ' 是「' + wd.m + '」。' })
        } else {
          const wrong = wrongMeans(wordMeans, wd.m, 3)
          if (wrong.length < 3) continue
          const opts = shuffle([wd.m].concat(wrong))
          qs.push({ kind: 'guess', tag: r.t, say: r.say, label: r.label, word: wd.w, seg: wd.seg, wp: wd.p || '', speak: wd.w, mean: wd.m, ask: '根据构词猜一猜，这个词最可能是什么意思？', opts: opts, ans: opts.indexOf(wd.m), picked: -1, checked: false, ok: false, exp: '拆开看：' + broken(wd.seg) + '，其中 ' + r.t + ' 表示「' + r.mean + '」，合起来就是「' + wd.m + '」。' })
        }
      }
      return qs.slice(0, 10)
    },
    buildPhonicQuiz() {
      const rules = [], ipas = [], allWords = []
      const catOf = k => (k === 'vowel' || k === 'magic') ? 'v' : 'c'
      Object.keys(R.phonics).forEach(k => {
        const cat = catOf(k)
        R.phonics[k].forEach(it => {
          rules.push({ id: it.id, t: it.t, say: it.say, tip: it.tip, demo: it.demo, label: PHONIC_LABEL[k], words: it.words, cat: cat })
          ipas.push({ say: it.say, cat: cat })
          it.words.forEach(w => allWords.push({ w: w.w, m: w.m, seg: w.seg, say: it.say, cat: cat }))
        })
      })
      const qs = []
      const order = shuffle(rules.slice())
      let step = 0
      while (qs.length < 10 && step < rules.length * 3) {
        const r = order[step % order.length]
        step++
        const wd = r.words[step % r.words.length]
        if (!wd) continue
        if (step % 2 === 0) {
          let wrong = wrongIpa(ipas.filter(x => x.cat === r.cat).map(x => x.say), r.say, 3)
          if (wrong.length < 3) wrong = wrongIpa(ipas.map(x => x.say), r.say, 3)
          if (wrong.length < 3) continue
          const opts = shuffle([r.say].concat(wrong))
          qs.push({ kind: 'sound', tag: r.t, word: wd.w, seg: wd.seg, wp: wd.p || '', speak: wd.w, mean: wd.m, ask: '高亮部分读什么音？', opts: opts, ans: opts.indexOf(r.say), picked: -1, checked: false, ok: false, exp: wd.w + ' 中 ' + r.t + ' 读 ' + r.say + '。' + r.tip })
        } else {
          const c = ipaCore(r.say)
          const diffIpa = x => {
            const k = ipaCore(x.say)
            return k && k !== c && k.indexOf(c) < 0 && c.indexOf(k) < 0
          }
          let pool = allWords.filter(x => x.cat === r.cat && x.w !== wd.w && diffIpa(x))
          if (pool.length < 12) pool = allWords.filter(x => x.w !== wd.w && diffIpa(x))
          const picks = [{ w: wd.w, seg: wd.seg }]
          shuffle(pool).forEach(x => {
            if (picks.length >= 4) return
            if (picks.some(p => p.w === x.w)) return
            picks.push({ w: x.w, seg: x.seg })
          })
          if (picks.length < 4) continue
          shuffle(picks)
          const opts = picks.map(p => p.w)
          const optSegs = picks.map(p => p.seg)
          qs.push({ kind: 'pick', tag: r.t, word: wd.w, seg: wd.seg, wp: wd.p || '', speak: wd.w, mean: wd.m, ask: '哪个单词的高亮部分读这个音？', showIpa: r.say, opts: opts, optSegs: optSegs, ans: opts.indexOf(wd.w), picked: -1, checked: false, ok: false, exp: wd.w + ' 中 ' + r.t + ' 读 ' + r.say + '。' + r.tip })
        }
      }
      return qs.slice(0, 10)
    },
    startQuiz() {
      const tab = this.data.tab
      const qs = tab === 'affix' ? this.buildAffixQuiz() : this.buildPhonicQuiz()
      if (!qs.length) { wx.showToast({ title: '题库暂不可用', icon: 'none' }); return }
      this.setData({ quiz: { on: true, kind: tab, qs: qs, qi: 0, q: qs[0], correct: 0, finished: false } })
      wx.pageScrollTo({ scrollTop: 0 })
    },
    pick(e) {
      const z = this.data.quiz
      const q = z.q
      if (!q || q.checked) return
      const i = parseInt(e.currentTarget.dataset.i)
      const ok = i === q.ans
      this.setData({ 'quiz.q.picked': i, 'quiz.q.checked': true, 'quiz.q.ok': ok, 'quiz.correct': z.correct + (ok ? 1 : 0) })
      if (ok) wx.vibrateShort({ type: 'light' })
      else if (q.speak) audio.speak(q.speak)
    },
    speakQ() {
      const q = this.data.quiz.q
      if (q && q.speak) audio.speak(q.speak)
    },
    nextQ() {
      const z = this.data.quiz
      if (z.qi + 1 >= z.qs.length) {
        this.setData({ 'quiz.finished': true })
        store.recordQuiz(z.correct, z.qs.length, z.correct * 3)
        return
      }
      const n = z.qi + 1
      this.setData({ 'quiz.qi': n, 'quiz.q': z.qs[n] })
    },
    againQuiz() { this.startQuiz() },
    closeQuiz() {
      this.setData({ quiz: { on: false, kind: this.data.tab, qs: [], qi: 0, q: null, correct: 0, finished: false } })
      this.rebuild()
    }
  }

  /* ---------- 完整词表 ---------- */
  const words = {
    data: { bookNames: [], bookIdx: 0, book: '', bookWords: 0, isMain: true, totalWords: 0, units: [], grandTotal: 0 },
    onLoad() {
      const names = store.books()
      let grand = 0
      names.forEach(bk => { store.VOCAB[bk].units.forEach(u => { grand += u.words.length }) })
      this.setData({ bookNames: names, grandTotal: grand })
      this.pickBook(0)
    },
    pickBook(i) {
      const bk = this.data.bookNames[i]
      let n = 0
      const units = store.VOCAB[bk].units.map(u => {
        n += u.words.length
        return { title: u.title, count: u.words.length, open: false, words: u.words }
      })
      this.setData({ bookIdx: i, book: bk, units: units, bookWords: n, isMain: !store.VOCAB[bk].extra })
    },
    goUnit(e) {
      const title = e.currentTarget.dataset.u
      const bk = this.data.book
      wx.navigateTo({ url: '/pages/quiz/quiz?book=' + encodeURIComponent(bk) + '&unit=' + encodeURIComponent(title) })
    },
    onPickBook(e) { this.pickBook(Number(e.detail.value)) },
    toggleUnit(e) {
      const i = e.currentTarget.dataset.i
      this.setData({ ['units[' + i + '].open']: !this.data.units[i].open })
    },
    speakWord(e) {
      this._seq = (this._seq || 0) + 1
      audio.speak(e.currentTarget.dataset.w)
    },
    speakAll(e) {
      const ui = e.currentTarget.dataset.i
      const ws = this.data.units[ui].words
      const token = (this._seq = (this._seq || 0) + 1)
      let k = 0
      const next = () => {
        if (this._seq !== token || k >= ws.length) return
        audio.speak(ws[k].w)
        k++
        setTimeout(next, 2200)
      }
      next()
    }
  }

  /* ---------- 复习 ---------- */
  const review = {
    data: { items: [], qi: -1, q: null, checked: false, ok: false, picked: -1, spellVal: '', done: null, hasAny: false },
    goHome() { wx.switchTab({ url: '/pages/index/index' }) },
    onShow() {
      const rs = store.reviewWords()
      this.rs = rs
      const qs = rs.map(r => {
        const w = r.word
        if (Math.random() < 0.5) {
          const ds = quizUtil.shuffle(quizUtil.allWords().filter(x => x.w !== w.w)).slice(0, 3).map(x => x.m)
          const opts = quizUtil.shuffle(ds.concat([w.m]))
          return { type: 'mc', word: w, options: opts, answer: w.m, from: r.from }
        }
        return { type: 'spell', word: w, answer: w.w, hint: w.m, from: r.from }
      })
      this.setData({ items: rs, qs: qs, hasAny: qs.length > 0, qi: -1, done: null })
    },
    start() { this.setData({ qi: 0, q: this.data.qs[0], checked: false, picked: -1, spellVal: '' }); setTimeout(() => quizUtil.playWord(this.data.q.word.w), 250) },
    replay() { if (this.data.q) quizUtil.playWord(this.data.q.word.w) },
    pick(e) {
      if (this.data.checked) return
      const i = parseInt(e.currentTarget.dataset.i)
      const ok = this.data.q.options[i] === this.data.q.answer
      this.setData({ picked: i, checked: true, ok: ok })
      this.after(ok)
    },
    spellInput(e) { this.setData({ spellVal: e.detail.value }, { silent: true }) },
    spellCheck() {
      const ok = this.data.spellVal.trim().toLowerCase() === this.data.q.answer.toLowerCase()
      this.setData({ checked: true, ok: ok })
      this.after(ok)
    },
    after(ok) {
      const w = this.data.q.word
      if (ok) store.clearError(w.w)
      else store.recordError(w.w, w.m, '复习')
    },
    next() {
      if (!this.data.checked) return
      const n = this.data.qi + 1
      if (n >= this.data.qs.length) { this.setData({ done: true, qi: -1 }); return }
      this.setData({ qi: n, q: this.data.qs[n], checked: false, picked: -1, ok: false, spellVal: '' })
      setTimeout(() => quizUtil.playWord(this.data.q.word.w), 250)
    }
  }

  /* ---------- 我的 ---------- */
  const me = {
    data: { stats: {}, errorCount: 0, days: [], stage: 1, stages: STAGES },
    onShow() {
      const s = store.get()
      const acc = s.stats.total ? Math.round(s.stats.correct * 100 / s.stats.total) : 0
      const days = []
      const d = new Date()
      for (let i = 6; i >= 0; i--) {
        const dd = new Date(); dd.setDate(d.getDate() - i)
        const k = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0')
        days.push({ checked: !!(s.checkins[k] && s.checkins[k].count > 0), label: (dd.getMonth() + 1) + '/' + dd.getDate() })
      }
      this.setData({
        stats: { level: s.pet.level, xp: s.pet.xp, acc: acc, total: s.stats.total, streak: s.streak || 0, done: Object.keys(s.progress).length },
        errorCount: Object.keys(s.errors).length,
        days: days,
        stage: s.pet.stage
      })
    },
    myCode() {
      const code = codeUtil.encodeCheckin()
      wx.setClipboardData({
        data: code,
        success: () => wx.showToast({ title: '打卡码已复制，发给老师吧', icon: 'none' })
      })
    },
    clearData() {
      wx.showModal({
        title: '重置学习数据？', content: '将清除全部进度、打卡与错题（宠物保留）',
        success: (r) => {
          if (r.confirm) {
            const s = store.get()
            const pet = s.pet, profile = s.profile
            wx.clearStorageSync()
            const ns = store.get()
            ns.pet = pet; ns.profile = profile
            store.save()
            this.onShow()
          }
        }
      })
    },
    testSound() {
      audio.speak('apple')
      setTimeout(() => {
        const st = audio.status()
        wx.showModal({
          title: st.failCount ? '发音异常' : '发音已触发',
          content: st.failCount
            ? '播放失败 ' + st.failCount + ' 次\n原因：' + (st.lastError || '未知') + '\n\n请检查网络，以及设备音量是否开启。'
            : '已尝试播放 apple。\n如果没有声音，请检查：\n1. 设备音量\n2. 是否连接了蓝牙耳机\n3. 首次播放需点击页面任意位置以启用声音',
          showCancel: false
        })
      }, 1200)
    },
    about() {
      wx.showModal({ title: '单词精灵岛', content: '收录人教版新教材小学三年级至初中九年级共 14 册（3657 词），另附旧版教材 12 册作为拓展词库。数据保存在本机浏览器中。', showCancel: false })
    }
  }

  /* ---------- 班级 ---------- */
  const klass = {
    data: { profile: {}, name: '', code: '', className: '', joined: false, isTeacher: false, pending: null, roster: [], teacherName: '', showManual: false, inviteText: '' },
    onShow() {
      const s = store.get()
      const p = s.profile
      this.setData({
        profile: p, name: p.name, code: p.classCode, className: p.className,
        joined: !!p.classCode, isTeacher: p.isTeacher, roster: p.roster || [],
        teacherName: '', pending: null
      })
    },
    applyInvite(text) {
      const inv = codeUtil.decodeInvite(text)
      if (!inv) { wx.showToast({ title: '这不是班级邀请码', icon: 'none' }); return }
      this.setData({
        pending: inv, roster: inv.roster, code: inv.classCode, className: inv.className,
        teacherName: inv.teacherName, showManual: false, name: '', inviteText: ''
      })
      wx.showToast({ title: '请点自己的名字', icon: 'none' })
    },
    pickName(e) {
      const name = e.currentTarget.dataset.n
      const p = this.data.pending
      if (!name) return
      if (!p) { this.setData({ name: name }); return }
      store.joinClass(name, p.classCode, p.className, p.roster)
      this.setData({ joined: true, name: name, roster: p.roster, pending: null })
      wx.showToast({ title: '已加入 ' + name, icon: 'success' })
      this.onShow()
    },
    changeName(e) {
      const name = e.currentTarget.dataset.n
      if (!name) return
      const s = store.get()
      store.joinClass(name, s.profile.classCode, s.profile.className, s.profile.roster)
      wx.showToast({ title: '已切换为 ' + name, icon: 'success' })
      this.onShow()
    },
    pasteInvite() {
      const self = this
      wx.getClipboardData({
        success: function (r) {
          const text = (r && r.data) || ''
          if (text.indexOf('PETC2|') !== 0) { wx.showToast({ title: '剪贴板里没有班级邀请码，可把邀请码粘贴到下方输入框', icon: 'none' }); return }
          self.applyInvite(text)
        },
        fail: function () { wx.showToast({ title: '无法读取剪贴板，请粘贴到下方输入框', icon: 'none' }) }
      })
    },
    onInviteText(e) { this.setData({ inviteText: e.detail.value }, { silent: true }) },
    applyPasted() {
      const t = String(this.data.inviteText || '').trim()
      if (!t) { wx.showToast({ title: '请先粘贴邀请码', icon: 'none' }); return }
      this.applyInvite(t)
    },
    onName(e) { this.setData({ name: e.detail.value }, { silent: true }) },
    onCode(e) { this.setData({ code: e.detail.value }, { silent: true }) },
    onClass(e) { this.setData({ className: e.detail.value }, { silent: true }) },
    toggleManual() { this.setData({ showManual: !this.data.showManual }) },
    join() {
      const name = String(this.data.name || '').trim()
      const code = String(this.data.code || '').trim()
      if (!name) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return }
      if (!/^\d{6}$/.test(code)) { wx.showToast({ title: '班级码为 6 位数字', icon: 'none' }); return }
      store.joinClass(name, code, this.data.className.trim(), this.data.roster)
      wx.showToast({ title: '已加入班级', icon: 'success' })
      this.onShow()
    },
    leave() {
      const self = this
      wx.showModal({
        title: '退出班级？',
        content: '退出后老师将看不到你的打卡，学习进度不受影响',
        success: function (r) {
          if (r.confirm) {
            store.joinClass(self.data.profile.name || '', '', '')
            self.setData({ pending: null })
            self.onShow()
          }
        }
      })
    },
    goTeacher() { wx.navigateTo({ url: '/pages/teacher/teacher' }) }
  }

  /* ---------- 教师端 ---------- */
  const TKEY = 'engpet_teacher_v2'
  function emptyTd() { return { v: 1, teacherName: '', className: '', classCode: '', roster: [], students: [] } }
  function loadTd() {
    let td = null
    try { td = wx.getStorageSync(TKEY) } catch (e) { }
    if (!td || !td.v) {
      let old = null
      try { old = wx.getStorageSync('engpet_teacher_data') } catch (e) { }
      td = emptyTd()
      if (old && old.classCode) { td.classCode = old.classCode; td.students = old.students || [] }
    }
    return td
  }
  function newCode() { return String(Math.floor(100000 + Math.random() * 900000)) }
  function parseRoster(text) {
    const parts = String(text || '').split(/[\n\r,，、;；\t]+/)
    const out = []
    parts.forEach(function (x) {
      const n = codeUtil.cleanField(x, 12)
      if (n && out.indexOf(n) < 0) out.push(n)
    })
    return out
  }

  const teacher = {
    data: { mode: 'setup', td: emptyTd(), roster: [], students: [], qrImg: '', qrTip: '', rosterEdit: false, rosterText: '', pasteVal: '', tName: '', tClass: '', weekLabels: [] },
    onShow() {
      const td = loadTd()
      this.td = td
      const labels = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        labels.push((d.getMonth() + 1) + '/' + d.getDate())
      }
      this.setData({
        mode: td.teacherName && td.classCode ? 'main' : 'setup',
        td: td, roster: td.roster || [], students: td.students || [],
        tName: td.teacherName || '', tClass: td.className || '',
        weekLabels: labels, rosterText: (td.roster || []).join('\n')
      })
    },
    onTName(e) { this.setData({ tName: e.detail.value }, { silent: true }) },
    onTClass(e) { this.setData({ tClass: e.detail.value }, { silent: true }) },
    createClass() {
      const name = String(this.data.tName || '').trim()
      const cls = String(this.data.tClass || '').trim()
      if (!name) { wx.showToast({ title: '请填写教师姓名', icon: 'none' }); return }
      if (!cls) { wx.showToast({ title: '请填写班级名称', icon: 'none' }); return }
      const td = this.td || emptyTd()
      td.teacherName = name
      td.className = cls
      if (!td.classCode) td.classCode = newCode()
      this.td = td
      this.persist()
      this.setData({ mode: 'main', td: td })
      wx.showToast({ title: '班级已创建', icon: 'success' })
    },
    editSetup() { this.setData({ mode: 'setup', tName: this.td.teacherName, tClass: this.td.className }) },
    persist() { try { wx.setStorageSync(TKEY, this.td) } catch (e) { } },
    copyCode() {
      wx.setClipboardData({
        data: this.td.classCode,
        success: function () { wx.showToast({ title: '班级码已复制', icon: 'none' }) }
      })
    },
    copyInvite() {
      if (!(this.td.roster || []).length) {
        wx.showToast({ title: '请先设置学生名单', icon: 'none' })
        this.setData({ rosterEdit: true })
        return
      }
      const text = codeUtil.encodeInvite(this.td)
      wx.setClipboardData({
        data: text,
        success: function () {
          wx.showModal({
            title: '邀请码已复制',
            content: '直接粘贴发到班级群即可。学生打开网页 →「班级」→ 粘贴邀请码加入，就能看到名单并点自己的名字。',
            showCancel: false
          })
        }
      })
    },
    toggleRosterEdit() {
      const open = !this.data.rosterEdit
      this.setData({ rosterEdit: open, rosterText: open ? (this.td.roster || []).join('\n') : this.data.rosterText })
    },
    onRosterText(e) { this.setData({ rosterText: e.detail.value }, { silent: true }) },
    saveRoster() {
      const list = parseRoster(this.data.rosterText)
      if (!list.length) { wx.showToast({ title: '名单不能为空', icon: 'none' }); return }
      this.td.roster = list
      this.persist()
      this.setData({ roster: list, rosterEdit: false, rosterText: list.join('\n'), qrImg: '' })
      wx.showToast({ title: '已保存 ' + list.length + ' 人', icon: 'success' })
    },
    showQR() {
      if (!this.td.roster || !this.td.roster.length) {
        wx.showToast({ title: '请先设置学生名单', icon: 'none' })
        this.setData({ rosterEdit: true })
        return
      }
      const text = codeUtil.encodeInvite(this.td)
      const qr = WI.qr.build(text)
      if (!qr) {
        this.setData({ qrTip: '名单太长（' + text.length + ' 字符），请分批或精简姓名' })
        wx.showToast({ title: '名单过长，二维码放不下', icon: 'none' })
        return
      }
      this.setData({ qrImg: '', qrTip: '', qrShow: true }, { silent: true })
      const self = this
      setTimeout(function () {
        const canvas = document.getElementById('qr-canvas')
        if (!canvas) { self.setData({ qrTip: '当前环境不支持生成二维码，请改用「班级码 + 姓名」加入' }); return }
        const box = 300
        const dpr = 2
        canvas.width = box * dpr
        canvas.height = box * dpr
        canvas.style.width = box + 'px'
        canvas.style.height = box + 'px'
        const ctx = canvas.getContext('2d')
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, box, box)
        const n = qr.size
        const pad = 14
        const cell = (box - pad * 2) / n
        ctx.fillStyle = '#000000'
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (qr.modules[r][c]) ctx.fillRect(pad + c * cell, pad + r * cell, Math.ceil(cell), Math.ceil(cell))
          }
        }
        self.setData({ qrImg: canvas.toDataURL('image/png'), qrTip: '' })
      }, 80)
    },
    saveQR() {
      if (!this.data.qrImg) return
      const a = document.createElement('a')
      a.href = this.data.qrImg
      a.download = 'class-invite-qr.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      wx.showToast({ title: '二维码图片已下载', icon: 'success' })
    },
    onPaste(e) { this.setData({ pasteVal: (e && e.detail && e.detail.value) || '' }, { silent: true }) },
    importStudent() {
      const raw = String(this.data.pasteVal || '').trim()
      if (!raw) { wx.showToast({ title: '请先粘贴打卡码', icon: 'none' }); return }
      const codes = raw.split(/\s+/).filter(function (x) { return x.indexOf('PET1:') === 0 })
      const list = codes.length ? codes : [raw]
      let added = 0
      const self = this
      list.forEach(function (c) {
        const d = codeUtil.decodeCheckin(c)
        if (d && d.n) { self.upsertStudent(d); added++ }
      })
      if (!added) { wx.showToast({ title: '打卡码无效', icon: 'none' }); return }
      this.persist()
      this.setData({ students: this.td.students, pasteVal: '' })
      wx.showToast({ title: '已导入 ' + added + ' 人', icon: 'success' })
    },
    upsertStudent(data) {
      const st = this.td.students || []
      const days = data.days || []
      const cells = days.map(function (d) { return (d && d.c > 0) ? 1 : 0 }).reverse()
      const tot = days.reduce(function (a, d) { return a + (d ? (d.t || 0) : 0) }, 0)
      const cor = days.reduce(function (a, d) { return a + (d ? (d.cr || 0) : 0) }, 0)
      const rec = {
        n: data.n, cc: data.cc || '', cn: data.cn || '', lv: data.lv || 1,
        cells: cells, today: !!(days[0] && days[0].c > 0),
        weekDays: cells.reduce(function (a, x) { return a + x }, 0),
        acc: tot ? Math.round(cor * 100 / tot) : (data.acc || 0),
        units: data.u || 0, totalUnits: data.tu || 0, lastUnit: data.l || '',
        streak: data.st || 0, at: data.at || store.todayStr()
      }
      let idx = -1
      for (let i = 0; i < st.length; i++) {
        if (st[i].n === data.n && (!data.cc || st[i].cc === data.cc)) { idx = i; break }
      }
      if (idx >= 0) st[idx] = rec; else st.push(rec)
      this.td.students = st
    },
    clearAll() {
      const self = this
      wx.showModal({
        title: '清空学生记录？', content: '将删除已导入的全部学生打卡数据（名单保留）',
        success: function (r) {
          if (r.confirm) { self.td.students = []; self.persist(); self.setData({ students: [] }) }
        }
      })
    },
    exportCsv() {
      const st = this.td.students || []
      if (!st.length) { wx.showToast({ title: '还没有学生数据', icon: 'none' }); return }
      const today = store.todayStr()
      const className = this.td.className || ''
      const head = ['姓名', '班级', '今日打卡', '近7天打卡天数', '正确率(%)', '已通关单元', '总单元数', '最近通关单元', '连续打卡', '宠物等级', '数据日期']
      const rows = [head.join(',')]
      st.slice().sort(function (a, b) { return (b.units || 0) - (a.units || 0) }).forEach(function (s) {
        rows.push([s.n, s.cn || className, s.today ? '是' : '否', s.weekDays || 0, s.acc || 0, s.units || 0, s.totalUnits || 0, s.lastUnit || '', s.streak || 0, s.lv || 1, s.at || today].join(','))
      })
      const csv = rows.join('\n')
      wx.setClipboardData({
        data: csv,
        success: function () {
          wx.showModal({
            title: '已复制 ' + st.length + ' 人数据',
            content: '打开聊天窗口或 WPS/Excel 粘贴即可生成表格。\n\n前两行预览：\n' + rows.slice(0, 2).join('\n'),
            showCancel: false
          })
        }
      })
    },
    goStudent() { wx.switchTab({ url: '/pages/index/index' }) }
  }

  return {
    index: index, quiz: quiz, units: units, grammar: grammar, usage: usage,
    roots: roots, words: words, review: review, me: me, class: klass, teacher: teacher
  }
})()
