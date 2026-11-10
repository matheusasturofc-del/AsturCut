// Recursos extras: exportar quadro, legendas SRT, marcadores/capítulos, tela dividida,
// inverter clipe, batidas da música, normalizar volume e igualar cor
import { store, bus } from './store.js';
import { el, modal, toast, clamp, fmtTime, promptDialog } from './util.js';
import { t } from './i18n.js';
import { renderFrame } from './compositor.js';
import { pause, player } from './player.js';
import { api, isDesktop, mediaUrl, importPaths } from './media.js';
import { createClips, CAPTION_STYLES } from './captions.js';
import { decodeMedia } from './fastExport.js';
import { srcOffset } from './keyframes.js';
import { settings } from './settings.js';

const projName = () => (store.p.name || 'AsturCut').replace(/[\\/:*?"<>|]/g, '-');
const tc = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return (h ? h + 'h' : '') + String(m).padStart(2, '0') + 'm' + String(x).padStart(2, '0') + 's'; };

async function saveFile(name, ext, payload) {
  if (api?.saveAs) {
    const p = await api.saveAs({ name, ext, ...payload });
    if (p) toast(t('Salvo em {p}', { p }), 'success', 4000);
    return p;
  }
  // navegador / celular: download
  const blob = payload.text != null ? new Blob([payload.text], { type: 'text/plain;charset=utf-8' }) : new Blob([payload.data], { type: ext === 'png' ? 'image/png' : 'application/octet-stream' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${name}.${ext}` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

// ---------- quadro atual como imagem ----------
export async function exportFrame() {
  pause();
  const { width: W, height: H } = store.p.settings;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  await new Promise((r) => setTimeout(r, 120));
  renderFrame(cv.getContext('2d'), store.time);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return saveFile(`${projName()} ${tc(store.time)}`, 'png', { data: await blob.arrayBuffer(), title: t('Salvar quadro como imagem') });
}

// ---------- legendas SRT ----------
const srtTime = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), x = Math.floor((ms % 60000) / 1000), r = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(r).padStart(3, '0')}`; };
export async function exportSrt() {
  let list = store.p.clips.filter((c) => c.autoCaption);
  if (!list.length) list = store.p.clips.filter((c) => c.type === 'text');
  if (!list.length) { toast(t('Não há legendas ou textos na linha do tempo'), 'error'); return; }
  list.sort((a, b) => a.start - b.start);
  const txt = list.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.start + c.duration)}\n${(c.text?.content || '').trim()}\n`).join('\n');
  return saveFile(projName(), 'srt', { text: txt, title: t('Exportar legendas (.srt)') });
}
export function parseSrt(text) {
  const out = [];
  const blocks = String(text).replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n/, '').split(/\n\s*\n/);
  const toS = (s) => { const m = /(?:(\d+):)?(\d+):(\d+)[,.](\d+)/.exec(s); return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0').slice(0, 3) / 1000 : null; };
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, z] = lines[i].split('-->');
    const s = toS(a), e = toS(z);
    const tx = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (s == null || e == null || !tx) continue;
    out.push({ text: tx, start: s, end: Math.max(e, s + 0.1), words: [] });
  }
  return out;
}
export async function importSrt() {
  let file = null;
  if (api?.openText) file = await api.openText({ exts: ['srt', 'vtt'] });
  else {
    file = await new Promise((res) => {
      const inp = el('input', { type: 'file', accept: '.srt,.vtt,text/plain' });
      inp.onchange = async () => { const f = inp.files[0]; res(f ? { name: f.name, text: await f.text() } : null); };
      inp.click();
    });
  }
  if (!file) return;
  const caps = parseSrt(file.text);
  if (!caps.length) { toast(t('Nenhuma legenda encontrada no arquivo'), 'error'); return; }
  const style = CAPTION_STYLES.find((s) => !s.karaoke)?.id || 'classic';
  createClips(caps, { style, pos: 'bottom', replace: false });
  toast(t('{n} legendas importadas', { n: caps.length }), 'success');
}

// ---------- marcadores e capítulos ----------
const MARK_COLORS = ['#1ccfdc', '#e5484d', '#ffb224', '#46a758', '#8e4ec6', '#f76b15', '#ffffff'];
export function editMarker(m) {
  const name = el('input', { class: 'input', value: m.name || '', placeholder: t('Ex.: Introdução') });
  const note = el('textarea', { class: 'input', rows: 3, placeholder: t('Anotações (opcional)') }, m.note || '');
  let color = m.color || MARK_COLORS[0];
  const chips = el('div', { class: 'btn-row' }, MARK_COLORS.map((c) => { const b = el('button', { class: 'swatch' + (c === color ? ' on' : ''), style: { background: c, width: '22px', height: '22px', borderRadius: '50%', border: '2px solid ' + (c === color ? '#fff' : 'transparent') }, onclick: () => { color = c; chips.querySelectorAll('button').forEach((x) => { x.style.borderColor = 'transparent'; }); b.style.borderColor = '#fff'; } }); return b; }));
  modal({
    title: t('Marcador em {t}', { t: fmtTime(m.time) }), width: 420,
    body: el('div', { class: 'dlg' }, el('b', {}, t('Nome (vira capítulo do YouTube)')), name, el('b', {}, t('Cor')), chips, el('b', {}, t('Notas')), note),
    actions: [
      { label: t('Excluir'), danger: true, onClick: () => { store.begin(); store.p.markers = store.p.markers.filter((x) => x !== m); store.commit('marker'); } },
      { label: t('Cancelar') },
      { label: t('Salvar'), primary: true, onClick: () => { store.begin(); m.name = name.value.trim(); m.note = note.value; m.color = color; store.commit('marker'); } },
    ],
  });
  setTimeout(() => name.focus(), 30);
}
export function markerAt(tt, tol) { return (store.p.markers || []).find((m) => Math.abs(m.time - tt) <= tol) || null; }

export function chaptersDialog() {
  const ms = [...(store.p.markers || [])].sort((a, b) => a.time - b.time);
  const fmt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const rows = [];
  if (!ms.length || ms[0].time > 0.5) rows.push(`0:00 ${t('Introdução')}`);
  ms.forEach((m, i) => rows.push(`${fmt(m.time)} ${m.name || t('Capítulo {n}', { n: i + 1 + (rows.length && i === 0 && ms[0].time > 0.5 ? 1 : 0) })}`));
  const ta = el('textarea', { class: 'input', rows: 10, style: { width: '100%', fontFamily: 'monospace' } }, rows.join('\n'));
  modal({
    title: t('Capítulos do YouTube'), width: 480,
    body: el('div', { class: 'dlg' },
      el('div', { class: 'muted small' }, t('Gerado a partir dos marcadores (M). Dê um nome a cada marcador clicando duas vezes nele na régua. Cole este texto na descrição do vídeo no YouTube.')),
      ms.length < 2 ? el('div', { class: 'muted small', style: { color: 'var(--warn, #ffb224)' } }, t('O YouTube pede pelo menos 3 capítulos com 10 segundos ou mais cada.')) : null,
      ta),
    actions: [
      { label: t('Salvar .txt'), onClick: () => { saveFile(projName() + ' - ' + t('capítulos'), 'txt', { text: ta.value }); return false; } },
      { label: t('Copiar'), primary: true, onClick: () => { navigator.clipboard?.writeText(ta.value).then(() => toast(t('Copiado!'), 'success')).catch(() => { ta.select(); document.execCommand('copy'); }); } },
    ],
  });
}

// ---------- tela dividida / layouts ----------
const LAYOUTS = [
  { id: 'h2', name: 'Lado a lado', n: 2, r: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { id: 'v2', name: 'Em cima e embaixo', n: 2, r: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  { id: 'h3', name: '3 colunas', n: 3, r: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
  { id: 'v3', name: '3 faixas', n: 3, r: [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]] },
  { id: 'big2', name: '1 grande + 2', n: 3, r: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]] },
  { id: 'g4', name: 'Grade 2×2', n: 4, r: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: 'pip', name: 'Picture-in-picture', n: 2, r: [[0, 0, 1, 1], [0.66, 0.05, 0.3, 0.3]] },
  { id: 'pipL', name: 'PiP canto inferior', n: 2, r: [[0, 0, 1, 1], [0.04, 0.65, 0.3, 0.3]] },
];
function layoutIcon(L) {
  const s = el('div', { class: 'lay-ico' });
  L.r.forEach(([x, y, w, h], i) => s.append(el('span', { style: { left: x * 100 + '%', top: y * 100 + '%', width: w * 100 + '%', height: h * 100 + '%', background: `hsl(${185 + i * 40} 70% ${45 + i * 6}%)` } })));
  return s;
}
export function splitLayoutDialog() {
  let vis = store.selectedClips().filter((c) => ['video', 'image', 'gen', 'sequence'].includes(c.type));
  if (vis.length < 2) {
    const tt = store.time;
    vis = store.p.clips.filter((c) => ['video', 'image', 'gen', 'sequence'].includes(c.type) && tt >= c.start && tt < c.start + c.duration);
    // ordem: trilha de baixo primeiro
    vis.sort((a, b) => store.p.tracks.findIndex((x) => x.id === b.trackId) - store.p.tracks.findIndex((x) => x.id === a.trackId));
  }
  if (vis.length < 2) { toast(t('Selecione 2 ou mais vídeos/imagens que aparecem ao mesmo tempo (um em cada trilha)'), 'error', 4000); return; }
  const grid = el('div', { class: 'lay-grid' });
  const dlg = modal({
    title: t('Tela dividida'), width: 520,
    body: el('div', { class: 'dlg' }, el('div', { class: 'muted small' }, t('{n} clipe(s) serão organizados. A ordem segue a seleção (ou da trilha de baixo para cima).', { n: vis.length })), grid),
    actions: [{ label: t('Desfazer layout'), onClick: () => { store.batch('layout', () => { for (const c of vis) { c.masks = (c.masks || []).filter((k) => !k.layout); Object.assign(c.transform, { x: 0, y: 0, scale: 1 }); } }); } }, { label: t('Fechar') }],
  });
  for (const L of LAYOUTS) {
    if (L.n > vis.length) continue;
    grid.append(el('button', { class: 'lay-btn', onclick: () => { applyLayout(L, vis); dlg.close(); } }, layoutIcon(L), el('span', {}, t(L.name))));
  }
}
function applyLayout(L, vis) {
  const { width: W, height: H } = store.p.settings;
  store.batch('layout', () => {
    vis.slice(0, L.n).forEach((c, i) => {
      const [rx, ry, rw, rh] = L.r[i];
      let mw = W, mh = H;
      if (c.type === 'video' || c.type === 'image') { const m = store.media(c.mediaId); mw = m?.width || W; mh = m?.height || H; }
      c.fit = 'cover';
      const k = Math.max(W / mw, H / mh), Cw = mw * k, Ch = mh * k;
      const s = Math.max((rw * W) / Cw, (rh * H) / Ch);
      c.transform.scale = +s.toFixed(4);
      c.transform.x = +(rx + rw / 2 - 0.5).toFixed(4);
      c.transform.y = +(ry + rh / 2 - 0.5).toFixed(4);
      c.transform.rotation = 0;
      if (c.kf) { delete c.kf.x; delete c.kf.y; delete c.kf.scale; }
      c.masks = (c.masks || []).filter((m) => !m.layout);
      const full = rw >= 0.999 && rh >= 0.999;
      if (!full) c.masks.push({ id: 'lay' + i, layout: true, shape: 'rect', x: 0, y: 0, w: +((rw * W) / (Cw * s)).toFixed(4), h: +((rh * H) / (Ch * s)).toFixed(4), rot: 0, feather: 0, expand: 0, opacity: 1, invert: false });
    });
  });
  player.needsRender = true;
  toast(t('Layout aplicado'), 'success');
}

// ---------- inverter clipe ----------
export async function reverseClip(c = store.primarySelected()) {
  if (!c || c.type !== 'video') { toast(t('Selecione um clipe de vídeo'), 'error'); return; }
  if (!isDesktop || !api.reverseMedia) { toast(t('Inverter funciona no aplicativo para PC'), 'error'); return; }
  const m = store.media(c.mediaId);
  if (!m?.path) return;
  pause();
  const bar = el('div', { class: 'progress-fill' });
  const dlg = modal({ title: t('Invertendo o clipe'), width: 400, className: 'no-close', body: el('div', { class: 'exp-progress' }, el('div', { class: 'progress' }, bar), el('div', { class: 'muted small' }, t('O vídeo vai tocar de trás para frente...'))), actions: [] });
  const off = api.on('proxy:progress', (d) => { if (d.id === c.id) bar.style.width = Math.round(d.p * 100) + '%'; });
  try {
    const len = srcOffset(c, c.duration);
    const out = await api.reverseMedia({ path: m.path, id: c.id, start: c.in || 0, duration: len });
    const [nm] = await importPaths([out]);
    if (!nm) throw new Error('import');
    nm.name = m.name.replace(/\.[^.]+$/, '') + ' (' + t('invertido') + ').mp4';
    const linked = store.linked ? store.linked(c).filter((x) => x !== c && x.mediaId === m.id) : [];
    store.batch('reverse', () => {
      for (const x of new Set([c, ...linked])) {
        x.mediaId = nm.id; x.in = 0; x.reversed = !x.reversed;
        if (x.kf) for (const k of Object.keys(x.kf)) x.kf[k] = x.kf[k].map((f) => ({ ...f, t: +(x.duration - f.t).toFixed(3) })).sort((a, b) => a.t - b.t);
      }
    });
    bus.emit('media');
    toast(t('Clipe invertido'), 'success');
  } catch (e) { console.error(e); toast(t('Não foi possível inverter: {m}', { m: String(e.message || e).slice(0, 120) }), 'error'); }
  finally { off(); dlg.close(); }
}

// ---------- batidas da música ----------
export async function detectBeats(c) {
  const m = store.media(c.mediaId);
  const buf = m && await decodeMedia(m);
  if (!buf) return null;
  const sr = buf.sampleRate, hop = Math.round(sr / 100);
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const a0 = c.in || 0, a1 = Math.min(buf.duration, a0 + srcOffset(c, c.duration));
  const i0 = Math.floor(a0 * sr), i1 = Math.floor(a1 * sr);
  const n = Math.floor((i1 - i0) / hop);
  if (n < 200) return null;
  // envelope com ênfase nos graves (filtro passa-baixa simples) e fluxo positivo
  const env = new Float32Array(n);
  let lp = 0;
  const alpha = 1 - Math.exp(-2 * Math.PI * 180 / sr);
  for (let i = 0; i < n; i++) {
    let s = 0, sh = 0;
    for (let k = i0 + i * hop, e = k + hop; k < e; k++) { const v = (L[k] + R[k]) * 0.5; lp += alpha * (v - lp); s += lp * lp; sh += v * v; }
    env[i] = Math.log(1e-6 + s / hop) * 0.7 + Math.log(1e-6 + sh / hop) * 0.3;
  }
  const flux = new Float32Array(n);
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
  // média móvel subtraída
  const W = 15, on = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += flux[i]; if (i >= W) acc -= flux[i - W]; on[i] = Math.max(0, flux[i] - acc / Math.min(i + 1, W)); }
  // tempo por autocorrelação (70–180 BPM)
  let bestLag = 50, bestV = -1;
  for (let lag = 33; lag <= 86; lag++) {
    let v = 0; for (let i = lag; i < n; i++) v += on[i] * on[i - lag];
    const bpm = 6000 / lag; const w = Math.exp(-((Math.log2(bpm / 120)) ** 2) * 1.5); // preferência por ~120
    if (v * w > bestV) { bestV = v * w; bestLag = lag; }
  }
  // fase
  let bestP = 0, bestS = -1;
  for (let p = 0; p < bestLag; p++) { let s = 0; for (let i = p; i < n; i += bestLag) s += on[i] + 0.5 * (on[i - 1] || 0) + 0.5 * (on[i + 1] || 0); if (s > bestS) { bestS = s; bestP = p; } }
  // ajuste fino de cada batida ao pico mais próximo (±3 amostras)
  const beats = [];
  for (let i = bestP; i < n; i += bestLag) {
    let bi = i, bv = on[i];
    for (let k = -3; k <= 3; k++) if (on[i + k] > bv) { bv = on[i + k]; bi = i + k; }
    beats.push(bi / 100);
  }
  const spd = (c.speed || 1);
  return { bpm: Math.round(6000 / bestLag), times: beats.map((s) => c.start + s / spd).filter((x) => x < c.start + c.duration) };
}

export function beatsDialog() {
  const music = store.selectedClips().find((c) => c.type === 'audio') || store.p.clips.filter((c) => c.type === 'audio').sort((a, b) => b.duration - a.duration)[0];
  if (!music) { toast(t('Adicione uma música na linha do tempo'), 'error'); return; }
  const o = { every: 2, mode: 'markers' };
  const pick = (key, opts) => el('div', { class: 'chips' }, opts.map(([v, n]) => { const b = el('button', { class: 'chip' + (o[key] === v ? ' on' : ''), onclick: () => { o[key] = v; b.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, t(n)); return b; }));
  modal({
    title: t('Batidas da música'), width: 480,
    body: el('div', { class: 'dlg' },
      el('div', { class: 'muted small' }, t('Música: {n}', { n: music.name || '' })),
      el('b', {}, t('O que fazer')), pick('mode', [['markers', 'Só marcar as batidas'], ['cut', 'Cortar os clipes no ritmo']]),
      el('b', {}, t('Cortar a cada')), pick('every', [[1, '1 batida'], [2, '2 batidas'], [4, '4 batidas (1 compasso)'], [8, '8 batidas']]),
      el('div', { class: 'muted small' }, t('"Cortar no ritmo" ajusta a duração dos clipes da trilha principal para trocar exatamente nas batidas, como os modelos de beat do CapCut.'))),
    actions: [{ label: t('Cancelar') }, { label: t('Aplicar'), primary: true, onClick: () => { runBeats(music, o); } }],
  });
}
async function runBeats(music, o) {
  const tst = toast(t('Ouvindo a música...'), 'info', 30000);
  const r = await detectBeats(music).catch((e) => { console.error(e); return null; });
  tst.remove();
  if (!r || r.times.length < 2) { toast(t('Não encontrei batidas nesta música'), 'error'); return; }
  const marks = r.times.filter((_, i) => i % o.every === 0);
  if (o.mode === 'markers') {
    store.batch('beats', () => {
      store.p.markers = (store.p.markers || []).filter((m) => !m.beat);
      for (const tt of marks) store.p.markers.push({ id: 'bt' + Math.round(tt * 1000), time: +tt.toFixed(3), color: '#ffb224', beat: true });
    });
    toast(t('{n} batidas marcadas ({b} BPM)', { n: marks.length, b: r.bpm }), 'success');
    return;
  }
  const main = store.clipsOn(store.mainTrack().id).filter((c) => ['video', 'image', 'gen', 'sequence'].includes(c.type));
  if (!main.length) { toast(t('Coloque vídeos ou fotos na trilha principal'), 'error'); return; }
  const grid = [music.start, ...marks.filter((x) => x > music.start + 0.2)];
  store.batch('beat-cut', () => {
    let cur = grid[0], gi = 0;
    for (const c of main) {
      c.start = cur;
      let next = grid[gi + 1] ?? cur + c.duration;
      // vídeo curto demais para chegar à próxima batida? usa a batida anterior possível
      const maxLen = c.type === 'video' ? ((store.media(c.mediaId)?.duration || 1e9) - (c.in || 0)) / (c.speed || 1) : 1e9;
      let k = gi + 1;
      while (next - cur > maxLen && k > gi + 1) { k--; next = grid[k]; }
      if (next - cur > maxLen) next = cur + maxLen;
      c.duration = Math.max(0.1, next - cur);
      cur = next; gi = Math.max(gi + 1, k);
    }
    store.p.markers = (store.p.markers || []).filter((m) => !m.beat);
    for (const tt of marks) store.p.markers.push({ id: 'bt' + Math.round(tt * 1000), time: +tt.toFixed(3), color: '#ffb224', beat: true });
  });
  toast(t('{n} clipes cortados no ritmo ({b} BPM)', { n: main.length, b: r.bpm }), 'success');
}

// ---------- normalizar volume (LUFS aproximado) ----------
async function loudness(c) {
  const m = store.media(c.mediaId);
  const buf = m && await decodeMedia(m);
  if (!buf) return null;
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const a0 = Math.floor((c.in || 0) * sr), a1 = Math.min(buf.length, Math.floor(((c.in || 0) + srcOffset(c, c.duration)) * sr));
  // filtro K simplificado: passa-alta 60 Hz + realce de agudos ~+4 dB acima de 2 kHz
  const hpA = Math.exp(-2 * Math.PI * 60 / sr), shA = Math.exp(-2 * Math.PI * 2000 / sr);
  const blk = Math.round(sr * 0.4), stepB = Math.round(sr * 0.1);
  let hpx = 0, hpy = 0, sh = 0;
  const e = new Float32Array(a1 - a0);
  for (let i = a0; i < a1; i++) {
    const x = (L[i] + R[i]) * 0.5;
    hpy = hpA * (hpy + x - hpx); hpx = x;
    sh += (1 - shA) * (hpy - sh);
    const y = hpy + (hpy - sh) * 0.58;
    e[i - a0] = y * y;
  }
  const blocks = [];
  let acc = 0;
  for (let i = 0; i < e.length; i++) { acc += e[i]; if (i >= blk) acc -= e[i - blk]; if (i >= blk - 1 && (i - blk + 1) % stepB === 0) blocks.push(acc / blk); }
  if (!blocks.length) blocks.push(e.reduce((s, v) => s + v, 0) / Math.max(1, e.length));
  const lk = (p) => -0.691 + 10 * Math.log10(p + 1e-12) + 3.01; // mono somado → aproxima estéreo
  const abs = blocks.filter((p) => lk(p) > -70);
  if (!abs.length) return null;
  const rel = lk(abs.reduce((s, v) => s + v, 0) / abs.length) - 10;
  const g = abs.filter((p) => lk(p) > rel);
  return lk(g.reduce((s, v) => s + v, 0) / Math.max(1, g.length));
}
export function normalizeDialog() {
  const sel = store.selectedClips().filter((c) => c.type === 'audio' || (c.type === 'video' && !c.audioDetached));
  const list = sel.length ? sel : store.p.clips.filter((c) => c.type === 'audio' || (c.type === 'video' && !c.audioDetached));
  if (!list.length) { toast(t('Não há áudio na linha do tempo'), 'error'); return; }
  const o = { target: -14 };
  const pick = el('div', { class: 'chips' }, [[-14, 'YouTube / Spotify (-14 LUFS)'], [-16, 'Podcast (-16 LUFS)'], [-23, 'TV (-23 LUFS)'], [-11, 'Alto / redes sociais (-11 LUFS)']].map(([v, n]) => { const b = el('button', { class: 'chip' + (o.target === v ? ' on' : ''), onclick: () => { o.target = v; pick.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, t(n)); return b; }));
  modal({
    title: t('Normalizar volume'), width: 480,
    body: el('div', { class: 'dlg' }, el('div', { class: 'muted small' }, t('Deixa todos os clipes com o mesmo volume percebido (loudness), no padrão da plataforma. {n} clipe(s).', { n: list.length })), el('b', {}, t('Padrão')), pick),
    actions: [{ label: t('Cancelar') }, { label: t('Normalizar'), primary: true, onClick: () => { runNormalize(list, o.target); } }],
  });
}
async function runNormalize(list, target) {
  const tst = toast(t('Medindo o volume...'), 'info', 60000);
  const res = [];
  for (const c of list) { const l = await loudness(c).catch(() => null); if (l != null && Number.isFinite(l)) res.push([c, l]); }
  tst.remove();
  if (!res.length) { toast(t('Não foi possível medir o volume'), 'error'); return; }
  store.batch('normalize', () => { for (const [c, l] of res) { c.volume = +clamp(Math.pow(10, (target - l) / 20), 0, 4).toFixed(3); if (c.kf) delete c.kf.volume; } });
  toast(t('{n} clipe(s) normalizado(s) para {l} LUFS', { n: res.length, l: target }), 'success');
}

// ---------- igualar cor ----------
async function frameStats(c) {
  const m = store.media(c.mediaId);
  if (!m) return null;
  let src;
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
  const x = cv.getContext('2d', { willReadFrequently: true });
  if (m.type === 'image') {
    src = new Image(); src.crossOrigin = 'anonymous'; src.src = mediaUrl(m);
    await new Promise((r) => { src.onload = r; src.onerror = r; });
  } else {
    src = document.createElement('video'); src.muted = true; src.crossOrigin = 'anonymous'; src.src = mediaUrl(m);
    await new Promise((r) => { src.onloadeddata = r; src.onerror = r; setTimeout(r, 4000); });
    const tt = (c.in || 0) + srcOffset(c, Math.min(c.duration / 2, Math.max(0, store.time - c.start) || c.duration / 2));
    await new Promise((r) => { src.onseeked = r; src.currentTime = tt; setTimeout(r, 2000); });
  }
  try { x.drawImage(src, 0, 0, 96, 54); } catch { return null; }
  const d = x.getImageData(0, 0, 96, 54).data;
  let sl = 0, sl2 = 0, sc = 0, sr = 0, sg = 0, sb = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], l = 0.299 * r + 0.587 * g + 0.114 * b;
    sl += l; sl2 += l * l; sc += Math.max(r, g, b) - Math.min(r, g, b); sr += r; sg += g; sb += b;
  }
  if (src.tagName === 'VIDEO') { src.removeAttribute('src'); src.load(); }
  const mean = sl / n;
  return { mean, sd: Math.sqrt(Math.max(0, sl2 / n - mean * mean)), chroma: sc / n, r: sr / n, g: sg / n, b: sb / n };
}
export async function colorMatch(target, ref) {
  const vis = (c) => c && (c.type === 'video' || c.type === 'image');
  if (!vis(target) || !vis(ref)) { toast(t('Selecione 2 clipes: primeiro o de referência, depois o que vai mudar'), 'error', 4000); return; }
  const tst = toast(t('Comparando as cores...'), 'info', 20000);
  const [a, b] = [await frameStats(target), await frameStats(ref)];
  tst.remove();
  if (!a || !b) { toast(t('Não foi possível ler os quadros'), 'error'); return; }
  const sumA = Math.max(1, a.r + a.g + a.b), sumB = Math.max(1, b.r + b.g + b.b);
  const dTemp = (((a.b - a.r) / sumA) - ((b.b - b.r) / sumB)) * 260;
  const dTint = (((a.r + a.b) / 2 - a.g) / sumA - ((b.r + b.b) / 2 - b.g) / sumB) * -260;
  store.batch('color-match', () => {
    const ad = target.adjust;
    ad.brightness = Math.round(clamp((b.mean / Math.max(1, a.mean) - 1) * 200, -100, 100));
    ad.contrast = Math.round(clamp((b.sd / Math.max(1, a.sd) - 1) * 100, -100, 100));
    ad.saturation = Math.round(clamp((b.chroma / Math.max(1, a.chroma) - 1) * 100, -100, 100));
    ad.temperature = Math.round(clamp(dTemp, -100, 100));
    ad.tint = Math.round(clamp(dTint, -100, 100));
  });
  player.needsRender = true;
  toast(t('Cores igualadas — ajuste fino na aba Ajuste'), 'success');
}
export function colorMatchSelected() {
  const s = store.selectedClips().filter((c) => c.type === 'video' || c.type === 'image');
  if (s.length < 2) { toast(t('Selecione 2 clipes: primeiro o de referência, depois o que vai mudar'), 'error', 4000); return; }
  return colorMatch(s[s.length - 1], s[0]);
}

void settings; void promptDialog;
