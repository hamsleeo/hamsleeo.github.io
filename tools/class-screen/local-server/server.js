/* 班务大屏 · 本地服务器
 * 零依赖 Node HTTP 服务：静态站点 + 本地账号/权限/班级数据 API
 * 数据持久化在 data/db.json（含密码哈希，勿提交到公开仓库）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(DATA_DIR, 'seed-main.json');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_DAYS = 30;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const CLASS_NAMES = {
  main: '915班',
  class1: '七年级（1）班',
  class2: '七年级（2）班',
  class3: '八年级（1）班',
  class4: '八年级（2）班',
  class5: '八年级（3）班',
  class6: '九年级（1）班',
  class7: '九年级（2）班',
  class8: '九年级（3）班'
};

function now() { return new Date().toISOString(); }
function uid(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function loadSeed() {
  try {
    if (fs.existsSync(SEED_FILE)) return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  } catch (e) {
    console.error('[warn] 种子数据读取失败：' + e.message);
  }
  return null;
}

function blankState() {
  const seed = loadSeed();
  if (seed && typeof seed === 'object') {
    const s = deepClone(seed);
    ['students', 'groups', 'events', 'shoutHistory', 'models', 'fun', 'announcements', 'homework', 'schedule', 'duty', 'leaves']
      .forEach(k => { if (Array.isArray(s[k])) s[k] = []; });
    if (s.weeklySchedule) Object.keys(s.weeklySchedule).forEach(d => { s.weeklySchedule[d] = []; });
    if (s.attendance && typeof s.attendance === 'object') s.attendance = {};
    s.weekNet = [0, 0, 0, 0, 0, 0, 0];
    s.shout = null;
    s.layoutVersion = 0;
    return s;
  }
  return { className: '班级班务大屏', students: [], weeklySchedule: {}, shout: null, layoutVersion: 0 };
}

function initDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.users = db.users || [];
    db.sessions = db.sessions || {};
    db.classes = db.classes || [];
    db.boards = db.boards || {};
    db.assignments = db.assignments || [];
    db.blocklist = db.blocklist || [];
    return db;
  }
  const db = {
    users: [], sessions: {}, classes: [], boards: {}, assignments: [], blocklist: [],
    createdAt: now()
  };
  Object.keys(CLASS_NAMES).forEach(key => {
    db.classes.push({ board_key: key, class_name: CLASS_NAMES[key] });
    db.boards[key] = {
      data: key === 'main' && loadSeed() ? loadSeed() : blankState(),
      updated_at: now(),
      owner_name: '系统初始化'
    };
  });
  saveDb(db);
  return db;
}

let db = initDb();

function saveDb(next) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function makeUser(phone, password, role, displayName) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id: uid('u'), phone: phone, salt: salt, passwordHash: hashPassword(password, salt),
    displayName: displayName || phone, role: role || 'teacher',
    createdAt: now(), blocked: false
  };
}
function publicUser(u) {
  return { user_id: u.id, role: u.role, display_name: u.displayName, phone: u.phone, created_at: u.createdAt };
}
function classesOf(u) {
  if (u.role === 'admin') return db.classes.map(c => c.board_key);
  return db.assignments.filter(a => a.userId === u.id).map(a => a.boardKey);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function fail(res, status, message) { sendJson(res, status, { error: message }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}

function currentUser(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const s = db.sessions[m[1]];
  if (!s || s.expires < Date.now()) return null;
  return db.users.find(u => u.id === s.userId) || null;
}
function requireUser(req, res) {
  const u = currentUser(req);
  if (!u) { fail(res, 401, '请先登录'); return null; }
  if (u.blocked) { fail(res, 403, '该账号已被停用'); return null; }
  return u;
}
function requireAdmin(req, res) {
  const u = requireUser(req, res);
  if (!u) return null;
  if (u.role !== 'admin') { fail(res, 403, '需要管理员权限'); return null; }
  return u;
}
function canEditBoard(u, key) {
  return u.role === 'admin' || db.assignments.some(a => a.userId === u.id && a.boardKey === key);
}
function createSession(u) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: u.id, expires: Date.now() + SESSION_DAYS * 86400000 };
  saveDb(db);
  return token;
}

async function handleApi(req, res, urlObj) {
  const p = urlObj.pathname;
  const method = req.method;

  if (p === '/api/health' && method === 'GET') return sendJson(res, 200, { ok: true, mode: 'local', time: now() });

  /* ---------- 登录 ---------- */
  if (p === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req);
    const phone = String(body.phone || '').replace(/\D/g, '');
    const password = String(body.password || '');
    if (!/^1\d{10}$/.test(phone)) return fail(res, 400, '请输入正确的 11 位手机号');
    if (password.length < 6) return fail(res, 400, '密码至少 6 位');

    let u = db.users.find(x => x.phone === phone);
    if (!u) {
      if (db.blocklist.some(b => b.phone === phone)) return fail(res, 403, '该账号已被停用，请联系管理员恢复');
      const role = db.users.length === 0 ? 'admin' : 'teacher';
      u = makeUser(phone, password, role, phone);
      db.users.push(u);
      saveDb(db);
      console.log('[auth] 新用户注册：' + phone + ' → ' + role);
    } else {
      if (u.blocked) return fail(res, 403, '该账号已被停用，请联系管理员恢复');
      if (hashPassword(password, u.salt) !== u.passwordHash) return fail(res, 401, '手机号或密码错误');
    }
    const token = createSession(u);
    return sendJson(res, 200, {
      access_token: token,
      user: { id: u.id, phone: u.phone, name: u.displayName }
    });
  }

  if (p === '/api/auth/session' && method === 'GET') {
    const u = requireUser(req, res);
    if (!u) return;
    return sendJson(res, 200, { user: { id: u.id, phone: u.phone, name: u.displayName } });
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (m && db.sessions[m[1]]) { delete db.sessions[m[1]]; saveDb(db); }
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/auth/change-password' && method === 'POST') {
    const u = requireUser(req, res);
    if (!u) return;
    const body = await readBody(req);
    const oldPwd = String(body.oldPassword || '');
    const newPwd = String(body.newPassword || '');
    if (newPwd.length < 6) return fail(res, 400, '新密码至少 6 位');
    if (hashPassword(oldPwd, u.salt) !== u.passwordHash) return fail(res, 400, '原密码错误');
    u.salt = crypto.randomBytes(16).toString('hex');
    u.passwordHash = hashPassword(newPwd, u.salt);
    saveDb(db);
    return sendJson(res, 200, { ok: true });
  }

  /* ---------- 班级 ---------- */
  if (p === '/api/classes' && method === 'GET') {
    if (!requireUser(req, res)) return;
    return sendJson(res, 200, db.classes.slice().sort((a, b) => a.board_key.localeCompare(b.board_key)));
  }

  if (p === '/api/classes' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const key = String(body.key || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,32}$/.test(key)) return fail(res, 400, '班级代码需 2-32 位字母、数字、下划线或短横线');
    if (db.classes.some(c => c.board_key === key)) return fail(res, 400, '该班级代码已存在');
    const cls = { board_key: key, class_name: String(body.className || key).slice(0, 40) };
    db.classes.push(cls);
    db.boards[key] = { data: blankState(), updated_at: now(), owner_name: '系统初始化' };
    saveDb(db);
    return sendJson(res, 200, cls);
  }

  const boardMatch = /^\/api\/boards\/([^/]+)$/.exec(p);
  if (boardMatch) {
    const key = decodeURIComponent(boardMatch[1]);
    if (method === 'GET') {
      const row = db.boards[key];
      if (!row || !row.data || !Object.keys(row.data).length) return fail(res, 404, '暂无数据');
      return sendJson(res, 200, row);
    }
    if (method === 'PUT') {
      const u = requireUser(req, res);
      if (!u) return;
      if (!canEditBoard(u, key)) return fail(res, 403, '没有权限修改本班数据，请联系管理员分配班级');
      const body = await readBody(req);
      if (!body.data || typeof body.data !== 'object') return fail(res, 400, '数据格式错误');
      const row = db.boards[key] || { data: {}, updated_at: now(), owner_name: '' };
      row.data = body.data;
      row.updated_at = now();
      row.owner_name = u.displayName || u.phone;
      db.boards[key] = row;
      saveDb(db);
      return sendJson(res, 200, row);
    }
  }

  /* ---------- 大屏端免密作业编辑 ----------
     仅供一体机大屏上的各科老师/课代表快速登记当日作业；
     只改 board.data.homework 一个字段，其他数据（积分/名单/课表等）一律不碰，
     因此无需登录、也不会放大权限面。字段做长度/条数上限防止误填刷屏。 */
  if (p === '/api/homework' && method === 'POST') {
    const body = await readBody(req);
    const key = decodeURIComponent(String(body.key || '').trim() || 'main');
    const hw = body.homework;
    if (!Array.isArray(hw) || hw.length > 30) return fail(res, 400, '作业格式错误或科目过多');
    const clean = [];
    for (const h of hw) {
      if (!h || typeof h !== 'object') continue;
      const subject = String(h.subject || '其他').trim().slice(0, 12) || '其他';
      const items = Array.isArray(h.items) ? h.items.slice(0, 20).map(it => ({
        title: String((it && it.title) || '').trim().slice(0, 120),
        detail: String((it && it.detail) || '').trim().slice(0, 500)
      })).filter(it => it.title) : [];
      clean.push({ subject: subject, items: items });
    }
    const row = db.boards[key] || { data: {}, updated_at: now(), owner_name: '' };
    row.data = row.data || {};
    row.data.homework = clean;
    row.updated_at = now();
    row.owner_name = '大屏作业编辑';
    db.boards[key] = row;
    saveDb(db);
    return sendJson(res, 200, { ok: true, homework: clean, updated_at: row.updated_at });
  }

  /* 大屏端免密消消乐编辑：科代表直接登记各科未交作业情况。
     只改 board.data.fun 一个字段，其他数据（积分/名单/课表/作业等）一律不碰，
     因此无需登录、也不会放大权限面。条数/长度上限防止误填刷屏。 */
  if (p === '/api/fun' && method === 'POST') {
    const body = await readBody(req);
    const key = decodeURIComponent(String(body.key || '').trim() || 'main');
    const fun = body.fun;
    if (!Array.isArray(fun) || fun.length > 30) return fail(res, 400, '消消乐格式错误或科目过多');
    const clean = [];
    for (const f of fun) {
      if (!f || typeof f !== 'object') continue;
      const subject = String(f.subject || '其他').trim().slice(0, 12) || '其他';
      const title = String(f.title || '任务').trim().slice(0, 120) || '任务';
      const total = Math.max(0, Math.min(9999, Number(f.total) || 0));
      const done = Math.max(0, Math.min(total, Number(f.done) || 0));
      const unfinished = String(f.unfinished || '').trim().slice(0, 500);
      clean.push({ subject: subject, title: title, total: total, done: done, unfinished: unfinished });
    }
    const row = db.boards[key] || { data: {}, updated_at: now(), owner_name: '' };
    row.data = row.data || {};
    row.data.fun = clean;
    row.updated_at = now();
    row.owner_name = '大屏消消乐编辑';
    db.boards[key] = row;
    saveDb(db);
    return sendJson(res, 200, { ok: true, fun: clean, updated_at: row.updated_at });
  }

  /* ---------- 权限 ---------- */
  if (p === '/api/access' && method === 'POST') {
    const u = requireUser(req, res);
    if (!u) return;
    const body = await readBody(req);
    if (body.displayName && String(body.displayName).trim()) {
      u.displayName = String(body.displayName).trim().slice(0, 20);
      saveDb(db);
    }
    return sendJson(res, 200, {
      role: u.role,
      classes: classesOf(u),
      displayName: u.displayName
    });
  }

  if (p === '/api/users/me' && method === 'PATCH') {
    const u = requireUser(req, res);
    if (!u) return;
    const body = await readBody(req);
    const name = String(body.displayName || '').trim();
    if (!name) return fail(res, 400, '姓名不能为空');
    if (name.length > 20) return fail(res, 400, '姓名不能超过 20 个字');
    u.displayName = name;
    saveDb(db);
    return sendJson(res, 200, { display_name: name });
  }

  if (p === '/api/users' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const list = db.users.map(u => Object.assign(publicUser(u), { classes: classesOf(u) }));
    return sendJson(res, 200, list);
  }

  const assignMatch = /^\/api\/users\/([^/]+)\/assign$/.exec(p);
  if (assignMatch && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(assignMatch[1]);
    const body = await readBody(req);
    const key = String(body.boardKey || '');
    if (!db.users.some(u => u.id === id)) return fail(res, 404, '用户不存在');
    if (!db.classes.some(c => c.board_key === key)) return fail(res, 400, '班级不存在');
    if (!db.assignments.some(a => a.userId === id && a.boardKey === key)) {
      db.assignments.push({ userId: id, boardKey: key });
      saveDb(db);
    }
    return sendJson(res, 200, { ok: true });
  }

  const unassignMatch = /^\/api\/users\/([^/]+)\/assign\/([^/]+)$/.exec(p);
  if (unassignMatch && method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(unassignMatch[1]);
    const key = decodeURIComponent(unassignMatch[2]);
    db.assignments = db.assignments.filter(a => !(a.userId === id && a.boardKey === key));
    saveDb(db);
    return sendJson(res, 200, { ok: true });
  }

  const roleMatch = /^\/api\/users\/([^/]+)\/role$/.exec(p);
  if (roleMatch && method === 'PATCH') {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(roleMatch[1]);
    const body = await readBody(req);
    const role = body.role === 'admin' ? 'admin' : 'teacher';
    const u = db.users.find(x => x.id === id);
    if (!u) return fail(res, 404, '用户不存在');
    if (u.role === 'admin' && role === 'teacher' &&
        db.users.filter(x => x.role === 'admin' && !x.blocked).length <= 1) {
      return fail(res, 400, '至少保留一名管理员');
    }
    u.role = role;
    saveDb(db);
    return sendJson(res, 200, publicUser(u));
  }

  if (p === '/api/blocked' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return sendJson(res, 200, db.blocklist.slice().reverse());
  }

  const deleteMatch = /^\/api\/users\/([^/]+)$/.exec(p);
  if (deleteMatch && method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(deleteMatch[1]);
    const u = db.users.find(x => x.id === id);
    if (!u) return fail(res, 404, '用户不存在');
    if (u.role === 'admin') return fail(res, 400, '不能删除管理员');
    u.blocked = true;
    db.assignments = db.assignments.filter(a => a.userId !== id);
    if (!db.blocklist.some(b => b.userId === id)) {
      db.blocklist.push({ userId: id, display_name: u.displayName, phone: u.phone, blocked_at: now() });
    }
    Object.keys(db.sessions).forEach(t => { if (db.sessions[t].userId === id) delete db.sessions[t]; });
    saveDb(db);
    return sendJson(res, 200, { ok: true });
  }

  const restoreMatch = /^\/api\/blocked\/([^/]+)\/restore$/.exec(p);
  if (restoreMatch && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(restoreMatch[1]);
    const u = db.users.find(x => x.id === id);
    if (!u) return fail(res, 404, '用户不存在');
    u.blocked = false;
    db.blocklist = db.blocklist.filter(b => b.userId !== id);
    saveDb(db);
    return sendJson(res, 200, { ok: true });
  }

  return fail(res, 404, '接口不存在：' + method + ' ' + p);
}

function serveStatic(req, res, urlObj) {
  let pathname;
  try { pathname = decodeURIComponent(urlObj.pathname); } catch (e) { return fail(res, 400, '路径错误'); }
  if (pathname === '/') pathname = '/index.html';
  const full = path.normalize(path.join(ROOT, pathname));
  if (full.indexOf(ROOT) !== 0) return fail(res, 403, '禁止访问');
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return fail(res, 404, '文件不存在');
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(full).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    if (urlObj.pathname.indexOf('/api/') === 0) {
      await handleApi(req, res, urlObj);
    } else {
      serveStatic(req, res, urlObj);
    }
  } catch (e) {
    console.error('[error] ' + e.stack);
    if (!res.headersSent) fail(res, 500, e.message || '服务器错误');
  }
});

server.listen(PORT, HOST, () => {
  console.log('班务大屏本地服务器已启动');
  console.log('  本机: http://127.0.0.1:' + PORT + '/tools/class-screen/index.html?class=main');
  console.log('  管理: http://127.0.0.1:' + PORT + '/tools/class-screen/admin.html');
  console.log('  数据: ' + DB_FILE);
  console.log('  首个登录的手机号自动成为管理员，其余手机号登录自动注册为班主任。');
});
