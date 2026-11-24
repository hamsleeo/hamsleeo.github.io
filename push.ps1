# 教师工具箱 · 一键推送（无需反引号续行，不会卡在 >>）
# 用法：在 PowerShell 里运行  powershell -ExecutionPolicy Bypass -File "推送到GitHub.ps1"
# 提示时粘贴新的 GitHub 令牌，回车即可。令牌只在本机内存中用，不写入任何文件。

$ErrorActionPreference = 'Stop'
$git  = 'G:\HRSoftstore\Install\WorkBuddy\resources\vendor\PortableGit\mingw64\bin\git.exe'
$repo = 'G:\workbuddy\2026-11-18-15-39-36\teacher-toolbox'

Write-Host '=== 教师工具箱推送 ===' -ForegroundColor Cyan
$tok = (Read-Host '粘贴新令牌后回车（屏幕不显示是正常的）').Trim()
if ($tok.Length -ne 93) {
  Write-Host "令牌长度 = $($tok.Length)，标准是 93。差字符请回 GitHub 点复制图标重新复制。" -ForegroundColor Red
  exit 1
}
Write-Host "令牌长度 = $($tok.Length) OK" -ForegroundColor Green

try {
  $h = @{ Authorization = "Bearer $tok"; 'User-Agent' = 'wb' }
  $u = Invoke-RestMethod 'https://api.github.com/user' -Headers $h
  $r = Invoke-RestMethod 'https://api.github.com/repos/hamsleeo/hamsleeo.github.io' -Headers $h
} catch {
  Write-Host "令牌验证失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
Write-Host "身份 = $($u.login)   可写 = $($r.permissions.push)   分支 = $($r.default_branch)"
if ($u.login -ne 'hamsleeo' -or $r.permissions.push -ne $true) {
  Write-Host '令牌权限不对：必须是 hamsleeo 账号 + 仓库 hamsleeo.github.io + Contents 读写' -ForegroundColor Red
  exit 1
}

Write-Host '本地提交：'
& $git -C $repo log --oneline -1

Write-Host '正在推送…' -ForegroundColor Cyan
$env:GIT_TERMINAL_PROMPT = '0'
$pushUrl = "https://hamsleeo:$tok@github.com/hamsleeo/hamsleeo.github.io.git"
& $git -C $repo -c credential.helper= -c http.sslBackend=openssl -c http.version=HTTP/1.1 push $pushUrl main:main
if ($LASTEXITCODE -eq 0) {
  Write-Host '推送成功！约 1 分钟后访问 https://www.smartlearner.top/downloads.html' -ForegroundColor Green
} else {
  Write-Host "推送失败，退出码 $LASTEXITCODE。把上面的报错原文贴给阿简。" -ForegroundColor Red
}
$tok = $null
