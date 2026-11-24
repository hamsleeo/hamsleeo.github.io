/* 云服务连接配置：值来自 WorkBuddy 云服务 publicConfig
 *
 * ★ 跨域修复说明（2026-11-24）★
 * ------------------------------------------------------------------
 * 本站域名通过 Cloudflare Worker 反向代理调用云端，绕开云端不支持
 * OPTIONS 预检的问题。部署 Worker 后，把它的地址填到下面 WORKER 即可，
 * 形如 https://xxxxx.your-account.workers.dev（末尾不要加斜杠）。
 *
 * 没填（保持空字符串）时自动回退到云端直连，行为和以前完全一样，
 * 不会把页面改坏——所以先推送本文件也安全，等 Worker 好了再填。
 * ------------------------------------------------------------------
 */
(function () {
  // ↓↓↓ 部署好 Worker 后，把地址粘贴到引号里 ↓↓↓
  var WORKER = '';
  // ↑↑↑ 只需改这一行 ↑↑↑

  var CLOUD = 'https://class-screen-72644.app.workbuddy.host';
  var OAUTH = 'https://www.workbuddy.cn/v2/as/genie-baas/oauth';

  // Worker 地址可能是完整 https URL，也可能是相对路径
  var base = '';
  if (WORKER) {
    base = WORKER.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base) && base.charAt(0) !== '/') base = '/' + base;
  }

  window.CLOUD_CONFIG = {
    endpoint: base ? base + '/api' : CLOUD,
    oauthRelayBaseUrl: base ? base + '/oauth' : OAUTH,
    publishableKey: 'wbpk_8srtdD1SnpD4G1BcCgMWfo_VI2ERCx4LO4F0iJ8oIMW29CnghsQGz36',
    viaWorker: !!base
  };
})();
