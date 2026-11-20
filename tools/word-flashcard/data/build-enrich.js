/* 闪卡全量派生数据构建脚本  node build-enrich.js
 * 输入：vocab-src.js（原版词库）、usage-src.js（482 道语境题）、roots-src.js（105 条拼读规则）
 * 输出：flash-data.js —— 浏览器 <script> 直接引用的自包含数据
 *
 * 为什么预计算：易混词、藏词、拼读家族涉及全库两两比对，
 * 5870 词条放到浏览器里实时算会明显卡顿，这里一次算好、前端只查表。
 */
const fs = require('fs');
const path = require('path');

const V = require('./vocab-src.js');
const U = require('./usage-src.js');
const R = require('./roots-src.js');

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function letters(w) { return /^[a-z'-]+$/i.test(w); }
function clean(w) { return String(w || '').trim(); }

/* ---------- 1. 扁平词表 + 册/单元层级 ---------- */
const flat = [], books = [], byWord = {};
Object.keys(V).forEach((bn, bi) => {
  const b = V[bn];
  const book = { name: bn, edition: b.edition || '', extra: !!b.extra, units: [] };
  (b.units || []).forEach((u, ui) => {
    const ids = [];
    (u.words || []).forEach(w => {
      const word = clean(w.w);
      if (!word) return;
      const idx = flat.length;
      flat.push([bi, ui, word, clean(w.m), clean(w.ph), clean(w.pos), b.extra ? 1 : 0]);
      ids.push(idx);
      const key = word.toLowerCase();
      if (!(key in byWord)) byWord[key] = idx;      // 主体册排在前，优先跳主体
    });
    book.units.push({ title: u.title || ('Unit ' + (ui + 1)), ids: ids });
  });
  books.push(book);
});
const N = flat.length;

/* ---------- 2. 例句：优先用语境真题回填，其余按词性模板生成 ---------- */
const exUsage = {};
(U.groups || []).forEach(g => (g.qs || []).forEach(q => {
  if (!q.q) return;
  const ans = (q.a && q.a[0]) || '';
  const m = q.q.match(/\(([a-zA-Z'-]+)\)/);
  const base = m ? m[1].toLowerCase() : '';
  let s = q.q;
  if (ans) s = s.replace(/_{2,}\s*\([^)]*\)/g, ans).replace(/_{2,}/g, ans);
  s = s.replace(/\s+/g, ' ').trim();
  if (base && s && !/_{2,}/.test(s) && s.length < 140 && s.indexOf('(') < 0) {
    if (!exUsage[base] || s.length < exUsage[base].length) exUsage[base] = s;
  }
}));

const TPL = {
  noun:  ['This is a {w}.', 'Look at the {w}.', 'I can see a {w}.'],
  verb:  ["Let's {w} together.", 'I can {w}.', 'We {w} every day.'],
  adj:   ['It is very {w}.', 'It looks {w}.', 'This one is {w}.'],
  adv:   ['Please say it {w}.', 'We do it {w}.'],
  phrase:['Can you use "{w}" in a sentence?', 'We often say "{w}".', 'I know the phrase "{w}".'],
  proper:['This is {w}.', 'I know {w}.', '{w} is here.'],
  other: ['This is "{w}".', 'Look at "{w}".']
};
function makeExample(w, m, pos) {
  const key = w.toLowerCase();
  if (exUsage[key]) return [exUsage[key], 1];
  // 这几类词套 "This is a ..." 会造出病句，单独给句型
  if (/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|zero)$/.test(key) || /num\./.test(pos)) return ['The number is ' + w + '.', 0];
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(key)) return ['It is ' + w + ' today.', 0];
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december)$/.test(key)) return ['It is ' + w + '.', 0];
  if (/^(red|green|blue|yellow|black|white|orange|pink|purple|brown|grey|gray|gold|silver)$/.test(key)) return ['I like ' + w + '.', 0];
  const seed = hash(key);
  let kind;
  if (w.indexOf(' ') > 0 || w.indexOf('-') > 0) kind = 'phrase';
  else if (/^[A-Z]/.test(w) && w.length > 2) kind = 'proper';
  else if (/n\./.test(pos)) kind = 'noun';
  else if (/v\./.test(pos)) kind = 'verb';
  else if (/adj\./.test(pos)) kind = 'adj';
  else if (/adv\./.test(pos)) kind = 'adv';
  else if (/[的地]$/.test(m)) kind = 'adj';
  else kind = 'noun';
  const arr = TPL[kind] || TPL.other;
  let tpl = arr[seed % arr.length];
  const art = /^[aeiou]/i.test(w) ? 'an' : 'a';
  tpl = tpl.replace(/a \{w\}/g, art + ' {w}').replace(/A \{w\}/g, art + ' {w}');
  return [tpl.replace('{w}', w), 0];
}

/* ---------- 3. 自然拼读拆段：优先复用 roots 的 seg，其余按元音核切 ---------- */
const allRules = [];
['prefix', 'suffix', 'root'].forEach(k => (R.affix[k] || []).forEach(r => allRules.push(r)));
['vowel', 'magic', 'consonant', 'cluster'].forEach(k => (R.phonics[k] || []).forEach(r => allRules.push(r)));

const rootSeg = {}, ruleMeta = {};
allRules.forEach(r => {
  ruleMeta[r.id] = { t: r.t || r.id, say: r.say || '', tip: r.tip || '' };
  (r.words || []).forEach(w => {
    const k = String(w.w || '').toLowerCase();
    if (!rootSeg[k] && w.seg && w.seg.length > 1) rootSeg[k] = w.seg.map(s => clean(s.t)).filter(Boolean);
  });
});

const DIGRAPHS = ['igh', 'eigh', 'ough', 'tion', 'sion', 'ture', 'ee', 'ea', 'oo', 'ai', 'oa', 'ie', 'ou', 'oi', 'oy', 'ay', 'ey', 'aw', 'ow', 'ar', 'er', 'ir', 'ur', 'or', 'ch', 'sh', 'th', 'ck', 'ph', 'wh', 'qu', 'ng', 'nk', 'ss', 'll', 'tt', 'dd', 'gg', 'mm', 'nn', 'pp', 'rr', 'bb', 'ff', 'zz'];
const VOWEL = /[aeiouy]/;

/* 把单词切成「辅音簇 + 元音核」的若干段，保证拼接后与原词完全一致 */
function splitWord(raw) {
  const w = raw.toLowerCase();
  if (rootSeg[w] && rootSeg[w].join('').toLowerCase() === w) return rootSeg[w].map((t, i) => [t, rootSeg[w].length, i]);
  if (w.indexOf(' ') > 0) return w.split(' ').map((t, i, a) => [t, a.length, i]);
  if (!letters(w) || w.length <= 3) return [[w, 1, 0]];

  // 标出每个字符是否为元音，连续元音合成一个核
  const marks = [];
  for (let i = 0; i < w.length; i++) {
    let d = '';
    for (const g of DIGRAPHS) if (w.startsWith(g, i)) { d = g; break; }
    if (d) { for (let j = 0; j < d.length; j++) marks.push({ v: VOWEL.test(d[j]) || d.length > 1 && j === 0 ? true : VOWEL.test(d[j]), g: d }); i += d.length - 1; }
    else marks.push({ v: VOWEL.test(w[i]), g: '' });
  }
  // 找元音核区间
  const cores = [];
  let i = 0;
  while (i < marks.length) {
    if (marks[i].v) { const st = i; while (i < marks.length && marks[i].v) i++; cores.push([st, i]); }
    else i++;
  }
  if (cores.length <= 1) return [[w, 1, 0]];

  // 段边界：把两个元音核之间的辅音平分，前段留尾辅音、后段带前导辅音
  const bounds = [0];
  for (let c = 1; c < cores.length; c++) {
    const prevEnd = cores[c - 1][1], nextSt = cores[c][0];
    const gap = nextSt - prevEnd;
    const cut = prevEnd + Math.max(1, Math.floor(gap / 2));
    bounds.push(Math.min(cut, nextSt));
  }
  bounds.push(w.length);
  const parts = [];
  for (let b = 0; b < bounds.length - 1; b++) {
    const t = w.slice(bounds[b], bounds[b + 1]);
    if (t) parts.push(t);
  }
  // 合并过短的碎片（如单字母段），最多保留 5 段
  let merged = [];
  parts.forEach(p => {
    if (p.length === 1 && merged.length) merged[merged.length - 1] += p;
    else merged.push(p);
  });
  if (merged.join('') !== w) merged = [w];   // 兜底：绝不改变拼写
  if (merged.length > 5) { const head = merged.slice(0, 4).join(''); merged = [head, w.slice(head.length)]; }
  return merged.map((t, k) => [t, merged.length, k]);
}

/* ---------- 4. 拼读家族：用户指定的字母组合 + 音标对照 ---------- */
const PHON = [
  { k: 'ee',  say: 'iː',  tip: 'ee 通常读长音 /iː/' },
  { k: 'ea',  say: 'iː',  tip: 'ea 多数读 /iː/，少数读 /e/' },
  { k: 'oo',  say: 'uː',  tip: 'oo 读 /uː/ 或 /ʊ/' },
  { k: 'ae',  say: 'iː',  tip: 'ae 组合少见，多见于外来词' },
  { k: 'ie',  say: 'aɪ',  tip: 'ie 常读 /aɪ/ 或 /iː/' },
  { k: 'ir',  say: 'ɜː',  tip: 'ir 读 /ɜː/' },
  { k: 'ur',  say: 'ɜː',  tip: 'ur 读 /ɜː/' },
  { k: 'er',  say: 'ə',   tip: 'er 在词尾常读轻音 /ə/' },
  { k: 'ar',  say: 'ɑː',  tip: 'ar 读 /ɑː/' },
  { k: 'or',  say: 'ɔː',  tip: 'or 读 /ɔː/' },
  { k: 'ow',  say: 'aʊ',  tip: 'ow 常读 /aʊ/ 或 /əʊ/' },
  { k: 'ou',  say: 'aʊ',  tip: 'ou 常读 /aʊ/' },
  { k: 'oa',  say: 'əʊ',  tip: 'oa 读 /əʊ/' },
  { k: 'ai',  say: 'eɪ',  tip: 'ai 读 /eɪ/' },
  { k: 'ay',  say: 'eɪ',  tip: 'ay 在词尾读 /eɪ/' },
  { k: 'oi',  say: 'ɔɪ',  tip: 'oi 读 /ɔɪ/' },
  { k: 'oy',  say: 'ɔɪ',  tip: 'oy 在词尾读 /ɔɪ/' },
  { k: 'igh', say: 'aɪ',  tip: 'igh 读 /aɪ/' },
  { k: 'ear', say: 'ɪə',  tip: 'ear 常读 /ɪə/' },
  { k: 'sh',  say: 'ʃ',   tip: 'sh 读 /ʃ/' },
  { k: 'ch',  say: 'tʃ',  tip: 'ch 常读 /tʃ/' },
  { k: 'th',  say: 'θ',   tip: 'th 读 /θ/ 或 /ð/' },
  { k: 'ck',  say: 'k',   tip: 'ck 在词尾读 /k/' },
  { k: 'ph',  say: 'f',   tip: 'ph 读 /f/' },
  { k: 'wh',  say: 'w',   tip: 'wh 常读 /w/' },
  { k: 'qu',  say: 'kw',  tip: 'qu 读 /kw/' },
  { k: 'ng',  say: 'ŋ',   tip: 'ng 读 /ŋ/' }
];
const famMembers = {}, famHit = {};
PHON.forEach(p => {
  const pool = [];
  for (let i = 0; i < N; i++) {
    const w = flat[i][2].toLowerCase();
    if (!letters(w) || w === p.k) continue;
    if (w.indexOf(p.k) < 0) continue;
    const ph = flat[i][4];
    // 对照音标：命中音素的排前面，没音标的排后面
    pool.push([w, ph && ph.indexOf(p.say) >= 0 ? 0 : 1, ph ? 0 : 1, w.length]);
  }
  pool.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[0].localeCompare(b[0]));
  famMembers[p.k] = pool.slice(0, 10).map(x => x[0]);
});
for (let i = 0; i < N; i++) {
  const w = flat[i][2].toLowerCase();
  if (!letters(w)) continue;
  const hits = PHON.filter(p => w.indexOf(p.k) >= 0).slice(0, 2).map(p => p.k);
  if (hits.length) famHit[i] = hits;
}

/* ---------- 5. 藏词：词里藏着课本里另一个 3 字母以上的单词 ---------- */
const wordSet = new Set();
for (let i = 0; i < N; i++) { const w = flat[i][2].toLowerCase(); if (/^[a-z]{3,}$/.test(w)) wordSet.add(w); }
const hid = {};
for (let i = 0; i < N; i++) {
  const w = flat[i][2].toLowerCase();
  if (!/^[a-z]{4,}$/.test(w)) continue;
  const found = [];
  for (let len = Math.min(w.length - 1, 9); len >= 3 && found.length < 3; len--) {
    for (let st = 0; st + len <= w.length && found.length < 3; st++) {
      const sub = w.slice(st, st + len);
      if (sub !== w && wordSet.has(sub) && (sub in byWord)) found.push([sub, st, len]);
    }
  }
  // 同一片段只留最长的一条，且尽量不重叠
  const picked = [];
  found.forEach(f => { if (!picked.some(p => p[0] === f[0])) picked.push(f); });
  if (picked.length) hid[i] = picked.slice(0, 2);
}

/* ---------- 6. 别搞混：只差一个字母的词（通配模式索引，避免 O(n²)） ---------- */
const patMap = {};
for (let i = 0; i < N; i++) {
  const w = flat[i][2].toLowerCase();
  if (!/^[a-z]{3,12}$/.test(w)) continue;
  for (let j = 0; j < w.length; j++) {
    const p = w.slice(0, j) + '*' + w.slice(j + 1);
    (patMap[p] = patMap[p] || []).push([w, j]);
  }
}
const con = {};
Object.keys(patMap).forEach(p => {
  const list = patMap[p];
  if (list.length < 2 || list.length > 40) return;
  list.forEach(([w1, pos]) => {
    const id = byWord[w1];
    if (id === undefined) return;
    const mates = list.filter(x => x[0] !== w1 && x[1] === pos).map(x => x[0]);
    if (!mates.length) return;
    (con[id] = con[id] || []);
    mates.slice(0, 2).forEach(m => { if (con[id].length < 3 && !con[id].some(c => c[0] === m)) con[id].push([m, pos]); });
  });
});

/* ---------- 7. 形状窍门 / 颜色与尺寸特效 ---------- */
const SHAPES = {
  eye: '两个 e 像两只眼睛，中间的 y 像鼻子——整个单词就是一张脸。',
  bed: 'b 和 d 是床头和床尾，中间的 e 像躺在床上的人。',
  level: '左右完全对称，像一架摆平的天平。',
  noon: '左右对称，中间两个 o 像正午的太阳。',
  wow: 'w 在两边像张开的双手，中间的 o 是惊讶张大的嘴。',
  look: '两个 o 像睁大的眼睛，l 和 k 指向要看的方向。',
  banana: 'b-a-n-a-n-a 三组 a 交替，像一串弯弯的香蕉。',
  smile: 's 像嘴角上扬的弧线，把 smile 读出来嘴角也会上扬。',
  umbrella: '开头的 um 像撑伞时的一声「嗯」，长长的词身就是伞面。'
};
const COLORS = { red: '#d94b45', green: '#2f9e60', blue: '#3b78c3', yellow: '#d9a51c', black: '#22292b', white: '#c9d6d2', orange: '#e07b2d', pink: '#dd719b', purple: '#8355b4', brown: '#8b6242', grey: '#7d8a8c', gray: '#7d8a8c', gold: '#c9a227', silver: '#9aa7ad' };
const SIZEWORDS = { big: 'big', small: 'small', tall: 'tall', fast: 'fast', long: 'long', short: 'short', high: 'high', low: 'low', huge: 'huge', tiny: 'tiny', wide: 'wide' };
const shape = {}, fx = {};
for (let i = 0; i < N; i++) {
  const w = flat[i][2].toLowerCase();
  if (SHAPES[w]) shape[i] = SHAPES[w];
  if (COLORS[w]) fx[i] = ['color', COLORS[w]];
  else if (SIZEWORDS[w]) fx[i] = ['size', SIZEWORDS[w]];
}

/* ---------- 8. 串起来看：按主题给每个单元分组 ---------- */
const THEMES = [
  { name: '家人', kind: 'tree', en: ['mother','father','sister','brother','grandma','grandpa','grandmother','grandfather','uncle','aunt','cousin','family','parent','baby','dad','mum','son','daughter','wife','husband'], cn: ['母','父','姐','妹','兄','弟','祖母','祖父','叔','伯','姑','姨','堂','表','家人','婴儿','儿子','女儿','丈夫','妻子'] },
  { name: '颜色', kind: 'swatch', en: ['red','green','blue','yellow','black','white','orange','pink','purple','brown','grey','gray','color','colour'], cn: ['红','绿','蓝','黄','黑','白','橙','粉','紫','棕','灰','颜色'] },
  { name: '数字', kind: 'line', en: ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','twenty','thirty','forty','fifty','number','first','second','third'], cn: ['一','二','三','四','五','六','七','八','九','十','数字','第'] },
  { name: '动物', kind: 'grid', en: ['animal','dog','cat','fish','bird','rabbit','fox','tiger','lion','elephant','monkey','panda','bear','wolf','whale','shark','snake','giraffe','penguin','eagle','sheep','horse','cow','duck','pig','zoo'], cn: ['动物','狗','猫','鱼','鸟','兔','狐','虎','狮','象','猴','熊猫','熊','狼','鲸','鲨','蛇','长颈鹿','企鹅','鹅','羊','马','牛','鸭','猪','动物园'] },
  { name: '食物', kind: 'grid', en: ['food','rice','noodle','bread','egg','milk','apple','banana','orange','grape','cake','meat','fish','soup','tea','coffee','water','vegetable','potato','tomato','sandwich','hamburger'], cn: ['食物','米饭','面','面包','蛋','奶','苹果','香蕉','橙','葡萄','蛋糕','肉','汤','茶','咖啡','水','蔬菜','土豆','西红柿','三明治','汉堡'] },
  { name: '身体', kind: 'grid', en: ['body','head','face','eye','ear','nose','mouth','hand','arm','leg','foot','hair','neck','tooth','tongue','heart'], cn: ['身体','头','脸','眼','耳','鼻','嘴','手','胳膊','腿','脚','头发','脖子','牙','舌','心'] },
  { name: '学校', kind: 'grid', en: ['school','class','classroom','teacher','student','book','pen','pencil','bag','desk','chair','blackboard','homework','lesson','library','playground'], cn: ['学校','班级','教室','老师','学生','书','钢笔','铅笔','书包','课桌','椅子','黑板','作业','课','图书馆','操场'] },
  { name: '天气季节', kind: 'grid', en: ['weather','sunny','rainy','windy','cloudy','snowy','cold','hot','warm','cool','spring','summer','autumn','winter','rain','snow','wind'], cn: ['天气','晴','雨','风','云','雪','冷','热','暖','凉','春','夏','秋','冬'] },
  { name: '星期月份', kind: 'line', en: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday','week','january','february','march','april','may','june','july','august','september','october','november','december','month'], cn: ['星期','周一','周二','周三','周四','周五','周六','周日','月','一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'] },
  { name: '运动游戏', kind: 'grid', en: ['sport','play','run','jump','swim','football','basketball','game','ball','chess','dance','sing','race','win','team'], cn: ['运动','玩','跑','跳','游泳','足球','篮球','游戏','球','棋','跳舞','唱','比赛','赢','队'] },
  { name: '交通出行', kind: 'grid', en: ['bus','car','train','plane','ship','bike','bicycle','taxi','subway','station','airport','road','street','travel','trip','ticket'], cn: ['公交车','汽车','火车','飞机','船','自行车','出租车','地铁','车站','机场','路','街道','旅行','票'] },
  { name: '职业', kind: 'grid', en: ['job','doctor','nurse','teacher','farmer','worker','driver','police','cook','player','student','manager','engineer'], cn: ['工作','医生','护士','教师','农民','工人','司机','警察','厨师','运动员','学生','经理','工程师'] },
  { name: '房间家具', kind: 'grid', en: ['room','bedroom','kitchen','bathroom','living room','bed','sofa','table','chair','door','window','light','lamp','floor','wall','home','house'], cn: ['房间','卧室','厨房','浴室','客厅','床','沙发','桌','椅','门','窗','灯','地板','墙','家','房子'] },
  { name: '感受情绪', kind: 'grid', en: ['happy','sad','angry','afraid','excited','worried','tired','sorry','love','like','feel','fun','glad','scared','nervous'], cn: ['高兴','难过','生气','害怕','激动','担心','累','抱歉','爱','喜欢','感觉','有趣','害怕','紧张'] }
];
function themeOf(w, m) {
  const lw = w.toLowerCase();
  for (const t of THEMES) {
    if (t.en.some(x => lw === x || lw.indexOf(x) >= 0 && x.length >= 4)) return t;
    if (t.cn.some(x => m && m.indexOf(x) >= 0)) return t;
  }
  return null;
}
const theme = {};
books.forEach((b, bi) => b.units.forEach((u, ui) => {
  const groups = {}, others = [];
  u.ids.forEach(idx => {
    const t = themeOf(flat[idx][2], flat[idx][3]);
    if (t) (groups[t.name] = groups[t.name] || { kind: t.kind, ids: [] }).ids.push(idx);
    else others.push(idx);
  });
  const list = Object.keys(groups).filter(k => groups[k].ids.length >= 2).map(k => [k, groups[k].kind, groups[k].ids]);
  const spill = Object.keys(groups).filter(k => groups[k].ids.length < 2).reduce((a, k) => a.concat(groups[k].ids), []);
  if (others.length + spill.length) list.push(['其他词', 'grid', others.concat(spill)]);
  theme['u' + bi + '_' + ui] = list;
}));

/* ---------- 9. 汇总输出 ---------- */
const ex = {}, seg = {};
for (let i = 0; i < N; i++) {
  const f = flat[i];
  ex[i] = makeExample(f[2], f[3], f[5]);
  seg[i] = splitWord(f[2]).map(s => s[0]);
}
const out = {
  meta: {
    source: '单词精灵岛 · 人教版教材词库（26 册 178 单元）',
    words: N, books: books.length,
    units: books.reduce((a, b) => a + b.units.length, 0),
    usageSentences: Object.keys(exUsage).length,
    segFromRoots: Object.keys(rootSeg).length,
    builtAt: new Date().toISOString().slice(0, 10)
  },
  books: books, flat: flat, ex: ex, seg: seg,
  fam: famHit, famMembers: famMembers, phon: PHON, rules: ruleMeta,
  hid: hid, con: con, shape: shape, fx: fx, theme: theme, byWord: byWord
};
const dest = path.join(__dirname, 'flash-data.js');
fs.writeFileSync(dest, '/* 自动生成，勿手改；重新生成运行 node build-enrich.js */\nwindow.FLASH = ' + JSON.stringify(out) + ';\n', 'utf8');

console.log('=== 闪卡派生数据核对 ===');
console.log('词条        : ' + N + '  册 ' + out.meta.books + '  单元 ' + out.meta.units);
console.log('真题例句    : ' + out.meta.usageSentences + ' 个词（其余按词性模板生成）');
console.log('roots 拆段  : ' + out.meta.segFromRoots + ' 个词（其余按元音核程序拆分）');
console.log('拼读家族命中: ' + Object.keys(famHit).length + '  藏词: ' + Object.keys(hid).length + '  易混词: ' + Object.keys(con).length);
console.log('形状窍门    : ' + Object.keys(shape).length + '  特效词: ' + Object.keys(fx).length + '  主题分组单元: ' + Object.keys(theme).length);
console.log('拆段还原校验: ' + (() => { let bad = 0; for (let i = 0; i < N; i++) if (seg[i].join('').toLowerCase() !== flat[i][2].toLowerCase().replace(/\s+/g, '')) bad++; return bad === 0 ? '全部通过' : (bad + ' 条异常'); })());
console.log('例句抽样    : ' + JSON.stringify([ex[0], ex[100], ex[1000], ex[3000]]));
console.log('拆段抽样    : elephant=' + JSON.stringify(seg[byWord['elephant']]) + '  family=' + JSON.stringify(seg[byWord['family']]) + '  teacher=' + JSON.stringify(seg[byWord['teacher']]));
console.log('藏词抽样    : bear=' + JSON.stringify(hid[byWord['bear']]) + '  elephant=' + JSON.stringify(hid[byWord['elephant']]));
console.log('已写出: flash-data.js (' + fs.statSync(dest).size + ' bytes)');
