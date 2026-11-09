// Importação de mídia, miniaturas, formas de onda, fontes e elementos de reprodução
import { store, bus } from './store.js';
import { t } from './i18n.js';
import { uid, toast } from './util.js';
import { renderSfx, audioDef } from './lib/sfx.js';

export const api = window.astur || null;
export const isDesktop = !!(api && api.isDesktop);
export const isMobile = !!(api && api.isMobile); // app Android
export const canRecordScreen = isDesktop && !isMobile;

const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'ogv'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
export function typeFromExt(ext) {
  ext = (ext || '').toLowerCase();
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

// cache em tempo de execução (não vai para o arquivo do projeto)
export const runtime = new Map(); // mediaId -> { url, thumb, frames, peaks, img, ready }
const blobFiles = new Map(); // mediaId -> File (modo navegador)

export function mediaUrl(m) {
  const r = runtime.get(m.id);
  if (r && r.url) return r.url;
  if (m.path && isDesktop) return api.mediaUrl(m.path);
  return null;
}

// ---------- Áudio (Web Audio) ----------
let actx = null, master = null, exportDest = null;
export function audioCtx() {
  if (!actx) {
    actx = new AudioContext({ latencyHint: 'interactive' });
    master = actx.createGain();
    master.connect(actx.destination);
    exportDest = actx.createMediaStreamDestination();
    master.connect(exportDest);
  }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}
export function masterGain() { audioCtx(); return master; }
export function exportAudioStream() { audioCtx(); return exportDest.stream; }
window.addEventListener('pointerdown', () => audioCtx(), { once: true });

// ---------- Importação ----------
export async function importViaDialog() {
  if (isDesktop) {
    const files = await api.importMedia();
    return addDesktopFiles(files);
  }
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.accept = [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].map((e) => '.' + e).join(',');
    inp.onchange = () => res(addBrowserFiles([...inp.files]));
    inp.click();
  });
}

export async function importDropped(fileList) {
  const files = [...fileList];
  if (isDesktop) {
    const paths = files.map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) return addDesktopFiles(await api.describeFiles(paths));
  }
  return addBrowserFiles(files);
}

// importa arquivos do disco pelo caminho (ex.: gravações)
export async function importPaths(paths) { return addDesktopFiles(await api.describeFiles(paths)); }

async function addDesktopFiles(files) {
  const added = [];
  for (const f of files) {
    const type = typeFromExt(f.ext);
    if (!type) { toast(t('Formato não suportado: {name}', { name: f.name }), 'error'); continue; }
    const existing = store.p.media.find((m) => m.path === f.path);
    if (existing) { added.push(existing); continue; }
    const m = { id: uid('med'), name: f.name, type, path: f.path, size: f.size, ext: f.ext, duration: 0, width: 0, height: 0 };
    store.p.media.push(m);
    added.push(m);
  }
  await finalizeImport(added);
  return added;
}

async function addBrowserFiles(files) {
  const added = [];
  for (const f of files) {
    const ext = f.name.split('.').pop();
    const type = typeFromExt(ext);
    if (!type) { toast(t('Formato não suportado: {name}', { name: f.name }), 'error'); continue; }
    const m = { id: uid('med'), name: f.name, type, size: f.size, ext, duration: 0, width: 0, height: 0, browserOnly: true };
    blobFiles.set(m.id, f);
    runtime.set(m.id, { url: URL.createObjectURL(f) });
    store.p.media.push(m);
    added.push(m);
  }
  await finalizeImport(added);
  return added;
}

async function finalizeImport(added) {
  if (!added.length) return;
  bus.emit('media');
  await Promise.all(added.map((m) => probe(m).catch((e) => console.warn('probe', m.name, e))));
  store.dirty = true;
  bus.emit('media');
  toast(t('{n} arquivo(s) importado(s)', { n: added.length }), 'success');
  // quadros e formas de onda em segundo plano
  for (const m of added) analyze(m);
}

// adiciona áudio da biblioteca (gerado)
export async function addLibraryAudio(id) {
  let m = store.p.media.find((x) => x.gen === id);
  if (m && runtime.get(m.id)?.url) return m;
  const r = await renderSfx(id);
  if (!m) {
    m = { id: uid('med'), name: t(r.name), type: 'audio', gen: id, duration: r.duration, size: r.blob.size, ext: 'wav', hidden: true };
    store.p.media.push(m);
  }
  runtime.set(m.id, { ...(runtime.get(m.id) || {}), url: r.url });
  analyze(m);
  return m;
}

// restaura mídias ao abrir projeto
export async function restoreProjectMedia() {
  runtime.clear();
  const missing = [];
  for (const m of store.p.media) {
    if (m.gen) {
      try { const r = await renderSfx(m.gen); runtime.set(m.id, { url: r.url }); } catch {}
    } else if (!m.path && !m.genImg) missing.push(m);
  }
  await restoreGenerated();
  bus.emit('media');
  for (const m of store.p.media) { if (m.genImg) continue; probe(m).then(() => analyze(m)).catch(() => { m.missing = true; bus.emit('media'); }); }
  for (const f of store.p.fonts || []) loadCustomFont(f).catch(() => {});
  if (missing.length) toast(t('{n} mídia(s) não encontrada(s) (importadas no navegador).', { n: missing.length }), 'error', 4000);
}

function loadEl(m) {
  const url = mediaUrl(m);
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('sem url'));
    if (m.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.src = url;
    } else {
      const v = document.createElement(m.type === 'video' ? 'video' : 'audio');
      v.crossOrigin = 'anonymous';
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => resolve(v);
      v.onerror = () => reject(new Error('Falha ao carregar mídia'));
      v.src = url;
    }
  });
}

async function probe(m) {
  const elm = await loadEl(m);
  const r = runtime.get(m.id) || {};
  if (m.type === 'image') {
    m.width = elm.naturalWidth || 1000; m.height = elm.naturalHeight || 1000; m.duration = 0;
    r.img = elm;
    r.thumb = thumbFrom(elm, m.width, m.height);
  } else {
    m.duration = isFinite(elm.duration) ? elm.duration : 0;
    if (m.type === 'video') { m.width = elm.videoWidth; m.height = elm.videoHeight; }
    elm.removeAttribute('src'); elm.load();
  }
  m.missing = false;
  runtime.set(m.id, r);
}

function thumbFrom(src, w, h, tw = 160) {
  const th = Math.round(tw * (h / w)) || 90;
  const c = document.createElement('canvas');
  c.width = tw; c.height = Math.min(th, 240);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0, c.width, c.height);
  try { return c.toDataURL('image/jpeg', 0.75); } catch { return null; }
}

// fila de análise (quadros do vídeo + forma de onda)
const queue = [];
let busy = false;
function analyze(m) { queue.push(m); pump(); }
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const m = queue.shift();
    try {
      if (m.type === 'video') await videoFrames(m);
      if (m.type === 'video' || m.type === 'audio') await waveform(m);
    } catch (e) { console.warn('analyze', e); }
    bus.emit('media-analyzed', m.id);
  }
  busy = false;
}

function seekTo(v, t) {
  return new Promise((res) => {
    const done = () => { v.removeEventListener('seeked', done); res(); };
    v.addEventListener('seeked', done);
    v.currentTime = t;
    setTimeout(done, 2500);
  });
}

async function videoFrames(m) {
  const url = mediaUrl(m);
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.src = url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(res, 8000); });
  const r = runtime.get(m.id) || {};
  const n = Math.min(24, Math.max(4, Math.ceil(m.duration / 2)));
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(m.duration - 0.05, (i + 0.5) * (m.duration / n));
    await seekTo(v, Math.max(0, t));
    const f = thumbFrom(v, m.width || 16, m.height || 9, 120);
    if (f) frames.push({ t, src: f });
    if (i === 0 || i === Math.floor(n / 3)) { r.thumb = frames[frames.length - 1]?.src || r.thumb; bus.emit('media'); }
  }
  r.frames = frames;
  runtime.set(m.id, r);
  v.removeAttribute('src'); v.load();
}

async function waveform(m) {
  if ((m.size || 0) > 400 * 1024 * 1024) return;
  const url = mediaUrl(m);
  const buf = await (await fetch(url)).arrayBuffer();
  let audio;
  try {
    const off = new OfflineAudioContext(1, 1, 44100);
    audio = await off.decodeAudioData(buf);
  } catch { const r = runtime.get(m.id) || {}; r.noAudio = m.type === 'video'; runtime.set(m.id, r); return; }
  const data = audio.getChannelData(0);
  const perSec = 40;
  const n = Math.max(1, Math.ceil(audio.duration * perSec));
  const block = Math.floor(data.length / n) || 1;
  const peaks = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    let p = 0;
    const s = i * block, e = Math.min(data.length, s + block);
    for (let j = s; j < e; j += 4) { const v = Math.abs(data[j]); if (v > p) p = v; }
    peaks[i] = p; if (p > max) max = p;
  }
  if (max > 0) for (let i = 0; i < n; i++) peaks[i] /= max;
  const r = runtime.get(m.id) || {};
  r.peaks = peaks; r.peaksPerSec = perSec;
  runtime.set(m.id, r);
}

// ---------- Elementos de reprodução por clipe ----------
const pool = new Map(); // clipId -> { el, gain, mediaId }
export function getPlayer(clip) {
  const m = store.media(clip.mediaId);
  if (!m || (m.type !== 'video' && m.type !== 'audio')) return null;
  let p = pool.get(clip.id);
  if (p && p.mediaId === m.id) return p;
  if (p) releasePlayer(clip.id);
  const url = mediaUrl(m);
  if (!url) return null;
  const el = document.createElement(m.type === 'video' ? 'video' : 'audio');
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  el.playsInline = true;
  el.src = url;
  p = { el, mediaId: m.id, gain: null, seeking: false };
  try {
    const ctx = audioCtx();
    const src = ctx.createMediaElementSource(el);
    p.gain = ctx.createGain();
    src.connect(p.gain).connect(master);
  } catch (e) { console.warn('audio route', e); }
  el.addEventListener('seeked', () => { p.seeking = false; bus.emit('frame-ready'); });
  el.addEventListener('loadeddata', () => bus.emit('frame-ready'));
  pool.set(clip.id, p);
  return p;
}
export function releasePlayer(id) {
  const p = pool.get(id);
  if (!p) return;
  try { p.el.pause(); p.el.removeAttribute('src'); p.el.load(); } catch {}
  pool.delete(id);
}
export function allPlayers() { return pool; }
export function gcPlayers() {
  for (const id of [...pool.keys()]) if (!store.clip(id)) releasePlayer(id);
}
export function imageFor(mediaId) { return runtime.get(mediaId)?.img || null; }

// ---------- Fontes personalizadas ----------
export async function importFonts() {
  let files = [];
  if (isDesktop) {
    files = (await api.importFonts()).map((f) => ({ family: f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]/g, ' '), path: f.path }));
  } else {
    files = await new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = true; inp.accept = '.ttf,.otf,.woff,.woff2';
      inp.onchange = () => res([...inp.files].map((f) => ({ family: f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]/g, ' '), url: URL.createObjectURL(f) })));
      inp.click();
    });
  }
  const ok = [];
  for (const f of files) {
    try { await loadCustomFont(f); store.p.fonts = store.p.fonts || []; if (!store.p.fonts.some((x) => x.family === f.family)) store.p.fonts.push({ family: f.family, path: f.path }); ok.push(f.family); } catch (e) { toast(t('Falha ao carregar fonte {name}', { name: f.family }), 'error'); }
  }
  if (ok.length) { toast(t('Fonte(s) adicionada(s): {list}', { list: ok.join(', ') }), 'success'); bus.emit('fonts'); saveUserFonts(); }
  return ok;
}
export async function loadCustomFont(f) {
  const url = f.url || (f.path && isDesktop ? api.mediaUrl(f.path) : null);
  if (!url) throw new Error('sem url');
  const face = new FontFace(f.family, `url("${url}")`);
  await face.load();
  document.fonts.add(face);
  customFonts.add(f.family);
}
export const customFonts = new Set();
// fontes importadas ficam disponíveis em todos os projetos (desktop)
function saveUserFonts() {
  if (!isDesktop) return;
  const list = (store.p.fonts || []).filter((f) => f.path);
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('asturcut.fonts') || '[]'); } catch {}
  for (const f of list) if (!saved.some((s) => s.family === f.family)) saved.push(f);
  localStorage.setItem('asturcut.fonts', JSON.stringify(saved));
}
export async function loadUserFonts() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('asturcut.fonts') || '[]'); } catch {}
  for (const f of saved) await loadCustomFont(f).catch(() => {});
  if (saved.length) bus.emit('fonts');
}
export { audioDef };

// ---------- Imagens geradas (fundos grátis da biblioteca) ----------
export const BACKGROUNDS = [
  ...['#000000', '#ffffff', '#1ccfdc', '#ff2d55', '#ffcc00', '#34c759', '#5856d6', '#ff9500', '#1c1c1e', '#8e8e93', '#ff6fa8', '#0a84ff'].map((c) => ({ id: 'solid:' + c, name: 'Cor ' + c, label: ['Cor {c}', c], kind: 'solid', colors: [c] })),
  { id: 'grad:#ff512f:#dd2476', name: 'Gradiente Fogo', kind: 'grad', colors: ['#ff512f', '#dd2476'] },
  { id: 'grad:#1ccfdc:#5b2bff', name: 'Gradiente Astur', kind: 'grad', colors: ['#1ccfdc', '#5b2bff'] },
  { id: 'grad:#f7971e:#ffd200', name: 'Gradiente Sol', kind: 'grad', colors: ['#f7971e', '#ffd200'] },
  { id: 'grad:#00c6ff:#0072ff', name: 'Gradiente Céu', kind: 'grad', colors: ['#00c6ff', '#0072ff'] },
  { id: 'grad:#11998e:#38ef7d', name: 'Gradiente Menta', kind: 'grad', colors: ['#11998e', '#38ef7d'] },
  { id: 'grad:#8e2de2:#4a00e0', name: 'Gradiente Roxo', kind: 'grad', colors: ['#8e2de2', '#4a00e0'] },
  { id: 'grad:#0f2027:#2c5364', name: 'Gradiente Noite', kind: 'grad', colors: ['#0f2027', '#2c5364'] },
  { id: 'grad:#ee9ca7:#ffdde1', name: 'Gradiente Rosa', kind: 'grad', colors: ['#ee9ca7', '#ffdde1'] },
  { id: 'radial:#2b2b2b:#000000', name: 'Holofote', kind: 'radial', colors: ['#3a3a3a', '#000000'] },
  { id: 'radial:#1ccfdc:#04161a', name: 'Brilho ciano', kind: 'radial', colors: ['#1ccfdc', '#04161a'] },
  { id: 'stripes:#1c1c1e:#2c2c2e', name: 'Listras', kind: 'stripes', colors: ['#1c1c1e', '#2c2c2e'] },
  { id: 'dots:#101014:#1ccfdc', name: 'Bolinhas', kind: 'dots', colors: ['#101014', '#1ccfdc'] },
  { id: 'grid:#0b0b10:#1ccfdc', name: 'Grade neon', kind: 'grid', colors: ['#0b0b10', '#1ccfdc'] },
  { id: 'sunset:', name: 'Paisagem', kind: 'sunset', colors: [] },
];

export function drawBackground(ctx, spec, W, H) {
  const [a, b] = spec.colors;
  if (spec.kind === 'solid') { ctx.fillStyle = a; ctx.fillRect(0, 0, W, H); }
  else if (spec.kind === 'grad') { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  else if (spec.kind === 'radial') { const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  else if (spec.kind === 'stripes') { ctx.fillStyle = a; ctx.fillRect(0, 0, W, H); ctx.fillStyle = b; for (let x = -H; x < W; x += W / 12) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.lineTo(x + H + W / 24, 0); ctx.lineTo(x + W / 24, H); ctx.fill(); } }
  else if (spec.kind === 'dots') { ctx.fillStyle = a; ctx.fillRect(0, 0, W, H); ctx.fillStyle = b; ctx.globalAlpha = 0.5; const s = W / 24; for (let y = s / 2; y < H; y += s) for (let x = s / 2; x < W; x += s) { ctx.beginPath(); ctx.arc(x, y, s * 0.12, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
  else if (spec.kind === 'grid') { ctx.fillStyle = a; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = b; ctx.globalAlpha = 0.35; ctx.lineWidth = Math.max(1, W / 960); const s = W / 20; for (let x = 0; x < W; x += s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y < H; y += s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.globalAlpha = 1; }
  else if (spec.kind === 'sunset') {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b1055'); g.addColorStop(0.55, '#d53369'); g.addColorStop(1, '#fbb03b'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd56b'; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.62, H * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b1d4a'; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * 0.7); ctx.lineTo(W * 0.2, H * 0.55); ctx.lineTo(W * 0.4, H * 0.72); ctx.lineTo(W * 0.62, H * 0.5); ctx.lineTo(W * 0.85, H * 0.7); ctx.lineTo(W, H * 0.6); ctx.lineTo(W, H); ctx.fill();
    ctx.fillStyle = '#1d0f2a'; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * 0.85); ctx.lineTo(W * 0.3, H * 0.75); ctx.lineTo(W * 0.55, H * 0.88); ctx.lineTo(W * 0.8, H * 0.78); ctx.lineTo(W, H * 0.86); ctx.lineTo(W, H); ctx.fill();
  }
}

async function genImage(specId) {
  const spec = BACKGROUNDS.find((b) => b.id === specId) || { kind: 'solid', colors: ['#000'] };
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1080;
  drawBackground(c.getContext('2d'), spec, 1920, 1080);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res) => { img.onload = res; img.src = url; });
  return { url, img, thumb: thumbFrom(c, 1920, 1080), name: spec.label ? t(spec.label[0], { c: spec.label[1] }) : t(spec.name) };
}

export async function addBackground(specId) {
  let m = store.p.media.find((x) => x.genImg === specId);
  const r = await genImage(specId);
  if (!m) {
    m = { id: uid('med'), name: r.name, type: 'image', genImg: specId, width: 1920, height: 1080, duration: 0, ext: 'png' };
    store.p.media.push(m);
  }
  runtime.set(m.id, { url: r.url, img: r.img, thumb: r.thumb });
  bus.emit('media');
  return m;
}
export async function restoreGenerated() {
  for (const m of store.p.media) if (m.genImg) { const r = await genImage(m.genImg); runtime.set(m.id, { url: r.url, img: r.img, thumb: r.thumb }); }
}
