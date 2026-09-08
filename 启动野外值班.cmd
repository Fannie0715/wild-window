@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先从 https://nodejs.org 安装 Node.js 22.13 或更新版本，再重新打开。
  pause
  exit /b 1
)
if not exist dist\index.html (
  call npm ci
  if errorlevel 1 goto failed
  call npm run build
  if errorlevel 1 goto failed
)
node scripts\launch-desktop.mjs
exit /b
:failed
echo 安装失败，请检查网络后重试。
pause
exit /b 1
