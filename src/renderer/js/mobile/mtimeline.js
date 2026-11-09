// Linha do tempo do celular: cursor fixo no centro, a linha do tempo desliza por baixo dele.
// Toque seleciona; arraste das bordas apara; arraste do clipe selecionado move; pinça dá zoom.
import { store, bus } from '../store.js';
import { el, icon, clamp } from '../util.js';
import { runtime } from '../media.js';
import { player, pause } from '../player.js';
import { t } from '../i18n.js';

const MAIN_H = 54, ROW_H = 28, RULER_H = 24, GAP = 6;
let root, scroller, inner, addBtn, pps = 56, ignoreScroll = 0, queued = false, cb = {};
let dragging = false;

const isMedia = (c) => c.type === 'video' || c.type === 'audio';
const pad = () => Math.round((scroller?.clientWidth || 360) / 2);
const X = (time) => pad() + time * pps;

export function initMobileTimeline(container, callbacks) {
  cb = callbacks || {};
  root = container;
  scroller = el('div', { class: 'mtl-scroll' });
  inner = el('div', { class: 'mtl-inner' });
  scroller.append(inner);
  addBtn = el('button', { class: 'mtl-add', title: t('Adicionar mídia'), onclick: () => cb.onAddMain && cb.onAddMain(), html: icon('plus', 22) });
  root.append(scroller, el('div', { class: 'mtl-playhead' }), addBtn);

  scroller.addEventListener('scroll', () => {
    if (ignoreScroll > 0) return;
    if (player.playing) pause();
    store.setTime(Math.max(0, scroller.scrollLeft / pps));
  }, { passive: true });
  inner.addEventListener('click', (e) => {
    if (e.target.closest('.mc') || e.target.closest('.mtr') || e.target.closest('.mtl-btn')) return;
    store.clearSelection();
  });
  setupPinch();
  bus.on('change', queue);
  bus.on('selection', queue);
  bus.on('media-analyzed', queue);
  bus.on('project', () => { fitZoom(); queue(); });
  bus.on('fit-timeline', () => { fitZoom(); queue(); });
  bus.on('time', followTime);
  new ResizeObserver(() => queue()).observe(root);
  render();
}

function followTime() {
  if (dragging || !scroller) return;
  const target = Math.round(store.time * pps);
  if (Math.abs(scroller.scrollLeft - target) < 1) return;
  ignoreScroll++;
  scroller.scrollLeft = target;
  requestAnimationFrame(() => requestAnimationFrame(() => { ignoreScroll = Math.max(0, ignoreScroll - 1); }));
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

export function fitZoom() {
  if (!scroller) return;
  const d = Math.max(3, store.duration());
  pps = clamp((scroller.clientWidth * 0.8) / d, 8, 220);
}

function setPps(p) {
  pps = clamp(p, 6, 400);
  render();
  followTime();
}

function setupPinch() {
  let d0 = 0, p0 = pps;
  const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  scroller.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { d0 = dist(e); p0 = pps; } }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !d0) return;
    e.preventDefault();
    setPps(p0 * (dist(e) / d0));
  }, { passive: false });
  scroller.addEventListener('touchend', () => { d0 = 0; });
}

// ---------- desenho ----------
function rulerStep() {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]) if (s * pps >= 60) return s;
  return 600;
}
const fmt = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function trackRows() {
  const main = store.mainTrack();
  return store.p.tracks.filter((tr) => tr === main || store.p.clips.some((c) => c.trackId === tr.id));
}

function render() {
  if (!inner || dragging) return;
  const dur = store.duration();
  const W = pad() * 2 + Math.max(dur, 1) * pps;
  inner.innerHTML = '';
  inner.style.width = W + 'px';
  // régua
  const ruler = el('div', { class: 'mtl-ruler', style: { height: RULER_H + 'px' } });
  const step = rulerStep();
  for (let s = 0; s <= dur + step; s += step) {
    ruler.append(el('span', { class: 'mtl-tick', style: { left: X(s) + 'px' } }, fmt(s)));
    ruler.append(el('i', { class: 'mtl-dot', style: { left: X(s + step / 2) + 'px' } }));
  }
  inner.append(ruler);
  let y = RULER_H + 4;
  let mainTop = y;
  const main = store.mainTrack();
  for (const tr of trackRows()) {
    const isMain = tr === main;
    const h = isMain ? MAIN_H : ROW_H;
    const row = el('div', { class: 'mtl-row' + (isMain ? ' main' : '') + (tr.type === 'audio' ? ' audio' : ''), style: { top: y + 'px', height: h + 'px' } });
    const clips = store.clipsOn(tr.id);
    for (const c of clips) row.append(clipNode(c, h, isMain));
    if (isMain) {
      mainTop = y;
      // transições entre clipes encostados
      for (let i = 1; i < clips.length; i++) {
        const a = clips[i - 1], b = clips[i];
        if (Math.abs(a.start + a.duration - b.start) > 0.05) continue;
        const on = !!b.transitionIn;
        row.append(el('button', { class: 'mtr' + (on ? ' on' : '') + (store.selectedTransition === b.id ? ' sel' : ''), style: { left: (X(b.start) - 11) + 'px' }, title: t('Transição'),
          onclick: (e) => { e.stopPropagation(); store.selectTransition(b.id); cb.onTransition && cb.onTransition(b); }, html: icon(on ? 'transitions' : 'plus', 11) }));
      }
      // botão de som da trilha principal
      const muted = clips.length && clips.every((c) => c.type !== 'video' || c.volume === 0);
      row.append(el('button', { class: 'mtl-btn mute', style: { left: Math.max(4, pad() - 54) + 'px' }, title: muted ? t('Ativar som do clipe') : t('Silenciar clipe'),
        onclick: (e) => { e.stopPropagation(); store.begin(); for (const c of clips) if (c.type === 'video') c.volume = muted ? 1 : 0; store.commit('mute-main'); },
        html: icon(muted ? 'mute' : 'volume', 16) + `<small>${muted ? t('Sem som') : t('Som')}</small>` }));
    }
    inner.append(row);
    y += h + GAP;
  }
  inner.style.height = (y + 8) + 'px';
  addBtn.style.top = (mainTop + (MAIN_H - 40) / 2 - scroller.scrollTop) + 'px';
  if (!store.p.clips.length) inner.append(el('div', { class: 'mtl-empty', style: { left: (pad() + 50) + 'px', top: (mainTop + 14) + 'px' } }, t('Toque no + para adicionar vídeos e fotos')));
  followTime();
}

function clipNode(c, h, isMain) {
  const sel = store.selection.has(c.id);
  const w = Math.max(6, c.duration * pps);
  const node = el('div', { class: `mc ${c.type}${sel ? ' sel' : ''}${isMain ? ' main' : ''}`, style: { left: X(c.start) + 'px', width: w + 'px', height: h + 'px' }, dataset: { id: c.id } });
  const m = c.mediaId ? store.media(c.mediaId) : null;
  const rt = m ? runtime.get(m.id) : null;
  if (c.type === 'video' || c.type === 'image') {
    const ar = m && m.width ? m.width / m.height : 1;
    const tileW = Math.max(24, h * Math.min(ar, 1.2));
    const n = Math.min(80, Math.ceil(w / tileW));
    const strip = el('div', { class: 'mc-strip' });
    for (let i = 0; i < n; i++) {
      let src = rt?.thumb;
      if (rt?.frames?.length && c.type === 'video') {
        const st = (c.in || 0) + (i * tileW / pps) * (c.speed || 1);
        let best = rt.frames[0];
        for (const f of rt.frames) if (Math.abs(f.t - st) < Math.abs(best.t - st)) best = f;
        src = best.src;
      }
      if (src) strip.append(el('img', { src, draggable: 'false', style: { left: (i * tileW) + 'px', width: tileW + 'px' } }));
    }
    node.append(strip);
  }
  if (c.type === 'audio' && rt?.peaks) node.append(wave(c, rt, w, h));
  const label = c.type === 'text' ? (c.text?.content || '').replace(/\n/g, ' ') : c.type === 'sticker' ? (c.sticker?.emoji || '') : (c.name || '');
  if (!isMain || c.type !== 'video') node.append(el('span', { class: 'mc-label no-tr' }, label));
  if (isMain) node.append(el('span', { class: 'mc-dur' }, (Math.round(c.duration * 10) / 10) + 's'));
  if (c.speed && c.speed !== 1) node.append(el('span', { class: 'mc-badge' }, c.speed + 'x'));
  node.addEventListener('click', (e) => { e.stopPropagation(); if (!sel) store.select([c.id]); cb.onSelect && cb.onSelect(c); });
  if (sel) {
    node.append(handle(c, 'l'), handle(c, 'r'));
    node.addEventListener('pointerdown', (e) => startMove(e, c));
  }
  return node;
}

function wave(c, rt, w, h) {
  const cv = el('canvas', { class: 'mc-wave', width: Math.min(4000, Math.round(w)), height: h - 4 });
  const x = cv.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,.55)';
  const per = rt.peaksPerSec || 40, spd = c.speed || 1;
  for (let i = 0; i < cv.width; i++) {
    const st = (c.in || 0) + (i / pps) * spd;
    const v = rt.peaks[Math.floor(st * per)] || 0;
    const hh = Math.max(1, v * (cv.height - 2));
    x.fillRect(i, (cv.height - hh) / 2, 1, hh);
  }
  return cv;
}

// ---------- aparar e mover ----------
function handle(c, side) {
  const hd = el('div', { class: 'mc-h ' + side }, el('i'));
  hd.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    pause();
    const m = c.mediaId ? store.media(c.mediaId) : null;
    const spd = c.speed || 1;
    const o = { start: c.start, dur: c.duration, in: c.in || 0, end: c.start + c.duration };
    const x0 = e.clientX;
    dragging = true;
    store.begin();
    hd.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dt = (ev.clientX - x0) / pps;
      if (side === 'l') {
        const minStart = isMedia(c) && m?.duration ? o.start - o.in / spd : 0;
        const ns = clamp(o.start + dt, Math.max(0, minStart), o.end - 0.1);
        c.start = ns; c.duration = o.end - ns; c.in = Math.max(0, o.in + (ns - o.start) * spd);
      } else {
        const maxDur = isMedia(c) && m?.duration ? (m.duration - o.in) / spd : 3600;
        c.duration = clamp(o.dur + dt, 0.1, maxDur);
      }
      const n = hd.parentElement;
      n.style.left = X(c.start) + 'px'; n.style.width = Math.max(6, c.duration * pps) + 'px';
      store.setTime(side === 'l' ? c.start : c.start + c.duration - 0.01);
      player.needsRender = true;
    };
    const up = () => {
      hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
      dragging = false;
      store.commit('trim');
    };
    hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
  });
  return hd;
}

function startMove(e, c) {
  if (e.target.closest('.mc-h')) return;
  const node = e.currentTarget;
  const x0 = e.clientX, s0 = c.start;
  let moved = false;
  node.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dx = ev.clientX - x0;
    if (!moved && Math.abs(dx) < 8) return;
    if (!moved) { moved = true; dragging = true; pause(); store.begin(); node.classList.add('moving'); }
    c.start = Math.max(0, s0 + dx / pps);
    node.style.left = X(c.start) + 'px';
  };
  const up = () => {
    node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up);
    if (moved) { dragging = false; store.commit('move'); }
  };
  node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
}
