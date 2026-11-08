// Estado do projeto, histórico (desfazer/refazer) e operações de edição
import { uid, deepClone, Emitter, clamp } from './util.js';
import { t } from './i18n.js';
import { settings } from './settings.js';

export const bus = new Emitter();

export const ASPECTS = {
  '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:3': [1440, 1080],
  '3:4': [1080, 1440], '4:5': [1080, 1350], '21:9': [2560, 1080], '2.35:1': [2538, 1080],
};

export function defaultTransform() {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipH: false, flipV: false };
}
export function defaultAdjust() {
  return { brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, hue: 0, blur: 0, vignette: 0, sharpen: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 };
}
export function defaultText() {
  return {
    content: 'Texto', font: 'Montserrat', size: 96, color: '#ffffff', bold: true, italic: false, underline: false,
    align: 'center', letterSpacing: 0, lineHeight: 1.15, stroke: '#000000', strokeWidth: 0,
    shadow: false, shadowColor: '#000000', shadowBlur: 12, shadowX: 4, shadowY: 4,
    bg: false, bgColor: '#000000', bgOpacity: 0.6, bgPadding: 24, bgRadius: 12, glow: 0, glowColor: '#22d3ee', uppercase: false,
  };
}

function newProject(name = t('Projeto sem título')) {
  const [w, h] = ASPECTS[settings.get('defaultAspect')] || [1920, 1080];
  return {
    id: uid('prj'), name, version: 1, created: Date.now(),
    settings: { width: w, height: h, fps: settings.get('defaultFps') || 30, aspect: settings.get('defaultAspect') || '16:9', background: '#000000', originalAspect: true },
    media: [],
    fonts: [],
    tracks: [
      { id: uid('trk'), type: 'video', name: t('Principal'), main: true, muted: false, hidden: false, locked: false },
      { id: uid('trk'), type: 'audio', name: t('Áudio {n}', { n: 1 }), muted: false, hidden: false, locked: false },
    ],
    clips: [],
    markers: [],
    range: null, // { in, out } marcas de Entrada/Saída da linha do tempo
  };
}

class Store {
  constructor() {
    this.project = newProject();
    this.filePath = null;
    this.dirty = false;
    this.selection = new Set();
    this.selectedTransition = null; // id do clipe que recebe a transição
    this.time = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = [];
  }

  // ---------- Acesso ----------
  get p() { return this.project; }
  track(id) { return this.project.tracks.find((t) => t.id === id); }
  clip(id) { return this.project.clips.find((c) => c.id === id); }
  media(id) { return this.project.media.find((m) => m.id === id); }
  clipsOn(trackId) { return this.project.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start); }
  mainTrack() { return this.project.tracks.find((t) => t.main) || this.project.tracks.find((t) => t.type === 'video'); }
  duration() { return this.project.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0); }
  selectedClips() { return [...this.selection].map((id) => this.clip(id)).filter(Boolean); }
  primarySelected() { const s = this.selectedClips(); return s[s.length - 1] || null; }

  // ---------- Histórico ----------
  snapshot() {
    const { tracks, clips, settings: st, name, markers, range } = this.project;
    return JSON.stringify({ tracks, clips, settings: st, name, markers, range: range || null });
  }
  commit(label = '') {
    this.undoStack.push(this._last ?? this.snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this._last = null;
    this.dirty = true;
    this.applyMagnet();
    bus.emit('change', label);
  }
  // inicia uma edição contínua (arrastar slider): guarda estado antes
  begin() { if (this._last == null) this._last = this.snapshot(); }
  // mudança sem histórico (ex: durante arraste)
  touch() { this.dirty = true; bus.emit('change', 'touch'); }
  restore(snap) {
    const s = JSON.parse(snap);
    Object.assign(this.project, s);
    for (const id of [...this.selection]) if (!this.clip(id)) this.selection.delete(id);
    bus.emit('change', 'restore');
    bus.emit('selection');
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.dirty = true;
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.dirty = true;
  }

  // ---------- Projeto ----------
  newProject(name) {
    this.project = newProject(name);
    this.filePath = null; this.dirty = false;
    this.selection.clear(); this.undoStack = []; this.redoStack = []; this.time = 0;
    bus.emit('project');
    bus.emit('change', 'new');
    bus.emit('selection');
  }
  loadProject(data, filePath = null) {
    const base = newProject();
    this.project = Object.assign(base, data);
    this.project.clips.forEach((c) => normalizeClip(c));
    this.filePath = filePath; this.dirty = false;
    this.selection.clear(); this.undoStack = []; this.redoStack = []; this.time = 0;
    bus.emit('project');
    bus.emit('change', 'load');
    bus.emit('selection');
  }
  setTime(t) {
    this.time = clamp(t, 0, Math.max(this.duration(), 0) + 0.0001);
    bus.emit('time', this.time);
  }

  // ---------- Seleção ----------
  select(ids, additive = false) {
    if (!additive) this.selection.clear();
    this.selectedGap = null;
    for (const id of this.withLinked([].concat(ids))) {
      if (additive && this.selection.has(id)) this.selection.delete(id); else this.selection.add(id);
    }
    this.selectedTransition = null;
    bus.emit('selection');
  }
  clearSelection() { this.selection.clear(); this.selectedTransition = null; this.selectedGap = null; bus.emit('selection'); }
  selectGap(g) { this.selection.clear(); this.selectedTransition = null; this.selectedGap = g; bus.emit('selection'); }
  selectTransition(clipId) { this.selection.clear(); this.selectedTransition = clipId; bus.emit('selection'); }

  // ---------- Trilhas ----------
  addTrack(type, index = null, name) {
    const count = this.project.tracks.filter((t) => t.type === type).length + 1;
    const trk = { id: uid('trk'), type, name: name || (type === 'audio' ? t('Áudio {n}', { n: count }) : t('Camada {n}', { n: count })), muted: false, hidden: false, locked: false };
    if (index == null) {
      if (type === 'audio') this.project.tracks.push(trk);
      else this.project.tracks.unshift(trk);
    } else this.project.tracks.splice(index, 0, trk);
    return trk;
  }
  removeEmptyTracks() {
    this.project.tracks = this.project.tracks.filter((t) => t.main || this.project.clips.some((c) => c.trackId === t.id)
      || (t.type === 'audio' && this.project.tracks.filter((x) => x.type === 'audio').indexOf(t) === 0));
  }
  isFree(trackId, start, end, ignore = []) {
    return !this.project.clips.some((c) => c.trackId === trackId && !ignore.includes(c.id) && c.start < end - 1e-4 && c.start + c.duration > start + 1e-4);
  }
  // encontra uma trilha livre do tipo, ou cria uma nova
  findTrackFor(type, start, end, preferMain = false) {
    const tracks = this.project.tracks.filter((t) => t.type === type && !t.locked);
    if (preferMain && type === 'video') {
      const m = this.mainTrack();
      if (m && this.isFree(m.id, start, end)) return m;
    }
    const candidates = type === 'video' ? tracks.filter((t) => !t.main).reverse() : tracks;
    for (const t of candidates) if (this.isFree(t.id, start, end)) return t;
    return this.addTrack(type);
  }

  // ---------- Clipes ----------
  addClip(partial, { select = true, commit = true } = {}) {
    if (commit) this.begin();
    const c = normalizeClip({ id: uid('clp'), ...partial });
    this.project.clips.push(c);
    if (select) { this.selection.clear(); this.selection.add(c.id); bus.emit('selection'); }
    if (commit) this.commit('add');
    return c;
  }
  // adiciona mídia ao final da trilha principal ou na posição do cursor
  addMediaClip(media, { at = null, trackId = null } = {}) {
    this.begin();
    const type = media.type === 'audio' ? 'audio' : 'video';
    const dur = media.type === 'image' ? settings.get('imageDuration') : (media.duration || 5);
    let track, start;
    if (trackId) {
      track = this.track(trackId); start = at ?? this.time;
    } else if (type === 'video') {
      const main = this.mainTrack();
      const end = this.clipsOn(main.id).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
      if (at == null) { track = main; start = end; } else { start = at; track = this.findTrackFor('video', start, start + dur, true); }
    } else {
      start = at ?? this.time;
      track = this.findTrackFor('audio', start, start + dur);
    }
    return this.addClip({
      trackId: track.id, type: media.type === 'image' ? 'image' : media.type, mediaId: media.id, name: media.name,
      start, duration: dur, in: 0,
    });
  }
  addOverlayClip(partial, dur) {
    this.begin();
    const start = this.time;
    const track = this.findTrackFor('video', start, start + dur);
    return this.addClip({ trackId: track.id, start, duration: dur, ...partial });
  }
  updateClip(id, patch, { commit = true } = {}) {
    const c = this.clip(id);
    if (!c) return;
    if (commit) this.begin();
    deepAssign(c, patch);
    if (commit) this.commit('update'); else this.touch();
  }
  deleteClips(ids = [...this.selection]) {
    if (!ids.length) return;
    this.begin();
    this.project.clips = this.project.clips.filter((c) => !ids.includes(c.id));
    ids.forEach((id) => this.selection.delete(id));
    this.removeEmptyTracks();
    this.commit('delete');
    bus.emit('selection');
  }
  splitAt(t = this.time, ids = null) {
    let targets = ids ? ids.map((id) => this.clip(id)) : this.selectedClips();
    if (!targets.length) targets = this.project.clips.filter((c) => !this.track(c.trackId)?.locked);
    targets = targets.filter((c) => c && t > c.start + 0.02 && t < c.start + c.duration - 0.02);
    if (!targets.length) return [];
    this.begin();
    const created = [];
    const linkMap = {};
    for (const c of targets) {
      const left = t - c.start;
      const b = deepClone(c);
      b.id = uid('clp');
      b.start = t;
      b.duration = c.duration - left;
      b.in = (c.in || 0) + left * (c.speed || 1);
      b.transitionIn = null;
      b.animIn = null;
      if (b.kf) for (const k of Object.keys(b.kf)) b.kf[k] = b.kf[k].map((f) => ({ ...f, t: f.t - left }));
      if (c.linkId) { linkMap[c.linkId] = linkMap[c.linkId] || uid('lnk'); b.linkId = linkMap[c.linkId]; }
      c.duration = left;
      c.animOut = null;
      this.project.clips.push(b);
      created.push(b);
    }
    this.commit('split');
    return created;
  }
  deleteLeft(t = this.time) {
    const created = this.splitAt(t);
    const sel = this.selectedClips().length ? this.selectedClips() : null;
    this.begin();
    const affected = (sel || this.project.clips).filter((c) => c.start + c.duration <= t + 1e-3 && c.start + c.duration >= t - 1e-3);
    const ids = affected.map((c) => c.id);
    this.project.clips = this.project.clips.filter((c) => !ids.includes(c.id));
    this.selection.clear();
    created.forEach((c) => this.selection.add(c.id));
    this.commit('deleteLeft');
    bus.emit('selection');
  }
  deleteRight(t = this.time) {
    const sel = this.selectedClips().map((c) => c.id);
    const created = this.splitAt(t);
    this.begin();
    const ids = created.map((c) => c.id);
    this.project.clips = this.project.clips.filter((c) => !ids.includes(c.id));
    this.selection = new Set(sel.filter((id) => this.clip(id)));
    this.commit('deleteRight');
    bus.emit('selection');
  }
  duplicate(ids = [...this.selection]) {
    const clips = ids.map((id) => this.clip(id)).filter(Boolean);
    if (!clips.length) return;
    this.begin();
    const newIds = [];
    for (const c of clips) {
      const d = deepClone(c);
      d.id = uid('clp');
      const start = c.start + c.duration;
      const track = this.isFree(c.trackId, start, start + c.duration) ? this.track(c.trackId)
        : this.findTrackFor(this.track(c.trackId).type, start, start + c.duration);
      d.start = start; d.trackId = track.id;
      this.project.clips.push(d);
      newIds.push(d.id);
    }
    this.selection = new Set(newIds);
    this.commit('duplicate');
    bus.emit('selection');
  }
  copy() { this.clipboard = this.selectedClips().map(deepClone); return this.clipboard.length; }
  paste() {
    if (!this.clipboard.length) return;
    this.begin();
    const minStart = Math.min(...this.clipboard.map((c) => c.start));
    const newIds = [];
    for (const c of this.clipboard) {
      const d = deepClone(c);
      d.id = uid('clp');
      d.start = this.time + (c.start - minStart);
      const tr = this.track(d.trackId);
      const type = tr ? tr.type : (d.type === 'audio' ? 'audio' : 'video');
      if (!tr || !this.isFree(tr.id, d.start, d.start + d.duration)) d.trackId = this.findTrackFor(type, d.start, d.start + d.duration).id;
      this.project.clips.push(d);
      newIds.push(d.id);
    }
    this.selection = new Set(newIds);
    this.commit('paste');
    bus.emit('selection');
  }
  // separa o áudio de um vídeo em uma trilha de áudio
  detachAudio(id) {
    const c = this.clip(id);
    if (!c || c.type !== 'video') return;
    this.begin();
    const tr = this.findTrackFor('audio', c.start, c.start + c.duration);
    const a = normalizeClip({ ...deepClone(c), id: uid('clp'), type: 'audio', trackId: tr.id, effects: [], filter: null, transitionIn: null, animIn: null, animOut: null });
    const link = uid('lnk');
    a.linkId = link; c.linkId = link;
    if (a.kf) { const v = a.kf.volume; a.kf = v ? { volume: v } : undefined; }
    if (c.kf) delete c.kf.volume;
    this.project.clips.push(a);
    c.volume = 0; c.audioDetached = true;
    this.commit('detach');
  }
  // clipes vinculados (vídeo + áudio separado)
  linked(c) { return c && c.linkId ? this.project.clips.filter((x) => x.linkId === c.linkId) : (c ? [c] : []); }
  withLinked(ids) {
    const out = new Set(ids);
    for (const id of ids) for (const x of this.linked(this.clip(id))) out.add(x.id);
    return [...out];
  }
  link(ids = [...this.selection]) {
    if (ids.length < 2) return;
    this.begin();
    const l = uid('lnk');
    ids.forEach((id) => { const c = this.clip(id); if (c) c.linkId = l; });
    this.commit('link');
  }
  unlink(ids = [...this.selection]) {
    this.begin();
    for (const id of ids) for (const x of this.linked(this.clip(id))) delete x.linkId;
    this.commit('unlink');
  }
  // exclusão com ripple: remove e puxa os clipes seguintes da mesma trilha
  rippleDelete(ids = [...this.selection]) {
    const clips = ids.map((id) => this.clip(id)).filter(Boolean).sort((a, b) => b.start - a.start);
    if (!clips.length) return;
    this.begin();
    for (const c of clips) {
      const end = c.start + c.duration;
      this.project.clips = this.project.clips.filter((x) => x !== c);
      for (const x of this.project.clips) if (x.trackId === c.trackId && x.start >= end - 1e-4) x.start -= c.duration;
    }
    ids.forEach((id) => this.selection.delete(id));
    this.removeEmptyTracks();
    this.commit('ripple');
    bus.emit('selection');
  }
  // espaço vazio em uma trilha no tempo t
  gapAt(trackId, t) {
    const clips = this.clipsOn(trackId);
    if (clips.some((c) => t >= c.start && t < c.start + c.duration)) return null;
    let start = 0, end = Infinity;
    for (const c of clips) {
      const e = c.start + c.duration;
      if (e <= t + 1e-6) start = Math.max(start, e);
      if (c.start > t) end = Math.min(end, c.start);
    }
    return end === Infinity || end - start < 0.01 ? null : { trackId, start, end };
  }
  deleteGap(g = this.selectedGap) {
    if (!g) return;
    this.begin();
    const len = g.end - g.start;
    for (const x of this.project.clips) if (x.trackId === g.trackId && x.start >= g.end - 1e-4) x.start -= len;
    this.selectedGap = null;
    this.commit('gap');
    bus.emit('selection');
  }
  setRange(kind, t = this.time) {
    this.begin();
    const r = this.project.range || { in: null, out: null };
    r[kind] = t;
    if (r.in != null && r.out != null && r.out < r.in) [r.in, r.out] = [r.out, r.in];
    this.project.range = r;
    this.commit('range');
  }
  clearRange() { this.begin(); this.project.range = null; this.commit('range'); }

  // magnetismo da trilha principal: remove espaços vazios
  applyMagnet() {
    if (!settings.get('magnet')) return;
    const main = this.mainTrack();
    if (!main) return;
    let t = 0;
    for (const c of this.clipsOn(main.id)) { c.start = t; t += c.duration; }
  }
  addMarker(t = this.time) {
    this.begin();
    this.project.markers.push({ id: uid('mk'), time: t, color: settings.get('accent') });
    this.commit('marker');
  }
}

export function normalizeClip(c) {
  c.speed = c.speed ?? 1;
  c.volume = c.volume ?? 1;
  c.fadeIn = c.fadeIn ?? 0;
  c.fadeOut = c.fadeOut ?? 0;
  c.in = c.in ?? 0;
  c.transform = { ...defaultTransform(), ...(c.transform || {}) };
  c.adjust = { ...defaultAdjust(), ...(c.adjust || {}) };
  c.effects = c.effects || [];
  c.filter = c.filter || null;
  c.animIn = c.animIn || null;
  c.animOut = c.animOut || null;
  c.animLoop = c.animLoop || null;
  c.transitionIn = c.transitionIn || null;
  c.blend = c.blend || 'source-over';
  if (c.type === 'text') c.text = { ...defaultText(), ...(c.text || {}) };
  return c;
}

function deepAssign(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepAssign(target[k], v);
    else target[k] = v;
  }
}

export const store = new Store();
window.__store = store;
