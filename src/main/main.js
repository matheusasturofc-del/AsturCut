// AsturCut — processo principal do Electron
const { app, BrowserWindow, ipcMain, dialog, protocol, shell, screen, desktopCapturer, session, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const { spawn } = require('child_process');

const isDev = process.argv.includes('--dev');
// IA local (legendas): permite várias threads no WebAssembly
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
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

// ---------- Janela de carregamento ----------
let splash = null;
const splashStart = Date.now();
const SPLASH_TEXT = {
  pt: { start: 'Preparando…', loading: 'Carregando a interface…', library: 'Organizando a biblioteca…', fonts: 'Carregando fontes…', almost: 'Quase pronto…', ready: 'Pronto!' },
  en: { start: 'Getting ready…', loading: 'Loading the interface…', library: 'Organizing the library…', fonts: 'Loading fonts…', almost: 'Almost there…', ready: 'Ready!' },
  es: { start: 'Preparando…', loading: 'Cargando la interfaz…', library: 'Organizando la biblioteca…', fonts: 'Cargando fuentes…', almost: 'Casi listo…', ready: '¡Listo!' },
};
const SPLASH_PROGRESS = { start: 0.08, loading: 0.3, library: 0.55, fonts: 0.75, almost: 0.9, ready: 1 };
function savedLang() {
  try { const l = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'lang.json'), 'utf8')).lang; if (SPLASH_TEXT[l]) return l; } catch {}
  const inst = installerLang(); if (inst) return inst;
  const loc = (app.getLocale() || 'pt').slice(0, 2);
  return SPLASH_TEXT[loc] ? loc : 'en';
}
function createSplash() {
  const l = savedLang();
  splash = new BrowserWindow({
    width: 440, height: 290, frame: false, resizable: false, movable: true, show: false, center: true,
    backgroundColor: '#141416', skipTaskbar: false, alwaysOnTop: false, title: 'AsturCut',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'), { query: { v: app.getVersion(), s: SPLASH_TEXT[l].start } });
  splash.once('ready-to-show', () => splash && splash.show());
  splash.on('closed', () => { splash = null; });
}
function splashStatus(step) {
  if (!splash || splash.isDestroyed()) return;
  const l = savedLang();
  const text = (SPLASH_TEXT[l] || SPLASH_TEXT.pt)[step] || step;
  splash.webContents.executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(text)}, ${SPLASH_PROGRESS[step] ?? 'null'})`).catch(() => {});
}
function closeSplash() { if (splash && !splash.isDestroyed()) splash.close(); splash = null; }
ipcMain.on('app:boot-step', (_e, step) => splashStatus(step));

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
  splashStatus('loading');
  const reveal = () => {
    if (!win || win.isVisible()) return;
    const wait = Math.max(0, 1300 - (Date.now() - splashStart));
    setTimeout(() => {
      if (!win) return;
      splashStatus('ready');
      win.show();
      if (width > 1700) win.maximize();
      setTimeout(closeSplash, 250);
    }, wait);
  };
  // mostra quando a interface avisar que terminou de carregar (ou depois de 15 s, por segurança)
  ipcMain.once('app:ready', reveal);
  setTimeout(reveal, 15000);
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
    setupCapture();
    createSplash();
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
ipcMain.on('app:set-lang', (_e, l) => {
  if (!L[l]) return;
  lang = l;
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'lang.json'), JSON.stringify({ lang: l })); } catch {}
});

// ---------- Atualizações: consulta a última versão publicada no GitHub ----------
const UPDATE_REPO = 'matheusasturofc-del/AsturCut';
ipcMain.handle('app:check-update', async () => {
  const { net } = require('electron');
  const r = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { 'User-Agent': 'AsturCut-Updater', Accept: 'application/vnd.github+json' } });
  if (!r.ok) return { ok: false, status: r.status, current: app.getVersion() };
  const j = await r.json();
  const exe = (j.assets || []).find((a) => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name));
  return {
    ok: true, current: app.getVersion(),
    version: String(j.tag_name || '').replace(/^v/i, ''), name: j.name || j.tag_name,
    notes: j.body || '', date: j.published_at, page: j.html_url, download: exe ? exe.browser_download_url : j.html_url,
  };
});

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

// ---------- IPC: exportação rápida (H.264 do WebCodecs + WAV mixado offline) ----------
let fxJob = null;
function fxCleanup(job) {
  if (!job) return;
  try { job.stream.destroy(); } catch {}
  for (const f of [job.video, job.audio]) fs.promises.unlink(f).catch(() => {});
}

ipcMain.handle('fx:begin', async () => {
  fxCleanup(fxJob);
  const base = path.join(os.tmpdir(), `asturcut-fx-${Date.now()}`);
  fxJob = { video: base + '.h264', audio: base + '.wav', stream: fs.createWriteStream(base + '.h264'), bytes: 0 };
  return true;
});

ipcMain.handle('fx:video', async (_e, buf) => {
  if (!fxJob) return false;
  const b = Buffer.from(buf);
  fxJob.bytes += b.length;
  if (!fxJob.stream.write(b)) await new Promise((res) => fxJob.stream.once('drain', res));
  return true;
});

ipcMain.handle('fx:audio', async (_e, buf) => {
  if (!fxJob) return false;
  await fs.promises.writeFile(fxJob.audio, Buffer.from(buf));
  return true;
});

ipcMain.handle('fx:end', async (e, opts) => {
  const job = fxJob;
  fxJob = null;
  if (!job) throw new Error(tr('noExport'));
  await new Promise((res) => job.stream.end(res));
  if (opts.cancel) { fxCleanup(job); return null; }
  const { outPath, format, quality = 'high', fps = 30, duration = 0 } = opts;
  const crf = { low: 34, medium: 30, high: 26, max: 20 }[quality] || 28;
  const vIn = ['-f', 'h264', '-r', String(fps), '-i', job.video];
  const len = duration > 0 ? ['-t', duration.toFixed(3)] : ['-shortest'];
  const aIn = ['-i', job.audio];
  let args;
  if (format === 'mp3') {
    args = ['-y', ...aIn, '-c:a', 'libmp3lame', '-b:a', '320k', outPath];
  } else if (format === 'gif') {
    args = ['-y', ...vIn, '-vf', `fps=${Math.min(fps, 20)},scale=640:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`, outPath];
  } else if (format === 'webm') {
    args = ['-y', ...vIn, ...aIn, '-map', '0:v', '-map', '1:a', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1',
      '-c:a', 'libopus', '-b:a', '192k', ...len, outPath];
  } else {
    args = ['-y', ...vIn, ...aIn, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', ...len, '-movflags', '+faststart', outPath];
  }
  if (process.env.ASTUR_DEBUG) console.log('[fx]', args.join(' '), fs.existsSync(job.audio) && fs.statSync(job.audio).size, job.bytes);
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath(), args, { windowsHide: true });
      let log = '';
      proc.stderr.on('data', (d) => {
        const s = d.toString();
        log = (log + s).slice(-4000);
        const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(s);
        if (m && duration > 0) e.sender.send('export:progress', Math.min(1, (+m[1] * 3600 + +m[2] * 60 + +m[3]) / duration));
      });
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(tr('ffmpegFail') + log.slice(-600)))));
    });
  } finally {
    fxCleanup(job);
  }
  return outPath;
});

// ---------- Gravação de tela, webcam e microfone ----------
let recSourceId = null, recSystemAudio = false, recBar = null;

function setupCapture() {
  // getDisplayMedia: usa a tela/janela escolhida na janela de gravação do AsturCut
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const srcs = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const s = srcs.find((x) => x.id === recSourceId) || srcs[0];
      cb(s ? { video: s, ...(recSystemAudio && process.platform === 'win32' ? { audio: 'loopback' } : {}) } : {});
    } catch { cb({}); }
  });
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write'].includes(perm));
}

ipcMain.handle('rec:sources', async () => {
  const srcs = await Promise.race([
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false }),
    new Promise((res) => setTimeout(() => res([]), 10000)),
  ]);
  return srcs
    .filter((s) => !(win && s.id === win.getMediaSourceId()) && !/^AsturCut/.test(s.name) || s.id.startsWith('screen'))
    .map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith('screen'), thumb: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL() }));
});

ipcMain.handle('rec:select', (_e, { id, systemAudio }) => { recSourceId = id; recSystemAudio = !!systemAudio; return true; });

const REC_BAR_TEXT = { pt: ['Parar', 'Pausar', 'Continuar'], en: ['Stop', 'Pause', 'Resume'], es: ['Detener', 'Pausar', 'Continuar'] };
ipcMain.handle('rec:started', (_e, { hide }) => {
  if (hide && win) win.minimize();
  const wa = screen.getPrimaryDisplay().workArea;
  recBar = new BrowserWindow({
    width: 300, height: 56, x: Math.round(wa.x + wa.width / 2 - 150), y: wa.y + 16,
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, transparent: true, hasShadow: false, focusable: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'recbar-preload.js') },
  });
  recBar.setAlwaysOnTop(true, 'screen-saver');
  try { recBar.setContentProtection(true); } catch {} // não aparece na gravação
  const [stop, pause, resume] = REC_BAR_TEXT[lang] || REC_BAR_TEXT.pt;
  recBar.loadFile(path.join(__dirname, 'recbar.html'), { query: { stop, pause, resume } });
  globalShortcut.register('CommandOrControl+Shift+F9', () => win && win.webContents.send('rec:control', 'stop'));
  return true;
});

ipcMain.on('recbar:control', (_e, what) => { if (win) win.webContents.send('rec:control', what); });
ipcMain.on('rec:tick', (_e, info) => { if (recBar && !recBar.isDestroyed()) recBar.webContents.send('recbar:tick', info); });

ipcMain.handle('rec:stopped', () => {
  try { globalShortcut.unregister('CommandOrControl+Shift+F9'); } catch {}
  if (recBar && !recBar.isDestroyed()) recBar.close();
  recBar = null;
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  return true;
});

// salva cada gravação (webm do MediaRecorder) e corrige a duração/índice com o FFmpeg
ipcMain.handle('rec:save', async (_e, { name, buffer }) => {
  const dir = path.join(app.getPath('documents'), 'AsturCut', lang === 'en' ? 'Recordings' : lang === 'es' ? 'Grabaciones' : 'Gravações');
  await fs.promises.mkdir(dir, { recursive: true });
  const safe = String(name || 'gravacao').replace(/[\\/:*?"<>|]/g, '-');
  const raw = path.join(os.tmpdir(), `asturcut-rec-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`);
  const out = path.join(dir, safe + '.webm');
  await fs.promises.writeFile(raw, Buffer.from(buffer));
  const ok = await new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), ['-y', '-i', raw, '-c', 'copy', out], { windowsHide: true });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
  if (!ok) await fs.promises.copyFile(raw, out);
  fs.promises.unlink(raw).catch(() => {});
  return out;
});
