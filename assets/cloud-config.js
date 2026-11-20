/* 云服务配置：这些值来自应用开通时返回的 publicConfig，可安全放在前端。
   所有页面共用同一个 cloud 客户端实例，不要重复初始化。

   2026-11-19 实测结论（重要，别再走回头路）：
   门户 / 后台 / 统一账号中心使用「教师工具箱」自己的云应用，云端按请求 Origin 精确校验。
   班级修仙管理用的另一套云应用 mp-api 绑定的是小程序渠道，实测只放行
   「无 Origin」/「https://servicewechat.com」/「localhost」三类来源；
   任何 https 网页域名都会被拒，连 mp-api 自己的域名也不例外，错误为
   the request origin is not allowed for this client。
   所以「把整站切到 mp-api」不是加个白名单就能解决，而是渠道不匹配，此路不通。
   三个工具要真正共用账号，唯一可行方向是反过来：把修仙业务层重建到本应用，
   再把 tools/xiuxian-class/js/core.js 的 endpoint / publishableKey 换成下面两行值。
   详见 _本地文档/账号与权限说明.md 第五节。 */
(function () {
  'use strict';
  var publicConfig = {
    endpoint: 'https://teacher-toolbox-65453.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_XFSGDGXaP8LiU7VGszYOKd_HhjqrhTvYIer62EpW9tpytiptgPlX6SA'
  };

  if (typeof window.WorkBuddyCloud === 'undefined') {
    window.WFC_CLOUD = null;
    window.WFC_CLOUD_ERROR = '云服务组件未加载，请检查网络后刷新';
    return;
  }
  try {
    window.WFC_CLOUD = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: publicConfig.endpoint,
      oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
      publishableKey: publicConfig.publishableKey
    });
  } catch (e) {
    window.WFC_CLOUD = null;
    window.WFC_CLOUD_ERROR = '云服务初始化失败';
  }
})();
