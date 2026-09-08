#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo '请先从 https://nodejs.org 安装 Node.js 22.13 或更新版本，然后重新打开。'
  read -r reply
  exit 1
fi
if [ ! -f dist/index.html ]; then
  npm ci && npm run build || { echo '安装失败，请检查网络后重试。'; read -r reply; exit 1; }
fi
node scripts/launch-desktop.mjs
