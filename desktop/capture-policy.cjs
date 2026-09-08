'use strict';

function isAppURL(value, origin) {
  try { const url = new URL(value); return url.origin === origin && url.pathname === '/'; }
  catch { return false; }
}

function assertSender(event, window, origin) {
  const contents = window?.webContents;
  if (!window || window.isDestroyed() || !contents || contents.isDestroyed() ||
      event.sender !== contents || !event.senderFrame ||
      event.senderFrame !== contents.mainFrame || !isAppURL(event.senderFrame.url, origin)) {
    throw new Error('只允许本程序的直播窗口截图。');
  }
}

function captureRectangle(bounds, zoom, viewport) {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height, zoom, viewport.width, viewport.height].every(Number.isFinite) ||
      zoom <= 0 || bounds.width < 32 || bounds.height < 32) throw new Error('没有可截取的直播区域。');
  // capturePage uses DIP; devicePixelRatio is already handled by Electron.
  const x = Math.floor(bounds.x * zoom), y = Math.floor(bounds.y * zoom);
  const right = Math.ceil((bounds.x + bounds.width) * zoom), bottom = Math.ceil((bounds.y + bounds.height) * zoom);
  if (x < 0 || y < 0 || right > viewport.width || bottom > viewport.height) throw new Error('请放大窗口，让直播画面完整显示后重试。');
  const width = right - x, height = bottom - y;
  // An empty Electron capture rect means the entire page. Never pass one.
  if (width <= 0 || height <= 0 || width * height > 16000000) throw new Error('直播区域大小无效。');
  return { x, y, width, height };
}

const PLAYER_BOUNDS = `(() => {
  const player = document.querySelector('[data-live-player]');
  const stream = player?.querySelector('iframe.stream');
  if (!player || !stream || document.querySelector('[role="dialog"]')) return null;
  const r = player.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, camera: player.dataset.camera, source: stream.src };
})()`;

function createCaptureHandler({ windowFor, origin, timeoutMs = 12000 }) {
  const busy = new Set();
  return async function capture(event) {
    const window = windowFor(event.sender);
    assertSender(event, window, origin);
    if (!window.isVisible() || window.isMinimized()) throw new Error('请先显示直播窗口。');
    const contents = window.webContents;
    if (busy.has(contents)) throw new Error('正在截取上一帧，请稍等。');
    busy.add(contents);
    let timer, cancelled = false;
    const operation = (async () => {
      const before = await contents.executeJavaScriptInIsolatedWorld(1004, [{code: PLAYER_BOUNDS}]);
      assertSender(event, window, origin);
      if (cancelled || !before) throw new Error('请先接通直播并关闭遮挡画面的弹窗。');
      const zoom = contents.getZoomFactor(), viewport = window.getContentBounds();
      const rect = captureRectangle(before, zoom, viewport);
      const image = await contents.capturePage(rect);
      assertSender(event, window, origin);
      if (cancelled) throw new Error('截图已取消。');
      const after = await contents.executeJavaScriptInIsolatedWorld(1004, [{code: PLAYER_BOUNDS}]);
      if (!after || after.camera !== before.camera || after.source !== before.source) throw new Error('机位已变化，请重新截图。');
      const afterViewport = window.getContentBounds();
      const afterRect = captureRectangle(after, contents.getZoomFactor(), afterViewport);
      if (zoom !== contents.getZoomFactor() || viewport.width !== afterViewport.width || viewport.height !== afterViewport.height ||
          ['x','y','width','height'].some(key => rect[key] !== afterRect[key])) throw new Error('画面位置已变化，请保持窗口稳定后重试。');
      assertSender(event, window, origin);
      if (!window.isVisible() || window.isMinimized()) throw new Error('请先显示直播窗口。');
      if (cancelled || image.isEmpty()) throw new Error('没有截到画面，请等直播出画面后重试。');
      const size = image.getSize();
      if (!size.width || !size.height) throw new Error('截图为空，请重试。');
      const scale = Math.min(1, 1280 / Math.max(size.width, size.height));
      const output = scale < 1 ? image.resize({width: Math.round(size.width * scale), height: Math.round(size.height * scale)}) : image;
      const bytes = output.toPNG();
      if (bytes.length > 5 * 1024 * 1024) throw new Error('截图过大，请缩小窗口后重试。');
      return { image: 'data:image/png;base64,' + bytes.toString('base64'), width: output.getSize().width, height: output.getSize().height };
    })();
    // A timeout rejects the caller but keeps the lock until the native work settles.
    void operation.finally(() => busy.delete(contents)).catch(() => {});
    try {
      return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => { cancelled = true; reject(new Error('截图超时，请保持直播窗口可见后重试。')); }, timeoutMs); })]);
    } finally { clearTimeout(timer); }
  };
}

module.exports = { isAppURL, assertSender, captureRectangle, createCaptureHandler };
