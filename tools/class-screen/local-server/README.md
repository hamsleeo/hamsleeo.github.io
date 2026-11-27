# 班务大屏 · 本地服务器版

此版本不再依赖 WorkBuddy 云端数据库和账号体系。网页、账号、权限、班级数据全部由本机 Node 服务提供；如需外网访问，用 Cloudflare Tunnel 把本机服务暴露出去。

## 1. 启动

在网站仓库根目录双击 `start-local-server.bat`，或命令行执行：

```bash
node tools/class-screen/local-server/server.js
```

默认监听 `0.0.0.0:8080`。可用环境变量覆盖：

```bash
set PORT=8080
set HOST=0.0.0.0
node tools/class-screen/local-server/server.js
```

打开：

- 大屏：`http://127.0.0.1:8080/tools/class-screen/index.html?class=main`
- 管理端：`http://127.0.0.1:8080/tools/class-screen/admin.html`

页面会自动识别为本地模式（非 `www.smartlearner.top` / `hamsleeo.github.io` 域名，或带 `?local=1`），加载 `cloud-local.js`，不再请求 WorkBuddy 云接口。

## 2. 账号与权限

- 本地版**没有短信验证码**，也不要点「首次注册」：在【密码登录】里输入手机号 + 至少 6 位密码直接登录即可。
- **第一个登录的手机号自动成为管理员**；之后任意手机号 + 密码登录会自动注册为班主任，登录后由管理员在【班级与权限】分配班级。
- 忘记密码请联系管理员，或登录后到「我的」修改密码（需原密码）。
- 被删除的班主任会进入停用名单，无法再登录；管理员可在后台恢复。
- 权限由本地服务器校验：班主任只能读写被分配的班级，越权请求返回 403。

## 3. 数据

数据文件：`tools/class-screen/local-server/data/db.json`

- 首次启动会自动创建 9 个班级：`main`（915班）与 `class1`～`class8`。
- `main` 班初始数据来自 `data/seed-main.json`（从 2026-11-27 完整备份提取的 915 班状态，50 名学生）。
- 密码以 scrypt 哈希保存，`data/` 已加入 `.gitignore`，**不要提交到公开仓库**。
- 大屏每 20 秒轮询一次本地服务器；教师端修改保存后，大屏通常在 20 秒内同步。
- 备份：直接复制 `data/db.json`；恢复：停止服务器后覆盖该文件再启动。

## 4. 局域网访问

教室机和教师机连同一路由器时，把 `127.0.0.1` 换成服务器电脑的局域网 IP：

```text
http://192.168.1.50:8080/tools/class-screen/admin.html
```

Windows 防火墙需放行 8080 端口（或你设置的 PORT）。

桌面安装包默认打开 `http://127.0.0.1:8080/...`；若教室机访问的是另一台服务器，编辑安装目录里的 `config.ini`：

```ini
ScreenUrl=http://192.168.1.50:8080/tools/class-screen/index.html?class=main
```

已安装电脑可把改好的文件另存为 `config.user.ini`，重装时会自动沿用。

## 5. 外网访问（Cloudflare Tunnel）

### 5.1 快速测试（无账号，URL 每次重启会变）

```bash
npx cloudflared tunnel --url http://127.0.0.1:8080
```

命令行会输出一个 `https://xxxx.trycloudflare.com` 地址，临时给外网教师访问用。重启后地址会变，不适合长期使用。

### 5.2 固定域名（推荐）

前提：有一个域名托管在 Cloudflare。

```bash
cloudflared tunnel login
cloudflared tunnel create class-screen
cloudflared tunnel route dns class-screen class.example.com
```

创建 `config.yml`（Windows 通常在 `%USERPROFILE%\.cloudflared\config.yml`）：

```yaml
tunnel: <你的 tunnel UUID>
credentials-file: C:\Users\<用户名>\.cloudflared\<UUID>.json
ingress:
  - hostname: class.example.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

启动隧道：

```bash
cloudflared tunnel run class-screen
```

外网访问 `https://class.example.com/tools/class-screen/admin.html`。页面会自动进入本地模式。若教室机也走这个域名，把 `config.ini` 的 `ScreenUrl` 改成同一个域名即可。

> 若希望继续使用 `www.smartlearner.top` 这个域名，需要把该域名的 DNS 解析切到 Cloudflare Tunnel（CNAME 到 `<UUID>.cfargotunnel.com`），并确保原 GitHub Pages 记录不再冲突。

## 6. 与原线上版的关系

- `https://www.smartlearner.top/...` 仍走原来的 WorkBuddy 云端实现，直到你把域名切到隧道或改为本地地址。
- 本地服务器版数据独立保存在 `data/db.json`，不会自动同步回 WorkBuddy 云。
- 之前云端数据因环境 `res_stopped` 未导出；915 班数据已通过备份文件种子恢复到本地。

## 7. 安全建议

- 管理员和班主任使用强密码（至少 10 位，含字母数字）。
- 不要把 `data/db.json` 上传仓库或发到公开群。
- 外网只暴露必要端口；Cloudflare Tunnel 不需要在路由器做端口映射。
- 长期运行建议把服务器和隧道注册为 Windows 服务，避免关机/注销后中断。
