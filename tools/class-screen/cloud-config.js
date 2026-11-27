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
  // ↓↓↓ 国内代理地址（WorkBuddy 应用，带 sharecode 才能过网关）↓↓↓
  var PROXY = 'https://class-screen-proxy.app.workbuddy.host/?sharecode=KHYR6C3XTY&p=';
  // ↑↑↑ 只需改这一行 ↑↑↑

  var CLOUD = 'https://class-screen-72644.app.workbuddy.host';
  var OAUTH = 'https://www.workbuddy.cn/v2/as/genie-baas/oauth';

  // SDK 用 baseUrl + 路径 拼接，所以把真实路径塞进 p 参数，
  // 网关只看根路径是否带 sharecode，代理端再从 p 还原路径。
  var apiBase = PROXY + '/api';
  var oauthBase = PROXY + '/oauth';
  var useProxy = !!PROXY;

  // 本地服务器模式：非原站点域名（localhost / 局域网 IP / 内网隧道域名）
  // 或显式 ?local=1 时，改由 cloud-local.js 提供 CloudAPI，彻底不依赖 WorkBuddy 云端。
  var host = (globalThis.location && globalThis.location.hostname || '').toLowerCase();
  var cloudHosts = ['www.smartlearner.top', 'smartlearner.top', 'hamsleeo.github.io'];
  var forcedLocal = new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('local') === '1';
  var isLocal = forcedLocal || cloudHosts.indexOf(host) < 0;

  window.CLOUD_CONFIG = {
    endpoint: useProxy ? apiBase : CLOUD,
    oauthRelayBaseUrl: useProxy ? oauthBase : OAUTH,
    publishableKey: 'wbpk_8srtdD1SnpD4G1BcCgMWfo_VI2ERCx4LO4F0iJ8oIMW29CnghsQGz36',
    viaWorker: useProxy,
    local: isLocal
  };
})();
