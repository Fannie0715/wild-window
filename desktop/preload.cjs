'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Remote iframes never receive the native bridge. Expose operations, not IPC itself.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('wildWindowDesktop', Object.freeze({
    captureLivePlayer: () => ipcRenderer.invoke('wild-window:capture'),
    openMini: cameraId => ipcRenderer.invoke('wild-window:mini', cameraId),
    setCompact: compact => ipcRenderer.invoke('wild-window:compact', compact),
  }));
  window.addEventListener('click', event => {
    if (!event.isTrusted || event.defaultPrevented) return;
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.protocol === 'https:' && url.origin !== window.location.origin) {
      event.preventDefault();
      void ipcRenderer.invoke('wild-window:open-link', url.href).catch(() => {});
    }
  }, true);
}
