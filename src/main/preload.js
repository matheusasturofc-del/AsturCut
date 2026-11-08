// Ponte segura entre a interface (renderer) e o sistema
const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');

contextBridge.exposeInMainWorld('astur', {
  isDesktop: true,
  setZoom: (f) => webFrame.setZoomFactor(Math.min(1.6, Math.max(0.6, Number(f) || 1))),
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  forceClose: () => ipcRenderer.send('win:force-close'),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  info: () => ipcRenderer.invoke('app:info'),
  setLang: (l) => ipcRenderer.send('app:set-lang', l),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  bootStep: (step) => ipcRenderer.send('app:boot-step', step),
  ready: () => ipcRenderer.send('app:ready'),
  importMedia: () => ipcRenderer.invoke('dialog:import-media'),
  importFonts: () => ipcRenderer.invoke('dialog:import-fonts'),
  describeFiles: (paths) => ipcRenderer.invoke('file:describe', paths),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return file.path || ''; } },
  mediaUrl: (p) => 'astur://media/?p=' + encodeURIComponent(p),
  saveProject: (opts) => ipcRenderer.invoke('project:save', opts),
  openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
  showItem: (p) => ipcRenderer.invoke('shell:show-item', p),
  openExternal: (u) => ipcRenderer.invoke('shell:open-external', u),
  exportChoose: (o) => ipcRenderer.invoke('export:choose', o),
  exportBegin: () => ipcRenderer.invoke('export:begin'),
  exportChunk: (buf) => ipcRenderer.invoke('export:chunk', buf),
  exportEnd: (o) => ipcRenderer.invoke('export:end', o),
  fxBegin: () => ipcRenderer.invoke('fx:begin'),
  fxVideo: (buf) => ipcRenderer.invoke('fx:video', buf),
  fxAudio: (buf) => ipcRenderer.invoke('fx:audio', buf),
  fxEnd: (o) => ipcRenderer.invoke('fx:end', o),
  on: (channel, cb) => {
    const allowed = ['win:state', 'export:progress', 'project:open-file', 'app:before-close'];
    if (!allowed.includes(channel)) return () => {};
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
