// Análise de vídeo: estabilização (estilo Warp Stabilizer), rastreamento de máscara e reenquadramento automático
import { store, bus } from './store.js';
import { el, modal, toast, clamp } from './util.js';
import { t } from './i18n.js';
import { pause, setAspect } from './player.js';
import { mediaUrl } from './media.js';
import { personCenter } from './keying.js';
import { srcOffset } from './keyframes.js';
export { stabAt, maskPosAt } from './lib/motion.js';

// ---------- utilidades ----------
function progressModal(title) {
  const bar = el('div', { class: 'progress-fill' });
  const label = el('div', { class: 'muted small' });
  const st = { cancelled: false, done: false };
  const m = modal({ title, width: 440, className: 'no-close', body: el('div', { class: 'exp-progress' }, el('div', { class: 'progress' }, bar), label),
    actions: [{ label: t('Cancelar'), danger: true, onClick: () => { st.cancelled = true; } }], onClose: () => { if (!st.done) st.cancelled = true; } });
  st.set = (p, txt) => { bar.style.width = Math.round(clamp(p, 0, 1) * 100) + '%'; if (txt) label.textContent = txt; };
  st.close = () => { st.done = true; m.close(); };
  return st;
}
async function openVideo(m) {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = mediaUrl(m);
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('vídeo')); });
  return v;
}
const seekTo = (v, tt) => new Promise((r) => { const done = () => r(); v.addEventListener('seeked', done, { once: true }); v.currentTime = tt; setTimeout(done, 1500); });
function grayFrame(v, w, h, cv) {
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.drawImage(v, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0, k = 0; i < d.length; i += 4, k++) g[k] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  return g;
}
// melhor deslocamento (dx,dy) de um bloco do quadro anterior no atual (SAD) com ajuste subpixel
function bestShift(prev, cur, w, h, R, x0, y0, x1, y1, step = 2) {
  let best = Infinity, bx = 0, by = 0;
  const score = new Map();
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += step) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let x = x0; x < x1; x += step) { const xx = x + dx; if (xx < 0 || xx >= w) continue; s += Math.abs(cur[yy * w + xx] - prev[y * w + x]); n++; } }
    s = n ? s / n : Infinity;
    score.set(dx + ',' + dy, s);
    if (s < best) { best = s; bx = dx; by = dy; }
  }
  if (!Number.isFinite(best)) return { dx: 0, dy: 0, err: Infinity };
  const sub = (a, b, c) => { const d = a - 2 * b + c; const r = d > 1e-6 ? (a - c) / (2 * d) : 0; return Number.isFinite(r) ? r : 0; };
  const g = (dx, dy) => score.get(dx + ',' + dy) ?? best;
  return { dx: bx + clamp(sub(g(bx - 1, by), best, g(bx + 1, by)), -0.5, 0.5), dy: by + clamp(sub(g(bx, by - 1), best, g(bx, by + 1)), -0.5, 0.5), err: best };
}
// ---------- estabilização ----------
export async function stabilize(c = store.primarySelected()) {
  if (!c || c.type !== 'video') { toast(t('Selecione um clipe de vídeo'), 'error'); return; }
  const m = store.media(c.mediaId);
  pause();
  const pm = progressModal(t('Estabilizando o vídeo'));
  pm.set(0, t('Analisando o movimento da câmera...'));
  try {
    const v = await openVideo(m);
    const ar = (m.width || 16) / (m.height || 9), w = 128, h = Math.max(36, Math.round(128 / ar));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const a = c.in || 0, b = Math.min(m.duration || 1e9, a + srcOffset(c, c.duration));
    const step = 1 / 15;
    const raw = [[a, 0, 0]];
    let px = 0, py = 0, prev = null;
    for (let tt = a; tt <= b + 1e-3 && !pm.cancelled; tt += step) {
      await seekTo(v, tt);
      const g = grayFrame(v, w, h, cv);
      if (prev) {
        const s = bestShift(prev, g, w, h, 12, 14, 10, w - 14, h - 10);
        px += s.dx / w; py += s.dy / h;
        raw.push([tt, px, py]);
      }
      prev = g;
      pm.set((tt - a) / Math.max(0.01, b - a), t('Analisando o movimento da câmera... {p}%', { p: Math.round(((tt - a) / Math.max(0.01, b - a)) * 100) }));
    }
    v.removeAttribute('src'); v.load();
    pm.close();
    if (pm.cancelled) return;
    store.begin();
    c.stab = { on: true, smooth: 1, raw: raw.map((r) => r.map((x) => +x.toFixed(5))) };
    store.commit('stabilize');
    toast(t('Vídeo estabilizado — ajuste a suavidade no painel'), 'success');
  } catch (e) { pm.close(); console.error(e); toast(t('Não foi possível analisar este vídeo'), 'error'); }
}

// ---------- rastreamento de máscara ----------
export async function trackMask(c, mask) {
  if (!c || c.type !== 'video' || !mask) return;
  const m = store.media(c.mediaId);
  pause();
  const pm = progressModal(t('Rastreando a máscara'));
  try {
    const v = await openVideo(m);
    const ar = (m.width || 16) / (m.height || 9), w = 320, h = Math.round(320 / ar);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const lt0 = clamp(store.time - c.start, 0, c.duration);
    const toSrc = (lt) => (c.in || 0) + srcOffset(c, lt);
    // posição inicial no quadro (centro da máscara)
    const pos0 = { x: (0.5 + mask.x) * w, y: (0.5 + mask.y) * h };
    const half = clamp(Math.round(Math.min(mask.w * w, mask.h * h) * 0.3), 8, 40);
    const track = new Map([[+lt0.toFixed(3), { x: mask.x, y: mask.y }]]);
    const step = 0.1;
    const total = c.duration / step;
    let doneN = 0;
    for (const dir of [1, -1]) {
      await seekTo(v, toSrc(lt0));
      let tpl = grayFrame(v, w, h, cv), pos = { ...pos0 };
      for (let lt = lt0 + dir * step; lt >= 0 && lt <= c.duration && !pm.cancelled; lt += dir * step) {
        await seekTo(v, toSrc(lt));
        const g = grayFrame(v, w, h, cv);
        const x0 = Math.round(pos.x - half), y0 = Math.round(pos.y - half);
        const sft = bestShift(tpl, g, w, h, 18, Math.max(0, x0), Math.max(0, y0), Math.min(w, x0 + half * 2), Math.min(h, y0 + half * 2), 2);
        pos = { x: clamp(pos.x + sft.dx, half, w - half), y: clamp(pos.y + sft.dy, half, h - half) };
        tpl = g;
        track.set(+lt.toFixed(3), { x: pos.x / w - 0.5, y: pos.y / h - 0.5 });
        doneN++;
        pm.set(doneN / total, t('Rastreando... {p}%', { p: Math.round((doneN / total) * 100) }));
      }
    }
    v.removeAttribute('src'); v.load();
    pm.close();
    if (pm.cancelled) return;
    store.begin();
    mask.track = [...track.entries()].sort((p, q) => p[0] - q[0]).map(([tt, p]) => ({ t: tt, x: +p.x.toFixed(4), y: +p.y.toFixed(4) }));
    store.commit('mask-track');
    toast(t('Máscara rastreada ({n} pontos)', { n: mask.track.length }), 'success');
  } catch (e) { pm.close(); console.error(e); toast(t('Não foi possível analisar este vídeo'), 'error'); }
}
// ---------- reenquadramento automático ----------
export function autoReframeDialog() {
  const vids = (store.selectedClips().length ? store.selectedClips() : store.clipsOn(store.mainTrack().id)).filter((c) => c.type === 'video');
  if (!vids.length) { toast(t('Selecione um clipe de vídeo'), 'error'); return; }
  const o = { aspect: '9:16', speed: 'normal' };
  const pick = (key, list) => el('div', { class: 'chips' }, list.map(([v, n]) => { const b = el('button', { class: 'chip' + (o[key] === v ? ' on' : ''), onclick: () => { o[key] = v; b.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, t(n)); return b; }));
  modal({
    title: t('Reenquadrar automaticamente'), width: 480,
    body: el('div', { class: 'dlg' },
      el('div', { class: 'muted small' }, t('Muda o formato do vídeo e move o enquadramento sozinho para seguir a pessoa (como o Auto Reframe do Premiere).')),
      el('b', {}, t('Novo formato')), pick('aspect', [['9:16', '9:16 (Reels, TikTok, Shorts)'], ['1:1', '1:1 (quadrado)'], ['4:5', '4:5 (feed)'], ['16:9', '16:9 (YouTube)']]),
      el('b', {}, t('Movimento da câmera')), pick('speed', [['slow', 'Lento (suave)'], ['normal', 'Normal'], ['fast', 'Rápido']]),
      el('div', { class: 'muted small' }, t('{n} clipe(s) serão analisados.', { n: vids.length }))),
    actions: [{ label: t('Cancelar') }, { label: t('Reenquadrar'), primary: true, onClick: () => { runReframe(vids, o); } }],
  });
}

async function runReframe(vids, o) {
  pause();
  setAspect(o.aspect);
  const { width: W, height: H } = store.p.settings;
  const pm = progressModal(t('Reenquadrando'));
  const win = { slow: 2.2, normal: 1.2, fast: 0.6 }[o.speed] || 1.2;
  const results = [];
  try {
    for (let i = 0; i < vids.length && !pm.cancelled; i++) {
      const c = vids[i], m = store.media(c.mediaId);
      if (!m) continue;
      pm.set(i / vids.length, t('Clipe {a} de {b}: carregando a IA...', { a: i + 1, b: vids.length }));
      const v = await openVideo(m);
      const samples = [];
      const n = Math.max(2, Math.ceil(c.duration / 0.33));
      let last = 0.5;
      for (let k = 0; k <= n && !pm.cancelled; k++) {
        const lt = (k / n) * c.duration;
        await seekTo(v, (c.in || 0) + srcOffset(c, lt));
        const pc = await personCenter(v);
        const x = pc.conf > 0.02 ? pc.x : last;
        last = x;
        samples.push([lt, x]);
        pm.set((i + k / n) / vids.length, t('Clipe {a} de {b}: seguindo a pessoa... {p}%', { a: i + 1, b: vids.length, p: Math.round((k / n) * 100) }));
      }
      v.removeAttribute('src'); v.load();
      // suaviza o caminho (média ponderada)
      const sm = samples.map(([tt]) => { let s = 0, sw = 0; for (const [t2, x2] of samples) { const wgt = Math.exp(-(((t2 - tt) / win) ** 2)); s += x2 * wgt; sw += wgt; } return [tt, s / sw]; });
      // conteúdo cobrindo o quadro: largura em fração do quadro
      const cw = Math.max(W, (H * (m.width || 16)) / (m.height || 9)) / W;
      const lim = Math.max(0, (cw - 1) / 2);
      const kf = [];
      for (let k = 0; k < sm.length; k += Math.max(1, Math.round(0.5 / 0.33))) {
        const [lt, sx] = sm[k];
        kf.push({ t: +lt.toFixed(3), v: +clamp((0.5 - sx) * cw, -lim, lim).toFixed(4), e: 'ease' });
      }
      const lastS = sm[sm.length - 1];
      if (kf[kf.length - 1].t < lastS[0] - 0.05) kf.push({ t: +lastS[0].toFixed(3), v: +clamp((0.5 - lastS[1]) * cw, -lim, lim).toFixed(4), e: 'ease' });
      results.push([c, kf]);
    }
    pm.close();
    if (pm.cancelled) return;
    store.batch('reframe', () => {
      for (const [c, kf] of results) { c.fit = 'cover'; c.transform.scale = 1; c.transform.y = 0; c.kf = { ...(c.kf || {}), x: kf }; }
    });
    bus.emit('settings-project');
    toast(t('{n} clipe(s) reenquadrado(s) para {a}', { n: results.length, a: o.aspect }), 'success');
  } catch (e) { pm.close(); console.error(e); toast(t('Não foi possível reenquadrar: {m}', { m: String(e.message || e) }), 'error'); }
}

// ---------- rastrear objeto: texto/sticker/imagem segue algo que se move no vídeo ----------
export function videoUnder(c, tt = store.time) {
  const order = store.p.tracks.map((x) => x.id);
  const ci = order.indexOf(c.trackId);
  const cands = store.p.clips.filter((v) => v.type === 'video' && v !== c && tt >= v.start && tt < v.start + v.duration && order.indexOf(v.trackId) > ci);
  cands.sort((a, b) => order.indexOf(a.trackId) - order.indexOf(b.trackId));
  return cands[0] || store.p.clips.find((v) => v.type === 'video' && v !== c && tt >= v.start && tt < v.start + v.duration) || null;
}
function frameMap(v) {
  const { width: W, height: H } = store.p.settings;
  const m = store.media(v.mediaId);
  const mw = m?.width || W, mh = m?.height || H;
  const fit = v.fit || 'contain';
  const sx = fit === 'fill' ? W / mw : fit === 'cover' ? Math.max(W / mw, H / mh) : Math.min(W / mw, H / mh);
  const sy = fit === 'fill' ? H / mh : sx;
  const tr = v.transform, k = tr.scale || 1;
  const cw = mw * sx * k, ch = mh * sy * k;
  const left = W / 2 + tr.x * W - cw / 2, top = H / 2 + tr.y * H - ch / 2;
  return {
    toMedia: (fx, fy) => ({ u: ((W / 2 + fx * W) - left) / cw, v: ((H / 2 + fy * H) - top) / ch }),
    toFrame: (u, vv) => ({ x: (left + u * cw - W / 2) / W, y: (top + vv * ch - H / 2) / H }),
  };
}
export async function trackObject(c = store.primarySelected()) {
  if (!c || !['text', 'sticker', 'shape', 'image', 'gen'].includes(c.type)) { toast(t('Selecione um texto, sticker ou imagem e posicione sobre o objeto'), 'error', 4000); return; }
  const lt0 = clamp(store.time - c.start, 0, c.duration);
  const v = videoUnder(c, c.start + lt0);
  if (!v) { toast(t('Não há vídeo embaixo deste item no cursor'), 'error'); return; }
  const m = store.media(v.mediaId);
  pause();
  const pm = progressModal(t('Rastreando o objeto'));
  try {
    const vid = await openVideo(m);
    const ar = (m.width || 16) / (m.height || 9), w = 320, h = Math.round(320 / ar);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const map = frameMap(v);
    const tr0 = c.transform;
    const p0 = map.toMedia(tr0.x, tr0.y);
    if (p0.u < 0 || p0.u > 1 || p0.v < 0 || p0.v > 1) throw new Error(t('o item está fora do vídeo'));
    const half = 14;
    const srcAt = (lt) => { const tl = c.start + lt; return (v.in || 0) + srcOffset(v, clamp(tl - v.start, 0, v.duration)); };
    const pts = new Map([[+lt0.toFixed(3), { u: p0.u, v: p0.v }]]);
    const step = 1 / 15;
    const total = c.duration / step;
    let doneN = 0;
    for (const dir of [1, -1]) {
      await seekTo(vid, srcAt(lt0));
      let tpl = grayFrame(vid, w, h, cv), pos = { x: p0.u * w, y: p0.v * h };
      for (let lt = lt0 + dir * step; lt >= 0 && lt <= c.duration && !pm.cancelled; lt += dir * step) {
        const tl = c.start + lt;
        if (tl < v.start || tl > v.start + v.duration) break;
        await seekTo(vid, srcAt(lt));
        const g = grayFrame(vid, w, h, cv);
        const x0 = Math.round(pos.x - half), y0 = Math.round(pos.y - half);
        const s = bestShift(tpl, g, w, h, 16, Math.max(0, x0), Math.max(0, y0), Math.min(w, x0 + half * 2), Math.min(h, y0 + half * 2), 1);
        pos = { x: clamp(pos.x + s.dx, half, w - half), y: clamp(pos.y + s.dy, half, h - half) };
        tpl = g;
        pts.set(+lt.toFixed(3), { u: pos.x / w, v: pos.y / h });
        doneN++;
        pm.set(doneN / total, t('Rastreando... {p}%', { p: Math.round((doneN / total) * 100) }));
      }
    }
    vid.removeAttribute('src'); vid.load();
    pm.close();
    if (pm.cancelled) return;
    const sorted = [...pts.entries()].sort((a, b) => a[0] - b[0]);
    // suaviza um pouco o caminho (média de 3)
    const sm = sorted.map(([tt], i) => { const a = sorted[Math.max(0, i - 1)][1], b = sorted[i][1], d = sorted[Math.min(sorted.length - 1, i + 1)][1]; return [tt, { u: (a.u + b.u * 2 + d.u) / 4, v: (a.v + b.v * 2 + d.v) / 4 }]; });
    store.batch('track-object', () => {
      c.kf = { ...(c.kf || {}) };
      c.kf.x = sm.map(([tt, p]) => ({ t: tt, v: +map.toFrame(p.u, p.v).x.toFixed(4), e: 'linear' }));
      c.kf.y = sm.map(([tt, p]) => ({ t: tt, v: +map.toFrame(p.u, p.v).y.toFixed(4), e: 'linear' }));
    });
    toast(t('Pronto! O item agora segue o objeto ({n} pontos)', { n: sm.length }), 'success');
  } catch (e) { pm.close(); console.error(e); toast(t('Não foi possível rastrear: {m}', { m: String(e.message || e) }), 'error'); }
}
