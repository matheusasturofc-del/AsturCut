// Multicâmera: sincroniza vários ângulos pelo áudio e corta entre eles ao vivo (teclas 1–9)
import { store, bus, normalizeClip } from './store.js';
import { el, modal, toast, clamp, uid, icon, fmtTime } from './util.js';
import { t } from './i18n.js';
import { decodeMedia } from './fastExport.js';
import { allPlayers } from './media.js';
import { player, pause } from './player.js';
import { ensureSeqs, seqData, seqFlags } from './sequences.js';

const ENV_HZ = 100;

// envelope de energia (RMS) do áudio, 100 amostras por segundo, com realce de ataques
async function envelope(m) {
  const buf = await decodeMedia(m);
  if (!buf) return null;
  const sr = buf.sampleRate, hop = Math.round(sr / ENV_HZ);
  const ch = [buf.getChannelData(0), buf.numberOfChannels > 1 ? buf.getChannelData(1) : null];
  const n = Math.floor(buf.length / hop), env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * hop, e = k + hop; k < e; k++) { const v = ch[1] ? (ch[0][k] + ch[1][k]) * 0.5 : ch[0][k]; s += v * v; }
    env[i] = Math.sqrt(s / hop);
  }
  // derivada positiva (início de sons) normalizada: mais robusta entre microfones diferentes
  const out = new Float32Array(n);
  for (let i = 1; i < n; i++) out[i] = Math.max(0, Math.log(1e-4 + env[i]) - Math.log(1e-4 + env[i - 1]));
  let mean = 0; for (const v of out) mean += v; mean /= Math.max(1, n);
  let sd = 0; for (const v of out) sd += (v - mean) ** 2; sd = Math.sqrt(sd / Math.max(1, n)) || 1;
  for (let i = 0; i < n; i++) out[i] = (out[i] - mean) / sd;
  return out;
}

// atraso k (em amostras) que melhor alinha b com a: a[n] ~ b[n - k]
function bestLag(a, b, maxLag) {
  const corr = (k, step) => {
    let s = 0, cnt = 0;
    const lo = Math.max(0, k), hi = Math.min(a.length, b.length + k);
    for (let n = lo; n < hi; n += step) { s += a[n] * b[n - k]; cnt++; }
    return cnt > 50 ? s / Math.sqrt(cnt) : -Infinity;
  };
  let best = -Infinity, bk = 0;
  for (let k = -maxLag; k <= maxLag; k += 2) { const c = corr(k, 2); if (c > best) { best = c; bk = k; } }
  let fine = -Infinity, fk = bk;
  for (let k = bk - 3; k <= bk + 3; k++) { const c = corr(k, 1); if (c > fine) { fine = c; fk = k; } }
  return { lag: fk, score: fine };
}

export function multicamDialog() {
  const vids = store.p.media.filter((m) => m.type === 'video');
  if (vids.length < 2) { toast(t('Importe pelo menos 2 vídeos (um por câmera)'), 'error'); return; }
  const selMedia = new Set(store.selectedClips().filter((c) => c.type === 'video').map((c) => c.mediaId));
  const chosen = new Set(selMedia.size >= 2 ? selMedia : vids.slice(0, Math.min(4, vids.length)).map((m) => m.id));
  const o = { sync: 'audio', audio: 'master' };
  const list = el('div', { class: 'mc-list' }, vids.map((m) => {
    const cb = el('input', { type: 'checkbox', checked: chosen.has(m.id), onchange: () => { if (cb.checked) chosen.add(m.id); else chosen.delete(m.id); } });
    return el('label', { class: 'mc-item' }, cb, el('span', {}, m.name), el('span', { class: 'muted small' }, fmtTime(m.duration || 0)));
  }));
  const pick = (key, opts) => el('div', { class: 'chips' }, opts.map(([v, n]) => { const b = el('button', { class: 'chip' + (o[key] === v ? ' on' : ''), onclick: () => { o[key] = v; b.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, t(n)); return b; }));
  modal({
    title: t('Criar sequência multicâmera'), width: 520,
    body: el('div', { class: 'dlg' },
      el('div', { class: 'muted small' }, t('Junte gravações de várias câmeras do mesmo momento. O AsturCut alinha tudo pelo som e você corta entre as câmeras ao vivo, apertando 1, 2, 3...')),
      el('b', {}, t('Câmeras (ângulos)')), list,
      el('b', {}, t('Sincronizar por')), pick('sync', [['audio', 'Áudio (automático)'], ['start', 'Início dos arquivos']]),
      el('b', {}, t('Som')), pick('audio', [['master', 'Sempre da câmera 1'], ['follow', 'Segue a câmera escolhida']])),
    actions: [{ label: t('Cancelar') }, { label: t('Criar'), primary: true, onClick: () => { const ms = vids.filter((m) => chosen.has(m.id)); if (ms.length < 2) { toast(t('Escolha pelo menos 2 câmeras'), 'error'); return false; } createMulticam(ms, o); } }],
  });
}

export async function createMulticam(ms, o = { sync: 'audio', audio: 'master' }) {
  pause();
  let starts = ms.map(() => 0);
  if (o.sync === 'audio') {
    const tst = toast(t('Sincronizando as câmeras pelo áudio...'), 'info', 60000);
    try {
      const envs = [];
      for (const m of ms) envs.push(await envelope(m));
      const ref = envs[0];
      if (ref) {
        for (let i = 1; i < ms.length; i++) {
          if (!envs[i]) continue;
          const maxLag = Math.round(Math.min(120, Math.max(ref.length, envs[i].length) / ENV_HZ) * ENV_HZ);
          const { lag } = bestLag(ref, envs[i], maxLag);
          starts[i] = lag / ENV_HZ;
        }
      }
    } catch (e) { console.error(e); toast(t('Não deu para sincronizar pelo áudio; usando o início dos arquivos'), 'error'); starts = ms.map(() => 0); }
    tst?.remove?.();
  }
  const min = Math.min(...starts);
  starts = starts.map((s) => s - min);
  ensureSeqs();
  const n = store.p.sequences.filter((s) => s.multicam).length + 1;
  const name = t('Multicâmera {n}', { n });
  const tracks = [], clips = [];
  ms.forEach((m, i) => {
    const tr = { id: uid('trk'), type: 'video', name: t('Câmera {n}', { n: i + 1 }), main: i === 0, muted: false, hidden: false, locked: false };
    tracks.push(tr);
    clips.push(normalizeClip({ id: uid('clp'), trackId: tr.id, type: 'video', mediaId: m.id, name: m.name, start: +starts[i].toFixed(3), duration: m.duration || 5, in: 0 }));
  });
  tracks.reverse(); // câmera 1 embaixo
  const s = { id: uid('seq'), name, multicam: { audio: o.audio || 'master' }, tracks, clips, markers: [], range: null };
  const dur = Math.max(...clips.map((c) => c.start + c.duration));
  let nc;
  store.batch('multicam', () => {
    store.p.sequences.push(s);
    const at = store.clipsOn(store.mainTrack().id).length ? store.time : 0;
    const tr = store.findTrackFor('video', at, at + dur, true);
    nc = store.addClip({ trackId: tr.id, type: 'sequence', seqId: s.id, name, start: at, duration: dur, in: 0, mcAngle: 0 }, { commit: false });
  });
  bus.emit('sequences');
  toast(t('Multicâmera criada: aperte 1–{n} durante a reprodução para trocar de câmera', { n: ms.length }), 'success', 5000);
  openMulticamMonitor();
  return nc;
}

// ---------- monitor multicâmera ----------
export const mcState = { open: false };
let panel = null, raf = 0;
import { angleTracks } from './sequences.js';
export function isMulticamSeq(id) { return !!seqData(id)?.multicam; }

function currentMcClip() {
  const tt = store.time;
  const sel = store.selectedClips().find((c) => c.type === 'sequence' && isMulticamSeq(c.seqId) && tt >= c.start && tt < c.start + c.duration);
  if (sel) return sel;
  const all = store.p.clips.filter((c) => c.type === 'sequence' && isMulticamSeq(c.seqId) && tt >= c.start - 1e-3 && tt < c.start + c.duration);
  return all[0] || null;
}

export function switchAngle(i) {
  const c = currentMcClip();
  if (!c) { toast(t('Coloque o cursor sobre um clipe multicâmera'), 'error'); return; }
  const d = seqData(c.seqId);
  if (i >= angleTracks(d).length) return;
  const tt = store.time;
  if ((c.mcAngle ?? 0) === i) return;
  store.batch('angle', () => {
    if (tt > c.start + 0.05 && tt < c.start + c.duration - 0.05) {
      const [b] = store.splitAt(tt, [c.id]);
      if (b) b.mcAngle = i;
    } else c.mcAngle = i;
  });
  player.needsRender = true;
  flash(i);
}

function flash(i) { if (!panel) return; const cell = panel.querySelectorAll('.mcm-cell')[i]; if (cell) { cell.classList.add('hit'); setTimeout(() => cell.classList.remove('hit'), 250); } }

export function openMulticamMonitor() {
  if (panel) { panel.classList.add('pulse'); setTimeout(() => panel?.classList.remove('pulse'), 300); return; }
  mcState.open = true; seqFlags.monitor = true;
  const grid = el('div', { class: 'mcm-grid' });
  const head = el('div', { class: 'mcm-head' }, el('b', {}, t('Monitor multicâmera')), el('span', { class: 'muted small' }, t('clique ou aperte 1–9 para cortar')), el('div', { class: 'grow' }),
    el('button', { class: 'icon-btn xs', title: t('Fechar'), onclick: () => closeMulticamMonitor(), html: icon('close', 14) }));
  panel = el('div', { class: 'mcm-panel' }, head, grid);
  document.body.append(panel);
  // arrastar pela barra
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = (ev) => { panel.style.left = clamp(ev.clientX - ox, 0, innerWidth - 120) + 'px'; panel.style.top = clamp(ev.clientY - oy, 0, innerHeight - 60) + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  let lastKey = '';
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const c = currentMcClip();
    const d = c && seqData(c.seqId);
    const angles = d ? angleTracks(d) : [];
    const key = (c?.id || '') + angles.length;
    if (key !== lastKey) {
      lastKey = key;
      grid.innerHTML = '';
      grid.style.gridTemplateColumns = `repeat(${angles.length > 4 ? 3 : 2}, 1fr)`;
      if (!c) grid.append(el('div', { class: 'muted small mcm-empty' }, t('Coloque o cursor sobre um clipe multicâmera')));
      angles.forEach((tr, i) => {
        const cv = el('canvas', { width: 320, height: 180 });
        grid.append(el('div', { class: 'mcm-cell', onclick: () => switchAngle(i) }, cv, el('span', { class: 'mcm-num' }, String(i + 1)), el('span', { class: 'mcm-name' }, tr.name)));
      });
    }
    if (!c) return;
    const innerT = (c.in || 0) + (store.time - c.start) * (c.speed || 1);
    const cells = grid.querySelectorAll('.mcm-cell');
    angles.forEach((tr, i) => {
      const cell = cells[i]; if (!cell) return;
      cell.classList.toggle('on', (c.mcAngle ?? 0) === i);
      const cv = cell.firstChild, x = cv.getContext('2d');
      const inner = d.clips.find((k) => k.trackId === tr.id && innerT >= k.start && innerT < k.start + k.duration);
      const p = inner && allPlayers().get(c.seqId + '>' + inner.id);
      x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
      if (p && p.el.readyState >= 2) {
        const vw = p.el.videoWidth || 16, vh = p.el.videoHeight || 9, s = Math.min(cv.width / vw, cv.height / vh);
        x.drawImage(p.el, (cv.width - vw * s) / 2, (cv.height - vh * s) / 2, vw * s, vh * s);
      } else { x.fillStyle = '#777'; x.font = '14px sans-serif'; x.textAlign = 'center'; x.fillText(inner ? '...' : t('sem imagem'), cv.width / 2, cv.height / 2); }
    });
  };
  tick();
  player.needsRender = true;
}
export function closeMulticamMonitor() {
  mcState.open = false; seqFlags.monitor = false;
  cancelAnimationFrame(raf);
  panel?.remove(); panel = null;
}

// teclas 1–9 trocam de câmera enquanto o monitor está aberto
document.addEventListener('keydown', (e) => {
  if (!mcState.open || e.ctrlKey || e.metaKey || e.altKey) return;
  const tg = e.target;
  if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
  const k = e.code.match(/^(?:Digit|Numpad)([1-9])$/);
  if (!k) return;
  e.preventDefault(); e.stopImmediatePropagation();
  switchAngle(+k[1] - 1);
}, true);
