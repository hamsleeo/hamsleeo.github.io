/* 习题 PPT · PDF 框选一键成片
   纯前端实现：pdf.js 渲染 / 裁剪，PptxGenJS 导出 PPTX，jsPDF 导出 PDF。
   所有文件都在本机浏览器处理，不上传任何数据。 */
(function () {
'use strict';

var pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
}
var PptxGenJS = window.PptxGenJS;
var JsPDF = window.jspdf && window.jspdf.jsPDF;

var $ = function (id) { return document.getElementById(id); };
var MAX_DOCS = 10;

var S = {
  docs: [],
  active: 0,
  slides: [],
  history: [],
  settings: { quality: 2, style: 'clean', source: true, cover: false, title: '习题讲评', sign: '' },
  renderSeq: 0,
  busy: false,
  previewIndex: 0
};

var canvas = $('pdfCanvas');
var stage = $('pdfStage');
var selectBox = $('selectBox');
var drag = null;

/* ---------- 工具函数 ---------- */
function toast(msg, ms) {
  var el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.hidden = true; }, ms || 2600);
}
function snapshot() {
  S.history.push(JSON.stringify(S.slides));
  if (S.history.length > 30) S.history.shift();
  updateUndo();
}
function updateUndo() { $('undoCount').textContent = S.history.length; }
function activeDoc() { return S.docs[S.active] || null; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function contain(iw, ih, bw, bh) {
  if (!iw || !ih) return { w: bw, h: bh };
  var r = iw / ih, br = bw / bh;
  var w, h;
  if (r > br) { w = bw; h = bw / r; } else { h = bh; w = bh * r; }
  return { x: (bw - w) / 2, y: (bh - h) / 2, w: w, h: h };
}

/* ---------- PDF 载入与渲染 ---------- */
function addFiles(files) {
  var list = Array.prototype.slice.call(files || []).filter(function (f) {
    return /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  });
  if (!list.length) { toast('请选择 PDF 文件'); return; }
  if (S.docs.length + list.length > MAX_DOCS) {
    toast('最多添加 ' + MAX_DOCS + ' 个 PDF 文件');
    list = list.slice(0, MAX_DOCS - S.docs.length);
  }
  list.forEach(function (f) {
    if (S.docs.some(function (d) { return d.name === f.name; })) {
      toast('文件「' + f.name + '」已存在，已跳过'); return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      if (!pdfjsLib) { toast('PDF 渲染库未加载'); return; }
      pdfjsLib.getDocument({ data: new Uint8Array(reader.result) }).promise.then(function (pdf) {
        S.docs.push({
          id: uid(), name: f.name, pdf: pdf, pageCount: pdf.numPages,
          curPage: 1, rot: 0, zoom: 1
        });
        S.active = S.docs.length - 1;
        updateDocSelect();
        renderPage();
        toast('已添加：' + f.name + '（' + pdf.numPages + ' 页）');
      }).catch(function (e) {
        toast('无法加载 PDF：' + (e && e.message ? e.message : '请尝试其他文件'));
      });
    };
    reader.onerror = function () { toast('读取文件失败：' + f.name); };
    reader.readAsArrayBuffer(f);
  });
}

function updateDocSelect() {
  var sel = $('docSelect');
  sel.innerHTML = S.docs.length
    ? S.docs.map(function (d, i) {
        return '<option value="' + i + '"' + (i === S.active ? ' selected' : '') + '>' +
          escapeHtml(d.name) + '（' + d.pageCount + ' 页）</option>';
      }).join('')
    : '<option value="0">未添加文件</option>';
  $('stageEmpty').hidden = S.docs.length > 0;
}

function renderPage() {
  var doc = activeDoc();
  if (!doc) return;
  var seq = ++S.renderSeq;
  $('stageLoading').hidden = false;
  doc.pdf.getPage(doc.curPage).then(function (page) {
    if (seq !== S.renderSeq) return;
    var q = Number(S.settings.quality) || 2;
    var vp = page.getViewport({ scale: doc.zoom * q, rotation: doc.rot });
    canvas.width = Math.max(1, Math.floor(vp.width));
    canvas.height = Math.max(1, Math.floor(vp.height));
    canvas.style.width = Math.round(vp.width / q) + 'px';
    canvas.style.height = Math.round(vp.height / q) + 'px';
    var ctx = canvas.getContext('2d', { alpha: false });
    var task = page.render({ canvasContext: ctx, viewport: vp });
    return task.promise.then(function () {
      if (seq === S.renderSeq) $('stageLoading').hidden = true;
    });
  }).catch(function () {
    $('stageLoading').hidden = true;
    toast('页面渲染失败');
  });
  $('pageInfo').textContent = doc.curPage + ' / ' + doc.pageCount;
  $('zoomInfo').textContent = Math.round(doc.zoom * 100) + '%';
  $('prevPage').disabled = doc.curPage <= 1;
  $('nextPage').disabled = doc.curPage >= doc.pageCount;
}

/* ---------- 框选 ---------- */
function pointInCanvas(e) {
  var r = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
}
stage.addEventListener('mousedown', function (e) {
  if (!activeDoc() || e.button !== 0 || S.busy) return;
  var r = canvas.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
  var p = pointInCanvas(e);
  drag = { x0: p.x, y0: p.y, ox: canvas.offsetLeft, oy: canvas.offsetTop };
  selectBox.hidden = false;
  updateSelect(p);
  e.preventDefault();
});
window.addEventListener('mousemove', function (e) {
  if (!drag) return;
  updateSelect(pointInCanvas(e));
});
function updateSelect(p) {
  var x = Math.min(drag.x0, p.x), y = Math.min(drag.y0, p.y);
  var w = Math.abs(p.x - drag.x0), h = Math.abs(p.y - drag.y0);
  selectBox.style.left = (drag.ox + x) + 'px';
  selectBox.style.top = (drag.oy + y) + 'px';
  selectBox.style.width = w + 'px';
  selectBox.style.height = h + 'px';
  drag.rect = { x: x, y: y, w: w, h: h };
}
window.addEventListener('mouseup', function () {
  if (!drag) return;
  var d = drag; drag = null;
  selectBox.hidden = true;
  if (!d.rect || d.rect.w < 12 || d.rect.h < 12) return;
  cropSelection(d.rect);
});

function cropSelection(rect) {
  var doc = activeDoc();
  if (!doc) return;
  var kx = canvas.width / canvas.clientWidth;
  var ky = canvas.height / canvas.clientHeight;
  var sx = Math.max(0, Math.round(rect.x * kx));
  var sy = Math.max(0, Math.round(rect.y * ky));
  var sw = Math.min(canvas.width - sx, Math.round(rect.w * kx));
  var sh = Math.min(canvas.height - sy, Math.round(rect.h * ky));
  if (sw < 8 || sh < 8) { toast('框选区域太小'); return; }
  var tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  tmp.getContext('2d', { alpha: false }).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  var dataUrl = tmp.toDataURL('image/jpeg', 0.9);
  snapshot();
  S.slides.push({
    id: uid(), type: 'img',
    images: [{ dataUrl: dataUrl, w: sw, h: sh, docName: doc.name, page: doc.curPage }]
  });
  renderSlides();
  toast('已生成第 ' + S.slides.length + ' 张幻灯片');
}

/* ---------- 幻灯片列表 ---------- */
function renderSlides() {
  var list = $('slideList');
  $('slideCount').textContent = S.slides.length;
  if (!S.slides.length) {
    list.innerHTML = '<div class="slides-empty" id="slidesEmpty"><div class="empty-mark">◫</div>' +
      '<b>还没有幻灯片</b><span>在左边 PDF 上框选题目，就会自动排到这里</span></div>';
    return;
  }
  list.innerHTML = '<div class="slide-grid">' + S.slides.map(function (sl, i) {
    var thumb, src, ops;
    if (sl.type === 'cover') {
      thumb = '<div class="slide-thumb cover-thumb"><b>' + escapeHtml(sl.title || '习题讲评') + '</b>' +
        (sl.sign ? '<small>' + escapeHtml(sl.sign) + '</small>' : '') + '</div>';
      src = '封面';
      ops = '<button type="button" data-op="del" data-i="' + i + '">删除</button>';
    } else {
      thumb = '<div class="slide-thumb">' + sl.images.map(function (im) {
        return '<img src="' + im.dataUrl + '" alt="题目">';
      }).join('') + '</div>';
      src = sl.images.map(function (im) { return im.docName.replace(/\.pdf$/i, '').slice(0, 12) + ' P' + im.page; }).join(' · ');
      ops = (i > 0 && S.slides[i - 1].type !== 'cover' && S.slides[i - 1].images.length < 2 && sl.images.length === 1
          ? '<button type="button" data-op="merge" data-i="' + i + '">合并到上一页</button>' : '') +
        (sl.images.length > 1 ? '<button type="button" data-op="delimg" data-i="' + i + '">删除此图</button>' : '') +
        '<button type="button" class="danger" data-op="del" data-i="' + i + '">删除页</button>';
    }
    return '<div class="slide-card" draggable="true" data-i="' + i + '">' +
      '<span class="slide-drag">⋮⋮</span>' + thumb +
      '<div class="slide-meta"><span class="slide-no">第 ' + (i + 1) + ' 页</span>' +
      '<span class="slide-src" title="' + escapeHtml(src) + '">' + escapeHtml(src) + '</span></div>' +
      '<div class="slide-ops">' + ops + '</div></div>';
  }).join('') + '</div>';
}

$('slideList').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-op]');
  if (!b) return;
  var i = Number(b.getAttribute('data-i'));
  var op = b.getAttribute('data-op');
  if (op === 'del') {
    snapshot(); S.slides.splice(i, 1); renderSlides(); toast('已删除第 ' + (i + 1) + ' 页');
  } else if (op === 'delimg') {
    snapshot(); S.slides[i].images.pop(); renderSlides(); toast('已删除一张图片');
  } else if (op === 'merge') {
    if (i <= 0) return;
    snapshot();
    S.slides[i - 1].images = S.slides[i - 1].images.concat(S.slides[i].images);
    S.slides.splice(i, 1); renderSlides(); toast('已合并到上一页');
  }
});

var dragIndex = -1;
$('slideList').addEventListener('dragstart', function (e) {
  var card = e.target.closest('.slide-card');
  if (!card) return;
  dragIndex = Number(card.getAttribute('data-i'));
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
$('slideList').addEventListener('dragover', function (e) {
  var card = e.target.closest('.slide-card');
  if (!card) return;
  e.preventDefault();
  Array.prototype.forEach.call(document.querySelectorAll('.slide-card'), function (c) { c.classList.remove('drag-over'); });
  card.classList.add('drag-over');
});
$('slideList').addEventListener('drop', function (e) {
  var card = e.target.closest('.slide-card');
  if (!card || dragIndex < 0) return;
  e.preventDefault();
  var to = Number(card.getAttribute('data-i'));
  if (to !== dragIndex) {
    snapshot();
    var item = S.slides.splice(dragIndex, 1)[0];
    S.slides.splice(to, 0, item);
    renderSlides();
    toast('已调整顺序');
  }
  dragIndex = -1;
});
$('slideList').addEventListener('dragend', function () {
  dragIndex = -1;
  Array.prototype.forEach.call(document.querySelectorAll('.slide-card'), function (c) {
    c.classList.remove('dragging', 'drag-over');
  });
});

$('btnUndo').addEventListener('click', function () {
  if (!S.history.length) { toast('没有可撤销的操作'); return; }
  S.slides = JSON.parse(S.history.pop());
  updateUndo(); renderSlides(); toast('已撤销');
});
$('btnAddCover').addEventListener('click', function () {
  snapshot();
  S.slides.unshift({ id: uid(), type: 'cover', title: S.settings.title || '习题讲评', sign: S.settings.sign || '' });
  renderSlides(); toast('已在最前面添加封面');
});

/* ---------- 设置弹窗 ---------- */
function openSettings() {
  $('setQuality').value = String(S.settings.quality);
  $('setStyle').value = S.settings.style;
  $('setSource').checked = S.settings.source;
  $('setCover').checked = S.settings.cover;
  $('setTitle').value = S.settings.title;
  $('setSign').value = S.settings.sign;
  $('coverFields').hidden = !S.settings.cover;
  $('settingsModal').hidden = false;
}
$('btnSettings').addEventListener('click', openSettings);
$('setCover').addEventListener('change', function () { $('coverFields').hidden = !this.checked; });
document.addEventListener('click', function (e) {
  if (e.target.closest('[data-close]')) {
    S.settings.quality = Number($('setQuality').value) || 2;
    S.settings.style = $('setStyle').value;
    S.settings.source = $('setSource').checked;
    S.settings.cover = $('setCover').checked;
    S.settings.title = $('setTitle').value.trim() || '习题讲评';
    S.settings.sign = $('setSign').value.trim();
    $('settingsModal').hidden = true;
    if (activeDoc()) renderPage();
  }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    $('settingsModal').hidden = true;
    $('previewModal').hidden = true;
  }
});

/* ---------- 全屏预览 ---------- */
function openPreview() {
  if (!S.slides.length) { toast('请先生成幻灯片'); return; }
  S.previewIndex = 0;
  $('previewModal').hidden = false;
  renderPreview();
}
function renderPreview() {
  var sl = S.slides[S.previewIndex];
  var stageEl = $('previewStage');
  $('previewInfo').textContent = (S.previewIndex + 1) + ' / ' + S.slides.length;
  $('prevSlide').disabled = S.previewIndex <= 0;
  $('nextSlide').disabled = S.previewIndex >= S.slides.length - 1;
  if (sl.type === 'cover') {
    stageEl.className = 'preview-stage cover';
    stageEl.innerHTML = '<b>' + escapeHtml(sl.title || '习题讲评') + '</b>' +
      (sl.sign ? '<small>' + escapeHtml(sl.sign) + '</small>' : '');
  } else {
    stageEl.className = 'preview-stage';
    stageEl.innerHTML = sl.images.map(function (im) {
      return '<img src="' + im.dataUrl + '" alt="题目">';
    }).join('') + (S.settings.source
      ? '<div style="position:absolute;bottom:6px;width:100%;text-align:center;font-size:12px;color:#888">' +
        sl.images.map(function (im) { return '来源 P' + im.page; }).join(' · ') + '</div>'
      : '');
  }
}
$('btnPreview').addEventListener('click', openPreview);
$('prevSlide').addEventListener('click', function () { if (S.previewIndex > 0) { S.previewIndex--; renderPreview(); } });
$('nextSlide').addEventListener('click', function () { if (S.previewIndex < S.slides.length - 1) { S.previewIndex++; renderPreview(); } });
$('closePreview').addEventListener('click', function () { $('previewModal').hidden = true; });

/* ---------- 导出 PPTX ---------- */
function slideLayout(im) {
  var W = 13.333, H = 7.5;
  var srcRatio = im.w / im.h;
  if (im.rows === 2) {
    var box = contain(srcRatio, 1, (W - 1.2) / 2, H - 1.35);
    return { x: 0.4 + im.col * ((W - 1.2) / 2 + 0.4) + box.x, y: 0.42 + box.y, w: box.w, h: box.h };
  }
  var b = contain(srcRatio, 1, W - 1.0, H - 1.35);
  return { x: 0.5 + b.x, y: 0.42 + b.y, w: b.w, h: b.h };
}
function exportPpt() {
  if (!S.slides.length) { toast('请先生成至少一张幻灯片'); return; }
  if (!PptxGenJS) { toast('PPT 导出库未加载'); return; }
  S.busy = true;
  toast('正在生成 PPT…', 60000);
  try {
    var pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    var W = 13.333, H = 7.5;
    var hasCover = S.slides[0] && S.slides[0].type === 'cover';
    var cover = hasCover ? S.slides[0] : null;
    if (S.settings.cover && !hasCover) {
      cover = { title: S.settings.title, sign: S.settings.sign };
    }
    var body = hasCover ? S.slides.slice(1) : S.slides.slice();
    if (cover) {
      var cs = pptx.addSlide();
      cs.background = { color: '0F2C21' };
      cs.addText(cover.title || '习题讲评', {
        x: 0.7, y: H * 0.32, w: W - 1.4, h: 1.3, fontSize: 40, bold: true,
        color: 'FFFFFF', align: 'center', fontFace: 'Microsoft YaHei'
      });
      if (cover.sign) {
        cs.addText(cover.sign, {
          x: 0.7, y: H * 0.32 + 1.5, w: W - 1.4, h: 0.6, fontSize: 18,
          color: '9DF3C1', align: 'center', fontFace: 'Microsoft YaHei'
        });
      }
    }
    body.forEach(function (sl) {
      if (sl.type === 'cover') return;
      var slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      sl.images.forEach(function (im, idx) {
        im.rows = sl.images.length; im.col = idx;
        var p = slideLayout(im);
        slide.addImage({ data: im.dataUrl, x: p.x, y: p.y, w: p.w, h: p.h });
        if (S.settings.style === 'card') {
          slide.addShape(pptx.ShapeType.rect, {
            x: p.x, y: p.y, w: p.w, h: p.h,
            line: { color: 'C9D6CE', width: 1 }, fill: { type: 'none' }
          });
        }
        if (S.settings.source) {
          slide.addText('来源 P' + im.page, {
            x: p.x, y: p.y + p.h + 0.02, w: p.w, h: 0.24,
            fontSize: 9, color: '8A9A90', align: 'center', fontFace: 'Microsoft YaHei'
          });
        }
      });
    });
    pptx.writeFile({ fileName: '习题PPT-' + stamp() + '.pptx' })
      .then(function () { toast('已导出 PPT · 共 ' + S.slides.length + ' 页'); })
      .catch(function () { toast('生成 PPT 时出错，请重试'); });
  } catch (err) {
    toast('生成 PPT 时出错：' + (err && err.message ? err.message : '请重试'));
  } finally { S.busy = false; }
}

/* ---------- 导出 PDF（canvas 合成整页，中文不丢字） ---------- */
function stamp() {
  var d = new Date();
  function n(x) { return x < 10 ? '0' + x : String(x); }
  return '' + d.getFullYear() + n(d.getMonth() + 1) + n(d.getDate()) + '-' + n(d.getHours()) + n(d.getMinutes());
}
function composeSlide(sl, W, H, scale) {
  var c = document.createElement('canvas');
  c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  var g = c.getContext('2d', { alpha: false });
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  if (sl.type === 'cover') {
    var grad = g.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#0f2c21'); grad.addColorStop(1, '#081611');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffffff';
    g.font = 'bold ' + Math.round(56 * scale) + 'px "Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sl.title || '习题讲评', c.width / 2, c.height * 0.46, c.width * 0.86);
    if (sl.sign) {
      g.fillStyle = '#9df3c1';
      g.font = Math.round(24 * scale) + 'px "Microsoft YaHei",sans-serif';
      g.fillText(sl.sign, c.width / 2, c.height * 0.6, c.width * 0.7);
    }
    return c;
  }
  var imgs = sl.images;
  var pad = 14 * scale;
  var top = 12 * scale, bottom = (S.settings.source ? 30 : 12) * scale;
  var areaH = c.height - top - bottom;
  imgs.forEach(function (im, idx) {
    var boxW = imgs.length === 2 ? (c.width - pad * 3) / 2 : c.width - pad * 2;
    var img = imageCache[im.dataUrl];
    var iw = img ? img.width : im.w, ih = img ? img.height : im.h;
    var b = contain(iw, ih, boxW, areaH);
    var x = imgs.length === 2 ? pad + idx * (boxW + pad) + b.x : pad + b.x;
    var y = top + b.y;
    if (!img) return;
    g.drawImage(img, x, y, b.w, b.h);
    if (S.settings.style === 'card') {
      g.strokeStyle = '#c9d6ce'; g.lineWidth = Math.max(1, scale);
      g.strokeRect(x, y, b.w, b.h);
    }
    if (S.settings.source) {
      g.fillStyle = '#8a9a90';
      g.font = Math.round(11 * scale) + 'px "Microsoft YaHei",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('来源 P' + im.page, x + b.w / 2, top + areaH + 6 * scale);
    }
  });
  return c;
}
var imageCache = {};
function preloadImages(cb) {
  var urls = [];
  S.slides.forEach(function (sl) {
    if (sl.type !== 'cover') sl.images.forEach(function (im) { urls.push(im.dataUrl); });
  });
  var left = urls.length;
  if (!left) { cb(); return; }
  urls.forEach(function (u) {
    if (imageCache[u]) { if (--left === 0) cb(); return; }
    var img = new Image();
    img.onload = function () { imageCache[u] = img; if (--left === 0) cb(); };
    img.onerror = function () { if (--left === 0) cb(); };
    img.src = u;
  });
}
function exportPdf() {
  if (!S.slides.length) { toast('请先生成至少一张幻灯片'); return; }
  if (!JsPDF) { toast('PDF 导出库未加载'); return; }
  S.busy = true;
  toast('正在生成 PDF…', 60000);
  preloadImages(function () {
    try {
      var pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: [297, 210] });
      S.slides.forEach(function (sl, i) {
        if (i) pdf.addPage();
        var c = composeSlide(sl, 297, 210, 4);
        pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 297, 210);
      });
      pdf.save('习题PPT-' + stamp() + '.pdf');
      toast('已导出 PDF · 共 ' + S.slides.length + ' 页');
    } catch (err) {
      toast('生成 PDF 时出错：' + (err && err.message ? err.message : '请重试'));
    } finally { S.busy = false; }
  });
}

/* ---------- 事件绑定 ---------- */
$('btnAdd').addEventListener('click', function () { $('fileInput').click(); });
$('fileInput').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
['dragenter', 'dragover'].forEach(function (ev) {
  stage.addEventListener(ev, function (e) { e.preventDefault(); stage.classList.add('drag-over'); });
});
['dragleave', 'drop'].forEach(function (ev) {
  stage.addEventListener(ev, function (e) { e.preventDefault(); stage.classList.remove('drag-over'); });
});
stage.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
$('docSelect').addEventListener('change', function () { S.active = Number(this.value) || 0; renderPage(); });
$('prevPage').addEventListener('click', function () { var d = activeDoc(); if (d && d.curPage > 1) { d.curPage--; renderPage(); } });
$('nextPage').addEventListener('click', function () { var d = activeDoc(); if (d && d.curPage < d.pageCount) { d.curPage++; renderPage(); } });
$('zoomIn').addEventListener('click', function () { var d = activeDoc(); if (d) { d.zoom = Math.min(4, d.zoom + 0.2); renderPage(); } });
$('zoomOut').addEventListener('click', function () { var d = activeDoc(); if (d) { d.zoom = Math.max(0.4, d.zoom - 0.2); renderPage(); } });
$('rotate').addEventListener('click', function () { var d = activeDoc(); if (d) { d.rot = (d.rot + 90) % 360; renderPage(); } });
$('btnExportPpt').addEventListener('click', exportPpt);
$('btnExportPdf').addEventListener('click', exportPdf);

/* ---------- 自检 ---------- */
function selftest() {
  var pass = 0, fail = 0;
  function ok(name, cond) { if (cond) pass++; else { fail++; console.warn('FAIL', name); } }
  ok('pdfjs 已加载', !!pdfjsLib);
  ok('PptxGenJS 已加载', !!PptxGenJS);
  ok('jsPDF 已加载', !!JsPDF);
  ok('画布存在', !!canvas && !!canvas.getContext);
  ok('contain 计算', (function () { var b = contain(2, 1, 10, 10); return b.w === 10 && Math.abs(b.h - 5) < .01; })());
  ok('初始无幻灯片', S.slides.length === 0);
  snapshot(); S.slides.push({ id: 't', type: 'cover', title: 'T', sign: '' });
  ok('新增幻灯片', S.slides.length === 1);
  ok('撤销栈', S.history.length === 1);
  S.slides = JSON.parse(S.history.pop());
  ok('撤销生效', S.slides.length === 0);
  ok('页面标题', /习题/.test(document.title));
  ok('导出按钮存在', !!$('btnExportPpt') && !!$('btnExportPdf'));
  ok('设置项存在', !!$('setQuality') && !!$('setStyle') && !!$('setSource'));
  ok('全屏预览结构', !!$('previewStage') && !!$('previewModal'));
  document.body.setAttribute('data-selftest', 'PASS:' + pass + ' FAIL:' + fail);
  return pass + '/' + fail;
}
window.__PPT_CROP__ = { state: S, selftest: selftest, addFiles: addFiles, exportPpt: exportPpt, exportPdf: exportPdf };
if (/[?&]selftest=1/.test(location.search)) {
  window.addEventListener('load', function () { setTimeout(selftest, 400); });
}
})();
