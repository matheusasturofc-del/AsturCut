// Várias sequências no mesmo projeto e sequências aninhadas (como no Premiere)
// A sequência ativa fica em store.p.tracks/clips/markers/range; as outras ficam em store.p.sequences[i]
import { store, bus, normalizeClip } from './store.js';
import { t } from './i18n.js';
import { uid, toast, promptDialog, confirmDialog } from './util.js';
import { srcOffset, valueAt } from './keyframes.js';

const DATA_KEYS = ['tracks', 'clips', 'markers', 'range'];
export const seqFlags = { monitor: false }; // monitor multicâmera aberto: sincroniza todos os ângulos
// ângulos de uma sequência multicâmera (câmera 1 primeiro)
export const angleTracks = (d) => d.tracks.filter((tr) => tr.type === 'video').slice().reverse();

export function ensureSeqs(p = store.p) {
  if (!p.seqId) p.seqId = uid('seq');
  if (!Array.isArray(p.sequences) || !p.sequences.length) p.sequences = [{ id: p.seqId, name: t('Sequência 1') }];
  if (!p.sequences.some((s) => s.id === p.seqId)) p.sequences.unshift({ id: p.seqId, name: t('Sequência 1') });
  for (const s of p.sequences) if (s.id !== p.seqId && Array.isArray(s.clips)) s.clips.forEach((c) => normalizeClip(c));
  return p.sequences;
}
export const sequences = () => ensureSeqs();
export const activeSeq = () => ensureSeqs().find((s) => s.id === store.p.seqId);

// dados de uma sequência ({ id, name, tracks, clips, markers, range })
export function seqData(id) {
  const p = store.p;
  const s = (p.sequences || []).find((x) => x.id === id);
  if (!s) return null;
  if (id === p.seqId) return { id, name: s.name, tracks: p.tracks, clips: p.clips, markers: p.markers, range: p.range };
  return s;
}
export function seqDuration(id) {
  const d = seqData(id);
  return d ? d.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0) : 0;
}
// uma sequência contém (direta ou indiretamente) outra?
export function seqContains(id, target, seen = new Set()) {
  if (id === target) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  const d = seqData(id);
  return !!d && d.clips.some((c) => c.type === 'sequence' && seqContains(c.seqId, target, seen));
}

function emptySeq(name) {
  return {
    id: uid('seq'), name,
    tracks: [
      { id: uid('trk'), type: 'video', name: t('Principal'), main: true, muted: false, hidden: false, locked: false },
      { id: uid('trk'), type: 'audio', name: t('Áudio {n}', { n: 1 }), muted: false, hidden: false, locked: false },
    ],
    clips: [], markers: [], range: null,
  };
}

export function switchSequence(id, { commit = true } = {}) {
  const p = store.p;
  ensureSeqs();
  if (id === p.seqId) return;
  const nx = p.sequences.find((s) => s.id === id);
  if (!nx) return;
  if (commit) store.begin();
  const cur = p.sequences.find((s) => s.id === p.seqId);
  for (const k of DATA_KEYS) cur[k] = p[k];
  cur.time = store.time;
  for (const k of DATA_KEYS) { p[k] = nx[k] ?? (k === 'range' ? null : []); delete nx[k]; }
  p.seqId = id;
  store.selection.clear();
  store.selectedGap = null;
  const tt = nx.time || 0; delete nx.time;
  if (commit) store.commit('sequence');
  else bus.emit('change', 'sequence');
  store.setTime(tt);
  bus.emit('selection');
  bus.emit('sequences');
}

export function newSequence(name, { open = true } = {}) {
  ensureSeqs();
  const s = emptySeq(name || t('Sequência {n}', { n: store.p.sequences.length + 1 }));
  store.begin();
  store.p.sequences.push(s);
  store.commit('new-sequence');
  bus.emit('sequences');
  if (open) switchSequence(s.id);
  return s;
}

export async function renameSequence(id) {
  const s = sequences().find((x) => x.id === id);
  if (!s) return;
  const n = await promptDialog(t('Nome da sequência'), s.name);
  if (!n) return;
  store.begin(); s.name = n; store.commit('rename-sequence');
  bus.emit('sequences');
}

export function duplicateSequence(id) {
  const d = seqData(id);
  if (!d) return;
  const copy = JSON.parse(JSON.stringify({ tracks: d.tracks, clips: d.clips, markers: d.markers || [], range: d.range || null }));
  const map = new Map();
  for (const tr of copy.tracks) { const n = uid('trk'); map.set(tr.id, n); tr.id = n; }
  for (const c of copy.clips) { c.id = uid('clp'); c.trackId = map.get(c.trackId); delete c.linkId; }
  const s = { id: uid('seq'), name: d.name + ' ' + t('(cópia)'), ...copy };
  store.begin(); store.p.sequences.push(s); store.commit('dup-sequence');
  bus.emit('sequences');
  return s;
}

export async function deleteSequence(id) {
  ensureSeqs();
  if (store.p.sequences.length < 2) { toast(t('O projeto precisa de pelo menos uma sequência'), 'error'); return; }
  const used = store.p.sequences.some((s) => (seqData(s.id)?.clips || []).some((c) => c.type === 'sequence' && c.seqId === id));
  if (!(await confirmDialog(t('Excluir esta sequência?'), used ? t('Ela está aninhada em outra sequência; esses clipes também serão removidos.') : t('Os clipes dela serão apagados.'), t('Excluir'), true))) return;
  if (store.p.seqId === id) switchSequence(store.p.sequences.find((s) => s.id !== id).id, { commit: false });
  store.begin();
  store.p.sequences = store.p.sequences.filter((s) => s.id !== id);
  for (const s of store.p.sequences) { const d = seqData(s.id); if (d) { const keep = d.clips.filter((c) => !(c.type === 'sequence' && c.seqId === id)); if (s.id === store.p.seqId) store.p.clips = keep; else s.clips = keep; } }
  store.commit('del-sequence');
  bus.emit('sequences');
}

// insere uma sequência como clipe (aninhada) no cursor
export function insertSequenceClip(id, at = store.time) {
  const s = seqData(id);
  if (!s) return;
  if (seqContains(id, store.p.seqId)) { toast(t('Não dá para colocar uma sequência dentro dela mesma'), 'error'); return; }
  const dur = seqDuration(id);
  if (dur <= 0) { toast(t('Essa sequência está vazia'), 'error'); return; }
  const tr = store.findTrackFor('video', at, at + dur, !store.clipsOn(store.mainTrack().id).length);
  return store.addClip({ trackId: tr.id, type: 'sequence', seqId: id, name: s.name, start: at, duration: dur, in: 0 });
}

// Aninhar: os clipes selecionados viram uma nova sequência, substituídos por um clipe dela
export function nestSelection() {
  const sel = store.selectedClips();
  if (!sel.length) { toast(t('Selecione os clipes para aninhar'), 'error'); return; }
  const ids = new Set(store.withLinked(sel.map((c) => c.id)));
  const clips = store.p.clips.filter((c) => ids.has(c.id));
  const t0 = Math.min(...clips.map((c) => c.start));
  const t1 = Math.max(...clips.map((c) => c.start + c.duration));
  ensureSeqs();
  const usedTracks = store.p.tracks.filter((tr) => clips.some((c) => c.trackId === tr.id));
  const map = new Map();
  const tracks = usedTracks.map((tr) => { const n = { ...JSON.parse(JSON.stringify(tr)), id: uid('trk') }; map.set(tr.id, n.id); return n; });
  if (!tracks.some((tr) => tr.main)) { const v = tracks.find((tr) => tr.type === 'video'); if (v) v.main = true; }
  const inner = clips.map((c) => { const x = JSON.parse(JSON.stringify(c)); x.trackId = map.get(c.trackId); x.start -= t0; return x; });
  const name = t('Sequência aninhada {n}', { n: store.p.sequences.length });
  const s = { id: uid('seq'), name, tracks, clips: inner, markers: [], range: null };
  const visTrack = clips.filter((c) => store.track(c.trackId)?.type === 'video').map((c) => store.p.tracks.findIndex((tr) => tr.id === c.trackId));
  store.batch('nest', () => {
    store.p.sequences.push(s);
    store.p.clips = store.p.clips.filter((c) => !ids.has(c.id));
    // trilha: a mais baixa entre as visuais usadas (ou a principal)
    let trackId = visTrack.length ? store.p.tracks[Math.max(...visTrack)].id : store.mainTrack().id;
    if (!store.isFree(trackId, t0, t1)) trackId = store.findTrackFor('video', t0, t1).id;
    const nc = store.addClip({ trackId, type: 'sequence', seqId: s.id, name, start: t0, duration: t1 - t0, in: 0 }, { commit: false, select: false });
    store.selection.clear(); store.selection.add(nc.id);
  });
  bus.emit('selection');
  bus.emit('sequences');
  toast(t('Clipes aninhados em "{n}" — clique duas vezes para editar', { n: name }), 'success');
}

const clampI = (i, n) => Math.max(0, Math.min(n - 1, i | 0));

// ---------- achatamento para áudio e sincronização de mídia ----------
// gera clipes "virtuais" de vídeo/áudio de dentro das sequências aninhadas, no tempo da sequência ativa
export function flattenSeqClip(nc, prefix = '', depth = 0, stack = []) {
  const out = [];
  if (depth > 6 || stack.includes(nc.seqId)) return out;
  const d = seqData(nc.seqId);
  if (!d) return out;
  const spd = nc.speed || 1;
  const a = nc.in || 0, b = a + nc.duration * spd;
  const nVol = nc.volume ?? 1;
  const pid = prefix + nc.seqId + '>'; // players por sequência: pedaços cortados reaproveitam o mesmo vídeo
  let angleId = null, audioId = null;
  if (d.multicam) {
    const angles = angleTracks(d);
    angleId = angles[clampI(nc.mcAngle ?? 0, angles.length)]?.id;
    audioId = d.multicam.audio === 'follow' ? angleId : angles[0]?.id;
  }
  for (const c of d.clips) {
    const tr = d.tracks.find((x) => x.id === c.trackId);
    if (!tr) continue;
    let mcMute = false;
    if (d.multicam && tr.type === 'video') {
      if (tr.id !== angleId && !seqFlags.monitor && tr.id !== audioId) continue;
      mcMute = tr.id !== audioId;
    }
    const o0 = Math.max(a, c.start), o1 = Math.min(b, c.start + c.duration);
    if (o1 <= o0 + 1e-4) continue;
    const vStart = nc.start + (o0 - a) / spd, vDur = (o1 - o0) / spd;
    if (c.type === 'sequence') {
      const sub = { ...c, start: vStart, duration: vDur, in: (c.in || 0) + srcOffset(c, o0 - c.start), speed: (c.speed || 1) * spd, volume: (c.volume ?? 1) * nVol };
      sub.id = c.id;
      for (const v of flattenSeqClip(sub, pid, depth + 1, [...stack, nc.seqId])) out.push(v);
      continue;
    }
    if (c.type !== 'video' && c.type !== 'audio') continue;
    const s0 = srcOffset(c, o0 - c.start), s1 = srcOffset(c, o1 - c.start);
    const shift = o0 - c.start;
    const vol = valueAt(c, 'volume', 0);
    const v = {
      ...c, id: pid + c.id, nestedFrom: nc.id, innerTrack: tr, trackId: nc.trackId,
      start: vStart, duration: vDur, in: (c.in || 0) + s0, speed: Math.max(0.01, (s1 - s0) / vDur),
      volume: (tr.muted || mcMute ? 0 : vol) * nVol,
      fadeIn: Math.abs(o0 - c.start) < 1e-3 ? (c.fadeIn || 0) / spd : 0,
      fadeOut: Math.abs(o1 - (c.start + c.duration)) < 1e-3 ? (c.fadeOut || 0) / spd : 0,
      kf: {},
    };
    if (c.kf?.volume?.length && !mcMute) v.kf.volume = c.kf.volume.map((k) => ({ ...k, t: (k.t - shift) / spd, v: (tr.muted ? 0 : k.v) * nVol }));
    if (Math.abs(nc.start - vStart) < 1e-3 && nc.fadeIn) v.fadeIn = Math.max(v.fadeIn, nc.fadeIn);
    if (Math.abs(nc.start + nc.duration - vStart - vDur) < 1e-3 && nc.fadeOut) v.fadeOut = Math.max(v.fadeOut, nc.fadeOut);
    out.push(v);
  }
  return out;
}
// todos os clipes com mídia da sequência ativa, incluindo os de dentro das aninhadas
export function mediaClipsDeep() {
  const out = [];
  for (const c of store.p.clips) {
    if (c.type === 'sequence') out.push(...flattenSeqClip(c));
    else if (c.type === 'video' || c.type === 'audio') out.push(c);
  }
  return out;
}
export const hasNested = () => store.p.clips.some((c) => c.type === 'sequence');
