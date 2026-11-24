/* 后台「软件管理」：downloads 表增删改查 + 后台分区切换
   仅在 admin.html 加载。页面已通过管理员校验，写入权限再由云端 RLS 把关。 */
(function () {
  'use strict';

  var cloud = window.WFC_CLOUD;
  var $ = function (id) { return document.getElementById(id); };
  var rows = [];
  var editingId = null;
  var delArm = null;
  var delTimer = null;
  var loaded = false;

  var SQL = [
    'create table if not exists public.downloads (',
    '  id text primary key,',
    '  name text not null,',
    '  version text,',
    '  size text,',
    '  platform text,',
    '  category text,',
    '  icon text,',
    '  url text not null,',
    '  mirror text,',
    '  description text,',
    '  note text,',
    '  sort_order int default 10,',
    '  enabled boolean default true,',
    '  created_at timestamptz default now(),',
    '  updated_at timestamptz default now()',
    ');',
    'alter table public.downloads enable row level security;',
    'create policy downloads_read on public.downloads for select using (true);',
    'create policy downloads_admin_write on public.downloads for all using (public.is_admin()) with check (public.is_admin());'
  ].join('\n');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function friendly(e) {
    if (!e) return '操作失败，请重试';
    var m = String(e.message || e || '');
    if (/does not exist|schema cache|not found/i.test(m)) return '云端还没有 downloads 表';
    if (e.code === '23505') return '这个 ID 已存在，请换个 ID';
    if (e.code === '42501') return '没有权限执行这个操作';
    return m || '操作失败，请重试';
  }

  function urlOk(u) {
    if (!u) return false;
    if (/^(javascript|data|vbscript|file):/i.test(u)) return false;
    if (/^https?:\/\//i.test(u)) return true;
    return /^(files|tools)\/[^\s]+$/i.test(u);
  }

  function errBox(text) {
    return '<div class="admin-empty">' + esc(text) +
      '　<button class="btn btn-sm" data-dl-reload="1">重试</button></div>';
  }

  function setupHtml() {
    return '<div class="dl-setup"><b>云端还没有 downloads 表</b>，所以软件管理暂时用不了。' +
      '在云端控制台执行下面这段 SQL（只做一次；如提示 policy 已存在，忽略即可），然后点「刷新列表」：' +
      '<pre>' + esc(SQL) + '</pre></div>';
  }

  /* ---------- 分区切换 ---------- */
  var tabs = $('adminTabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var t = e.target.closest('.atab');
      if (!t) return;
      Array.prototype.forEach.call(tabs.querySelectorAll('.atab'), function (x) {
        x.classList.toggle('active', x === t);
      });
      var target = t.getAttribute('data-panel');
      ['panelTools', 'panelDownloads'].forEach(function (id) {
        var el = $(id);
        if (el) el.hidden = (id !== target);
      });
      if (target === 'panelDownloads' && !loaded) loadDl();
    });
  }

  /* ---------- 读取 ---------- */
  function loadDl() {
    var wrap = $('dlList');
    if (!wrap) return;
    if (!cloud) { wrap.innerHTML = errBox('云服务未连接，请检查网络后刷新'); return; }
    wrap.innerHTML = '<div class="admin-empty">正在读取…</div>';
    cloud.database.from('downloads').select('*').order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) { fail(res.error); return; }
        rows = Array.isArray(res.data) ? res.data : [];
        loaded = true;
        renderDl();
      })
      .catch(function (e) { fail(e); });
  }

  function fail(e) {
    var m = String((e && e.message) || e || '');
    if (/does not exist|schema cache|not found/i.test(m)) {
      $('dlList').innerHTML = setupHtml();
      $('dlAdminSummary').textContent = '云端缺少 downloads 表，需先建表';
      return;
    }
    $('dlList').innerHTML = errBox(friendly(e));
  }

  function renderDl() {
    var html = '<div class="table-head"><span></span><span>软件</span><span>分类</span><span>状态</span><span>排序</span><span style="text-align:right">操作</span></div>';
    if (!rows.length) {
      html += '<div class="admin-empty">还没有软件，点右上角「＋ 新增软件」添加。</div>';
    } else {
      rows.forEach(function (r) {
        var armed = delArm === r.id;
        html += '<div class="tool-row" data-id="' + esc(r.id) + '">' +
          '<div class="e">' + esc(r.icon || '⬇') + '</div>' +
          '<div><div class="nm">' + esc(r.name) +
            (r.version ? ' <span style="color:var(--ink-3);font-weight:400;font-size:11.5px">' + esc(r.version) + '</span>' : '') +
          '</div><div class="sub">' + esc(r.url || '') + '</div></div>' +
          '<div class="cat">' + esc(r.category || '其他') + '</div>' +
          '<div><span class="status' + (r.enabled ? '' : ' off') + '"><i></i>' + (r.enabled ? '已上架' : '已停用') + '</span></div>' +
          '<div class="sort">' + esc(r.sort_order) + '</div>' +
          '<div class="row-actions">' +
            '<button data-act="dl-open">打开</button>' +
            '<button data-act="dl-edit">编辑</button>' +
            '<button data-act="dl-toggle">' + (r.enabled ? '停用' : '上架') + '</button>' +
            '<button data-act="dl-del" class="danger' + (armed ? ' armed' : '') + '">' + (armed ? '确认删除' : '删除') + '</button>' +
          '</div></div>';
      });
    }
    $('dlList').innerHTML = html;
    var on = rows.filter(function (r) { return r.enabled; }).length;
    $('dlAdminSummary').textContent = '共 ' + rows.length + ' 个软件，' + on + ' 个在前台显示 · 保存后前台刷新即可看到';
  }

  function rowById(id) {
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  function disarm() {
    delArm = null;
    clearTimeout(delTimer);
  }

  /* ---------- 列表操作 ---------- */
  var list = $('dlList');
  if (list) {
    list.addEventListener('click', function (e) {
      if (e.target.closest('[data-dl-reload]')) { loadDl(); return; }
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var rowEl = e.target.closest('.tool-row');
      if (!rowEl) return;
      var r = rowById(rowEl.getAttribute('data-id'));
      if (!r) return;
      var act = btn.getAttribute('data-act');

      if (act === 'dl-open') {
        if (!r.url) { toast('这个软件还没有下载地址，请先编辑'); return; }
        window.open(r.url, '_blank', 'noopener');
        return;
      }
      if (act === 'dl-edit') { openDlEdit(r); return; }

      if (act === 'dl-toggle') {
        cloud.database.from('downloads')
          .update({ enabled: !r.enabled, updated_at: new Date().toISOString() })
          .eq('id', r.id).select()
          .then(function (res) {
            if (res.error) { toast(friendly(res.error)); return; }
            if (!res.data || !res.data.length) { toast('没有权限或记录不存在'); return; }
            loadDl();
            toast(r.enabled ? '已停用，前台将不再显示' : '已上架，前台刷新可见');
          })
          .catch(function (err) { toast(friendly(err)); });
        return;
      }

      if (act === 'dl-del') {
        if (delArm !== r.id) {
          disarm();
          delArm = r.id;
          renderDl();
          toast('再点一次「确认删除」即可删除');
          delTimer = setTimeout(function () { disarm(); renderDl(); }, 4000);
          return;
        }
        disarm();
        cloud.database.from('downloads').delete().eq('id', r.id).select()
          .then(function (res) {
            if (res.error) { toast(friendly(res.error)); return; }
            if (!res.data || !res.data.length) { toast('没有权限或记录不存在'); return; }
            loadDl();
            toast('已删除（files/ 里的安装包文件不会自动删除，需要手动清理）');
          })
          .catch(function (err) { toast(friendly(err)); });
      }
    });
  }

  var addBtn = $('dlAddBtn');
  if (addBtn) addBtn.addEventListener('click', function () { openDlEdit(null); });
  var reloadBtn = $('dlReloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', function () { loadDl(); toast('已刷新'); });

  /* ---------- 新增 / 编辑表单 ---------- */
  function openDlEdit(r) {
    editingId = r ? r.id : null;
    $('dlEditTitle').textContent = r ? '编辑软件' : '新增软件';
    $('dId').value = r ? r.id : '';
    $('dId').readOnly = !!r;
    $('dName').value = r ? (r.name || '') : '';
    $('dVersion').value = r ? (r.version || '') : '';
    $('dSize').value = r ? (r.size == null ? '' : String(r.size)) : '';
    $('dPlatform').value = r ? (r.platform || '') : '';
    $('dCategory').value = r ? (r.category || '其他') : '其他';
    $('dIcon').value = r ? (r.icon || '⬇') : '⬇';
    $('dUrl').value = r ? (r.url || '') : '';
    $('dMirror').value = r ? (r.mirror || '') : '';
    $('dDesc').value = r ? (r.description || '') : '';
    $('dNote').value = r ? (r.note || '') : '';
    $('dSort').value = r ? (r.sort_order == null ? 10 : r.sort_order) : (rows.length + 1) * 10;
    $('dEnabled').checked = r ? !!r.enabled : true;
    $('dlOverlay').classList.add('show');
  }

  function closeDlEdit() { $('dlOverlay').classList.remove('show'); }

  var closeBtn = $('dlEditClose');
  if (closeBtn) closeBtn.addEventListener('click', closeDlEdit);
  var cancelBtn = $('dlEditCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeDlEdit);
  var overlay = $('dlOverlay');
  if (overlay) overlay.addEventListener('click', function (e) { if (e.target === this) closeDlEdit(); });

  var form = $('dlForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!cloud) { toast('云服务未连接，请检查网络后刷新'); return; }
      var id = $('dId').value.trim();
      var url = $('dUrl').value.trim();
      if (!/^[a-z0-9][a-z0-9-_]*$/i.test(id)) { toast('ID 只能用字母、数字、连字符和下划线'); return; }
      if (!urlOk(url)) { toast('下载地址需为 files/ 下的相对路径，或 https:// 完整网址'); return; }

      var payload = {
        name: $('dName').value.trim(),
        version: $('dVersion').value.trim(),
        size: $('dSize').value.trim(),
        platform: $('dPlatform').value.trim(),
        category: $('dCategory').value.trim() || '其他',
        icon: $('dIcon').value.trim() || '⬇',
        url: url,
        mirror: $('dMirror').value.trim(),
        description: $('dDesc').value.trim(),
        note: $('dNote').value.trim(),
        sort_order: parseInt($('dSort').value, 10) || 0,
        enabled: $('dEnabled').checked,
        updated_at: new Date().toISOString()
      };
      if (!payload.name) { toast('请填软件名称'); return; }

      var btn = this.querySelector('[type="submit"]');
      btn.disabled = true; btn.textContent = '正在保存…';
      var q = editingId
        ? cloud.database.from('downloads').update(payload).eq('id', editingId).select()
        : cloud.database.from('downloads').insert(Object.assign({ id: id }, payload)).select();

      q.then(function (res) {
        btn.disabled = false; btn.textContent = '保存到云端';
        if (res.error) { toast(friendly(res.error)); return; }
        if (!res.data || !res.data.length) { toast('保存未生效：没有管理权限或记录不存在'); return; }
        closeDlEdit();
        loadDl();
        toast(editingId ? '已保存，前台刷新可见' : '已上架，前台刷新可见');
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = '保存到云端';
        toast(friendly(err));
      });
    });
  }
})();
