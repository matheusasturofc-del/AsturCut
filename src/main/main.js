// AsturCut — processo principal do Electron
const { app, BrowserWindow, ipcMain, dialog, protocol, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const { spawn } = require('child_process');

const isDev = process.argv.includes('--dev');
let win = null;
let pendingOpenFile = null;
let lang = 'pt';

// Textos dos diálogos nativos
const L = {
  pt: { importMedia: 'Importar mídia', media: 'Mídia', videos: 'Vídeos', audio: 'Áudio', images: 'Imagens', all: 'Todos', importFonts: 'Importar fontes', fonts: 'Fontes', saveProject: 'Salvar projeto', openProject: 'Abrir projeto', projectType: 'Projeto AsturCut', exportVideo: 'Exportar vídeo', project: 'Projeto', noExport: 'Nenhuma exportação em andamento', ffmpegFail: 'FFmpeg falhou: ' },
  en: { importMedia: 'Import media', media: 'Media', videos: 'Videos', audio: 'Audio', images: 'Images', all: 'All files', importFonts: 'Import fonts', fonts: 'Fonts', saveProject: 'Save project', openProject: 'Open project', projectType: 'AsturCut project', exportVideo: 'Export video', project: 'Project', noExport: 'No export in progress', ffmpegFail: 'FFmpeg failed: ' },
  es: { importMedia: 'Importar medios', media: 'Medios', videos: 'Videos', audio: 'Audio', images: 'Imágenes', all: 'Todos', importFonts: 'Importar fuentes', fonts: 'Fuentes', saveProject: 'Guardar proyecto', openProject: 'Abrir proyecto', projectType: 'Proyecto AsturCut', exportVideo: 'Exportar video', project: 'Proyecto', noExport: 'No hay ninguna exportación en curso', ffmpegFail: 'FFmpeg falló: ' },
};
const tr = (k) => (L[lang] || L.pt)[k];

// Idioma escolhido no instalador (o NSIS grava o código do idioma do Windows em resources/installer-lang.txt)
function installerLang() {
  try {
    const raw = fs.readFileSync(path.join(process.resourcesPath, 'installer-lang.txt'), 'utf8').replace(/[^0-9]/g, '');
    const id = parseInt(raw, 10);
    if (!id) return null;
    const primary = id & 0x3ff;
    if (primary === 0x16) return 'pt';
    if (primary === 0x0a) return 'es';
    if (primary === 0x09) return 'en';
  } catch {}
  return null;
}

// ---------- Protocolo astur:// para servir mídia local (com suporte a Range p/ seek de vídeo) ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'astur', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.ogv': 'video/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.opus': 'audio/ogg', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function handleMediaProtocol() {
  protocol.handle('astur', async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get('p');
      if (!filePath) return new Response('missing path', { status: 400 });
      const stat = await fs.promises.stat(filePath);
      const size = stat.size;
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      const headers = {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      };
      const range = request.headers.get('range');
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        let start = m && m[1] ? parseInt(m[1], 10) : 0;
        let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
        if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
        end = Math.min(end, size - 1);
        if (start > end || start >= size) {
          return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
        }
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
        });
      }
      return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
        status: 200,
        headers: { ...headers, 'Content-Length': String(size) },
      });
    } catch (err) {
      return new Response(String(err && err.message), { status: 404 });
    }
  });
}

// ---------- Janela ----------
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1600, width),
    height: Math.min(940, height),
    minWidth: 1100,
    minHeight: 680,
    frame: false,
    backgroundColor: '#161618',
    title: 'AsturCut',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (width > 1700) win.maximize();
  });
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  win.on('maximize', () => win.webContents.send('win:state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('win:state', { maximized: false }));
  win.on('close', (e) => {
    if (win.__forceClose) return;
    e.preventDefault();
    win.webContents.send('app:before-close');
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function fileFromArgv(argv) {
  return argv.find((a) => a.toLowerCase().endsWith('.astur') && fs.existsSync(a)) || null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileFromArgv(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) win.webContents.send('project:open-file', f);
    }
  });
  app.whenReady().then(() => {
    pendingOpenFile = fileFromArgv(process.argv);
    handleMediaProtocol();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

// ---------- IPC: janela ----------
ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:maximize', () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('win:close', () => win && win.close());
ipcMain.on('win:force-close', () => { if (win) { win.__forceClose = true; win.close(); } });
ipcMain.on('win:fullscreen', () => win && win.setFullScreen(!win.isFullScreen()));
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  documents: app.getPath('documents'),
  videos: app.getPath('videos'),
  userData: app.getPath('userData'),
  openFile: pendingOpenFile,
  installerLang: installerLang(),
}));
ipcMain.on('app:set-lang', (_e, l) => { if (L[l]) lang = l; });

// ---------- IPC: arquivos ----------
const MEDIA_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'ogv', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

async function describeFile(p) {
  const st = await fs.promises.stat(p);
  return { path: p, name: path.basename(p), size: st.size, ext: path.extname(p).slice(1).toLowerCase() };
}

ipcMain.handle('dialog:import-media', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: tr('importMedia'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: tr('media'), extensions: MEDIA_EXT },
      { name: tr('videos'), extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'ogv'] },
      { name: tr('audio'), extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'] },
      { name: tr('images'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
      { name: tr('all'), extensions: ['*'] },
    ],
  });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(describeFile));
});

ipcMain.handle('dialog:import-fonts', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: tr('importFonts'),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: tr('fonts'), extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
  });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(describeFile));
});

ipcMain.handle('file:describe', async (_e, paths) => {
  const out = [];
  for (const p of paths) {
    try { out.push(await describeFile(p)); } catch {}
  }
  return out;
});

ipcMain.handle('project:save', async (_e, { filePath, data, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(win, {
      title: tr('saveProject'),
      defaultPath: path.join(app.getPath('documents'), `${((data && data.name) || tr('project')).replace(/[\\/:*?"<>|]/g, '-')}.astur`),
      filters: [{ name: tr('projectType'), extensions: ['astur'] }],
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  await fs.promises.writeFile(target, JSON.stringify(data, null, 1), 'utf8');
  return target;
});

ipcMain.handle('project:open', async (_e, filePath) => {
  let target = filePath;
  if (!target) {
    const r = await dialog.showOpenDialog(win, {
      title: tr('openProject'),
      properties: ['openFile'],
      filters: [{ name: tr('projectType'), extensions: ['astur'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    target = r.filePaths[0];
  }
  const raw = await fs.promises.readFile(target, 'utf8');
  return { filePath: target, data: JSON.parse(raw) };
});

ipcMain.handle('shell:show-item', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('shell:open-external', (_e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); });

// ---------- IPC: exportação ----------
let exportJob = null;

function ffmpegPath() {
  try {
    let p = require('ffmpeg-static');
    if (p) p = p.replace('app.asar', 'app.asar.unpacked');
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return 'ffmpeg';
}

ipcMain.handle('export:choose', async (_e, { name, format }) => {
  const ext = format === 'webm' ? 'webm' : format === 'gif' ? 'gif' : format === 'mp3' ? 'mp3' : format === 'mov' ? 'mov' : 'mp4';
  const r = await dialog.showSaveDialog(win, {
    title: tr('exportVideo'),
    defaultPath: path.join(app.getPath('videos'), `${(name || 'video').replace(/[\\/:*?"<>|]/g, '-')}.${ext}`),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('export:begin', async () => {
  const tmp = path.join(os.tmpdir(), `asturcut-${Date.now()}.webm`);
  exportJob = { tmp, stream: fs.createWriteStream(tmp) };
  return tmp;
});

ipcMain.handle('export:chunk', async (_e, buf) => {
  if (!exportJob) return false;
  await new Promise((res) => exportJob.stream.write(Buffer.from(buf), res));
  return true;
});

ipcMain.handle('export:end', async (e, opts) => {
  if (!exportJob) throw new Error(tr('noExport'));
  const job = exportJob;
  exportJob = null;
  await new Promise((res) => job.stream.end(res));
  const { outPath, format, quality = 'high', fps = 30, duration = 0 } = opts;
  if (opts.cancel) { fs.promises.unlink(job.tmp).catch(() => {}); return null; }
  if (format === 'webm') {
    await fs.promises.copyFile(job.tmp, outPath);
    fs.promises.unlink(job.tmp).catch(() => {});
    return outPath;
  }
  const crf = { low: 30, medium: 24, high: 19, max: 15 }[quality] || 20;
  let args;
  if (format === 'gif') {
    args = ['-y', '-i', job.tmp, '-vf', `fps=${Math.min(fps, 20)},scale=640:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`, outPath];
  } else if (format === 'mp3') {
    args = ['-y', '-i', job.tmp, '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', outPath];
  } else {
    args = ['-y', '-i', job.tmp, '-c:v', 'libx264', '-preset', quality === 'max' ? 'slow' : 'medium', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outPath];
  }
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), args, { windowsHide: true });
    let log = '';
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      log = (log + s).slice(-4000);
      const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(s);
      if (m && duration > 0) {
        const t = +m[1] * 3600 + +m[2] * 60 + +m[3];
        e.sender.send('export:progress', Math.min(1, t / duration));
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(tr('ffmpegFail') + log.slice(-600)))));
  });
  fs.promises.unlink(job.tmp).catch(() => {});
  return outPath;
});
