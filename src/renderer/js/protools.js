// Ferramentas profissionais: congelar quadro, histórico, detecção de cenas, ducking automático e crossfade de áudio
import { store, bus } from './store.js';
import { el, modal, toast, uid, deepClone, clamp, fmtTime } from './util.js';
import { t } from './i18n.js';
import { pause } from './player.js';
import { mediaUrl } from './media.js';
import { sourceTime } from './compositor.js';
import { renderAudioOffline, clearDecoded } from './fastExport.js';

// ---------- congelar quadro (Shift+F) ----------
export function freezeFrame(seconds = 2) {
  pause();
  const tt = store.time;
  const inside = (c) => c.type === 'video' && tt > c.start + 0.02 && tt < c.start + c.duration - 0.02;
  const c = store.selectedClips().find(inside) || store.clipsOn(store.mainTrack().id).find(inside) || store.p.clips.find(inside);
  if (!c) { toast(t('Coloque o cursor sobre um vídeo para congelar o quadro'), 'info'); return; }
  store.batch('freeze', () => {
    const src = sourceTime(c, tt - c.start);
    store.splitAt(tt, [c.id]);
    for (const x of store.p.clips) if (x.trackId === c.trackId && x.start >= tt - 1e-4) x.start += seconds;
    const fz = deepClone(c);
    Object.assign(fz, { id: uid('clp'), start: tt, duration: seconds, in: src, freeze: true, volume: 0, speed: 1, transitionIn: null, animIn: null, animOut: null, fadeIn: 0, fadeOut: 0, linkId: undefined, name: t('Quadro congelado') });
    delete fz.kf;
    store.p.clips.push(fz);
    store.selection = new Set([fz.id]);
  });
  bus.emit('selection');
  toast(t('Quadro congelado por {s} s', { s: seconds }), 'success');
}

// ---------- histórico ----------
const LABELS = {
  add: 'Adicionar', 'add-media': 'Adicionar mídia', delete: 'Excluir', ripple: 'Excluir (ripple)', split: 'Dividir', trim: 'Aparar', move: 'Mover', update: 'Alterar',
  slider: 'Ajuste', color: 'Cor', 'color-reset': 'Zerar cor', mask: 'Máscara', speed: 'Velocidade', duplicate: 'Duplicar', paste: 'Colar', text: 'Texto', kf: 'Keyframe',
  'ripple-trim': 'Edição ripple', 'roll-trim': 'Edição rolante', 'rate-stretch': 'Alongar taxa', slip: 'Slip', slide: 'Slide', freeze: 'Congelar quadro', scenes: 'Detectar cenas',
  duck: 'Ducking automático', crossfade: 'Crossfade de áudio', silences: 'Tirar silêncios', captions: 'Legendas automáticas', aspect: 'Proporção', detach: 'Separar áudio',
  gain: 'Ganho', link: 'Vincular', unlink: 'Desvincular', name: 'Renomear', bg: 'Fundo', record: 'Gravação', voice: 'Narração', reset: 'Redefinir', cut: 'Cortar',
};
export function openHistory() {
  const n = store.undoStack.length;
  const list = el('div', { class: 'hist-list' });
  const items = store.undoLabels.map((l, i) => [i, l]).reverse();
  list.append(el('div', { class: 'hist-item now' }, el('b', {}, t('Estado atual'))));
  for (const [i, l] of items) {
    list.append(el('button', { class: 'hist-item', onclick: () => { const k = n - i; for (let j = 0; j < k; j++) store.undo(); m.close(); toast(t('Voltou {n} passo(s)', { n: k }), 'info'); } },
      el('span', { class: 'muted small' }, String(i + 1)), el('span', {}, t(LABELS[l] || l || 'Alterar'))));
  }
  if (!items.length) list.append(el('div', { class: 'muted small' }, t('Nada para desfazer ainda.')));
  const m = modal({ title: t('Histórico'), width: 380, body: el('div', {}, el('div', { class: 'muted small', style: { marginBottom: '8px' } }, t('Clique em um passo para voltar até ele (dá para refazer com Ctrl+Y).')), list), actions: [{ label: t('Fechar') }] });
}

// ---------- detecção de cenas (corta o vídeo nas trocas de cena) ----------
export async function detectScenes(clip = store.primarySelected()) {
  if (!clip || clip.type !== 'video') { toast(t('Selecione um clipe de vídeo'), 'error'); return; }
  const m = store.media(clip.mediaId);
  const url = m && mediaUrl(m);
  if (!url) return;
  pause();
  const bar = el('div', { class: 'progress-fill' });
  const label = el('div', { class: 'muted small' }, t('Analisando as cenas...'));
  let cancelled = false, finished = false;
  const dlg = modal({ title: t('Detectar cenas'), width: 420, className: 'no-close', body: el('div', { class: 'exp-progress' }, el('div', { class: 'progress' }, bar), label),
    actions: [{ label: t('Cancelar'), danger: true, onClick: () => { cancelled = true; } }], onClose: () => { if (!finished) cancelled = true; } });
  const spd = clip.speed || 1, a = clip.in || 0, b = a + clip.duration * spd;
  const v = document.createElement('video');
  v.muted = true; v.src = url; v.preload = 'auto';
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 18;
  const x = cv.getContext('2d', { willReadFrequently: true });
  const samples = []; // { t, d, s (assinatura) }
  let prev = null;
  const sig = () => {
    x.drawImage(v, 0, 0, 32, 18);
    const d = x.getImageData(0, 0, 32, 18).data;
    const h = new Float32Array(48); // histograma 16 níveis x 3 canais
    const g = new Float32Array(32 * 18);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) { h[d[i] >> 4]++; h[16 + (d[i + 1] >> 4)]++; h[32 + (d[i + 2] >> 4)]++; g[k] = (d[i] + d[i + 1] + d[i + 2]) / 765; }
    return { h, g };
  };
  const diff = (p, q) => {
    let hd = 0, gd = 0;
    for (let i = 0; i < 48; i++) hd += Math.abs(p.h[i] - q.h[i]);
    for (let i = 0; i < p.g.length; i++) gd += Math.abs(p.g[i] - q.g[i]);
    return 0.5 * hd / (2 * 3 * 576) + 0.5 * gd / p.g.length * 2;
  };
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; });
    v.currentTime = a;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
    v.playbackRate = 4;
    await new Promise((resolve) => {
      const onFrame = (now, meta) => {
        if (cancelled) { v.pause(); return resolve(); }
        const tt = meta.mediaTime;
        const s = sig();
        samples.push({ t: tt, d: prev ? diff(prev, s) : 0, s });
        prev = s;
        bar.style.width = Math.round(clamp((tt - a) / (b - a), 0, 1) * 100) + '%';
        if (tt >= b - 0.05) { v.pause(); return resolve(); }
        v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
      v.onended = () => resolve();
      v.play().catch(() => resolve());
    });
  } catch (e) { console.error(e); }
  // limiar robusto (mediana + desvio absoluto): funciona mesmo com poucas amostras
  const ds = samples.slice(1).map((x) => x.d).sort((p, q) => p - q);
  const med = ds[Math.floor(ds.length / 2)] || 0;
  const mad = (ds.map((x) => Math.abs(x - med)).sort((p, q) => p - q)[Math.floor(ds.length / 2)]) || 0;
  const thr = Math.max(0.25, med + 8 * mad);
  const rough = [];
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    const okPeak = s.d > thr && (i === samples.length - 1 || s.d >= samples[i + 1].d);
    if (okPeak && s.t - a > 0.2 && b - s.t > 0.2 && (!rough.length || s.t - rough[rough.length - 1].hi > 0.4)) rough.push({ lo: samples[i - 1].t, hi: s.t, sLo: samples[i - 1].s, sHi: s.s });
  }
  // refina cada corte buscando o quadro exato entre as duas amostras
  label.textContent = t('Encontrando o quadro exato dos cortes...');
  const fps = store.p.settings.fps || 30;
  const seek = (tt) => new Promise((r) => { v.addEventListener('seeked', r, { once: true }); v.currentTime = tt; });
  v.pause();
  const cuts = [];
  for (const r of rough) {
    if (cancelled) break;
    let { lo, hi, sLo, sHi } = r;
    for (let k = 0; k < 8 && hi - lo > 1 / fps; k++) {
      const mid = (lo + hi) / 2;
      await seek(mid);
      const sm = sig();
      if (diff(sLo, sm) > diff(sm, sHi)) { hi = mid; sHi = sm; } else { lo = mid; sLo = sm; }
    }
    cuts.push(hi);
  }
  v.removeAttribute('src'); v.load();
  finished = true;
  dlg.close();
  if (cancelled) return;
  if (!cuts.length) { toast(t('Nenhuma troca de cena encontrada'), 'info'); return; }
  const times = cuts.map((ct) => clip.start + (ct - a) / spd);
  store.batch('scenes', () => {
    let ids = store.withLinked([clip.id]);
    for (const tt of times) {
      const created = store.splitAt(tt, ids.map((id) => store.clip(id)).filter(Boolean).filter((c) => tt > c.start && tt < c.start + c.duration).map((c) => c.id));
      ids = ids.concat(created.map((c) => c.id));
    }
  });
  toast(t('{n} cortes nas trocas de cena', { n: times.length }), 'success');
}

// ---------- ducking automático: abaixa a música quando há fala ----------
export async function autoDuckDialog() {
  const audioTracks = store.p.tracks.filter((tr) => tr.type === 'audio' && store.p.clips.some((c) => c.trackId === tr.id));
  if (!audioTracks.length) { toast(t('Adicione uma música numa trilha de áudio'), 'error'); return; }
  const o = { music: new Set(audioTracks.filter((tr) => !tr.narration).map((tr) => tr.id)), duck: -14, fade: 0.3 };
  if (!o.music.size) o.music.add(audioTracks[audioTracks.length - 1].id);
  const checks = el('div', { class: 'dlg' }, audioTracks.map((tr) => {
    const cb = el('input', { type: 'checkbox', checked: o.music.has(tr.id) });
    cb.addEventListener('change', () => (cb.checked ? o.music.add(tr.id) : o.music.delete(tr.id)));
    return el('label', { class: 'dlg-check' }, cb, el('span', { class: 'no-tr' }, tr.name));
  }));
  const red = el('input', { type: 'range', min: -30, max: -3, value: o.duck });
  const redV = el('span', { class: 'sil-val' }, o.duck + ' dB');
  red.addEventListener('input', () => { o.duck = +red.value; redV.textContent = o.duck + ' dB'; });
  const fd = el('input', { type: 'range', min: 0.05, max: 1.5, step: 0.05, value: o.fade });
  const fdV = el('span', { class: 'sil-val' }, o.fade + ' s');
  fd.addEventListener('input', () => { o.fade = +fd.value; fdV.textContent = o.fade + ' s'; });
  modal({
    title: t('Ducking automático'), width: 520,
    body: el('div', { class: 'dlg' },
      el('div', { class: 'muted small' }, t('Abaixa o volume da música sozinho sempre que alguém fala (vídeos e narração). Marque as trilhas de música:')),
      checks,
      el('div', { class: 'sil-row' }, el('label', {}, t('Redução')), red, redV),
      el('div', { class: 'sil-row' }, el('label', {}, t('Suavidade')), fd, fdV)),
    actions: [{ label: t('Cancelar') }, { label: t('Aplicar'), primary: true, onClick: () => { runDuck(o); } }],
  });
}

async function runDuck(o) {
  const dur = store.duration();
  if (!o.music.size) return;
  const lab = toast(t('Analisando a fala...'), 'info', 60000);
  const buf = await renderAudioOffline(0, dur, null, { sampleRate: 16000, channels: 1, filter: (c) => !o.music.has(c.trackId) });
  clearDecoded();
  lab?.remove?.();
  const d = buf.getChannelData(0), W = 800; // janelas de 50 ms
  const n = Math.ceil(d.length / W), db = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i * W; j < Math.min(d.length, (i + 1) * W); j++) s += d[j] * d[j]; db[i] = 10 * Math.log10(s / W + 1e-12); }
  const sorted = [...db].filter((v) => v > -90).sort((p, q) => p - q);
  if (!sorted.length) { toast(t('Não encontrei fala no áudio'), 'info'); return; }
  const floor = sorted[Math.floor(sorted.length * 0.15)], peak = sorted[Math.floor(sorted.length * 0.95)];
  const thr = Math.max(-50, floor + (peak - floor) * 0.35);
  // regiões de fala (junta pausas curtas)
  const regions = [];
  let s = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && db[i] > thr;
    if (on && s < 0) s = i;
    if (!on && s >= 0) { regions.push([s * 0.05, i * 0.05]); s = -1; }
  }
  const merged = [];
  for (const r of regions) { const l = merged[merged.length - 1]; if (l && r[0] - l[1] < 0.6) l[1] = r[1]; else if (r[1] - r[0] > 0.15) merged.push([...r]); }
  if (!merged.length) { toast(t('Não encontrei fala no áudio'), 'info'); return; }
  const k = Math.pow(10, o.duck / 20);
  let count = 0;
  store.batch('duck', () => {
    for (const c of store.p.clips) {
      if (!o.music.has(c.trackId) || c.type !== 'audio') continue;
      const base = c.volume ?? 1, lo = base * k;
      const pts = [];
      for (const [r0, r1] of merged) {
        const a = r0 - c.start, b = r1 - c.start;
        if (b < -o.fade || a > c.duration + o.fade) continue;
        pts.push([a - o.fade, base], [a, lo], [b, lo], [b + o.fade, base]);
      }
      if (!pts.length) continue;
      const kf = [];
      for (const [tt, v] of pts) {
        const tc = clamp(tt, 0, c.duration);
        const last = kf[kf.length - 1];
        if (last && Math.abs(last.t - tc) < 0.01) { last.v = Math.min(last.v, v); continue; }
        kf.push({ t: +tc.toFixed(3), v, e: 'linear' });
      }
      c.kf = { ...(c.kf || {}), volume: kf };
      count++;
    }
  });
  toast(count ? t('Ducking aplicado em {n} clipe(s) de música', { n: count }) : t('Nenhum clipe de música nas trilhas marcadas'), count ? 'success' : 'info');
}

// ---------- crossfade de áudio nas emendas (Ctrl+Shift+D no Premiere) ----------
export function audioCrossfades(sec = 0.25) {
  const sel = store.selectedClips();
  const pool = (sel.length ? sel : store.p.clips).filter((c) => c.type === 'audio' || (c.type === 'video' && !c.audioDetached));
  let n = 0;
  store.batch('crossfade', () => {
    for (const c of pool) {
      const list = store.clipsOn(c.trackId);
      const i = list.indexOf(c);
      const prev = list[i - 1], next = list[i + 1];
      if (prev && Math.abs(prev.start + prev.duration - c.start) < 0.02) { c.fadeIn = Math.min(sec, c.duration / 2); prev.fadeOut = Math.min(sec, prev.duration / 2); n++; }
      if (next && Math.abs(c.start + c.duration - next.start) < 0.02) { c.fadeOut = Math.min(sec, c.duration / 2); next.fadeIn = Math.min(sec, next.duration / 2); n++; }
    }
  });
  toast(n ? t('Crossfade aplicado em {n} emenda(s)', { n }) : t('Nenhuma emenda de áudio encontrada'), n ? 'success' : 'info');
}

void fmtTime;
