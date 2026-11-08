// Barra flutuante de gravação: só envia os comandos (parar/pausar) para o AsturCut
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('recbar', {
  control: (what) => ipcRenderer.send('recbar:control', what),
  onTick: (cb) => ipcRenderer.on('recbar:tick', (_e, info) => cb(info)),
});
