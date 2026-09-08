#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo '请先从 https://nodejs.org 安装 Node.js 22.13 或更新版本。'
  read -r reply
  exit 1
fi
node scripts/setup-ai.mjs
printf '\n按回车关闭此窗口。'
read -r reply
