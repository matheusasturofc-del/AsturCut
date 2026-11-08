// BIBLIOTECA DE ÁUDIO: efeitos sonoros e músicas geradas por síntese (100% livres de direitos)
const SR = 44100;

function noiseBuffer(ctx, dur) {
  const b = ctx.createBuffer(1, Math.ceil(SR * dur), SR);
  const d = b.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  return b;
}
function env(g, t0, a, peak, d, end = 0.0001) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(end, t0 + a + d);
}
function osc(ctx, type, freq, t0, dur, gain, dest, freqEnd = null, attack = 0.005) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  env(g, t0, attack, gain, dur);
  o.connect(g).connect(dest);
  o.start(t0); o.stop(t0 + attack + dur + 0.05);
  return o;
}
function noise(ctx, t0, dur, gain, dest, filterType = 'highpass', freq = 1000, q = 1, freqEnd = null) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, dur + 0.1);
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, Math.min(0.01, dur / 4), gain, dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t0); s.stop(t0 + dur + 0.1);
}
// instrumentos de bateria
const kick = (c, t, d, v = 0.9) => osc(c, 'sine', 150, t, 0.35, v, d, 40);
const snare = (c, t, d, v = 0.4) => { noise(c, t, 0.18, v, d, 'highpass', 1500); osc(c, 'triangle', 200, t, 0.1, v * 0.5, d, 120); };
const hat = (c, t, d, v = 0.12) => noise(c, t, 0.05, v, d, 'highpass', 7000);
const clap = (c, t, d, v = 0.35) => { for (let i = 0; i < 3; i++) noise(c, t + i * 0.012, 0.08, v, d, 'bandpass', 1800, 1.5); };

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

function pad(ctx, notes, t0, dur, gain, dest, type = 'triangle', cutoff = 1800) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.4, dur / 3));
  g.gain.linearRampToValueAtTime(gain * 0.8, t0 + dur - 0.2);
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  f.connect(g).connect(dest);
  for (const n of notes) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = NOTE(n); o.detune.value = det;
      o.connect(f); o.start(t0); o.stop(t0 + dur + 0.05);
    }
  }
}

export const SFX = [
  { id: 'whoosh', name: 'Whoosh', cat: 'Transição', dur: 0.9, gen: (c, d) => noise(c, 0, 0.8, 0.6, d, 'bandpass', 300, 2, 4000) },
  { id: 'swoosh', name: 'Swoosh reverso', cat: 'Transição', dur: 0.9, gen: (c, d) => noise(c, 0, 0.8, 0.6, d, 'bandpass', 5000, 2, 200) },
  { id: 'riser', name: 'Riser (subida)', cat: 'Transição', dur: 3.2, gen: (c, d) => {
      const s = c.createBufferSource(); s.buffer = noiseBuffer(c, 3.2);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(200, 0); f.frequency.exponentialRampToValueAtTime(6000, 3);
      const g = c.createGain(); g.gain.setValueAtTime(0.01, 0); g.gain.exponentialRampToValueAtTime(0.7, 3); g.gain.linearRampToValueAtTime(0, 3.15);
      s.connect(f).connect(g).connect(d); s.start(0);
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(100, 0); o.frequency.exponentialRampToValueAtTime(1200, 3);
      const g2 = c.createGain(); g2.gain.setValueAtTime(0.001, 0); g2.gain.exponentialRampToValueAtTime(0.12, 3); g2.gain.linearRampToValueAtTime(0, 3.15);
      o.connect(g2).connect(d); o.start(0); o.stop(3.2);
    } },
  { id: 'boom', name: 'Boom grave', cat: 'Impacto', dur: 2.2, gen: (c, d) => { osc(c, 'sine', 70, 0, 2, 1, d, 28); noise(c, 0, 1.2, 0.5, d, 'lowpass', 400); } },
  { id: 'impact', name: 'Impacto', cat: 'Impacto', dur: 1.2, gen: (c, d) => { osc(c, 'sine', 120, 0, 0.8, 1, d, 35); noise(c, 0, 0.4, 0.6, d, 'lowpass', 2500); } },
  { id: 'pop', name: 'Pop', cat: 'Interface', dur: 0.2, gen: (c, d) => osc(c, 'sine', 700, 0, 0.12, 0.8, d, 160) },
  { id: 'click', name: 'Clique', cat: 'Interface', dur: 0.08, gen: (c, d) => noise(c, 0, 0.025, 0.8, d, 'highpass', 3000) },
  { id: 'beep', name: 'Bip', cat: 'Interface', dur: 0.3, gen: (c, d) => osc(c, 'sine', 1000, 0, 0.25, 0.5, d) },
  { id: 'censor', name: 'Bip de censura', cat: 'Interface', dur: 0.8, gen: (c, d) => osc(c, 'sine', 1000, 0, 0.75, 0.5, d, null, 0.01) },
  { id: 'ding', name: 'Ding', cat: 'Interface', dur: 1.6, gen: (c, d) => { osc(c, 'sine', 1320, 0, 1.5, 0.5, d); osc(c, 'sine', 2640, 0, 0.8, 0.15, d); } },
  { id: 'notify', name: 'Notificação', cat: 'Interface', dur: 0.6, gen: (c, d) => { osc(c, 'sine', 880, 0, 0.2, 0.5, d); osc(c, 'sine', 1320, 0.15, 0.35, 0.5, d); } },
  { id: 'coin', name: 'Moeda', cat: 'Games', dur: 0.6, gen: (c, d) => { osc(c, 'square', 988, 0, 0.08, 0.25, d); osc(c, 'square', 1319, 0.08, 0.4, 0.25, d); } },
  { id: 'laser', name: 'Laser', cat: 'Games', dur: 0.4, gen: (c, d) => osc(c, 'square', 1600, 0, 0.3, 0.3, d, 180) },
  { id: 'jump', name: 'Pulo', cat: 'Games', dur: 0.35, gen: (c, d) => osc(c, 'square', 300, 0, 0.25, 0.25, d, 900) },
  { id: 'powerup', name: 'Power-up', cat: 'Games', dur: 0.8, gen: (c, d) => { [523, 659, 784, 1047].forEach((f, i) => osc(c, 'square', f, i * 0.09, 0.2, 0.2, d)); } },
  { id: 'error', name: 'Erro', cat: 'Games', dur: 0.6, gen: (c, d) => { osc(c, 'square', 220, 0, 0.18, 0.3, d); osc(c, 'square', 196, 0.22, 0.3, 0.3, d); } },
  { id: 'glitchsfx', name: 'Glitch', cat: 'Games', dur: 0.6, gen: (c, d) => { for (let i = 0; i < 10; i++) osc(c, 'square', 200 + ((i * 937) % 1800), i * 0.05, 0.04, 0.2, d); } },
  { id: 'shutter', name: 'Câmera', cat: 'Objetos', dur: 0.4, gen: (c, d) => { noise(c, 0, 0.05, 0.8, d, 'highpass', 2000); noise(c, 0.12, 0.08, 0.6, d, 'bandpass', 1500); } },
  { id: 'typing', name: 'Digitação', cat: 'Objetos', dur: 2.2, gen: (c, d) => { for (let i = 0; i < 16; i++) noise(c, i * 0.13 + ((i * 7) % 5) * 0.012, 0.02, 0.6, d, 'bandpass', 2500 + (i % 3) * 600, 2); } },
  { id: 'kick', name: 'Bumbo', cat: 'Batidas', dur: 0.5, gen: (c, d) => kick(c, 0, d) },
  { id: 'snare', name: 'Caixa', cat: 'Batidas', dur: 0.3, gen: (c, d) => snare(c, 0, d) },
  { id: 'clap', name: 'Palmas', cat: 'Batidas', dur: 0.3, gen: (c, d) => clap(c, 0, d) },
  { id: 'drumroll', name: 'Rufar de tambores', cat: 'Batidas', dur: 2.6, gen: (c, d) => { for (let i = 0; i < 40; i++) snare(c, i * 0.055, d, 0.12 + i * 0.006); kick(c, 2.25, d); noise(c, 2.25, 0.3, 0.3, d, 'highpass', 5000); } },
];

// Músicas (loops) — padrões determinísticos
export const MUSIC = [
  { id: 'lofi', name: 'Lo-fi Chill', cat: 'Músicas', dur: 24, gen: (c, d) => {
      const bpm = 80, beat = 60 / bpm;
      const chords = [[57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59]];
      for (let bar = 0; bar < 8; bar++) {
        const t0 = bar * beat * 4;
        if (t0 > 24) break;
        pad(c, chords[bar % 4], t0, beat * 4, 0.05, d, 'triangle', 1200);
        kick(c, t0, d, 0.7); kick(c, t0 + beat * 2.5, d, 0.5);
        snare(c, t0 + beat, d, 0.18); snare(c, t0 + beat * 3, d, 0.18);
        for (let i = 0; i < 8; i++) hat(c, t0 + i * beat / 2 + (i % 2 ? 0.03 : 0), d, 0.05);
        osc(c, 'sine', NOTE(chords[bar % 4][0] - 12), t0, beat * 3.5, 0.25, d, null, 0.02);
      }
    } },
  { id: 'synthwave', name: 'Synthwave', cat: 'Músicas', dur: 24, gen: (c, d) => {
      const bpm = 100, beat = 60 / bpm;
      const roots = [45, 41, 48, 43];
      for (let bar = 0; bar < 10; bar++) {
        const t0 = bar * beat * 4;
        if (t0 > 24) break;
        const r = roots[bar % 4];
        pad(c, [r + 12, r + 16, r + 19], t0, beat * 4, 0.04, d, 'sawtooth', 1500);
        for (let i = 0; i < 4; i++) kick(c, t0 + i * beat, d, 0.8);
        snare(c, t0 + beat, d, 0.25); snare(c, t0 + beat * 3, d, 0.25);
        for (let i = 0; i < 8; i++) { osc(c, 'sawtooth', NOTE(r - 12 + (i % 2 ? 12 : 0)), t0 + i * beat / 2, beat / 2.2, 0.12, d); hat(c, t0 + i * beat / 2 + beat / 4, d, 0.06); }
      }
    } },
  { id: 'ambient', name: 'Ambiente calmo', cat: 'Músicas', dur: 30, gen: (c, d) => {
      const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]];
      for (let i = 0; i < 5; i++) pad(c, chords[i % 4], i * 6, 6.5, 0.05, d, 'sine', 2500);
      for (let i = 0; i < 30; i++) osc(c, 'sine', NOTE([72, 76, 79, 83, 84][(i * 3) % 5]), i * 1 + 0.5, 1.4, 0.05, d, null, 0.05);
    } },
  { id: 'trap', name: 'Trap Beat', cat: 'Músicas', dur: 20, gen: (c, d) => {
      const bpm = 140, beat = 60 / bpm;
      const bass = [36, 36, 39, 34];
      for (let bar = 0; bar < 12; bar++) {
        const t0 = bar * beat * 4;
        if (t0 > 20) break;
        osc(c, 'sine', NOTE(bass[bar % 4]), t0, beat * 2.5, 0.9, d, NOTE(bass[bar % 4]) * 0.9, 0.005);
        kick(c, t0, d, 0.6); kick(c, t0 + beat * 2.75, d, 0.5);
        clap(c, t0 + beat * 2, d, 0.35);
        for (let i = 0; i < 16; i++) { if (bar % 2 && i > 11) { hat(c, t0 + i * beat / 4, d, 0.06); hat(c, t0 + i * beat / 4 + beat / 8, d, 0.05); } else if (i % 2 === 0) hat(c, t0 + i * beat / 4, d, 0.07); }
        pad(c, [bass[bar % 4] + 36, bass[bar % 4] + 39, bass[bar % 4] + 43], t0, beat * 4, 0.025, d, 'square', 900);
      }
    } },
  { id: 'upbeat', name: 'Pop Animado', cat: 'Músicas', dur: 20, gen: (c, d) => {
      const bpm = 120, beat = 60 / bpm;
      const chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
      const melody = [72, 74, 76, 79, 76, 74, 72, 67];
      for (let bar = 0; bar < 10; bar++) {
        const t0 = bar * beat * 4;
        if (t0 > 20) break;
        for (let i = 0; i < 4; i++) { kick(c, t0 + i * beat, d, 0.7); hat(c, t0 + i * beat + beat / 2, d, 0.08); }
        clap(c, t0 + beat, d, 0.3); clap(c, t0 + beat * 3, d, 0.3);
        for (let i = 0; i < 8; i++) chords[bar % 4].forEach((n) => osc(c, 'triangle', NOTE(n), t0 + i * beat / 2, beat / 3, 0.05, d));
        if (bar % 2) melody.forEach((n, i) => osc(c, 'square', NOTE(n), t0 + i * beat / 2, beat / 2.5, 0.06, d));
        osc(c, 'sine', NOTE(chords[bar % 4][0] - 24), t0, beat * 4, 0.3, d, null, 0.01);
      }
    } },
  { id: 'epic', name: 'Épico', cat: 'Músicas', dur: 24, gen: (c, d) => {
      const beat = 60 / 90;
      const chords = [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]];
      for (let bar = 0; bar < 7; bar++) {
        const t0 = bar * beat * 4;
        if (t0 > 24) break;
        pad(c, chords[bar % 4], t0, beat * 4, 0.06, d, 'sawtooth', 900 + bar * 200);
        osc(c, 'sine', NOTE(chords[bar % 4][0] - 12), t0, beat * 4, 0.4, d, null, 0.05);
        if (bar >= 2) { kick(c, t0, d, 1); kick(c, t0 + beat * 1.5, d, 0.7); kick(c, t0 + beat * 2, d, 1); snare(c, t0 + beat * 3, d, 0.3); }
        if (bar >= 4) for (let i = 0; i < 8; i++) osc(c, 'square', NOTE(chords[bar % 4][(i % 3) + 1] + 12), t0 + i * beat / 2, beat / 3, 0.04, d);
      }
    } },
];

export const AUDIO_LIBRARY = [...MUSIC, ...SFX];
const MAP = Object.fromEntries(AUDIO_LIBRARY.map((s) => [s.id, s]));

function toWav(buffer) {
  const ch = buffer.numberOfChannels, len = buffer.length;
  const out = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(out);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buffer.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([out], { type: 'audio/wav' });
}

const cache = new Map();
export async function renderSfx(id) {
  if (cache.has(id)) return cache.get(id);
  const def = MAP[id];
  if (!def) throw new Error('Som não encontrado: ' + id);
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * def.dur), SR);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 4;
  const master = ctx.createGain(); master.gain.value = 0.9;
  master.connect(comp).connect(ctx.destination);
  def.gen(ctx, master);
  const buf = await ctx.startRendering();
  const blob = toWav(buf);
  const res = { blob, url: URL.createObjectURL(blob), duration: def.dur, name: def.name };
  cache.set(id, res);
  return res;
}
export const audioDef = (id) => MAP[id];
