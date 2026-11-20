/* 视图层：每页一个 render(data) -> HTML 字符串。样式类与小程序版一致（card/btn/opt/...）。 */
window.VIEWS = (function () {
  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  }
  function prog(pct) {
    pct = Math.max(0, Math.min(100, pct || 0))
    return '<div class="progress"><div style="width:' + pct + '%"></div></div>'
  }
  /* 单词按构词切分高亮显示 */
  function segWord(seg, w) {
    if (seg && seg.length) {
      return seg.map(s => '<span class="' + (s.h ? 'hl' : '') + '">' + h(s.t) + '</span>').join('')
    }
    return h(w)
  }
  function btn(act, label, cls, extra) {
    return '<button class="btn ' + (cls || '') + '" data-act="' + act + '"' + (extra || '') + '>' + label + '</button>'
  }
  /* 融合版：新增部分统一使用简洁线性 SVG，不新增 emoji */
  const SVG = (p, sz) => '<svg viewBox="0 0 24 24" width="' + (sz || 18) + '" height="' + (sz || 18) +
    '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'
  const ICO = {
    cards: SVG('<rect x="3" y="5" width="13" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/>'),
    volume: SVG('<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>'),
    home: SVG('<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>', 15),
    back: SVG('<path d="M15 5 8 12l7 7"/>'),
    refresh: SVG('<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/><path d="m17 4 3 3-3 3"/>', 15),
    users: SVG('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20a6 6 0 0 1 12 0M15 20a5 5 0 0 1 6-4"/>', 15),
    user: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 15)
  }
  const TAGS = {
    index: ICO.home + ' 闯关',
    review: ICO.refresh + ' 复习',
    class: ICO.users + ' 班级',
    me: ICO.user + ' 我的'
  }
  const TABS = ['index', 'review', 'class', 'me']

  function bookSelect(names, cur, act) {
    return '<select class="select" data-act="' + act + '">' +
      names.map((n, i) => '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + h(n) + '</option>').join('') +
      '</select>'
  }

  /* ================= 首页 ================= */
  function index(d) {
    let out = ''
    out += '<div class="card" style="text-align:center">'
    out += '<div class="pet">' + h(d.stages[d.pet.stage] || '🐣') + '</div>'
    out += '<div class="h2 link" data-act="rename">' + h(d.pet.name) + ' Lv.' + d.pet.level + ' ✏️</div>'
    out += '<div style="margin:8px 30px">' + prog(d.pet.xp) + '</div>'
    out += '<div class="muted">经验 ' + d.pet.xp + '/' + (d.pet.level * 100) + ' · 连续打卡 ' + h(d.streak) + ' 天</div>'
    out += '<div style="margin-top:6px"><span class="tag">今日已练 ' + d.today.count + ' 关</span><span class="tag">今日经验 ' + d.today.xp + '</span>' + (d.checkedToday ? '<span class="tag">✅ 已打卡</span>' : '') + '</div>'
    if (d.joined) out += '<div class="muted" style="margin-top:5px">' + h(d.inClass) + ' · ' + h(d.myName) + '</div>'
    if (d.joined && d.checkedToday) out += '<div style="margin-top:7px">' + btn('sendCode', '📤 发送今日打卡码给老师', 'btn-ghost') + '</div>'
    out += '</div>'

    if (d.cur) {
      out += '<div class="card"><div class="h2">当前关卡</div>'
      out += '<div style="margin:6px 0"><span class="tag">' + h(d.cur.book) + '</span><span class="tag">' + h(d.cur.unit) + '</span><span class="muted">第 ' + (d.cur.idx + 1) + '/' + d.totalUnits + ' 个单元</span></div>'
      out += prog(d.doneCount * 100 / d.totalUnits)
      out += '<div class="muted" style="margin-top:5px">已通关 ' + d.doneCount + ' 个单元，还剩 ' + (d.totalUnits - d.doneCount) + ' 个</div>'
      out += '<div style="margin-top:12px">' + btn('goQuiz', '开始闯关（本单元全部 ' + d.cur.words + ' 词）') + '</div>'
      out += '<div class="muted" style="margin-top:5px">按顺序往下闯，或点「自由闯关」任选单元</div>'
      out += '<div style="margin-top:8px">' + btn('goUnits', '🗺 自由闯关（任选单元）', 'btn-ghost') + '</div>'
      out += '<div style="margin-top:8px">' + btn('goUsage', '✍️ 词汇运用（变形与填空）', 'btn-ghost') + '</div>'
      out += '<div style="margin-top:8px">' + btn('goRoots', '🧩 词根 & 拼读（归类记忆）', 'btn-ghost') + '</div>'
      out += '<div style="margin-top:8px">' + btn('goWords', '📖 完整词表（全部词汇）', 'btn-ghost') + '</div>'
      out += '<div style="margin-top:8px">' + btn('goGrammar', '🏰 语法闯关（初中语法框架）', 'btn-ghost') + '</div>'
      out += '</div>'
    } else {
      out += '<div class="card" style="text-align:center"><div class="h2">🎉 恭喜！全部单元通关！</div></div>'
    }

    /* 融合版新增：单词记忆卡入口（3D 翻卡 / 生词本 / 听写 / 关系图） */
    out += '<div class="card flash-entry">'
    out += '<div class="row"><span class="flash-entry-ico">' + ICO.cards + '</span><div class="grow"><div class="h2">单词记忆卡</div>'
    out += '<div class="muted">3D 翻卡 · 音标与拼读分段 · 例句与记忆窍门</div></div></div>'
    out += '<div class="muted" style="margin:8px 0 2px">生词本、隔 3 张复现、听写三圆点、串起来看关系图，进度保存在本机浏览器。</div>'
    out += '<div style="margin-top:10px">' + btn('goFlashcard', '进入记忆卡 →', 'btn-flash') + '</div>'
    out += '</div>'

    out += '<div class="card"><div class="h2" style="margin-bottom:6px">我的进度</div>'
    out += d.books.map(b =>
      '<div class="row" style="margin:5px 0"><div class="muted" style="width:88px">' + h(b.name) + '</div><div class="grow">' + prog(b.done * 100 / b.total) + '</div><div class="muted" style="width:40px;text-align:right">' + b.done + '/' + b.total + '</div></div>'
    ).join('')
    out += '</div>'
    return out
  }

  /* ================= 闯关答题 ================= */
  function quiz(d) {
    if (d.mode === 'learn') {
      /* 融合版：学词环节改为 3D 翻卡，正面英文+音标+拼读分段，背面释义+例句+程序化记忆窍门。
         学词顺序、跳过、开始答题等原有流程完全不变。 */
      const w = d.learnWords[d.li]
      if (!w) return '<div class="card">加载中…</div>'
      const F = window.FLASH
      const lw = String(w.w || '').toLowerCase()
      const fi = (F && F.byWord && F.byWord[lw] !== undefined) ? F.byWord[lw] : -1
      const segs = (fi >= 0 && F.seg[fi] && F.seg[fi].length) ? F.seg[fi] : [w.w]
      const ex = (fi >= 0 && F.ex[fi]) ? (F.ex[fi][0] || '') : ''
      const hid = (fi >= 0 && F.hid[fi]) ? F.hid[fi] : []
      const fam = (fi >= 0 && F.fam[fi]) ? F.fam[fi] : []
      const con = (fi >= 0 && F.con[fi]) ? F.con[fi] : []
      const shape = (fi >= 0 && F.shape[fi]) ? F.shape[fi] : ''
      const hiddenSet = {}
      hid.forEach(x => { hiddenSet[x[0]] = 1 })
      const segHtml = segs.map((s, i) =>
        '<span class="learn-seg seg-' + (i % 6) + (hiddenSet[String(s).toLowerCase()] ? ' seg-hidden' : '') + '">' + h(s) + '</span>'
      ).join('')
      const tips = []
      if (hid.length) tips.push('<div>藏词：<b>' + h(hid[0][0]) + '</b> 也是课本里的词，分开记更快</div>')
      if (fam.length) tips.push('<div>拼读家族：<b>' + h(fam[0]) + '</b> 组合，和同组合的词一起读</div>')
      if (con.length) tips.push('<div>别搞混：' + h(con[0][0]) + ' 只差一个字母</div>')
      if (shape) tips.push('<div>形状窍门：' + h(shape) + '</div>')
      if (!tips.length) tips.push('<div>按拼读分段，一段一段读，再合起来记</div>')

      let out = '<div class="card learn-card" style="text-align:center;padding:18px 14px">'
      out += '<div class="muted">' + h(d.book) + ' · ' + h(d.unit) + ' · 学词 ' + (d.li + 1) + '/' + d.learnWords.length + '</div>'
      out += '<div class="learn-flip' + (d.learnFlipped ? ' flipped' : '') + '" data-act="learnFlip" role="button" tabindex="0" aria-label="点击翻转单词卡">'
      out += '<div class="learn-inner">'
      out += '<div class="learn-face learn-front">'
      out += '<div class="learn-word">' + segHtml + '</div>'
      if (w.ph) out += '<div class="learn-ph">/ ' + h(w.ph) + ' /</div>'
      if (w.pos) out += '<div><span class="tag">' + h(w.pos) + '</span></div>'
      out += '<button class="learn-speak" data-act="learnSpeak">' + ICO.volume + ' 点击朗读（美音）</button>'
      out += '<div class="learn-hint">点卡片翻到背面 · 看释义、例句与记忆窍门</div>'
      out += '</div>'
      out += '<div class="learn-face learn-back">'
      out += '<div class="learn-back-w">' + h(w.w) + '</div>'
      out += '<div class="learn-meaning">' + h(w.m) + '</div>'
      if (ex) out += '<div class="learn-example"><span class="tag">例句</span>' + h(ex) + '</div>'
      out += '<div class="learn-tips">' + tips.join('') + '</div>'
      out += '</div>'
      out += '</div></div>'
      out += '<div class="row" style="margin-top:16px">'
      out += '<button class="btn btn-ghost grow" data-act="learnNav" data-d="-1"' + (d.li === 0 ? ' disabled' : '') + '>← 上一个</button>'
      out += '<button class="btn grow" data-act="learnNav" data-d="1">' + (d.li === d.learnWords.length - 1 ? '开始答题 ✓' : '下一个 →') + '</button>'
      out += '</div>'
      out += '<div class="muted" style="margin-top:10px" data-act="skipLearn">本单元共 ' + d.learnWords.length + ' 词 · 跳过学词直接答题 →</div>'
      out += '</div>'
      return out
    }

    if (d.mode === 'quiz') {
      const q = d.qs[d.qi]
      if (!q) return '<div class="card">加载中…</div>'
      let out = '<div class="card"><div class="row"><div class="muted grow">第 ' + (d.qi + 1) + '/' + d.qs.length + ' 题 · 正确 ' + d.correct + '</div><div class="muted link" data-act="back">退出</div></div>'
      out += '<div style="margin:8px 0">' + prog((d.qi + 1) * 100 / d.qs.length) + '</div>'

      if (q.type === 'mc') {
        out += '<div style="text-align:center;margin:12px 0"><div class="h2">' + h(q.word.w) + '</div><div style="font-size:28px;margin-top:3px" data-act="replayWord">🔊</div></div>'
        out += '<div class="muted" style="text-align:center">选出正确的中文意思</div>'
        out += q.options.map((o, i) => {
          let cls = 'opt'
          if (d.checked) { if (o === q.answer) cls += ' ok'; else if (i === d.picked) cls += ' no' }
          return '<div class="' + cls + '" data-act="pick" data-i="' + i + '">' + h(o) + '</div>'
        }).join('')
      } else if (q.type === 'sound') {
        out += '<div style="text-align:center;margin:15px 0"><div style="font-size:50px" data-act="soundReplay">🔊</div><div class="muted">听读音，选出单词</div></div>'
        out += q.options.map((o, i) => {
          let cls = 'opt'
          if (d.checked) { if (o === q.answer) cls += ' ok'; else if (i === d.picked) cls += ' no' }
          return '<div class="' + cls + '" data-act="pick" data-i="' + i + '">' + h(o) + '</div>'
        }).join('')
      } else {
        out += '<div style="text-align:center;margin:13px 0"><div class="h2">' + h(q.hint) + '</div><div class="muted" style="margin-top:4px">拼写出对应的英文单词</div></div>'
        out += '<input class="input" style="text-align:center;font-size:18px" value="' + h(d.spellVal) + '" data-act="spellInput"' + (d.checked ? ' disabled' : '') + ' placeholder="输入英文">'
        out += '<div style="margin-top:8px">' + btn('spellCheck', '提交', '', d.checked ? ' disabled' : '') + '</div>'
      }

      if (d.checked) {
        out += '<div style="text-align:center;margin:12px 0">'
        out += '<div style="color:' + (d.ok ? '#34B369' : '#E64545') + ';font-weight:600;font-size:17px">' + (d.ok ? '✓ 答对了！' : '✗ 正确答案：' + h(q.answer)) + '</div>'
        out += '<div class="muted" style="margin:4px 0">' + h(q.word.w) + ' — ' + h(q.word.m) + '</div>'
        out += btn('next', '下一题')
        out += '</div>'
      }
      out += '</div>'
      return out
    }

    /* done */
    const f = d.finished || {}
    let out = '<div class="card" style="text-align:center;padding:30px 14px">'
    out += '<div class="pet">' + h(d.stages[f.stage] || '🐤') + '</div>'
    out += '<div class="h1" style="margin:7px 0">答题完成！</div>'
    out += '<div class="h2">' + f.correct + '/' + f.total + ' · 正确率 ' + Math.round(f.correct * 100 / f.total) + '%</div>'
    out += '<div style="margin:8px 0"><span class="tag">经验 +' + f.xp + '</span></div>'
    out += '<div class="h2" style="margin:8px 0">' + h(f.petName) + ' 升到 Lv.' + f.level + ' 啦！</div>'
    out += '<div class="muted">本单元已通关 · 总进度 ' + d.nextIdx + '/' + d.totalLv + ' 单元</div>'
    if (d.nextName) {
      out += '<div style="margin-top:13px">' + btn('goNextUnit', '继续闯下一单元 →') + '</div>'
      out += '<div class="muted" style="margin-top:4px">下一关：' + h(d.nextName) + '</div>'
    }
    out += '<div style="margin-top:10px">' + btn('goUnits', '🗺 换个单元闯', 'btn-ghost') + '</div>'
    out += '<div style="margin-top:8px">' + btn('back', '返回上一页', 'btn-ghost') + '</div>'
    out += '<div style="margin-top:8px">' + btn('again', '再练一次', 'btn-ghost') + '</div>'
    out += '</div>'
    return out
  }

  /* ================= 自由闯关 ================= */
  function units(d) {
    let out = '<div class="card">'
    out += '<div class="row"><div class="h2 grow">自由闯关</div><button class="btn btn-ghost" data-act="goUsage">✍️ 词汇运用</button></div>'
    out += '<div class="muted" style="margin:6px 0">所有单元已解锁，任选单元练习</div>'
    out += bookSelect(d.bookNames, d.bookIdx, 'onPickBook')
    if (d.hasSeq) out += '<div style="margin-top:8px">' + btn('goSeq', '⏭ 按顺序闯：' + h(d.seqName)) + '</div>'
    out += '<div class="muted" style="margin-top:6px">本册已通关 ' + d.done + '/' + d.total + '</div>'
    out += '</div>'
    out += '<div class="card" style="padding:0">'
    out += d.units.map(u =>
      '<div class="unit-row' + (u.isNext ? ' next' : '') + '" data-act="goUnit" data-k="' + h(u.key) + '">' +
      '<div class="grow"><b>' + u.no + '. ' + h(u.name) + '</b>' +
      '<div class="muted">' + u.count + ' 词' + (u.best ? ' · 最佳 ' + u.best : '') + '</div></div>' +
      '<div>' + (u.passed ? '✅' : (u.isNext ? '<span class="tag">推荐</span>' : '<span class="tag tag-ghost">去闯关</span>')) + '</div>' +
      '</div>'
    ).join('')
    out += '</div>'
    return out
  }

  /* ================= 语法闯关 ================= */
  function grammar(d) {
    if (d.mode === 'map') {
      let out = '<div class="card"><div class="h2">🏰 语法闯关</div>'
      out += '<div class="muted">初中语法框架 ' + d.total + ' 关，逐关解锁 · 已通关 ' + d.passedCount + ' 关</div></div>'
      out += d.groups.map(g =>
        '<div class="card"><div class="h2">' + h(g.name) + '</div>' +
        g.levels.map(l =>
          '<div class="unit-row" data-act="openLevel" data-id="' + h(l.id) + '">' +
          '<div class="grow"><b>' + h(l.icon) + ' ' + h(l.title) + '</b>' +
          '<div class="muted">' + h(l.desc) + (l.best ? ' · 最佳 ' + l.best : '') + '</div></div>' +
          '<div>' + (l.passed ? '✅' : (l.unlocked ? '<span class="tag">去闯关</span>' : '🔒')) + '</div>' +
          '</div>'
        ).join('') + '</div>'
      ).join('')
      return out
    }
    if (d.mode === 'learn') {
      let out = '<div class="card"><div class="row"><div class="muted link" data-act="backToMap">← 关卡地图</div></div>'
      out += '<div class="h1" style="margin:8px 0">' + h(d.lv.icon) + ' ' + h(d.lv.title) + '</div>'
      out += '<div class="muted">' + h(d.lv.desc) + '</div>'
      out += '<div class="h2" style="margin-top:10px">要点</div>'
      out += '<ul class="points">' + d.points.map(p => '<li>' + h(p) + '</li>').join('') + '</ul>'
      out += '<div style="margin-top:12px">' + btn('startQuiz', '开始答题（10 题，对 8 题通关）') + '</div>'
      out += '</div>'
      return out
    }
    if (d.mode === 'quiz') {
      const q = d.qs[d.qi]
      let out = '<div class="card"><div class="row"><div class="muted grow">第 ' + (d.qi + 1) + '/' + d.qs.length + ' 题 · 正确 ' + d.correct + '</div><div class="muted link" data-act="backToMap">退出</div></div>'
      out += '<div style="margin:8px 0">' + prog((d.qi + 1) * 100 / d.qs.length) + '</div>'
      out += '<div class="qtext">' + h(q.q) + '</div>'
      out += q.o.map((o, i) => {
        let cls = 'opt'
        if (d.checked) { if (i === q.a) cls += ' ok'; else if (i === d.picked) cls += ' no' }
        return '<div class="' + cls + '" data-act="pick" data-i="' + i + '">' + h(o) + '</div>'
      }).join('')
      if (d.checked) {
        out += '<div class="exp" style="margin-top:10px">' + (d.ok ? '<b style="color:#34B369">✓ 答对了！</b> ' : '<b style="color:#E64545">✗</b> 正确答案：' + h(q.o[q.a]) + '。 ') + h(q.exp) + '</div>'
        out += '<div style="margin-top:10px">' + btn('next', '下一题') + '</div>'
      }
      out += '</div>'
      return out
    }
    /* done */
    let out = '<div class="card" style="text-align:center;padding:30px 14px">'
    out += '<div class="pet">' + (d.passed ? '🎉' : '💪') + '</div>'
    out += '<div class="h1" style="margin:7px 0">' + (d.passed ? '恭喜通关！' : '差一点，再来一次！') + '</div>'
    out += '<div class="h2">' + d.correct + '/' + d.qs.length + (d.passed ? ' · 下一关已解锁' : ' · 对 8 题即可通关') + '</div>'
    out += '<div style="margin-top:13px">' + btn('startQuiz', '再答一次', 'btn-ghost') + '</div>'
    out += '<div style="margin-top:8px">' + btn('nextLevel', '下一关 →') + '</div>'
    out += '<div style="margin-top:8px">' + btn('backToMap', '返回关卡地图', 'btn-ghost') + '</div>'
    out += '</div>'
    return out
  }

  /* ================= 词汇运用 ================= */
  function usage(d) {
    if (d.view === 'books') {
      let out = '<div class="card"><div class="h2">✍️ 词汇运用</div>'
      out += '<div class="muted">词形变形与选词填空，避免只会背不会用 · 共 ' + d.total + ' 题</div></div>'
      out += '<div class="card" style="padding:0">'
      out += d.books.map(b =>
        '<div class="unit-row" data-act="openBook" data-b="' + h(b.book) + '">' +
        '<div class="grow"><b>' + h(b.book) + '</b>' + (b.extra ? ' <span class="tag">' + h(b.tag) + '</span>' : '') +
        '<div class="muted">' + b.units + ' 个单元 · ' + b.count + ' 题 · 已练 ' + b.done + '</div></div>' +
        '<div>▸</div></div>'
      ).join('')
      out += '</div>'
      return out
    }
    if (d.view === 'units') {
      let out = '<div class="card"><div class="row"><div class="muted link" data-act="backToBooks">← 选册</div><div class="h2 grow">选单元</div></div></div>'
      out += '<div class="card" style="padding:0">'
      out += d.units.map(u =>
        '<div class="unit-row" data-act="startGroup" data-k="' + h(u.key) + '">' +
        '<div class="grow"><b>' + h(u.name) + '</b><div class="muted">' + u.count + ' 题' + (u.best ? ' · 最佳 ' + u.best : '') + '</div></div>' +
        '<div><span class="tag tag-ghost">开始</span></div></div>'
      ).join('')
      out += '</div>'
      return out
    }
    if (d.view === 'quiz' && !d.finished) {
      const q = d.qs[d.qi]
      if (!q) return '<div class="card">加载中…</div>'
      let out = '<div class="card"><div class="row"><div class="muted grow">' + h(d.group.name) + ' · 第 ' + (d.qi + 1) + '/' + d.qs.length + ' 题 · 正确 ' + d.correct + '</div><div class="muted link" data-act="backToUnits">退出</div></div>'
      out += '<div style="margin:8px 0">' + prog((d.qi + 1) * 100 / d.qs.length) + '</div>'
      out += '<div class="qtext">' + h(q.q) + '</div>'
      if (q.o) {
        out += q.o.map((o, i) => {
          let cls = 'opt'
          if (d.checked) {
            const al = q.a.map(x => x.toLowerCase())
            if (al.indexOf(String(o).toLowerCase()) >= 0) cls += ' ok'
            else if (i === d.picked) cls += ' no'
          }
          return '<div class="' + cls + '" data-act="pick" data-i="' + i + '">' + h(o) + '</div>'
        }).join('')
      } else {
        out += '<input class="input" style="text-align:center;font-size:17px" value="' + h(d.val) + '" data-act="input"' + (d.checked ? ' disabled' : '') + ' placeholder="填写答案">'
        out += '<div style="margin-top:8px">' + btn('submit', '提交', '', d.checked ? ' disabled' : '') + '</div>'
      }
      if (d.checked) {
        const al = q.a.map(x => x.toLowerCase())
        const ansShow = q.o ? q.o.find(x => al.indexOf(String(x).toLowerCase()) >= 0) : q.a[0]
        out += '<div class="exp" style="margin-top:10px">' + (d.ok ? '<b style="color:#34B369">✓ 答对了！</b> ' : '<b style="color:#E64545">✗</b> 正确答案：' + h(ansShow) + '。 ') + h(q.exp) + '</div>'
        out += '<div style="margin-top:10px">' + btn('next', '下一题') + '</div>'
      }
      out += '</div>'
      return out
    }
    /* done */
    let out = '<div class="card" style="text-align:center;padding:30px 14px">'
    out += '<div class="pet">🎉</div>'
    out += '<div class="h1" style="margin:7px 0">练习完成！</div>'
    out += '<div class="h2">' + d.correct + '/' + d.qs.length + ' · 正确率 ' + Math.round(d.correct * 100 / d.qs.length) + '%</div>'
    out += '<div class="muted">成绩取历次最佳 · 经验已累计</div>'
    out += '<div style="margin-top:13px">' + btn('backToUnits', '返回单元列表') + '</div>'
    out += '<div style="margin-top:8px">' + btn('backToBooks', '重新选册', 'btn-ghost') + '</div>'
    out += '</div>'
    return out
  }

  /* ================= 词根 & 拼读 ================= */
  function roots(d) {
    const isAffix = d.tab === 'affix'
    let out = '<div class="tabsrow">'
    out += '<div class="tab' + (isAffix ? ' on' : '') + '" data-act="setTab" data-t="affix">🧩 词根词缀</div>'
    out += '<div class="tab' + (!isAffix ? ' on' : '') + '" data-act="setTab" data-t="phonics">🔤 自然拼读</div>'
    out += '</div>'

    if (d.quiz.on) {
      const z = d.quiz
      const q = z.q
      if (z.finished) {
        out += '<div class="card" style="text-align:center;padding:25px 14px">'
        out += '<div class="pet">' + (z.correct >= 8 ? '🎉' : '💪') + '</div>'
        out += '<div class="h1" style="margin:7px 0">小测完成！</div>'
        out += '<div class="h2">' + z.correct + '/' + z.qs.length + '</div>'
        out += '<div class="muted">经验 +' + z.correct * 3 + '</div>'
        out += '<div style="margin-top:13px">' + btn('againQuiz', '再来一组') + '</div>'
        out += '<div style="margin-top:8px">' + btn('closeQuiz', '返回规则列表', 'btn-ghost') + '</div>'
        out += '</div>'
        return out
      }
      out += '<div class="card"><div class="row"><div class="muted grow">第 ' + (z.qi + 1) + '/' + z.qs.length + ' 题 · 正确 ' + z.correct + '</div><div class="muted link" data-act="closeQuiz">退出</div></div>'
      out += '<div style="margin:8px 0">' + prog((z.qi + 1) * 100 / z.qs.length) + '</div>'

      /* 题干 */
      out += '<div style="text-align:center;margin:12px 0">'
      out += '<div><span class="tag">' + h(q.tag) + '</span></div>'
      if (q.kind !== 'pick') {
        out += '<div class="h2" style="margin:8px 0">' + segWord(q.seg, q.word) + '</div>'
        if (q.kind === 'word' && q.mean) out += '<div class="muted">（' + h(q.mean) + '）</div>'
        if (q.kind === 'sound' && q.wp) out += '<div class="muted">/' + h(q.wp) + '/</div>'
        if (q.speak) out += '<div style="font-size:26px;margin-top:4px" data-act="speakQ">🔊</div>'
      } else {
        out += '<div class="h1" style="margin:8px 0">/' + h(q.showIpa) + '/</div>'
      }
      out += '<div class="muted" style="margin-top:4px">' + h(q.ask) + '</div>'
      out += '</div>'

      /* 选项 */
      if (q.kind === 'pick') {
        out += q.opts.map((o, i) => {
          let cls = 'opt'
          if (q.checked) { if (i === q.ans) cls += ' ok'; else if (i === q.picked) cls += ' no' }
          return '<div class="' + cls + '" data-act="pick" data-i="' + i + '"><b>' + h(o) + '</b><div class="segline">' + segWord(q.optSegs && q.optSegs[i], o) + '</div></div>'
        }).join('')
      } else {
        out += q.opts.map((o, i) => {
          let cls = 'opt'
          if (q.checked) { if (i === q.ans) cls += ' ok'; else if (i === q.picked) cls += ' no' }
          return '<div class="' + cls + '" data-act="pick" data-i="' + i + '">' + h(o) + '</div>'
        }).join('')
      }
      if (q.checked) {
        out += '<div class="exp" style="margin-top:10px">' + (q.ok ? '<b style="color:#34B369">✓ 答对了！</b> ' : '<b style="color:#E64545">✗</b> ') + h(q.exp) + '</div>'
        out += '<div style="margin-top:10px">' + btn('nextQ', '下一题') + '</div>'
      }
      out += '</div>'
      return out
    }

    /* 总则 + 统计 */
    out += '<div class="card">'
    out += isAffix
      ? '<div class="muted">单词 = 前缀 + 词根 + 后缀。点规则旁 🔊 听<b>词缀/词根本身</b>的读音，点例词旁 🔊 听<b>整词</b>。学一条规则，记一串单词。</div>'
      : '<div class="muted">字母组合有固定发音。点规则旁 🔊 听<b>字母组合</b>的读音，点例词旁 🔊 听<b>整词</b>。见词能读、听音能写。</div>'
    out += '<div class="row" style="margin-top:8px"><span class="tag">' + (isAffix ? d.affixRules : d.phonicRules) + ' 条规则</span><span class="tag">' + d.totalWords + ' 个例词</span><span class="tag">已掌握 ' + d.doneWords + '</span>'
    out += '<span class="grow"></span>'
    out += '<button class="mini-btn" data-act="expandAll">全部展开</button><button class="mini-btn" data-act="collapseAll">收起</button>'
    out += '<button class="mini-btn primary" data-act="startQuiz">▶ 小测 10 题</button></div>'
    out += '</div>'

    /* 规则分组 */
    out += d.groups.map(g =>
      '<div class="group-title">' + h(g.name) + ' <span class="muted">（' + g.desc + ' · 掌握 ' + g.done + '/' + g.total + '）</span></div>' +
      '<div class="card" style="padding:0">' +
      g.items.map((it, gi) => {
        const idx = d.groups.indexOf(g)
        let card = '<div class="rule" data-act="toggle" data-g="' + idx + '" data-i="' + gi + '">'
        card += '<div class="rule-head"><b class="rule-t">' + h(it.t) + '</b>'
        if (it.say) card += '<span class="ipa">/' + h(it.say) + '/</span>'
        card += '<span class="grow"></span>'
        if (isAffix && it.mean) card += '<span class="rule-mean">' + h(it.mean) + '</span>'
        card += '<span>' + (it.open ? '▾' : '▸') + '</span></div>'
        if (it.open) {
          if (isAffix) {
            if (it.hint) card += '<div class="muted" style="margin-top:4px">' + h(it.hint) + '</div>'
            if (it.pair) card += '<div class="muted" style="margin-top:2px">同音组合：' + h(it.pair) + '</div>'
          } else {
            if (it.tip) card += '<div class="muted" style="margin-top:4px">🔊 要领：' + h(it.tip) + '</div>'
            if (it.pair) card += '<div class="muted" style="margin-top:2px">同音组合：' + h(it.pair) + '</div>'
          }
          const spk = it.tts || it.demo
          if (spk) {
            card += '<div class="rule-spk" data-act="speakRule" data-w="' + h(spk) + '" data-t="' + h(it.t) + '" data-s="' + h(it.say) + '">🔊 读 ' + h(it.t) + (it.say ? ' /' + h(it.say) + '/' : '') + '</div>'
          }
          card += '<div class="wordlist">' + it.words.map((wd, wi) => {
            let row = '<div class="wordrow">'
            row += '<div class="mark' + (wd.done ? ' done' : '') + '" data-act="mark" data-g="' + idx + '" data-i="' + gi + '" data-j="' + wi + '">' + (wd.done ? '✓' : '○') + '</div>'
            row += '<div class="grow"><b>' + segWord(wd.seg, wd.w) + '</b>'
            if (wd.p) row += ' <span class="ipa">/' + h(wd.p) + '/</span>'
            row += '<div class="muted">' + h(wd.m) + (wd.b && wd.b !== '补充' ? ' · ' + h(wd.b) : '') + '</div></div>'
            row += '<div class="spk" data-act="speak" data-w="' + h(wd.w) + '">🔊</div>'
            row += '</div>'
            return row
          }).join('') + '</div>'
        }
        card += '</div>'
        return card
      }).join('') +
      '</div>'
    ).join('')
    out += '<div class="muted" style="text-align:center;margin:10px 0">点 ○ 标记「已掌握」，点 🔊 听发音</div>'
    return out
  }

  /* ================= 完整词表 ================= */
  function words(d) {
    let out = '<div class="card"><div class="h2">📖 完整词表</div>'
    out += '<div class="muted">共 ' + d.bookNames.length + ' 册 ' + d.grandTotal + ' 词 · 当前册 ' + d.bookWords + ' 词' + (d.isMain ? '' : '（旧版·拓展，不进主线闯关）') + '</div>'
    out += '<div style="margin-top:8px">' + bookSelect(d.bookNames, d.bookIdx, 'onPickBook') + '</div>'
    out += '</div>'
    out += '<div class="card" style="padding:0">'
    out += d.units.map((u, i) => {
      let c = '<div class="unit-row" data-act="toggleUnit" data-i="' + i + '">'
      c += '<div class="grow"><b>' + h(u.title) + '</b><div class="muted">' + u.count + ' 词</div></div>'
      c += '<div class="row" style="gap:6px">'
      if (d.isMain) c += '<button class="mini-btn primary" data-act="goUnit" data-u="' + h(u.title) + '">闯关</button>'
      c += '<button class="mini-btn" data-act="speakAll" data-i="' + i + '">🔊 整单元</button>'
      c += '<span>' + (u.open ? '▾' : '▸') + '</span></div></div>'
      if (u.open) {
        c += '<div class="wordlist">' + u.words.map(w =>
          '<div class="wordrow"><div class="grow"><b>' + h(w.w) + '</b>' + (w.ph ? ' <span class="ipa">/' + h(w.ph) + '/</span>' : '') + '<div class="muted">' + h(w.m) + '</div></div>' +
          '<div class="spk" data-act="speakWord" data-w="' + h(w.w) + '">🔊</div></div>'
        ).join('') + '</div>'
      }
      return c
    }).join('')
    out += '</div>'
    return out
  }

  /* ================= 复习 ================= */
  function review(d) {
    if (!d.hasAny) {
      return '<div class="card" style="text-align:center;padding:30px 14px"><div class="pet">🌱</div>' +
        '<div class="h1" style="margin:7px 0">暂无待复习</div>' +
        '<div class="muted">先去闯关吧！答错的词会自动进入复习队列。</div>' +
        '<div style="margin-top:13px">' + btn('goHome', '去闯关') + '</div></div>'
    }
    if (d.done) {
      return '<div class="card" style="text-align:center;padding:30px 14px"><div class="pet">🎉</div>' +
        '<div class="h1" style="margin:7px 0">复习完成！</div>' +
        '<div class="h2">' + d.qs.length + ' 题已复习</div>' +
        '<div class="muted">答对的词已移出错题本</div>' +
        '<div style="margin-top:13px">' + btn('goHome', '返回首页', 'btn-ghost') + '</div></div>'
    }
    if (d.qi < 0) {
      return '<div class="card" style="text-align:center;padding:30px 14px"><div class="pet">🔁</div>' +
        '<div class="h1" style="margin:7px 0">今日复习</div>' +
        '<div class="h2">' + d.qs.length + ' 个词待复习</div>' +
        '<div class="muted">错题 + 近期所学 · 答对移出错题本</div>' +
        '<div style="margin-top:13px">' + btn('start', '开始复习') + '</div></div>'
    }
    const q = d.qs[d.qi]
    let out = '<div class="card"><div class="row"><div class="muted grow">第 ' + (d.qi + 1) + '/' + d.qs.length + ' 题 <span class="tag">' + h(q.from) + '</span></div><div class="muted link" data-act="goHome">退出</div></div>'
    out += '<div style="margin:8px 0">' + prog((d.qi + 1) * 100 / d.qs.length) + '</div>'
    if (q.type === 'mc') {
      out += '<div style="text-align:center;margin:12px 0"><div class="h2">' + h(q.word.w) + '</div><div style="font-size:28px;margin-top:3px" data-act="replay">🔊</div></div>'
      out += '<div class="muted" style="text-align:center">选出正确的中文意思</div>'
      out += q.options.map((o, i) => {
        let cls = 'opt'
        if (d.checked) { if (o === q.answer) cls += ' ok'; else if (i === d.picked) cls += ' no' }
        return '<div class="' + cls + '" data-act="pick" data-i="' + i + '">' + h(o) + '</div>'
      }).join('')
    } else {
      out += '<div style="text-align:center;margin:13px 0"><div class="h2">' + h(q.hint) + '</div><div class="muted" style="margin-top:4px">拼写出对应的英文单词</div></div>'
      out += '<input class="input" style="text-align:center;font-size:18px" value="' + h(d.spellVal) + '" data-act="spellInput"' + (d.checked ? ' disabled' : '') + ' placeholder="输入英文">'
      out += '<div style="margin-top:8px">' + btn('spellCheck', '提交', '', d.checked ? ' disabled' : '') + '</div>'
    }
    if (d.checked) {
      out += '<div style="text-align:center;margin:12px 0">'
      out += '<div style="color:' + (d.ok ? '#34B369' : '#E64545') + ';font-weight:600;font-size:17px">' + (d.ok ? '✓ 答对了！' : '✗ 正确答案：' + h(q.answer)) + '</div>'
      out += '<div class="muted" style="margin:4px 0">' + h(q.word.w) + ' — ' + h(q.word.m) + '</div>'
      out += btn('next', '下一题')
      out += '</div>'
    }
    out += '</div>'
    return out
  }

  /* ================= 我的 ================= */
  function me(d) {
    const s = d.stats
    let out = '<div class="card" style="text-align:center">'
    out += '<div class="pet">' + h(d.stages[d.stage] || '🐣') + '</div>'
    out += '<div class="h2">Lv.' + s.level + ' · 经验 ' + s.xp + '</div>'
    out += '<div class="muted">连续打卡 ' + s.streak + ' 天 · 通关 ' + s.done + ' 个单元</div>'
    out += '<div style="margin:8px 0"><span class="tag">答题 ' + s.total + '</span><span class="tag">正确率 ' + s.acc + '%</span><span class="tag">错题 ' + d.errorCount + '</span></div>'
    out += '</div>'
    out += '<div class="card"><div class="h2" style="margin-bottom:6px">近 7 天打卡</div><div class="row" style="justify-content:space-between">'
    out += d.days.map(x =>
      '<div style="text-align:center"><div style="font-size:22px">' + (x.checked ? '✅' : '⚪') + '</div><div class="muted">' + h(x.label) + '</div></div>'
    ).join('')
    out += '</div></div>'
    out += '<div class="card">'
    out += '<div style="margin-top:4px">' + btn('myCode', '📤 复制我的打卡码') + '</div>'
    out += '<div style="margin-top:8px">' + btn('testSound', '🔉 测试发音', 'btn-ghost') + '</div>'
    out += '<div style="margin-top:8px">' + btn('about', 'ℹ️ 关于', 'btn-ghost') + '</div>'
    out += '<div style="margin-top:8px">' + btn('clearData', '🗑 重置学习数据', 'btn-ghost') + '</div>'
    out += '</div>'
    return out
  }

  /* ================= 班级 ================= */
  function klass(d) {
    let out = ''
    if (d.pending) {
      out += '<div class="card"><div class="h2">' + h(d.teacherName ? d.teacherName + ' 老师' : '') + h(d.className || '新班级') + '</div>'
      out += '<div class="muted">班级码 ' + h(d.code) + ' · 请点你的名字加入</div>'
      out += '<div class="roster">' + d.roster.map(n =>
        '<button class="mini-btn" data-act="pickName" data-n="' + h(n) + '">' + h(n) + '</button>'
      ).join('') + '</div></div>'
      return out
    }
    if (d.joined) {
      out += '<div class="card" style="text-align:center">'
      out += '<div class="h1">' + h(d.className || '我的班级') + '</div>'
      out += '<div class="muted">班级码 ' + h(d.code) + ' · 我是 ' + h(d.name) + '</div>'
      out += '<div style="margin-top:8px"><span class="tag">名单 ' + d.roster.length + ' 人</span></div>'
      out += '<div class="roster" style="margin-top:10px">' + d.roster.map(n =>
        '<button class="mini-btn' + (n === d.name ? ' primary' : '') + '" data-act="changeName" data-n="' + h(n) + '">' + h(n) + '</button>'
      ).join('') + '</div>'
      out += '<div class="muted" style="margin-top:6px">老师更新名单后，点名字可切换身份</div>'
      out += '</div>'
      out += '<div class="card">'
      out += btn('goTeacher', '🧑‍🏫 我是老师（打卡统计）', 'btn-ghost')
      out += '<div style="margin-top:8px">' + btn('leave', '退出班级', 'btn-ghost') + '</div>'
      out += '</div>'
      return out
    }
    /* 未加入 */
    out += '<div class="card"><div class="h2">加入班级</div>'
    out += '<div class="muted" style="margin:6px 0">请老师把班级邀请码发给你（一段以 PETC2| 开头的文本），粘贴到下面：</div>'
    out += '<textarea class="input" rows="3" data-act="onInviteText" placeholder="粘贴班级邀请码（PETC2|...）">' + h(d.inviteText) + '</textarea>'
    out += '<div class="row" style="margin-top:8px;gap:8px">'
    out += btn('applyPasted', '加入名单班级')
    out += btn('pasteInvite', '📋 读取剪贴板', 'btn-ghost')
    out += '</div>'
    out += '<div class="muted" style="margin-top:8px" data-act="toggleManual">' + (d.showManual ? '收起手动加入 ▴' : '没有邀请码？手动输入班级码加入 ▾') + '</div>'
    if (d.showManual) {
      out += '<div style="margin-top:8px">'
      out += '<input class="input" value="' + h(d.name) + '" data-act="onName" placeholder="你的姓名">'
      out += '<input class="input" style="margin-top:6px" value="' + h(d.code) + '" data-act="onCode" placeholder="6 位班级码">'
      out += '<input class="input" style="margin-top:6px" value="' + h(d.className) + '" data-act="onClass" placeholder="班级名称（选填）">'
      out += '<div style="margin-top:8px">' + btn('join', '加入班级') + '</div>'
      out += '</div>'
    }
    out += '</div>'
    out += '<div class="card">' + btn('goTeacher', '🧑‍🏫 我是老师（打卡统计）', 'btn-ghost') + '</div>'
    return out
  }

  /* ================= 教师端 ================= */
  function teacher(d) {
    if (d.mode === 'setup') {
      let out = '<div class="card"><div class="h2">🧑‍🏫 教师端 · 创建班级</div>'
      out += '<div class="muted" style="margin:6px 0">创建后生成 6 位班级码与邀请码，学生加入后可导入打卡、导出统计。</div>'
      out += '<input class="input" style="margin-top:8px" value="' + h(d.tName) + '" data-act="onTName" placeholder="教师姓名">'
      out += '<input class="input" style="margin-top:6px" value="' + h(d.tClass) + '" data-act="onTClass" placeholder="班级名称（如 三年二班）">'
      out += '<div style="margin-top:10px">' + btn('createClass', '创建班级') + '</div>'
      out += '</div>'
      out += '<div class="card"><div class="muted link" data-act="goStudent">← 返回学生端</div></div>'
      return out
    }
    const td = d.td
    let out = '<div class="card">'
    out += '<div class="row"><div class="h2 grow">' + h(td.className) + '</div><button class="mini-btn" data-act="editSetup">修改</button></div>'
    out += '<div class="muted">' + h(td.teacherName) + ' 老师 · 班级码 <b>' + h(td.classCode) + '</b> <span class="link" data-act="copyCode">复制</span></div>'
    out += '<div class="row" style="margin-top:8px;gap:8px">'
    out += '<button class="mini-btn primary" data-act="copyInvite">📋 复制邀请码（发群里）</button>'
    out += '<button class="mini-btn" data-act="showQR">🖼 生成二维码</button>'
    out += '</div>'
    if (d.qrShow || d.qrImg) {
      out += '<div style="text-align:center;margin-top:10px">'
      out += d.qrImg
        ? '<img class="qr" src="' + d.qrImg + '" alt="班级二维码">'
        : '<canvas id="qr-canvas"></canvas>'
      if (d.qrImg) out += '<div style="margin-top:6px">' + btn('saveQR', '⬇️ 下载二维码图片', 'btn-ghost') + '</div>'
      out += '<div class="muted">学生扫码或粘贴邀请码即可加入</div>'
      out += '</div>'
    }
    if (d.qrTip) out += '<div class="muted" style="margin-top:6px;color:#E64545">' + h(d.qrTip) + '</div>'
    out += '</div>'

    out += '<div class="card"><div class="row"><div class="h2 grow">学生名单（' + d.roster.length + ' 人）</div><button class="mini-btn" data-act="toggleRosterEdit">' + (d.rosterEdit ? '取消' : '编辑') + '</button></div>'
    if (d.rosterEdit) {
      out += '<textarea class="input" rows="5" data-act="onRosterText" placeholder="每行一个姓名，也可用逗号分隔">' + h(d.rosterText) + '</textarea>'
      out += '<div style="margin-top:8px">' + btn('saveRoster', '保存名单') + '</div>'
    } else if (d.roster.length) {
      out += '<div class="roster">' + d.roster.map(n => '<span class="tag">' + h(n) + '</span>').join('') + '</div>'
    } else {
      out += '<div class="muted">还没有名单，编辑后学生可点自己的名字加入</div>'
    }
    out += '</div>'

    out += '<div class="card"><div class="h2">📥 导入学生打卡</div>'
    out += '<div class="muted" style="margin:6px 0">学生把「我的」页复制的打卡码（PET1:...）发给你，粘贴到下面，可一次粘多个：</div>'
    out += '<textarea class="input" rows="3" data-act="onPaste" placeholder="PET1:...（可多个，用空格分隔）">' + h(d.pasteVal) + '</textarea>'
    out += '<div style="margin-top:8px">' + btn('importStudent', '导入') + '</div>'
    out += '</div>'

    out += '<div class="card"><div class="row"><div class="h2 grow">打卡统计（' + d.students.length + ' 人）</div>'
    out += '<button class="mini-btn" data-act="exportCsv">📊 复制表格</button>'
    out += '<button class="mini-btn" data-act="clearAll">清空</button></div>'
    if (d.students.length) {
      out += '<div class="week-labels">' + d.weekLabels.map(l => '<span>' + h(l) + '</span>').join('') + '</div>'
      out += '<div class="students">'
      out += d.students.slice().sort((a, b) => (b.units || 0) - (a.units || 0)).map(s =>
        '<div class="stu-row"><div class="grow"><b>' + h(s.n) + '</b>' +
        '<div class="muted">Lv.' + s.lv + ' · 通关 ' + s.units + '/' + s.totalUnits + ' · 正确率 ' + s.acc + '% · 连续 ' + s.streak + ' 天' + (s.today ? ' · <b style="color:#34B369">今日已打卡</b>' : '') + '</div></div>' +
        '<div class="cells">' + s.cells.map(c => '<span class="' + (c ? 'on' : '') + '"></span>').join('') + '</div>' +
        '</div>'
      ).join('')
      out += '</div>'
    } else {
      out += '<div class="muted" style="margin-top:6px">还没有学生数据</div>'
    }
    out += '</div>'
    out += '<div class="card"><div class="muted link" data-act="goStudent">← 返回学生端</div></div>'
    return out
  }

  return {
    index: index, quiz: quiz, units: units, grammar: grammar, usage: usage,
    roots: roots, words: words, review: review, me: me, class: klass, teacher: teacher,
    _tabs: TABS, _tabNames: TAGS
  }
})()
