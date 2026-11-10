// Tirar silêncios automaticamente: analisa o volume do áudio e corta (ou só divide) os trechos sem fala
import { store, bus } from './store.js';
import { el, modal, toast, clamp, uid, deepClone, fmtTime } from './util.js';
import { t } from './i18n.js';
import { decodeMedia, clearDecoded } from './fastExport.js';

const WIN = 0.02; // janela de análise: 20 ms
const hasAudio = (c) => c.type === 'audio' || c.type === 'video';

// grupos de clipes vinculados (vídeo + áudio separado); a análise usa o clipe que tem o som
export function groupsFrom(clips) {
  const seen = new Set();
  const groups = [];
  for (const c of clips) {
    if (seen.has(c.id)) continue;
    const g = store.linked(c);
    g.forEach((x) => seen.add(x.id));
    const src = g.find((x) => x.type === 'audio') || g.find((x) => x.type === 'video' && !x.audioDetached) || g.find(hasAudio);
    if (src) groups.push({ clips: g, src });
  }
  return groups.sort((a, b) => b.src.start - a.src.start);
}

// envelope em dB (um valor por janela de 20 ms do tempo da linha do tempo)
async function envelope(c) {
  const m = store.media(c.mediaId);
  if (!m) return null;
  const buf = await decodeMedia(m);
  if (!buf) return null;
  const sr = buf.sampleRate, spd = c.speed || 1;
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = Math.max(1, Math.floor(c.duration / WIN));
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s0 = Math.floor(((c.in || 0) + i * WIN * spd) * sr);
    const s1 = Math.min(L.length, Math.floor(((c.in || 0) + (i + 1) * WIN * spd) * sr));
    let sum = 0, k = 0;
    for (let j = s0; j < s1; j += 2) { const v = (L[j] + R[j]) * 0.5; sum += v * v; k++; }
    db[i] = k ? 10 * Math.log10(sum / k + 1e-12) : -100;
  }
  return db;
}

const secsTxt = (v) => (v < 60 ? v.toFixed(1).replace('.', ',') + ' s' : fmtTime(v, 30, false));
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(clamp(p, 0, 1) * (s.length - 1))]; };

// limiar sugerido: entre o ruído de fundo e o nível da fala
function autoThreshold(envs) {
  const all = envs.flatMap((e) => [...e.db].filter((v) => v > -90));
  if (!all.length) return -40;
  const floor = pct(all, 0.1), speech = pct(all, 0.9);
  return Math.round(clamp(floor + (speech - floor) * 0.35, -60, -15));
}

// trechos silenciosos [a, b] em segundos relativos ao início do clipe
function findSilences(db, o) {
  const out = [];
  let s = -1;
  for (let i = 0; i <= db.length; i++) {
    const quiet = i < db.length && db[i] < o.threshold;
    if (quiet && s < 0) s = i;
    if (!quiet && s >= 0) {
      const a = s * WIN, b = i * WIN;
      if (b - a >= o.minSilence) {
        const pa = s === 0 ? a : a + o.padding;            // no começo/fim do clipe corta tudo
        const pb = i === db.length ? b : b - o.padding;
        if (pb - pa > 0.05) out.push([pa, pb]);
      }
      s = -1;
    }
  }
  return out;
}

// remove o intervalo [a, b] (tempo da linha do tempo) de um clipe; devolve as partes que sobraram
function cutClip(x, a, b) {
  const s = x.start, e = x.start + x.duration, spd = x.speed || 1;
  const A = Math.max(a, s), B = Math.min(b, e);
  if (B - A <= 1e-4) return [x];
  const shiftKf = (c, d) => { if (c.kf) for (const k of Object.keys(c.kf)) c.kf[k] = c.kf[k].map((f) => ({ ...f, t: f.t - d })).filter((f) => f.t >= -1e-3); };
  if (A <= s + 1e-4 && B >= e - 1e-4) { store.p.clips = store.p.clips.filter((c) => c !== x); return []; }
  if (A <= s + 1e-4) { // corta o começo
    const d = B - s;
    x.in = (x.in || 0) + d * spd; x.start = B; x.duration -= d; x.transitionIn = null; x.animIn = null; x.fadeIn = 0;
    shiftKf(x, d);
    return [x];
  }
  if (B >= e - 1e-4) { // corta o fim
    x.duration = A - s; x.animOut = null; x.fadeOut = 0;
    return [x];
  }
  const r = deepClone(x); // corta no meio
  r.id = uid('clp');
  r.start = B; r.duration = e - B; r.in = (x.in || 0) + (B - s) * spd;
  r.transitionIn = null; r.animIn = null; r.fadeIn = 0;
  shiftKf(r, B - s);
  x.duration = A - s; x.animOut = null; x.fadeOut = 0;
  store.p.clips.push(r);
  return [x, r];
}

// aplica: ranges em tempo absoluto, do fim para o começo
export function apply(groups, rangesByGroup, ripple, label = 'silences') {
  store.begin();
  let removed = 0, count = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    let parts = [...g.clips];
    const tracks = new Set(g.clips.map((c) => c.trackId));
    const ranges = [...rangesByGroup[gi]].sort((p, q) => q[0] - p[0]);
    for (const [a, b] of ranges) {
      const next = [];
      for (const x of parts) next.push(...cutClip(x, a, b));
      parts = next;
      count++;
      if (ripple) {
        const len = b - a;
        removed += len;
        for (const c of store.p.clips) if (tracks.has(c.trackId) && c.start >= b - 1e-4) c.start -= len;
      }
    }
  }
  store.selection.clear();
  store.removeEmptyTracks();
  store.commit(label);
  bus.emit('selection');
  return { removed, count };
}

export async function removeSilencesDialog(clips = store.selectedClips()) {
  let pick = clips.filter(hasAudio);
  if (!pick.length) {
    // nada selecionado: usa a trilha principal (ou a primeira trilha com áudio)
    const main = store.mainTrack();
    pick = store.p.clips.filter((c) => c.trackId === main?.id && hasAudio(c));
    if (!pick.length) pick = store.p.clips.filter(hasAudio);
  }
  if (!pick.length) { toast(t('Adicione um vídeo ou áudio com fala na linha do tempo'), 'error'); return; }
  const groups = groupsFrom(pick);
  const loading = toast(t('Analisando o áudio...'), 'info', 60000);
  const envs = [];
  for (const g of groups) envs.push({ g, db: await envelope(g.src) });
  clearDecoded();
  loading?.remove?.();
  const ok = envs.filter((e) => e.db);
  if (!ok.length) { toast(t('Não foi possível ler o áudio deste clipe'), 'error'); return; }

  const o = { threshold: autoThreshold(ok), minSilence: 0.5, padding: 0.12, ripple: true };
  const W = 640, H = 90;
  const cv = el('canvas', { class: 'sil-wave', width: W * 2, height: H * 2 });
  const summary = el('div', { class: 'sil-sum' });
  const totalDur = ok.reduce((s, e) => s + e.g.src.duration, 0);
  const calc = () => ok.map((e) => findSilences(e.db, o));
  const draw = () => {
    const res = calc();
    const x = cv.getContext('2d');
    x.setTransform(2, 0, 0, 2, 0, 0);
    x.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.body);
    const accent = cs.getPropertyValue('--accent').trim() || '#1ccfdc';
    let off = 0;
    ok.forEach((e, i) => {
      const w0 = (e.g.src.duration / totalDur) * W;
      // silêncios
      x.fillStyle = 'rgba(239,68,68,.28)';
      for (const [a, b] of res[i]) x.fillRect(off + (a / e.g.src.duration) * w0, 0, Math.max(1, ((b - a) / e.g.src.duration) * w0), H);
      // envelope
      x.fillStyle = accent;
      const n = e.db.length;
      for (let px = 0; px < w0; px++) {
        const i0 = Math.floor((px / w0) * n), i1 = Math.max(i0 + 1, Math.floor(((px + 1) / w0) * n));
        let mx = -100;
        for (let k = i0; k < i1 && k < n; k++) if (e.db[k] > mx) mx = e.db[k];
        const h = clamp((mx + 70) / 70, 0, 1) * (H - 4);
        x.fillRect(off + px, (H - h) / 2, 1, Math.max(1, h));
      }
      off += w0;
      if (i < ok.length - 1) { x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(off, 0, 1, H); }
    });
    // linha do limiar
    const ty = clamp((o.threshold + 70) / 70, 0, 1) * (H - 4);
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.setLineDash([4, 3]);
    x.beginPath(); x.moveTo(0, (H - ty) / 2); x.lineTo(W, (H - ty) / 2); x.moveTo(0, (H + ty) / 2); x.lineTo(W, (H + ty) / 2); x.stroke();
    x.setLineDash([]);
    const n = res.reduce((s, r) => s + r.length, 0);
    const secs = res.reduce((s, r) => s + r.reduce((q, [a, b]) => q + b - a, 0), 0);
    summary.textContent = n
      ? t('{n} trechos de silêncio · {s} a menos ({p}% do áudio)', { n, s: secsTxt(secs), p: Math.round((secs / totalDur) * 100) })
      : t('Nenhum silêncio encontrado com esses ajustes');
    return res;
  };
  const slider = (label, key, min, max, step, fmt) => {
    const val = el('span', { class: 'sil-val' }, fmt(o[key]));
    const inp = el('input', { type: 'range', min, max, step, value: o[key] });
    inp.addEventListener('input', () => { o[key] = +inp.value; val.textContent = fmt(o[key]); draw(); });
    return el('div', { class: 'sil-row' }, el('label', {}, label), inp, val);
  };
  const modeSel = el('select', { class: 'select' },
    el('option', { value: 'ripple' }, t('Remover e juntar os pedaços')),
    el('option', { value: 'split' }, t('Só cortar (manter tudo, para revisar)')));
  modeSel.addEventListener('change', () => (o.ripple = modeSel.value === 'ripple'));
  modal({
    title: t('Tirar silêncios'), width: 700, className: 'sil-modal',
    body: el('div', { class: 'dlg' },
      el('div', { class: 'muted small' }, t('As áreas em vermelho serão cortadas. Ajuste até ficar bom — dá para desfazer com Ctrl+Z.')),
      cv, summary,
      slider(t('Volume mínimo'), 'threshold', -70, -10, 1, (v) => v + ' dB'),
      slider(t('Silêncio mínimo'), 'minSilence', 0.15, 3, 0.05, (v) => v.toFixed(2) + ' s'),
      slider(t('Margem'), 'padding', 0, 0.5, 0.01, (v) => Math.round(v * 1000) + ' ms'),
      el('div', { class: 'sil-row' }, el('label', {}, t('Ação')), modeSel),
    ),
    actions: [
      { label: t('Cancelar') },
      { label: t('Tirar silêncios'), primary: true, onClick: () => {
        const res = calc();
        const n = res.reduce((s, r) => s + r.length, 0);
        if (!n) { toast(t('Nenhum silêncio encontrado com esses ajustes'), 'info'); return false; }
        const gs = ok.map((e) => e.g);
        const abs = res.map((r, i) => r.map(([a, b]) => [gs[i].src.start + a, gs[i].src.start + b]));
        const r = apply(gs, abs, o.ripple);
        toast(o.ripple
          ? t('{n} silêncios removidos ({s} a menos)', { n: r.count, s: secsTxt(r.removed) })
          : t('{n} silêncios cortados — revise e apague o que quiser', { n: r.count }), 'success');
      } },
    ],
  });
  draw();
}
