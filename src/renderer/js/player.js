// Reprodutor: relógio de reprodução, sincronização de mídia, canvas e manipulação direta
import { store, bus, ASPECTS } from './store.js';
import { $, el, icon, fmtTime, clamp, dragHandler, dropdownFrom } from './util.js';
import { renderFrame, activeAt, sourceTime, hasMedia } from './compositor.js';
import { getPlayer, allPlayers, gcPlayers, audioCtx } from './media.js';
import { flattenSeqClip, mediaClipsDeep } from './sequences.js';
import { settings } from './settings.js';
import { valueAt, setValue, transformAt, localTime, speedAt } from './keyframes.js';
import { routePlayer } from './audiomix.js';
import { toggleScopes } from './color.js';

export const player = {
  playing: false,
  canvas: null,
  ctx: null,
  hits: [],
  needsRender: true,
  exporting: false,
  onExportFrame: null,
};

let lastTs = 0;
let rangeEnd = null;

export function initPlayer() {
  const panel = $('#panel-player');
  panel.innerHTML = '';
  const head = el('div', { class: 'panel-head', dataset: { drag: 'player' } },
    el('span', { class: 'panel-title', html: icon('drag', 14) + ' Reprodutor' }),
    el('div', { class: 'grow' }),
    el('button', { class: 'icon-btn', title: 'Scopes de cor (forma de onda, vetorscópio, histograma)', onclick: () => toggleScopes(), html: icon('scopes') }),
    el('button', { class: 'icon-btn', title: 'Grade de composição', id: 'btn-grid', onclick: () => { settings.set('showGrid', !settings.get('showGrid')); updateGridBtn(); renderOverlay(); }, html: icon('grid') }),
  );
  const stage = el('div', { class: 'player-stage', id: 'player-stage' });
  const wrap = el('div', { class: 'canvas-wrap', id: 'canvas-wrap' });
  const canvas = el('canvas', { id: 'preview-canvas' });
  const overlay = el('div', { class: 'canvas-overlay', id: 'canvas-overlay' });
  wrap.append(canvas, overlay);
  stage.append(wrap, el('div', { class: 'empty-player', id: 'empty-player' }, el('div', { html: icon('media', 42) }), el('div', {}, 'Importe mídias e arraste para a linha do tempo')));
  const controls = el('div', { class: 'player-controls' },
    el('div', { class: 'time-display' }, el('span', { id: 'time-cur', class: 'accent' }, '00:00:00:00'), el('span', { class: 'muted' }, ' / '), el('span', { id: 'time-total', class: 'muted' }, '00:00:00:00')),
    el('div', { class: 'grow' }),
    el('button', { class: 'icon-btn', title: 'Quadro anterior (←)', onclick: () => step(-1), html: icon('prev') }),
    el('button', { class: 'play-btn', id: 'btn-play', title: 'Reproduzir/Pausar (Espaço)', onclick: togglePlay, html: icon('play', 18) }),
    el('button', { class: 'icon-btn', title: 'Próximo quadro (→)', onclick: () => step(1), html: icon('next') }),
    el('div', { class: 'grow' }),
    el('button', { class: 'icon-btn' + (settings.get('loopPlayback') ? ' on' : ''), id: 'btn-loop', title: 'Repetir', onclick: (e) => { settings.set('loopPlayback', !settings.get('loopPlayback')); e.currentTarget.classList.toggle('on', settings.get('loopPlayback')); }, html: icon('loop') }),
    el('button', { class: 'chip-btn', id: 'btn-quality', title: 'Qualidade da prévia', onclick: qualityMenu }, qualityLabel()),
    el('button', { class: 'chip-btn', id: 'btn-aspect', title: 'Proporção', onclick: aspectMenu }, aspectLabel()),
    el('button', { class: 'icon-btn', title: 'Tela cheia', onclick: fullscreen, html: icon('fullscreen') }),
  );
  panel.append(head, stage, controls);
  player.canvas = canvas;
  player.ctx = canvas.getContext('2d', { alpha: false });
  setupCanvasSize();
  new ResizeObserver(() => fitCanvas()).observe(stage);
  setupOverlay(overlay);
  updateGridBtn();

  bus.on('change', () => { player.needsRender = true; updateTotal(); });
  bus.on('time', () => { player.needsRender = true; });
  bus.on('selection', () => renderOverlay());
  bus.on('frame-ready', () => { player.needsRender = true; });
  bus.on('project', () => { setupCanvasSize(); updateTotal(); });
  bus.on('settings-project', () => setupCanvasSize());
  settings.on('change', (k) => { if (k === 'previewQuality') setupCanvasSize(); });
  stage.addEventListener('dblclick', (e) => { if (e.target === stage) fullscreen(); });
  requestAnimationFrame(loop);
  setInterval(gcPlayers, 5000);
}

function updateGridBtn() { $('#btn-grid')?.classList.toggle('on', !!settings.get('showGrid')); }
function qualityLabel() { return { 1: 'Prévia: Máx', 0.5: 'Prévia: Média', 0.25: 'Prévia: Baixa' }[settings.get('previewQuality')] || 'Prévia'; }
function aspectLabel() { const s = store.p.settings; return s.aspect === 'original' ? 'Original' : s.aspect === 'custom' ? `${s.width}×${s.height}` : s.aspect; }

function qualityMenu(e) {
  dropdownFrom(e.currentTarget, [1, 0.5, 0.25].map((q) => ({
    label: { 1: 'Máxima (100%)', 0.5: 'Média (50%)', 0.25: 'Baixa (25%) — mais rápida' }[q], checked: settings.get('previewQuality') === q,
    onClick: () => { settings.set('previewQuality', q); $('#btn-quality').textContent = qualityLabel(); },
  })));
}

export function setAspect(a) {
  store.begin();
  const st = store.p.settings;
  if (a === 'original') {
    const first = store.clipsOn(store.mainTrack().id)[0];
    const m = first && store.media(first.mediaId);
    if (m && m.width) { const k = 1080 / Math.min(m.width, m.height); st.width = Math.round(m.width * k / 2) * 2; st.height = Math.round(m.height * k / 2) * 2; }
  } else { const [w, h] = ASPECTS[a]; st.width = w; st.height = h; }
  st.aspect = a;
  store.commit('aspect');
  setupCanvasSize();
  const b = $('#btn-aspect'); if (b) b.textContent = aspectLabel();
  bus.emit('settings-project');
}

function aspectMenu(e) {
  const items = ['original', ...Object.keys(ASPECTS)].map((a) => ({
    label: a === 'original' ? 'Original (do 1º vídeo)' : `${a}${{ '16:9': ' — YouTube', '9:16': ' — TikTok/Reels/Shorts', '1:1': ' — Instagram', '4:5': ' — Feed', '21:9': ' — Cinema' }[a] || ''}`,
    checked: store.p.settings.aspect === a,
    onClick: () => setAspect(a),
  }));
  dropdownFrom(e.currentTarget, items);
}

function setupCanvasSize() {
  const c = player.canvas;
  if (!c || player.exporting) return;
  const q = settings.get('previewQuality') || 0.5;
  const { width, height } = store.p.settings;
  c.width = Math.max(2, Math.round(width * q));
  c.height = Math.max(2, Math.round(height * q));
  fitCanvas();
  player.needsRender = true;
  const b = $('#btn-aspect'); if (b) b.textContent = aspectLabel();
}

function fitCanvas() {
  const stage = $('#player-stage');
  const wrap = $('#canvas-wrap');
  if (!stage || !wrap) return;
  const sw = stage.clientWidth - 24, sh = stage.clientHeight - 24;
  const { width, height } = store.p.settings;
  const k = Math.min(sw / width, sh / height);
  wrap.style.width = Math.max(10, Math.floor(width * k)) + 'px';
  wrap.style.height = Math.max(10, Math.floor(height * k)) + 'px';
  renderOverlay();
}

function fullscreen() {
  const stage = $('#player-stage');
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.();
}

function updateTotal() {
  const t = $('#time-total');
  if (t) t.textContent = fmtTime(store.duration(), store.p.settings.fps);
  const empty = $('#empty-player');
  if (empty) empty.style.display = store.p.clips.length ? 'none' : '';
}

// ---------- Reprodução ----------
export function play(fromStart = false, until = null) {
  if (player.playing) return;
  audioCtx();
  const dur = store.duration();
  if (dur <= 0) return;
  if (fromStart || store.time >= dur - 0.01) store.setTime(0);
  rangeEnd = until;
  player.playing = true;
  lastTs = performance.now();
  updatePlayBtn();
  bus.emit('play-state', true);
}
export function pause() {
  if (!player.playing) return;
  player.playing = false;
  for (const p of allPlayers().values()) p.el.pause();
  updatePlayBtn();
  player.needsRender = true;
  bus.emit('play-state', false);
}
export function togglePlay() { player.playing ? pause() : play(); }
export function step(n) { pause(); store.setTime(store.time + n / store.p.settings.fps); }
function updatePlayBtn() { const b = $('#btn-play'); if (b) b.innerHTML = icon(player.playing ? 'pause' : 'play', 18); }

export function syncMedia(t, playing) {
  const act = activeAt(t);
  const activeIds = new Set();
  const one = (c, tr) => {
    const p = getPlayer(c, c.id);
    if (!p) return;
    activeIds.add(c.id);
    routePlayer(p, c.trackId);
    const lt = t - c.start;
    const target = sourceTime(c, lt);
    const el = p.el;
    // volume com fade
    let vol = valueAt(c, 'volume', clamp(lt, 0, c.duration));
    if (c.fadeIn > 0) vol *= clamp(lt / c.fadeIn, 0, 1);
    if (c.fadeOut > 0) vol *= clamp((c.duration - lt) / c.fadeOut, 0, 1);
    if (lt < 0 || lt > c.duration) vol = 0;
    if (tr.muted) vol = 0;
    if (p.gain) p.gain.gain.value = vol; else el.volume = clamp(vol, 0, 1);
    const rate = clamp(speedAt(c, clamp(lt, 0, c.duration)) * (player.rateMul || 1), 0.0625, 16);
    if (Math.abs(el.playbackRate - rate) > 0.001) el.playbackRate = rate;
    el.preservesPitch = !c.changePitch;
    const inRange = lt >= 0 && lt < c.duration;
    if (playing && inRange && !c.freeze) {
      if (el.paused) { if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target; el.play().catch(() => {}); }
      else if (Math.abs(el.currentTime - target) > 0.3 * (player.rateMul || 1)) el.currentTime = target;
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - target) > 0.5 / store.p.settings.fps && !p.seeking) { p.seeking = true; el.currentTime = target; }
    }
  };
  for (const entry of act) {
    const tr = entry.track;
    for (const c of entry.items) {
      if (c.type === 'sequence') {
        // clipes de dentro da sequência aninhada
        for (const v of flattenSeqClip(c)) if (t >= v.start - 0.02 && t < v.start + v.duration) one(v, tr);
        continue;
      }
      if (hasMedia(c)) one(c, tr);
    }
  }
  for (const [id, p] of allPlayers()) if (!activeIds.has(id) && !p.el.paused) p.el.pause();
  // pré-carrega clipes que vão começar em breve
  if (playing) {
    for (const c of mediaClipsDeep()) {
      if (activeIds.has(c.id)) continue;
      const dt = c.start - t;
      if (dt > 0 && dt < 1.5) {
        const p = getPlayer(c, c.id);
        if (p && p.el.paused && Math.abs(p.el.currentTime - c.in) > 0.1 && !p.seeking) { p.seeking = true; p.el.currentTime = sourceTime(c, 0); }
      }
    }
  }
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (player.exporting) return;
  if (player.playing) {
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    let t = store.time + Math.min(dt, 0.1);
    const end = rangeEnd ?? store.duration();
    if (t >= end) {
      if (settings.get('loopPlayback') && rangeEnd == null) { t = 0; for (const p of allPlayers().values()) p.el.pause(); }
      else { store.setTime(end); pause(); return; }
    }
    store.time = t;
    bus.emit('time', t);
    player.needsRender = true;
  }
  syncMedia(store.time, player.playing);
  if (player.needsRender || player.playing || hasAnimated()) {
    player.needsRender = false;
    draw();
  }
}

// alguns efeitos/partículas são animados mesmo pausado? não — só redesenha quando muda.
function hasAnimated() { return false; }

export function draw() {
  const hits = [];
  try { renderFrame(player.ctx, store.time, hits); } catch (e) { console.error('render', e); }
  player.hits = hits;
  const cur = $('#time-cur');
  if (cur) cur.textContent = fmtTime(store.time, store.p.settings.fps);
  renderOverlay();
}

// ---------- Overlay de seleção (mover / escalar / girar no exibidor) ----------
function setupOverlay(overlay) {
  overlay.addEventListener('pointerdown', (e) => {
    if (player.pick && e.button === 0) { e.stopPropagation(); e.preventDefault(); samplePixel(e); }
  }, true);
  overlay.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const { x, y } = toCanvas(e);
    const hit = player.hits.find((h) => pointInHit(h, x, y) && !store.track(store.clip(h.id)?.trackId)?.locked);
    if (!hit) { if (e.target === overlay) store.clearSelection(); return; }
    if (!store.selection.has(hit.id)) store.select(hit.id);
    startMove(e, hit.id);
  });
  overlay.addEventListener('wheel', (e) => {
    const c = store.primarySelected();
    if (!c || !c.transform || !e.altKey) return;
    e.preventDefault();
    setValue(c, 'scale', clamp(transformAt(c, localTime(c)).scale * (e.deltaY < 0 ? 1.05 : 0.95), 0.02, 20)); store.touch();
    clearTimeout(overlay._wt); overlay._wt = setTimeout(() => store.commit('scale'), 300);
    store.begin();
  }, { passive: false });
}

function toCanvas(e) {
  const r = player.canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (player.canvas.width / r.width), y: (e.clientY - r.top) * (player.canvas.height / r.height) };
}
function pointInHit(h, x, y) {
  const a = (-h.rot * Math.PI) / 180;
  const dx = x - h.cx, dy = y - h.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= Math.abs(h.w) / 2 && Math.abs(ly) <= Math.abs(h.h) / 2;
}

// conta-gotas: lê a cor média em volta do clique e chama player.pick(r,g,b)
function samplePixel(e) {
  const { x, y } = toCanvas(e);
  const ctx = player.ctx;
  const d = ctx.getImageData(Math.max(0, Math.round(x) - 3), Math.max(0, Math.round(y) - 3), 7, 7).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const cb = player.pick;
  player.pick = null;
  document.body.classList.remove('picking');
  cb(r / n, g / n, b / n);
}
export function startPick(cb) { player.pick = cb; document.body.classList.add('picking'); }

function startMove(e, id) {
  const c = store.clip(id);
  const cur = transformAt(c, localTime(c));
  const st = { x: cur.x, y: cur.y };
  store.begin();
  const r = player.canvas.getBoundingClientRect();
  dragHandler(e, (ev, dx, dy) => {
    let nx = st.x + dx / r.width, ny = st.y + dy / r.height;
    const snap = 0.012;
    guides.x = Math.abs(nx) < snap; guides.y = Math.abs(ny) < snap;
    if (guides.x && !ev.altKey) nx = 0;
    if (guides.y && !ev.altKey) ny = 0;
    setValue(c, 'x', nx); setValue(c, 'y', ny);
    store.touch();
  }, (ev, dx, dy) => {
    guides.x = guides.y = false;
    if (Math.abs(dx) + Math.abs(dy) > 1) store.commit('move'); else store._last = null;
    renderOverlay();
  }, 'move');
}

const guides = { x: false, y: false };

export function renderOverlay() {
  const ov = $('#canvas-overlay');
  if (!ov || !player.canvas) return;
  ov.innerHTML = '';
  if (settings.get('showGrid')) ov.append(el('div', { class: 'grid-thirds' }));
  if (guides.x) ov.append(el('div', { class: 'guide-v' }));
  if (guides.y) ov.append(el('div', { class: 'guide-h' }));
  const c = store.primarySelected();
  if (!c || player.playing) return;
  const h = player.hits.find((x) => x.id === c.id);
  if (!h) return;
  const r = ov.getBoundingClientRect();
  const k = r.width / player.canvas.width;
  const box = el('div', { class: 'sel-box', style: {
    left: (h.cx * k) + 'px', top: (h.cy * k) + 'px', width: Math.abs(h.w * k) + 'px', height: Math.abs(h.h * k) + 'px',
    transform: `translate(-50%,-50%) rotate(${h.rot}deg)`,
  } });
  for (const pos of ['nw', 'ne', 'sw', 'se']) {
    const hd = el('div', { class: 'sel-handle ' + pos });
    hd.addEventListener('pointerdown', (e) => { e.stopPropagation(); startScale(e, c, h, k); });
    box.append(hd);
  }
  const rot = el('div', { class: 'sel-rotate', title: 'Girar', html: icon('rotate', 12) });
  rot.addEventListener('pointerdown', (e) => { e.stopPropagation(); startRotate(e, c, h, k); });
  box.append(rot);
  box.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.stopPropagation(); startMove(e, c.id); } });
  box.addEventListener('dblclick', () => { if (c.type === 'text') bus.emit('edit-text', c.id); });
  ov.append(box);
}

function startScale(e, c, h, k) {
  const r = $('#canvas-overlay').getBoundingClientRect();
  const cx = r.left + h.cx * k, cy = r.top + h.cy * k;
  const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
  const s0 = transformAt(c, localTime(c)).scale;
  store.begin();
  dragHandler(e, (ev) => {
    const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
    setValue(c, 'scale', clamp(s0 * (d / d0), 0.02, 20));
    store.touch();
  }, () => store.commit('scale'), 'nwse-resize');
}

function startRotate(e, c, h, k) {
  const r = $('#canvas-overlay').getBoundingClientRect();
  const cx = r.left + h.cx * k, cy = r.top + h.cy * k;
  const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
  const r0 = transformAt(c, localTime(c)).rotation;
  store.begin();
  dragHandler(e, (ev) => {
    const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
    let deg = r0 + ((a - a0) * 180) / Math.PI;
    if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
    else for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(deg - s) < 3) deg = s;
    setValue(c, 'rotation', Math.round(deg * 10) / 10);
    store.touch();
  }, () => store.commit('rotate'), 'grabbing');
}
