// Mixer de áudio: cada trilha tem um canal com EQ, compressor, limitador, redução de ruído, pan e volume
import { store, bus } from './store.js';
import { el, icon, modal, clamp } from './util.js';
import { audioCtx, masterGain } from './media.js';
import { t } from './i18n.js';
import { togglePlay } from './player.js';

export function defaultTrackAudio() {
  return {
    volume: 1, pan: 0,
    eq: { on: false, hp: 80, low: 0, mid: 0, midF: 1200, high: 0, lp: 18000 },
    comp: { on: false, threshold: -20, ratio: 2 },
    limiter: { on: false, ceiling: -1 },
    denoise: { on: false, amount: 30 },
  };
}
export function trackAudio(tr) {
  const d = defaultTrackAudio();
  tr.audio = { ...d, ...(tr.audio || {}), eq: { ...d.eq, ...(tr.audio?.eq || {}) }, comp: { ...d.comp, ...(tr.audio?.comp || {}) }, limiter: { ...d.limiter, ...(tr.audio?.limiter || {}) }, denoise: { ...d.denoise, ...(tr.audio?.denoise || {}) } };
  return tr.audio;
}

export const PRESETS = {
  none: { name: 'Nenhum', fx: defaultTrackAudio() },
  voice: { name: 'Voz limpa', fx: { eq: { on: true, hp: 80, low: -1, mid: -3, midF: 320, high: 3, lp: 16000 }, comp: { on: true, threshold: -18, ratio: 2 }, limiter: { on: true, ceiling: -1 }, denoise: { on: true, amount: 20 } } },
  podcast: { name: 'Podcast', fx: { eq: { on: true, hp: 90, low: 2, mid: -2, midF: 400, high: 4, lp: 15000 }, comp: { on: true, threshold: -22, ratio: 3 }, limiter: { on: true, ceiling: -1 }, denoise: { on: true, amount: 30 } } },
  music: { name: 'Música de fundo', fx: { eq: { on: true, hp: 40, low: 1, mid: -4, midF: 2500, high: 0, lp: 18000 }, comp: { on: false, threshold: -20, ratio: 2 }, limiter: { on: true, ceiling: -3 }, denoise: { on: false, amount: 0 } } },
  phone: { name: 'Telefone / rádio', fx: { eq: { on: true, hp: 400, low: -6, mid: 6, midF: 1800, high: -4, lp: 3400 }, comp: { on: true, threshold: -25, ratio: 4 }, limiter: { on: true, ceiling: -2 }, denoise: { on: false, amount: 0 } } },
};

// ---------- Grafo de áudio ----------
const buses = new Map(); // trackId -> nós
let gateReady = null;
export const GATE_CODE = `
class AsturGate extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1 }]; }
  constructor() { super(); this.env = 0; this.g = 1; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const amount = params.amount[0];
    const thr = 0.004 + amount * 0.05;
    const n = inp[0].length;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < inp.length; c++) s = Math.max(s, Math.abs(inp[c][i]));
      this.env = s > this.env ? s : this.env * 0.9995;
      const target = this.env < thr ? 1 - amount * 0.9 : 1;
      this.g += (target - this.g) * (target < this.g ? 0.0008 : 0.01);
      for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || inp[0])[i] * this.g;
    }
    return true;
  }
}
registerProcessor('astur-gate', AsturGate);`;

function loadGate(ctx) {
  if (!gateReady) {
    const url = URL.createObjectURL(new Blob([GATE_CODE], { type: 'application/javascript' }));
    gateReady = ctx.audioWorklet ? ctx.audioWorklet.addModule(url).then(() => true).catch(() => false) : Promise.resolve(false);
  }
  return gateReady;
}

function createBus(trackId) {
  const ctx = audioCtx();
  const n = {};
  n.input = ctx.createGain();
  n.hp = ctx.createBiquadFilter(); n.hp.type = 'highpass';
  n.low = ctx.createBiquadFilter(); n.low.type = 'lowshelf'; n.low.frequency.value = 150;
  n.mid = ctx.createBiquadFilter(); n.mid.type = 'peaking'; n.mid.Q.value = 1;
  n.high = ctx.createBiquadFilter(); n.high.type = 'highshelf'; n.high.frequency.value = 6000;
  n.lp = ctx.createBiquadFilter(); n.lp.type = 'lowpass';
  n.comp = ctx.createDynamicsCompressor();
  n.lim = ctx.createDynamicsCompressor(); n.lim.ratio.value = 20; n.lim.knee.value = 0; n.lim.attack.value = 0.002; n.lim.release.value = 0.08;
  n.gateSlot = ctx.createGain();
  n.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  n.fader = ctx.createGain();
  n.analyser = ctx.createAnalyser(); n.analyser.fftSize = 1024;
  n.input.connect(n.hp).connect(n.low).connect(n.mid).connect(n.high).connect(n.lp).connect(n.comp).connect(n.lim).connect(n.gateSlot);
  n.gateSlot.connect(n.pan).connect(n.fader).connect(n.analyser).connect(masterGain());
  buses.set(trackId, n);
  loadGate(ctx).then((ok) => {
    if (!ok || n.gate) return;
    try {
      n.gate = new AudioWorkletNode(ctx, 'astur-gate', { outputChannelCount: [2] });
      n.lim.disconnect(); n.lim.connect(n.gate).connect(n.gateSlot);
      const tr = store.track(trackId); if (tr) applyBus(tr);
    } catch {}
  });
  const tr = store.track(trackId);
  if (tr) applyBus(tr);
  return n;
}

export function busFor(trackId) { return buses.get(trackId) || createBus(trackId); }

function anySolo() { return store.p.tracks.some((x) => x.solo); }

export function applyBus(tr) {
  const n = buses.get(tr.id);
  if (!n) return;
  const a = trackAudio(tr);
  const now = audioCtx().currentTime;
  const set = (param, v) => { try { param.setTargetAtTime(v, now, 0.02); } catch { param.value = v; } };
  const e = a.eq;
  set(n.hp.frequency, e.on ? clamp(e.hp, 10, 2000) : 10);
  set(n.low.gain, e.on ? e.low : 0);
  set(n.mid.gain, e.on ? e.mid : 0);
  set(n.mid.frequency, clamp(e.midF, 80, 12000));
  set(n.high.gain, e.on ? e.high : 0);
  set(n.lp.frequency, e.on ? clamp(e.lp, 1000, 22000) : 22000);
  set(n.comp.threshold, a.comp.on ? a.comp.threshold : 0);
  set(n.comp.ratio, a.comp.on ? a.comp.ratio : 1);
  set(n.lim.threshold, a.limiter.on ? a.limiter.ceiling : 0);
  set(n.lim.ratio, a.limiter.on ? 20 : 1);
  if (n.gate) set(n.gate.parameters.get('amount'), a.denoise.on ? a.denoise.amount / 100 : 0);
  if (n.pan.pan) set(n.pan.pan, a.pan);
  const silent = tr.muted || (anySolo() && !tr.solo);
  set(n.fader.gain, silent ? 0 : a.volume);
}
export function applyAll() { for (const tr of store.p.tracks) if (buses.has(tr.id)) applyBus(tr); }
bus.on('change', applyAll);

// conecta o elemento de mídia de um clipe ao canal da sua trilha
export function routePlayer(p, trackId) {
  if (!p || !p.gain || p.routed === trackId) return;
  try { p.gain.disconnect(); } catch {}
  p.gain.connect(busFor(trackId).input);
  p.routed = trackId;
}

function levelDb(n) {
  if (!n) return -90;
  const d = new Float32Array(n.analyser.fftSize);
  n.analyser.getFloatTimeDomainData(d);
  let pk = 0;
  for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  return pk > 0 ? 20 * Math.log10(pk) : -90;
}
const dbToGain = (db) => Math.pow(10, db / 20);
const gainToDb = (g) => (g <= 0.0001 ? -60 : 20 * Math.log10(g));
const fmtDb = (db) => (db <= -59.5 ? '-∞' : (db > 0 ? '+' : '') + db.toFixed(1)) + ' dB';

// ---------- Interface do mixer ----------
export function openMixer(focusTrackId = null) {
  let sel = focusTrackId || store.p.tracks.find((x) => x.type === 'audio')?.id || store.p.tracks[0]?.id;
  const root = el('div', { class: 'mixer' });
  const strips = el('div', { class: 'mix-strips' });
  const fxPane = el('div', { class: 'mix-fx' });
  root.append(strips, fxPane);
  const meters = [];
  let raf = 0;

  const renderStrips = () => {
    strips.innerHTML = '';
    meters.length = 0;
    for (const tr of store.p.tracks) {
      const a = trackAudio(tr);
      const meter = el('canvas', { class: 'mix-meter', width: 10, height: 150 });
      meters.push({ canvas: meter, id: tr.id, peak: -90 });
      const fader = el('input', { type: 'range', class: 'mix-fader', min: -60, max: 12, step: 0.5, value: gainToDb(a.volume).toFixed(1), orient: 'vertical' });
      const dbLabel = el('div', { class: 'mix-db' }, fmtDb(gainToDb(a.volume)));
      fader.addEventListener('pointerdown', () => store.begin());
      fader.addEventListener('input', () => { a.volume = +fader.value <= -59.5 ? 0 : dbToGain(+fader.value); dbLabel.textContent = fmtDb(+fader.value); applyBus(tr); store.touch(); });
      fader.addEventListener('change', () => store.commit('mixvol'));
      fader.addEventListener('dblclick', () => { store.begin(); a.volume = 1; store.commit('mixvol'); renderStrips(); });
      const pan = el('input', { type: 'range', class: 'mix-pan', min: -1, max: 1, step: 0.05, value: a.pan, title: t('Pan (esquerda/direita)') });
      pan.addEventListener('pointerdown', () => store.begin());
      pan.addEventListener('input', () => { a.pan = +pan.value; applyBus(tr); store.touch(); });
      pan.addEventListener('change', () => store.commit('mixpan'));
      pan.addEventListener('dblclick', () => { store.begin(); a.pan = 0; store.commit('mixpan'); renderStrips(); });
      const fxOn = a.eq.on || a.comp.on || a.limiter.on || a.denoise.on;
      strips.append(el('div', { class: 'mix-strip' + (sel === tr.id ? ' active' : ''), onclick: (e) => { if (e.target.closest('input,button')) return; sel = tr.id; renderStrips(); renderFx(); } },
        el('div', { class: 'mix-name no-tr', title: tr.name }, tr.name),
        el('div', { class: 'mix-pan-wrap' }, el('span', {}, 'L'), pan, el('span', {}, 'R')),
        el('div', { class: 'mix-body' }, meter, fader),
        dbLabel,
        el('div', { class: 'mix-btns' },
          el('button', { class: 'mix-b' + (tr.muted ? ' on mute' : ''), title: t('Silenciar'), onclick: () => { store.begin(); tr.muted = !tr.muted; store.commit('mute'); renderStrips(); } }, 'M'),
          el('button', { class: 'mix-b' + (tr.solo ? ' on solo' : ''), title: t('Solo'), onclick: () => { store.begin(); tr.solo = !tr.solo; store.commit('solo'); renderStrips(); } }, 'S')),
        el('button', { class: 'mix-fxbtn' + (fxOn ? ' on' : ''), onclick: () => { sel = tr.id; renderStrips(); renderFx(); }, html: icon('wand', 12) + `<span>${t('Efeitos')}</span>` })));
    }
    const m = masterGain();
    const mf = el('input', { type: 'range', class: 'mix-fader', min: -60, max: 12, step: 0.5, value: gainToDb(m.gain.value).toFixed(1), orient: 'vertical' });
    const ml = el('div', { class: 'mix-db' }, fmtDb(gainToDb(m.gain.value)));
    mf.addEventListener('input', () => { m.gain.value = +mf.value <= -59.5 ? 0 : dbToGain(+mf.value); ml.textContent = fmtDb(+mf.value); store.p.masterVolume = m.gain.value; store.dirty = true; });
    const mm = el('canvas', { class: 'mix-meter', width: 10, height: 150 });
    meters.push({ canvas: mm, id: '__master', peak: -90 });
    strips.append(el('div', { class: 'mix-strip master' }, el('div', { class: 'mix-name' }, t('Mestre')), el('div', { class: 'mix-pan-wrap' }), el('div', { class: 'mix-body' }, mm, mf), ml));
  };

  const fxSlider = (label, obj, key, min, max, step, unit, tr) => {
    const v = el('span', { class: 'mono small' }, obj[key] + unit);
    const r = el('input', { type: 'range', class: 'slider', min, max, step, value: obj[key] });
    const paint = () => r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%');
    paint();
    r.addEventListener('pointerdown', () => store.begin());
    r.addEventListener('input', () => { obj[key] = +r.value; v.textContent = r.value + unit; paint(); applyBus(tr); drawCurve(); store.touch(); });
    r.addEventListener('change', () => store.commit('fx'));
    return el('div', { class: 'fx-row' }, el('label', {}, label), r, v);
  };
  const fxBlock = (title, obj, tr, ...rows) => {
    const sw = el('button', { class: 'switch' + (obj.on ? ' on' : ''), onclick: () => { store.begin(); obj.on = !obj.on; store.commit('fx'); applyBus(tr); renderFx(); renderStrips(); } }, el('span'));
    return el('div', { class: 'fx-block' + (obj.on ? '' : ' off') }, el('div', { class: 'fx-block-head' }, el('b', {}, title), sw), ...rows);
  };

  let curve = null;
  const drawCurve = () => {
    if (!curve) return;
    const tr = store.track(sel); if (!tr) return;
    const n = busFor(tr.id);
    const W = curve.width, H = curve.height;
    const x = curve.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.08)';
    for (const f of [100, 1000, 10000]) { const px = Math.log10(f / 20) / Math.log10(1000) * W; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke(); }
    x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();
    const freqs = new Float32Array(W);
    for (let i = 0; i < W; i++) freqs[i] = 20 * Math.pow(1000, i / W);
    const total = new Float32Array(W).fill(0);
    const mag = new Float32Array(W), ph = new Float32Array(W);
    for (const node of [n.hp, n.low, n.mid, n.high, n.lp]) {
      node.getFrequencyResponse(freqs, mag, ph);
      for (let i = 0; i < W; i++) total[i] += 20 * Math.log10(Math.max(1e-5, mag[i]));
    }
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    x.strokeStyle = accent; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i < W; i++) { const y = H / 2 - clamp(total[i], -24, 24) / 24 * (H / 2 - 4); i ? x.lineTo(i, y) : x.moveTo(i, y); }
    x.stroke();
    x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.globalAlpha = 0.12; x.fillStyle = accent; x.fill(); x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,.4)'; x.font = '10px sans-serif';
    x.fillText('100 Hz', Math.log10(5) / 3 * W + 3, H - 4); x.fillText('1 kHz', Math.log10(50) / 3 * W + 3, H - 4); x.fillText('10 kHz', Math.log10(500) / 3 * W + 3, H - 4);
  };

  const renderFx = () => {
    fxPane.innerHTML = '';
    const tr = store.track(sel);
    if (!tr) return;
    const a = trackAudio(tr);
    busFor(tr.id);
    const presetSel = el('select', { class: 'select' }, el('option', { value: '' }, t('Predefinição...')), Object.entries(PRESETS).map(([id, p]) => el('option', { value: id }, t(p.name))));
    presetSel.addEventListener('change', () => {
      const p = PRESETS[presetSel.value]; if (!p) return;
      store.begin();
      const keep = { volume: a.volume, pan: a.pan };
      tr.audio = { ...defaultTrackAudio(), ...structuredClone(p.fx), ...keep };
      trackAudio(tr);
      store.commit('preset'); applyBus(tr); renderFx(); renderStrips();
    });
    curve = el('canvas', { class: 'eq-curve', width: 420, height: 120 });
    fxPane.append(
      el('div', { class: 'fx-head' }, el('div', {}, el('div', { class: 'muted small' }, t('Efeitos da trilha')), el('b', { class: 'no-tr' }, tr.name)), presetSel),
      el('div', { class: 'muted small fx-hint' }, t('Os efeitos valem para todos os clipes desta trilha (deixe cada voz em sua própria trilha).')),
      fxBlock(t('Equalizador'), a.eq, tr, curve,
        fxSlider(t('Corte de graves (Hz)'), a.eq, 'hp', 10, 600, 5, '', tr),
        fxSlider(t('Graves (dB)'), a.eq, 'low', -15, 15, 0.5, '', tr),
        fxSlider(t('Médios (dB)'), a.eq, 'mid', -15, 15, 0.5, '', tr),
        fxSlider(t('Freq. dos médios (Hz)'), a.eq, 'midF', 100, 8000, 10, '', tr),
        fxSlider(t('Agudos / brilho (dB)'), a.eq, 'high', -15, 15, 0.5, '', tr),
        fxSlider(t('Corte de agudos (Hz)'), a.eq, 'lp', 1000, 22000, 100, '', tr)),
      fxBlock(t('Compressor'), a.comp, tr,
        fxSlider(t('Limiar (dB)'), a.comp, 'threshold', -60, 0, 0.5, '', tr),
        fxSlider(t('Proporção'), a.comp, 'ratio', 1, 20, 0.1, ':1', tr)),
      fxBlock(t('Limitador'), a.limiter, tr,
        fxSlider(t('Teto (dB)'), a.limiter, 'ceiling', -12, 0, 0.1, '', tr)),
      fxBlock(t('Redução de ruído'), a.denoise, tr,
        fxSlider(t('Intensidade (%)'), a.denoise, 'amount', 0, 100, 1, '', tr)),
    );
    requestAnimationFrame(drawCurve);
  };

  const tick = () => {
    for (const m of meters) {
      const n = m.id === '__master' ? null : buses.get(m.id);
      const db = m.id === '__master' ? Math.max(-90, ...[...buses.values()].map(levelDb)) : levelDb(n);
      m.peak = Math.max(db, m.peak - 1.2);
      const x = m.canvas.getContext('2d');
      const H = m.canvas.height;
      x.clearRect(0, 0, 10, H);
      x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, 0, 10, H);
      const h = clamp((m.peak + 60) / 66, 0, 1) * H;
      const g = x.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, '#22c55e'); g.addColorStop(0.75, '#eab308'); g.addColorStop(1, '#ef4444');
      x.fillStyle = g; x.fillRect(0, H - h, 10, h);
    }
    raf = requestAnimationFrame(tick);
  };
  renderStrips(); renderFx(); tick();
  const onKey = (e) => { if (e.key === ' ' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); togglePlay(); } };
  document.addEventListener('keydown', onKey);
  modal({ title: t('Mixer de áudio'), width: 'min(1100px, calc(100vw - 40px))', body: root, className: 'mixer-modal', onClose: () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); } });
}

// restaura volume mestre do projeto
bus.on('project', () => { try { masterGain().gain.value = store.p.masterVolume ?? 1; } catch {} });
