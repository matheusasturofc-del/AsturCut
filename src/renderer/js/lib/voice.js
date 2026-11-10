// Efeitos de voz (estilo CapCut): grafos Web Audio usados na prévia e na exportação
export const PITCH_URL = new URL('../worklets/pitch.js', import.meta.url).href;

export const VOICES = [
  { id: 'clean', name: 'Voz limpa (menos ruído)', cat: 'Melhorar voz', hp: 90, lp: 9500, peak: [3000, 3], comp: [-28, 4] },
  { id: 'announcer', name: 'Locutor de rádio', cat: 'Melhorar voz', hp: 70, lowBoost: 4, peak: [3500, 4], comp: [-30, 6] },
  { id: 'podcast', name: 'Podcast', cat: 'Melhorar voz', hp: 80, peak: [2500, 2.5], comp: [-24, 3.5] },
  { id: 'loud', name: 'Mais alto e presente', cat: 'Melhorar voz', hp: 60, peak: [4000, 3], comp: [-35, 8], makeup: 2 },
  { id: 'chipmunk', name: 'Esquilo', cat: 'Personagens', pitch: 1.6 },
  { id: 'kid', name: 'Criança', cat: 'Personagens', pitch: 1.3, hp: 200 },
  { id: 'female', name: 'Voz aguda', cat: 'Personagens', pitch: 1.18 },
  { id: 'male', name: 'Voz grave', cat: 'Personagens', pitch: 0.82 },
  { id: 'deep', name: 'Gigante', cat: 'Personagens', pitch: 0.65, lowBoost: 4 },
  { id: 'monster', name: 'Monstro', cat: 'Personagens', pitch: 0.58, drive: 12, lowBoost: 6 },
  { id: 'robot', name: 'Robô', cat: 'Efeitos', ring: 55, comb: 0.012 },
  { id: 'alien', name: 'Alienígena', cat: 'Efeitos', pitch: 1.25, ring: 28, vibrato: 7 },
  { id: 'vibrato', name: 'Tremido', cat: 'Efeitos', vibrato: 6 },
  { id: 'echo', name: 'Eco', cat: 'Ambiente', echo: [0.28, 0.42] },
  { id: 'hall', name: 'Salão', cat: 'Ambiente', reverb: [2.2, 0.45] },
  { id: 'cathedral', name: 'Catedral', cat: 'Ambiente', reverb: [4.5, 0.6] },
  { id: 'room', name: 'Sala pequena', cat: 'Ambiente', reverb: [0.6, 0.3] },
  { id: 'cave', name: 'Caverna', cat: 'Ambiente', reverb: [3, 0.5], echo: [0.45, 0.35] },
  { id: 'underwater', name: 'Embaixo d\'água', cat: 'Ambiente', lp: 450, vibrato: 3 },
  { id: 'phone', name: 'Telefone', cat: 'Aparelhos', hp: 350, lp: 3400, drive: 4 },
  { id: 'radio', name: 'Rádio antigo', cat: 'Aparelhos', hp: 500, lp: 4200, drive: 8 },
  { id: 'megaphone', name: 'Megafone', cat: 'Aparelhos', hp: 800, lp: 4500, drive: 22, peak: [1800, 6] },
  { id: 'walkie', name: 'Rádio comunicador', cat: 'Aparelhos', hp: 600, lp: 3000, drive: 30 },
  { id: 'distort', name: 'Distorcido', cat: 'Aparelhos', drive: 40 },
];
export const VOICE_MAP = Object.fromEntries(VOICES.map((v) => [v.id, v]));

const curveCache = new Map();
function driveCurve(k) {
  if (curveCache.has(k)) return curveCache.get(k);
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * (1 + k / 4)) / Math.tanh(1 + k / 4); }
  curveCache.set(k, c);
  return c;
}
const irCache = new WeakMap();
function impulse(ctx, secs) {
  let m = irCache.get(ctx); if (!m) { m = new Map(); irCache.set(ctx, m); }
  const key = secs.toFixed(2);
  if (m.has(key)) return m.get(key);
  const len = Math.max(1, Math.floor(ctx.sampleRate * secs)), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let seed = ch ? 7 : 3; for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 3); } }
  m.set(key, b);
  return b;
}

// monta a cadeia: retorna { input, output, stop() } ou null; pitch exige o worklet 'astur-pitch' carregado (pitchOk)
export function buildVoice(ctx, id, pitchOk = true) {
  const v = VOICE_MAP[id];
  if (!v) return null;
  const nodes = [], oscs = [];
  const input = ctx.createGain();
  let last = input;
  const chain = (n) => { last.connect(n); last = n; nodes.push(n); return n; };
  if (v.pitch && pitchOk) { const p = new AudioWorkletNode(ctx, 'astur-pitch', { outputChannelCount: [2] }); p.parameters.get('ratio').value = v.pitch; chain(p); }
  if (v.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = v.hp; f.Q.value = 0.7; chain(f); }
  if (v.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = v.lp; f.Q.value = 0.7; chain(f); }
  if (v.peak) { const f = ctx.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = v.peak[0]; f.gain.value = v.peak[1]; chain(f); }
  if (v.lowBoost) { const f = ctx.createBiquadFilter(); f.type = 'lowshelf'; f.frequency.value = 180; f.gain.value = v.lowBoost; chain(f); }
  if (v.comp) { const c = ctx.createDynamicsCompressor(); c.threshold.value = v.comp[0]; c.ratio.value = v.comp[1]; c.knee.value = 8; c.attack.value = 0.005; c.release.value = 0.15; chain(c); const g = ctx.createGain(); g.gain.value = v.makeup || Math.min(2.2, 1 + (-v.comp[0] / 40) * (1 - 1 / v.comp[1])); chain(g); }
  if (v.drive) { const w = ctx.createWaveShaper(); w.curve = driveCurve(v.drive); w.oversample = '2x'; chain(w); const g = ctx.createGain(); g.gain.value = 1 / (1 + v.drive / 30); chain(g); }
  if (v.ring) {
    const g = ctx.createGain(); g.gain.value = 0;
    const o = ctx.createOscillator(); o.frequency.value = v.ring; o.connect(g.gain); o.start(); oscs.push(o);
    chain(g);
    const mk = ctx.createGain(); mk.gain.value = 1.6; chain(mk);
  }
  if (v.comb) {
    const d = ctx.createDelay(0.1); d.delayTime.value = v.comb;
    const fb = ctx.createGain(); fb.gain.value = 0.55;
    const mix = ctx.createGain();
    last.connect(mix); last.connect(d); d.connect(fb).connect(d); d.connect(mix);
    nodes.push(d, fb, mix); last = mix;
  }
  if (v.vibrato) {
    const d = ctx.createDelay(0.05); d.delayTime.value = 0.006;
    const lfo = ctx.createOscillator(); lfo.frequency.value = v.vibrato;
    const depth = ctx.createGain(); depth.gain.value = 0.0025;
    lfo.connect(depth).connect(d.delayTime); lfo.start(); oscs.push(lfo);
    chain(d);
  }
  if (v.echo) {
    const [t, f] = v.echo;
    const d = ctx.createDelay(2); d.delayTime.value = t;
    const fb = ctx.createGain(); fb.gain.value = f;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    const mix = ctx.createGain();
    last.connect(mix); last.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(mix);
    nodes.push(d, fb, wet, mix); last = mix;
  }
  if (v.reverb) {
    const [secs, wetv] = v.reverb;
    const cv = ctx.createConvolver(); cv.buffer = impulse(ctx, secs);
    const wet = ctx.createGain(); wet.gain.value = wetv;
    const dry = ctx.createGain(); dry.gain.value = 1 - wetv * 0.4;
    const mix = ctx.createGain();
    last.connect(dry).connect(mix); last.connect(cv).connect(wet).connect(mix);
    nodes.push(cv, wet, dry, mix); last = mix;
  }
  const output = ctx.createGain();
  last.connect(output);
  return { input, output, stop: () => { for (const o of oscs) { try { o.stop(); } catch {} } for (const n of [input, ...nodes, output]) { try { n.disconnect(); } catch {} } } };
}
