// Remover fundo de FOTOS com IA (qualquer objeto: pessoa, produto, animal, carro, comida...).
// Gera um PNG novo com fundo transparente (o original não muda). Para vídeos, continua o recorte de pessoa em tempo real.
import { store, bus } from './store.js';
import { el, modal, toast, clamp, fmtBytes } from './util.js';
import { t } from './i18n.js';
import { pause, player } from './player.js';
import { api, importPaths, mediaUrl, runtime } from './media.js';

let worker = null;
function getWorker() {
  if (!worker) worker = new Worker(new URL('./ai/rmbg-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

async function loadImage(m) {
  const r = runtime.get(m.id);
  if (r?.img && r.img.complete !== false) return r.img;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = mediaUrl(m, true);
  await img.decode();
  return img;
}

// recorta a imagem e devolve um Blob PNG com transparência
async function cutout(m, onStatus, crop = true) {
  const img = await loadImage(m);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const bmp = await createImageBitmap(img);
  const res = await new Promise((resolve, reject) => {
    const w = getWorker();
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'download') onStatus(d.loaded / d.total, t('Baixando a IA de recorte (só na primeira vez)... {a} de {b}', { a: fmtBytes(d.loaded), b: fmtBytes(d.total) }));
      else if (d.type === 'status') onStatus(null, d.text === 'run' ? t('Recortando...') : t('Carregando a IA...'));
      else if (d.type === 'done') resolve(d);
      else if (d.type === 'error') reject(new Error(d.message));
    };
    w.onerror = (e) => reject(new Error(e.message || 'worker'));
    w.postMessage({ bitmap: bmp, vendor: window.ASTUR_VENDOR?.transformers || null }, [bmp]);
  });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H);
  const a = res.alpha;
  for (let i = 0; i < a.length; i++) d.data[i * 4 + 3] = Math.min(d.data[i * 4 + 3], a[i]);
  x.putImageData(d, 0, 0);
  // recorta as sobras transparentes em volta (fica mais fácil de posicionar)
  const box = bounds(a, W, H);
  let out = cv;
  if (crop && box && (box.w < W * 0.98 || box.h < H * 0.98)) {
    out = document.createElement('canvas'); out.width = box.w; out.height = box.h;
    out.getContext('2d').drawImage(cv, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  }
  const kept = a.reduce((s, v) => s + (v > 128 ? 1 : 0), 0) / a.length;
  return { blob: await new Promise((r) => out.toBlob(r, 'image/png')), kept, model: res.model };
}
function bounds(a, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (a[y * W + x] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(W, H) * 0.01);
  x0 = clamp(x0 - pad, 0, W); y0 = clamp(y0 - pad, 0, H); x1 = clamp(x1 + pad, 0, W - 1); y1 = clamp(y1 + pad, 0, H - 1);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function saveAsMedia(blob, name) {
  if (api?.saveMedia) {
    const path = await api.saveMedia(name, new Uint8Array(await blob.arrayBuffer()));
    const [m] = await importPaths([path]);
    return m;
  }
  // versão web: mídia em memória
  const { importDropped } = await import('./media.js');
  const list = await importDropped([new File([blob], name, { type: 'image/png' })]);
  return list && list[0];
}

// remove o fundo da mídia; se clip for informado, troca a foto do clipe pela recortada
export async function removeBackground(m, clip = null) {
  if (!m || m.type !== 'image') { toast(t('Selecione uma foto'), 'error'); return null; }
  if (m.alpha) {
    toast(t('Esta foto já tem fundo transparente — não precisa remover.'), 'info', 4000);
    return null;
  }
  pause();
  const bar = el('div', { class: 'progress-fill' });
  const label = el('div', { class: 'muted small' }, t('Preparando...'));
  let cancelled = false;
  const dlg = modal({
    title: t('Removendo o fundo...'), width: 440, className: 'no-close',
    body: el('div', { class: 'exp-progress' }, el('div', { class: 'progress' }, bar), label),
    actions: [{ label: t('Cancelar'), danger: true, onClick: () => { cancelled = true; if (worker) { worker.terminate(); worker = null; } } }],
  });
  try {
    // no clipe mantém o tamanho original (o objeto fica no mesmo lugar); na biblioteca recorta as sobras
    const { blob, kept } = await cutout(m, (p, txt) => { if (p != null) bar.style.width = Math.round(p * 100) + '%'; else bar.style.width = '100%'; if (txt) label.textContent = txt; }, !clip);
    if (cancelled) return null;
    const name = (m.name || 'foto').replace(/\.[^.]+$/, '') + ' (' + t('sem fundo') + ').png';
    const nm = await saveAsMedia(blob, name);
    if (!nm) throw new Error('import');
    nm.name = name;
    if (clip && store.clip(clip.id)) {
      store.batch('remove-bg', () => { clip.mediaId = nm.id; clip.name = name; if (clip.cutout) clip.cutout.on = false; });
      player.needsRender = true;
    }
    bus.emit('media');
    dlg.close();
    if (kept < 0.01) toast(t('A IA não encontrou um objeto principal nesta foto. Tente uma foto com o objeto mais em destaque.'), 'error', 5000);
    else toast(t('Fundo removido! A foto nova está na biblioteca como "{n}".', { n: name }), 'success', 4500);
    return nm;
  } catch (e) {
    if (cancelled) return null;
    dlg.close();
    console.error(e);
    const msg = String(e.message || e);
    toast(/fetch|network|Failed|ERR_/i.test(msg) ? t('Não consegui baixar a IA de recorte. Verifique a internet (só precisa na primeira vez).') : t('Não foi possível remover o fundo: {m}', { m: msg.slice(0, 120) }), 'error', 6000);
    return null;
  }
}
