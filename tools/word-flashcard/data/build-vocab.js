/* 词库核对与转换脚本（可重复运行）
 * 用法：node build-vocab.js
 * 源数据：data/vocab-src.js —— 来自原版「单词精灵岛」工程 data/vocab.js，勿手改
 * 产出：  data/vocab.js —— 浏览器可直接 <script> 引用的完整词库
 * 同时输出各册词数核对清单，方便人工抽查「有没有漏词」
 */
const fs = require('fs');
const path = require('path');

const SRC = require('./vocab-src.js');
const names = Object.keys(SRC);

let mainBooks = 0, extraBooks = 0, mainUnits = 0, extraUnits = 0;
let mainWords = 0, extraWords = 0, withPh = 0, withPos = 0, total = 0;
const unique = new Set();
const rows = [];

const books = names.map((name, bi) => {
  const b = SRC[name];
  const extra = !!b.extra;
  const units = b.units || [];
  let bookWords = 0;

  const unitList = units.map((u, ui) => {
    const words = (u.words || []).map((w, wi) => {
      total++; bookWords++;
      if (w.ph) withPh++;
      if (w.pos) withPos++;
      unique.add(String(w.w || '').trim().toLowerCase());
      return {
        w: String(w.w || '').trim(),
        m: String(w.m || '').trim(),
        ph: String(w.ph || '').trim(),
        pos: String(w.pos || '').trim(),
        id: 'b' + bi + 'u' + ui + 'w' + wi
      };
    });
    return { id: 'b' + bi + 'u' + ui, title: u.title || ('Unit ' + (ui + 1)), words: words };
  });

  if (extra) { extraBooks++; extraUnits += units.length; extraWords += bookWords; }
  else { mainBooks++; mainUnits += units.length; mainWords += bookWords; }
  rows.push({ book: name, edition: b.edition || '', extra: extra, units: units.length, words: bookWords });

  return {
    id: 'b' + bi, name: name, edition: b.edition || '', extra: extra,
    order: typeof b.order === 'number' ? b.order : bi, units: unitList
  };
});

const out = {
  meta: {
    source: '单词精灵岛 · 人教版教材词库（新教材主体 + 旧版拓展）',
    books: books.length, mainBooks: mainBooks, extraBooks: extraBooks,
    units: mainUnits + extraUnits, mainUnits: mainUnits, extraUnits: extraUnits,
    words: total, mainWords: mainWords, extraWords: extraWords,
    uniqueWords: unique.size, withPh: withPh, withPos: withPos,
    builtAt: new Date().toISOString().slice(0, 10)
  },
  books: books
};

fs.writeFileSync(path.join(__dirname, 'vocab.js'),
  '/* 自动生成，勿手改；重新生成请运行 node build-vocab.js */\n' +
  'window.FULL_VOCAB = ' + JSON.stringify(out) + ';\n', 'utf8');

const m = out.meta;
console.log('=== 词库核对结果 ===');
console.log('册数        : ' + m.books + '（主体 ' + m.mainBooks + ' + 拓展 ' + m.extraBooks + '）');
console.log('单元数      : ' + m.units + '（主体 ' + m.mainUnits + ' + 拓展 ' + m.extraUnits + '）');
console.log('词条总数    : ' + m.words + '（主体 ' + m.mainWords + ' + 拓展 ' + m.extraWords + '）');
console.log('去重唯一词  : ' + m.uniqueWords);
console.log('带音标      : ' + m.withPh + ' / ' + m.words + ' (' + (m.withPh / m.words * 100).toFixed(1) + '%)');
console.log('带词性      : ' + m.withPos + ' / ' + m.words + ' (' + (m.withPos / m.words * 100).toFixed(1) + '%)');
console.log('');
console.log('=== 各册明细 ===');
console.log('册名\t版本\t类型\t单元\t词条');
rows.forEach(r => console.log([r.book, r.edition, r.extra ? '拓展' : '主体', r.units, r.words].join('\t')));
console.log('');
console.log('已写出: data/vocab.js (' + fs.statSync(path.join(__dirname, 'vocab.js')).size + ' bytes)');
