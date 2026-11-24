/**
 * 班务大屏 · Cloudflare Worker 反向代理
 * ------------------------------------------------------------------
 * 作用：让 https://www.smartlearner.top 下的班务大屏页面能调用
 *       class-screen-72644.app.workbuddy.host 的云端接口。
 *
 * 为什么需要：云端对 OPTIONS 预检返回 501，跨域请求会被浏览器拦成
 *             "Failed to fetch"。Worker 先把预检吃掉，再把请求转发，
 *             并把 Origin/Referer 换成云端自己，服务端就当成同源请求。
 *
 * 部署：Cloudflare 控制台 → Workers & Pages → Create Worker →
 *       把本文件全部内容粘贴进去 → Deploy。
 *       记下生成的地址，形如 https://xxx.yourname.workers.dev
 * ------------------------------------------------------------------
 */

const UPSTREAM = 'https://class-screen-72644.app.workbuddy.host';
const OAUTH_UPSTREAM = 'https://www.workbuddy.cn/v2/as/genie-baas/oauth';
const SHARECODE = 'DIEDM4D3JD';
const ALLOWED_ORIGIN = 'https://www.smartlearner.top';

// 带凭据请求时，Allow-Headers 不能用通配符，必须逐项列出
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-wb-webapp-access-key, X-Requested-With, Accept, Origin, Cache-Control',
  'Access-Control-Expose-Headers': 'Content-Type, X-Request-Id, x-trace-id',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
};

// 不能透传的逐跳响应头
const HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'content-encoding', 'content-length'
]);

// 浏览器不能跨站接受带 Domain 的 Cookie，去掉 Domain 让它种在 Worker 域名下
function cleanCookie(v) {
  return v.replace(/;\s*Domain=[^;]+/gi, '');
}

// 云端页面靠 __wb_rsc Cookie 识别会话；跨域时浏览器不会有这个 Cookie，
// Worker 先访问一次分享码页面把它取回来，塞进后续请求。
async function ensureSession(incomingCookie) {
  if (/\b__wb_rsc=/.test(incomingCookie || '')) {
    return { cookie: incomingCookie, bootCookies: [] };
  }
  try {
    const boot = await fetch(
      UPSTREAM + '/?sharecode=' + SHARECODE + '&class=main',
      { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const all = typeof boot.headers.getAll === 'function'
      ? boot.headers.getAll('Set-Cookie')
      : [boot.headers.get('Set-Cookie')].filter(Boolean);
    const rsc = all.find(function (v) { return v && v.indexOf('__wb_rsc=') !== -1; });
    const token = rsc ? (rsc.match(/__wb_rsc=[^;]+/) || [])[0] : '';
    return {
      cookie: token ? ((incomingCookie ? incomingCookie + '; ' : '') + token) : incomingCookie,
      bootCookies: all
    };
  } catch (e) {
    return { cookie: incomingCookie, bootCookies: [] };
  }
}

async function handle(request) {
  const url = new URL(request.url);

  // 1. 预检请求直接吃掉，绝不让云端看到（它看到就回 501）
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // 2. 访问 Worker 根路径时给一句状态提示，方便确认部署成功
  if (url.pathname === '/' || url.pathname === '') {
    return new Response('班务大屏代理已就绪。', {
      headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS)
    });
  }

  // 3. 路径映射：/api/* → 云端业务接口，/oauth/* → WorkBuddy OAuth 中继
  let target, isOauth = false;
  if (url.pathname.indexOf('/api/') === 0) {
    target = UPSTREAM + url.pathname.slice(4) + url.search;
  } else if (url.pathname.indexOf('/oauth/') === 0) {
    target = OAUTH_UPSTREAM + url.pathname.slice(6) + url.search;
    isOauth = true;
  } else {
    return new Response('未知路径，应以 /api/ 或 /oauth/ 开头。', {
      status: 404,
      headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS)
    });
  }

  // 4. 组装转发请求头：原样带上 SDK 的鉴权头，但把来源伪装成云端自己
  const headers = new Headers();
  request.headers.forEach(function (v, k) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'origin' || lk === 'referer' ||
        lk === 'cookie' || lk === 'accept-encoding' ||
        lk === 'cf-connecting-ip' || lk === 'cf-ray') return;
    headers.set(k, v);
  });
  headers.set('Origin', UPSTREAM);
  headers.set('Referer', UPSTREAM + '/');
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

  const incomingCookie = request.headers.get('Cookie') || '';
  let session = { cookie: incomingCookie, bootCookies: [] };
  if (!isOauth) session = await ensureSession(incomingCookie);
  if (session.cookie) headers.set('Cookie', session.cookie);

  const init = { method: request.method, headers: headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  // 5. 转发并回收响应
  let upstreamResp;
  try {
    upstreamResp = await fetch(target, init);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream unreachable', detail: String(e) }), {
      status: 502,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS)
    });
  }

  const out = new Headers();
  Object.keys(CORS).forEach(function (k) { out.set(k, CORS[k]); });
  upstreamResp.headers.forEach(function (v, k) {
    const lk = k.toLowerCase();
    if (lk === 'set-cookie' || HOP.has(lk)) return;
    out.set(k, v);
  });

  // 把云端和引导阶段拿到的 Cookie 都交回浏览器（去掉 Domain）
  const respCookies = typeof upstreamResp.headers.getAll === 'function'
    ? upstreamResp.headers.getAll('Set-Cookie')
    : [upstreamResp.headers.get('Set-Cookie')].filter(Boolean);
  session.bootCookies.concat(respCookies).forEach(function (v) {
    if (v) out.append('Set-Cookie', cleanCookie(v));
  });

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: out
  });
}

export default { fetch: handle };
