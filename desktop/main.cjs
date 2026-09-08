'use strict';
const { app, BrowserWindow, ipcMain, shell, session, Menu } = require('electron');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { isAppURL, assertSender, createCaptureHandler } = require('./capture-policy.cjs');

app.setName('Global Wildlife Monitor');
const project = resolve(__dirname, '..');
const windows = new Set();
const miniWindows = new Set();
let server, runtime, origin, quitting = false;
const allowedHosts = new Set(['africam.com','www.allaboutbirds.org','www.youtube.com','chatgpt.com','www.qianwen.com','gemini.google.com']);
const cameraIds = new Set(['camelthorn','albatross','panda','cornell-feeders','panama-fruit','panama-hummingbirds','hellgate-ospreys','tembe-elephants','stony-point-penguins']);
const windowFor = contents => [...windows].find(win => !win.isDestroyed() && win.webContents === contents);

function createWindow({ mini = false, camera = 'panda' } = {}) {
  const win = new BrowserWindow({
    title: 'Global Wildlife Monitor · 全球动物监控', width: mini ? 560 : 1180, height: mini ? 620 : 860,
    minWidth: 520, minHeight: 430, backgroundColor: '#10150f', autoHideMenuBar: true,
    alwaysOnTop: mini,
    webPreferences: { preload: resolve(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true,
      nodeIntegration: false, nodeIntegrationInSubFrames: false, webSecurity: true, webviewTag: false,
      backgroundThrottling: false },
  });
  windows.add(win); if (mini) miniWindows.add(win);
  win.on('closed', () => { windows.delete(win); miniWindows.delete(win); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (!isAppURL(url, origin) && !url.startsWith(origin + '/observation-game/')) event.preventDefault(); });
  win.webContents.on('will-redirect', (event, url, _inPlace, isMainFrame) => { if (isMainFrame && !isAppURL(url, origin)) event.preventDefault(); });
  const target = new URL('/', origin); target.searchParams.set('camera', camera);
  if (mini) target.searchParams.set('mini', '1');
  void win.loadURL(target.href);
  return win;
}

async function start() {
  await app.whenReady();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{label:'Global Wildlife Monitor',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'unhide'},{type:'separator'},{role:'quit'}]}] : []),
    {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'视图',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
  ]));
  const { makeServer } = await import(pathToFileURL(resolve(project, 'scripts/serve.mjs')).href);
  const { createRuntimeManager } = await import(pathToFileURL(resolve(project, 'scripts/ollama-runtime.mjs')).href);
  runtime = createRuntimeManager();
  server = makeServer(resolve(project, 'dist'), { ensureRuntime: () => runtime.ensure() });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const trusted = !!windowFor(contents) && details.isMainFrame && isAppURL(details.requestingUrl, origin);
    callback(permission === 'fullscreen' || (permission === 'clipboard-sanitized-write' && trusted));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _requestingOrigin, details) => {
    const trusted = !!contents && !!windowFor(contents) && details.isMainFrame && isAppURL(contents.getURL(), origin);
    return permission === 'fullscreen' || (permission === 'clipboard-sanitized-write' && trusted);
  });
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
  session.defaultSession.webRequest.onHeadersReceived({ urls: [origin + '/*'] }, (details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
  });
  ipcMain.handle('wild-window:capture', createCaptureHandler({ windowFor, origin }));
  ipcMain.handle('wild-window:mini', (event, id) => {
    assertSender(event, windowFor(event.sender), origin);
    if (!cameraIds.has(id)) throw new Error('未知机位。');
    const existing = [...miniWindows].find(win => !win.isDestroyed());
    if (existing) existing.close();
    createWindow({mini:true,camera:id});
    return { opened: true };
  });
  ipcMain.handle('wild-window:open-link', async (event, href) => {
    assertSender(event, windowFor(event.sender), origin);
    const url = new URL(href);
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password) throw new Error('不支持这个链接。');
    await shell.openExternal(url.href);
  });
  createWindow();
  app.on('activate', () => { if (!windows.size) createWindow(); });
  console.log('Global Wildlife Monitor 桌面窗口已启动；直接截图已启用。');
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  quitting = true; event.preventDefault();
  server?.closeAllConnections(); server?.close();
  Promise.resolve(runtime?.stop()).finally(() => app.quit());
});
start().catch(error => { console.error(error); app.quit(); });
