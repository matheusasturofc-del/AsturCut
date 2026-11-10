// Ações para adicionar itens da biblioteca ao projeto (clique, duplo clique ou arrastar)
import { store, bus, defaultText } from './store.js';
import { t } from './i18n.js';
import { toast, deepClone } from './util.js';
import { settings } from './settings.js';
import { importDropped, addLibraryAudio } from './media.js';
import { TEXT_PRESETS } from './lib/textPresets.js';
import { EFFECT_MAP } from './lib/effects.js';
import { FILTER_MAP } from './lib/filters.js';
import { TRANSITION_MAP } from './lib/transitions.js';

const VISUAL_CLIP = ['video', 'image', 'text', 'sticker', 'shape'];

function placeVisual(partial, dur, info) {
  const start = info?.t ?? store.time;
  store.begin();
  let track = null;
  if (info?.trackId) {
    const tr = store.track(info.trackId);
    if (tr && tr.type === 'video' && !tr.locked && store.isFree(tr.id, start, start + dur)) track = tr;
  }
  if (!track && info?.newzone) track = store.addTrack('video', info.newzone === 'top' ? 0 : Math.max(0, store.p.tracks.findIndex((t) => t.main)));
  if (!track) track = store.findTrackFor('video', start, start + dur);
  return store.addClip({ trackId: track.id, start, duration: dur, ...partial });
}

export function addMedia(m, info = null) {
  if (!m) return;
  if (info && (info.trackId || info.newzone)) {
    const dur = m.type === 'image' ? settings.get('imageDuration') : m.duration || 5;
    const start = info.t;
    store.begin();
    const type = m.type === 'audio' ? 'audio' : 'video';
    let track = info.trackId ? store.track(info.trackId) : null;
    if (track && (track.type !== type || track.locked)) track = null;
    if (track && !store.isFree(track.id, start, start + dur)) {
      if (track.main && type === 'video') {
        // insere na trilha principal empurrando os demais
        const after = store.clipsOn(track.id).filter((c) => c.start + c.duration > start);
        const first = after[0];
        const at = first && start > first.start ? first.start + first.duration : start;
        for (const c of store.clipsOn(track.id).filter((c) => c.start >= at - 1e-4)) c.start += dur;
        return store.addClip({ trackId: track.id, type: m.type === 'image' ? 'image' : m.type, mediaId: m.id, name: m.name, start: at, duration: dur });
      }
      track = null;
    }
    if (!track && info.newzone) track = store.addTrack(type, type === 'audio' ? null : info.newzone === 'top' ? 0 : Math.max(0, store.p.tracks.findIndex((t) => t.main)));
    if (!track) track = store.findTrackFor(type, start, start + dur, true);
    return store.addClip({ trackId: track.id, type: m.type === 'image' ? 'image' : m.type, mediaId: m.id, name: m.name, start, duration: dur });
  }
  return store.addMediaClip(m);
}

// insere um trecho (Entrada→Saída) de uma mídia — opcionalmente só o vídeo ou só o áudio
export function addMediaRange(m, r, info = null) {
  if (!m) return;
  const dur = Math.max(0.1, (r.out ?? m.duration) - (r.in || 0));
  const type = r.only === 'audio' || m.type === 'audio' ? 'audio' : 'video';
  const start = info?.t ?? store.time;
  store.begin();
  let track = null;
  if (info?.trackId) { const tr = store.track(info.trackId); if (tr && tr.type === type && !tr.locked && store.isFree(tr.id, start, start + dur)) track = tr; }
  if (!track && info?.newzone) track = store.addTrack(type, type === 'audio' ? null : info.newzone === 'top' ? 0 : Math.max(0, store.p.tracks.findIndex((t) => t.main)));
  if (!track) track = store.findTrackFor(type, start, start + dur, true);
  return store.addClip({
    trackId: track.id, type: type === 'audio' ? 'audio' : 'video', mediaId: m.id, name: m.name, start, duration: dur, in: r.in || 0,
    ...(r.only === 'video' ? { volume: 0, audioDetached: true } : {}),
  });
}
bus.on('source-add', ({ media, in: i, out, only }) => addMediaRange(media, { in: i, out, only }));

export function addText(presetId = 'default', info = null) {
  const p = TEXT_PRESETS.find((x) => x.id === presetId) || TEXT_PRESETS[0];
  const text = { ...defaultText(), ...deepClone(p.t) };
  text.content = t(text.content);
  return placeVisual({ type: 'text', name: t(p.name), text, transform: { x: p.x || 0, y: p.y || 0, scale: 1, rotation: 0, opacity: 1 } }, settings.get('textDuration'), info);
}

export function addSticker(emoji, info = null) {
  return placeVisual({ type: 'sticker', name: 'Sticker', sticker: { emoji } }, settings.get('textDuration'), info);
}

export function addShape(kind, info = null) {
  const color = kind === 'like' ? '#1877f2' : settings.get('accent');
  return placeVisual({ type: 'shape', name: 'Forma', shape: { kind, color, stroke: '#ffffff', strokeWidth: 0, title: t('Seu Nome'), subtitle: t('Cargo ou descrição') }, transform: { scale: kind === 'lowerthird' ? 0.8 : 0.6, y: kind === 'lowerthird' ? 0.3 : 0 } }, settings.get('textDuration'), info);
}

function targetVisualClip(clipId) {
  const c = clipId ? store.clip(clipId) : store.primarySelected();
  return c && VISUAL_CLIP.includes(c.type) ? c : null;
}

export function applyEffect(id, { clipId = null, asLayer = false, info = null } = {}) {
  const def = EFFECT_MAP[id];
  if (!def) return;
  const c = asLayer ? null : targetVisualClip(clipId);
  if (c) {
    store.begin();
    if (!c.effects.some((e) => e.id === id)) c.effects.push({ id, intensity: 0.6 });
    store.commit('effect');
    toast(t('Efeito "{name}" aplicado ao clipe', { name: t(def.name) }), 'success');
    return c;
  }
  const sel = store.primarySelected();
  if (sel && sel.type === 'effect' && !asLayer) {
    store.begin(); sel.effects = [{ id, intensity: sel.effects[0]?.intensity ?? 0.6 }]; sel.name = def.name; store.commit('effect');
    return sel;
  }
  return placeVisual({ type: 'effect', name: def.name, effects: [{ id, intensity: 0.6 }] }, 3, info || topInfo());
}

export function applyFilter(id, { clipId = null, asLayer = false, info = null } = {}) {
  const def = FILTER_MAP[id];
  if (!def) return;
  const c = asLayer ? null : targetVisualClip(clipId);
  if (c) {
    store.updateClip(c.id, { filter: { id, intensity: c.filter?.intensity ?? 1 } });
    toast(t('Filtro "{name}" aplicado', { name: t(def.name) }), 'success');
    return c;
  }
  const sel = store.primarySelected();
  if (sel && sel.type === 'filter' && !asLayer) { store.updateClip(sel.id, { filter: { id, intensity: sel.filter?.intensity ?? 1 }, name: def.name }); return sel; }
  return placeVisual({ type: 'filter', name: def.name, filter: { id, intensity: 1 } }, 3, info || topInfo());
}

function topInfo() { return { t: store.time }; }

// aplica transição na entrada do clipe (precisa de um clipe anterior encostado)
export function applyTransition(id, clipId = null, atTime = null) {
  if (!TRANSITION_MAP[id]) return;
  let target = null;
  if (store.selectedTransition) target = store.clip(store.selectedTransition);
  if (!target) {
    const c = clipId ? store.clip(clipId) : store.primarySelected();
    if (c) {
      const sorted = store.clipsOn(c.trackId);
      const i = sorted.indexOf(c);
      const prev = sorted[i - 1], next = sorted[i + 1];
      const touchPrev = prev && Math.abs(prev.start + prev.duration - c.start) < 0.05;
      const touchNext = next && Math.abs(c.start + c.duration - next.start) < 0.05;
      const t = atTime ?? store.time;
      if (touchNext && (!touchPrev || t > c.start + c.duration / 2)) target = next;
      else if (touchPrev) target = c;
    }
  }
  if (!target) {
    // procura a junção mais próxima do cursor na trilha principal
    const main = store.mainTrack();
    const sorted = store.clipsOn(main.id);
    let best = null, bd = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (Math.abs(a.start + a.duration - b.start) > 0.05) continue;
      const d = Math.abs(b.start - (atTime ?? store.time));
      if (d < bd) { bd = d; best = b; }
    }
    target = best;
  }
  if (!target) { toast('Coloque dois clipes encostados na mesma trilha para usar transições', 'error', 3500); return; }
  store.updateClip(target.id, { transitionIn: { id, dur: target.transitionIn?.dur || settings.get('transitionDuration') } });
  store.selectTransition(target.id);
  toast(t('Transição "{name}" aplicada', { name: t(TRANSITION_MAP[id].name) }), 'success');
}

export function applyAnimation(kind, id) {
  const c = targetVisualClip();
  if (!c) { toast('Selecione um clipe visual na linha do tempo', 'error'); return; }
  const key = kind === 'in' ? 'animIn' : kind === 'out' ? 'animOut' : 'animLoop';
  store.updateClip(c.id, { [key]: id ? { id, dur: c[key]?.dur || 0.6, speed: c[key]?.speed || 1 } : null });
}

export async function addAudio(id, info = null) {
  try {
    const m = await addLibraryAudio(id);
    bus.emit('media');
    if (info) return addMedia(m, { ...info, trackId: info.trackId && store.track(info.trackId)?.type === 'audio' ? info.trackId : null, newzone: null });
    store.begin();
    const tr = store.findTrackFor('audio', store.time, store.time + m.duration);
    return store.addClip({ trackId: tr.id, type: 'audio', mediaId: m.id, name: m.name, start: store.time, duration: m.duration });
  } catch (e) { toast(t('Falha ao gerar áudio: {e}', { e: e.message }), 'error'); }
}

// soltar na linha do tempo
export async function handleDrop(dt, info) {
  const raw = dt.getData('application/x-astur');
  if (raw) {
    const d = JSON.parse(raw);
    switch (d.kind) {
      case 'media': return d.in != null || d.only ? addMediaRange(store.media(d.id), { in: d.in, out: d.out, only: d.only }, info) : addMedia(store.media(d.id), info);
      case 'text': return addText(d.id, info);
      case 'sticker': return addSticker(d.id, info);
      case 'shape': return addShape(d.id, info);
      case 'effect': return info.clipId ? applyEffect(d.id, { clipId: info.clipId }) : applyEffect(d.id, { asLayer: true, info });
      case 'filter': return info.clipId ? applyFilter(d.id, { clipId: info.clipId }) : applyFilter(d.id, { asLayer: true, info });
      case 'transition': return applyTransition(d.id, info.clipId, info.t);
      case 'audio': return addAudio(d.id, info);
    }
    return;
  }
  if (dt.files && dt.files.length) {
    const added = await importDropped(dt.files);
    let t = info.t;
    for (const m of added) {
      const c = addMedia(m, { ...info, t });
      if (c) t = c.start + c.duration;
    }
  }
}

// "Sem sinal": camada de chuvisco de TV por cima de tudo + chiado no mesmo tempo
export async function addNoSignal(dur = 3) {
  const t0 = store.time;
  const { addLibraryAudio } = await import('./media.js');
  const m = await addLibraryAudio('tvstatic');
  store.batch('no-signal', () => {
    const vtr = store.addTrack('video', 0);
    store.addClip({ trackId: vtr.id, type: 'effect', name: t('Chuvisco de TV (sem sinal)'), start: t0, duration: dur, effects: [{ id: 'tvstatic', intensity: 1 }] }, { commit: false });
    if (m) {
      const atr = store.findTrackFor('audio', t0, t0 + dur);
      store.addClip({ trackId: atr.id, type: 'audio', mediaId: m.id, name: m.name, start: t0, duration: Math.min(dur, m.duration || dur), in: 0 }, { commit: false });
    }
  });
  bus.emit('selection');
  toast(t('Tela "sem sinal" adicionada (chuvisco + chiado)'), 'success');
}

// banco de mídia: vídeo gerado (chuvisco, barras, contagem...) + som que acompanha
export async function addStock(id) {
  const { STOCK_MAP } = await import('./lib/stock.js');
  const v = STOCK_MAP[id];
  if (!v) return;
  const dur = v.dur || 5;
  let m = null;
  if (v.sfx) { const { addLibraryAudio } = await import('./media.js'); m = await addLibraryAudio(v.sfx).catch(() => null); }
  let clip = null;
  store.batch('stock', () => {
    const main = store.mainTrack();
    const mainClips = store.clipsOn(main.id);
    const end = mainClips.reduce((mx, c) => Math.max(mx, c.start + c.duration), 0);
    const atEnd = !mainClips.length || Math.abs(store.time - end) < 0.05;
    const start = atEnd ? end : store.time;
    const track = atEnd ? main : store.findTrackFor('video', start, start + dur);
    clip = store.addClip({ trackId: track.id, type: 'gen', gen: { kind: id }, name: t(v.name), start, duration: dur }, { commit: false });
    if (m) {
      const atr = store.findTrackFor('audio', start, start + dur);
      store.addClip({ trackId: atr.id, type: 'audio', mediaId: m.id, name: m.name, start, duration: Math.min(dur, m.duration || dur), in: 0 }, { commit: false, select: false });
    }
  });
  bus.emit('selection');
  return clip;
}
