# 班务大屏 · 国内代理部署说明

## 为什么需要它

班务大屏页面在你的域名 `www.smartlearner.top`，但数据接口在云端
`class-screen-72644.app.workbuddy.host`。浏览器跨域请求必须先发 OPTIONS 预检，
而云端对预检返回 501，导致登录和数据同步报 `Failed to fetch`。

需要一个中间代理：吃掉预检、转发请求、把来源伪装成云端自己。

## 方案演进（重要）

1. **Cloudflare Worker 方案已废弃**：`workers.dev` 域名在国内被墙，
   浏览器直接超时（`ERR_CONNECTION_TIMED_OUT`），教室电脑连不上。
   绑自定义域名又要求把 NS 迁到 Cloudflare，会牵动整个站点，风险太大。
2. **现方案：WorkBuddy 云代理**：把同样的代理逻辑写成 Node 服务，
   部署在 WorkBuddy 国内节点（`class-screen-proxy.app.workbuddy.host`），
   国内可正常访问。代码在 `G:\workbuddy\2026-11-18-16-19-04\class-screen-proxy\`。

## 当前配置

- 代理地址：`https://class-screen-proxy.app.workbuddy.host/?sharecode=KHYR6C3XTY`
- 配置位置：`tools/class-screen/cloud-config.js` 的 `PROXY` 一行
- SDK 用 `baseUrl + 路径` 拼接，所以配置里把真实路径塞进 `p` 参数：
  `PROXY + '/api'` → 请求变成 `?sharecode=XXX&p=/api/v1/xxx`
  → WorkBuddy 网关看根路径带 sharecode 放行 → 代理端从 `p` 还原路径并转发上游。

## 验证是否成功

1. 浏览器打开 `https://www.smartlearner.top/tools/class-screen/admin.html`
   （用 Ctrl+F5 强制刷新，避免缓存）
2. 输入手机号 → 点「获取验证码」
3. **不再报 `Failed to fetch`**，能收到短信验证码 → 成功

如果报 `Failed to fetch` 以外的错（如验证码发送失败、401），那是接口层问题，代理已通。

## 维护

- 代理应用管理：WorkBuddy 客户端 → 头像 → 设置 → 数据管理 → 应用
- 重新部署：在 `class-screen-proxy` 目录执行发布，sharecode 保持不变即可
- 想换回直连：把 `cloud-config.js` 的 `PROXY` 改成空字符串
- 代理日志排错：本地 `cd class-screen-proxy && node server.js` 后 curl 测试

## 技术细节

代理用 Node 原生 `https.request` 转发（不用 fetch），
避免本机/沙箱的 `HTTP_PROXY` 环境变量把请求劫持到别处。
转发时把 `Origin`/`Referer` 换成上游域名，云端当成同源请求；
自动访问分享码页拿 `__wb_rsc` 会话 Cookie 并注入，处理跨域预检（ OPTIONS → 204 ）。
