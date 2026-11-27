@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动班务大屏本地服务器...
echo 大屏: http://127.0.0.1:8080/tools/class-screen/index.html?class=main
echo 管理: http://127.0.0.1:8080/tools/class-screen/admin.html
echo 关闭本窗口即停止服务器。
echo.
node "tools\class-screen\local-server\server.js"
pause
