# 教师工具箱 · 配置自动推送（只需运行一次）
# 作用：把 GitHub 令牌存进 Windows 凭据管理器，之后 agent 每次提交后可直接 push，无需再手动输令牌。
# 用法：本机 PowerShell 运行  powershell -ExecutionPolicy Bypass -File "setup-auto-push.ps1"

$ErrorActionPreference = 'Stop'
$git  = 'G:\HRSoftstore\Install\WorkBuddy\resources\vendor\PortableGit\mingw64\bin\git.exe'
$repo = 'G:\workbuddy\2026-11-18-15-39-36\teacher-toolbox'

Write-Host '=== 配置自动推送（一次性）===' -ForegroundColor Cyan
Write-Host '令牌要求：hamsleeo 账号 + hamsleeo.github.io 仓库 + Contents 读写，长度 93。'
Write-Host '令牌会存进 Windows 凭据管理器（git credential manager），只在本机，不写任何明文文件。' -ForegroundColor DarkGray
$tok = (Read-Host '粘贴令牌后回车（屏幕不显示是正常的）').Trim()
if ($tok.Length -ne 93) {
  Write-Host "令牌长度 = $($tok.Length)，标准是 93。请回 GitHub 点复制图标重新复制。" -ForegroundColor Red
  exit 1
}

# 1) 验证令牌
try {
  $h = @{ Authorization = "Bearer $tok"; 'User-Agent' = 'wb' }
  $u = Invoke-RestMethod 'https://api.github.com/user' -Headers $h
  $r = Invoke-RestMethod 'https://api.github.com/repos/hamsleeo/hamsleeo.github.io' -Headers $h
} catch {
  Write-Host "令牌验证失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
if ($u.login -ne 'hamsleeo' -or $r.permissions.push -ne $true) {
  Write-Host "令牌权限不对（账号=$($u.login) 可写=$($r.permissions.push)）。" -ForegroundColor Red
  exit 1
}
Write-Host "令牌验证通过：账号=$($u.login) 可写=$($r.permissions.push)" -ForegroundColor Green

# 2) 存进 Windows 凭据管理器（走 git credential approve，host=github.com）
$cred = "protocol=https`nhost=github.com`nusername=hamsleeo`npassword=$tok`n`n"
$cred | & $git credential approve
Write-Host '凭据已写入 Windows 凭据管理器（github.com / hamsleeo）。' -ForegroundColor Green

# 3) 配置仓库用 manager 凭据；并绕开当前环境的反代（该反代会拦 git 智能协议）
& $git -C $repo config credential.helper manager
& $git -C $repo config http.sslBackend openssl
& $git -C $repo config http.version HTTP/1.1
& $git -C $repo config --unset-all http.proxy 2>$null
& $git -C $repo config --unset-all https.proxy 2>$null

# 4) 测试：绕过代理环境变量读远端 + 验证凭据能取回
$env:HTTPS_PROXY = ''; $env:HTTP_PROXY = ''; $env:https_proxy = ''; $env:http_proxy = ''
$head = & $git -C $repo ls-remote origin HEAD 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "读取远端失败：$head" -ForegroundColor Red
  exit 1
}
Write-Host "远端 HEAD：$head" -ForegroundColor Green

# 5) 可选：立即把本地已提交的改动推上去（当前已是最新则显示 Everything up-to-date）
Write-Host '正在测试推送…' -ForegroundColor Cyan
& $git -C $repo push origin main:main
if ($LASTEXITCODE -eq 0) {
  Write-Host '✅ 配置完成！以后 agent 每次提交后会自动推送，无需你再操作。' -ForegroundColor Green
} else {
  Write-Host "推送测试失败（退出码 $LASTEXITCODE）。把报错原文发给阿简。" -ForegroundColor Red
}
$tok = $null
