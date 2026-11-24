# 班务大屏 · Cloudflare Worker 代理部署说明

## 为什么需要它

班务大屏页面在你的域名 `www.smartlearner.top`，但数据接口在云端
`class-screen-72644.app.workbuddy.host`。浏览器跨域请求必须先发 OPTIONS 预检，
而云端对预检返回 501，导致登录和数据同步报 `Failed to fetch`。

Cloudflare Worker 作为中间代理：吃掉预检、转发请求、把来源伪装成云端自己，
浏览器看到的仍是你的域名，云端看到的仍是同源请求。

## 部署步骤（约 5 分钟，免费）

### 1. 注册 / 登录 Cloudflare

打开 https://dash.cloudflare.com 注册账号（免费版即可，不需要绑定你的域名）。

### 2. 创建 Worker

左侧菜单 **Workers & Pages** → **Create** → **Create Worker** →
起个名字（如 `class-screen-proxy`）→ **Deploy**。

### 3. 粘贴代码

创建后点 **Edit code**，把编辑器里默认内容全部删掉，
把本仓库的 `cloudflare-worker.js` **全文复制粘贴**进去 → **Deploy**。

### 4. 复制 Worker 地址

部署成功后，页面顶部会显示地址，形如：

```
https://class-screen-proxy.你的账号.workers.dev
```

点右上角复制按钮。**末尾不要带斜杠**。

### 5. 把地址填进配置

打开仓库里的 `tools/class-screen/cloud-config.js`，找到这一行：

```js
  var WORKER = '';
```

改成（把地址换成你复制的）：

```js
  var WORKER = 'https://class-screen-proxy.你的账号.workers.dev';
```

保存后推送，约 1 分钟后生效。

## 验证是否成功

1. 浏览器打开 `https://www.smartlearner.top/tools/class-screen/admin.html`
   （用 Ctrl+F5 强制刷新，避免缓存）
2. 输入手机号 → 点「获取验证码」
3. **不再报 `Failed to fetch`**，能收到短信验证码 → 成功

如果报别的错（如验证码发送失败、401），把错误提示截图发我，
那是接口层面的问题，代理已经通了。

## 注意事项

- Worker 免费版每天 10 万次请求，班级大屏完全够用。
- 改 Worker 代码后立即生效，不用改域名 DNS、不用动 GitHub Pages。
- 你的域名 DNS（DNSPod）和 GitHub Pages 配置**都不用动**。
- 如果以后想换回直连，把 `WORKER` 改回空字符串即可。
