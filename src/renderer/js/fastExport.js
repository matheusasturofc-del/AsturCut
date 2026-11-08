// Exportação rápida: áudio mixado offline (sem tempo real) + vídeo codificado com WebCodecs (H.264)
// - projetos sem vídeo: renderiza o mais rápido possível
// - projetos com vídeo: reproduz acelerado (2x) e captura cada quadro
import { store } from './store.js';
import { clamp } from './util.js';
import { renderFrame } from './compositor.js';
import { player, syncMedia } from './player.js';
import { allPlayers, masterGain, mediaUrl, api } from './media.js';
import { valueAt } from './keyframes.js';
import { trackAudio, GATE_CODE } from './audiomix.js';

const SR = 48000;
const decoded = new Map(); // mediaId -> AudioBuffer | null

export function fastSupported() {
  return typeof VideoEncoder !== 'undefined' && !!(api && api.fxBegin);
}

// libera a memória dos áudios decodificados
export function clearDecoded() { decoded.clear(); }

export async function decodeMedia(m) {
  if (decoded.has(m.id)) return decoded.get(m.id);
  let buf = null;
  try {
    const data = await (await fetch(mediaUrl(m))).arrayBuffer();
    buf = await new OfflineAudioContext(2, 1, SR).decodeAudioData(data);
  } catch { buf = null; }
  decoded.set(m.id, buf);
  return buf;
}

function makeBus(ctx, tr, gateOk) {
  const a = trackAudio(tr);
  const n = {};
  n.input = ctx.createGain();
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = a.eq.on ? clamp(a.eq.hp, 10, 2000) : 10;
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 150; low.gain.value = a.eq.on ? a.eq.low : 0;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = clamp(a.eq.midF, 80, 12000); mid.gain.value = a.eq.on ? a.eq.mid : 0;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 6000; high.gain.value = a.eq.on ? a.eq.high : 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(ctx.sampleRate / 2, a.eq.on ? clamp(a.eq.lp, 1000, 22000) : 22000);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = a.comp.on ? a.comp.threshold : 0; comp.ratio.value = a.comp.on ? a.comp.ratio : 1;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = a.limiter.on ? a.limiter.ceiling : 0; lim.ratio.value = a.limiter.on ? 20 : 1; lim.knee.value = 0; lim.attack.value = 0.002; lim.release.value = 0.08;
  const pan = ctx.createStereoPanner(); pan.pan.value = a.pan;
  const fader = ctx.createGain(); fader.gain.value = a.volume;
  let chain = n.input.connect(hp).connect(low).connect(mid).connect(high).connect(lp).connect(comp).connect(lim);
  if (gateOk && a.denoise.on) {
    try {
      const g = new AudioWorkletNode(ctx, 'astur-gate', { outputChannelCount: [2] });
      g.parameters.get('amount').value = a.denoise.amount / 100;
      chain = chain.connect(g);
    } catch {}
  }
  chain.connect(pan).connect(fader);
  n.output = fader;
  return n;
}

// mixa todo o áudio do intervalo [start, start+dur]
export async function renderAudioOffline(start, dur, onProgress, { sampleRate = SR, channels = 2, filter = null } = {}) {
  const len = Math.max(1, Math.ceil(dur * sampleRate));
  const ctx = new OfflineAudioContext(channels, len, sampleRate);
  let gateOk = false;
  try { await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([GATE_CODE], { type: 'application/javascript' }))); gateOk = true; } catch {}
  const master = ctx.createGain();
  master.gain.value = store.p.masterVolume ?? 1;
  master.connect(ctx.destination);
  const anySolo = store.p.tracks.some((t) => t.solo);
  const buses = new Map();
  const clips = store.p.clips.filter((c) => (c.type === 'audio' || c.type === 'video') && c.start < start + dur && c.start + c.duration > start && (!filter || filter(c)));
  let i = 0;
  for (const c of clips) {
    i++;
    onProgress && onProgress(i / Math.max(1, clips.length));
    const tr = store.track(c.trackId);
    if (!tr || tr.muted || (anySolo && !tr.solo)) continue;
    if (c.type === 'video' && (c.audioDetached || (c.volume ?? 1) === 0) && !(c.kf && c.kf.volume)) continue;
    const m = store.media(c.mediaId);
    if (!m) continue;
    const buf = await decodeMedia(m);
    if (!buf) continue;
    if (!buses.has(tr.id)) { const b = makeBus(ctx, tr, gateOk); b.output.connect(master); buses.set(tr.id, b); }
    const spd = c.speed || 1;
    const t0 = Math.max(start, c.start), t1 = Math.min(start + dur, c.start + c.duration);
    if (t1 <= t0) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = spd;
    const g = ctx.createGain();
    src.connect(g).connect(buses.get(tr.id).input);
    const when = t0 - start;
    const srcOffset = (c.in || 0) + (t0 - c.start) * spd;
    if (srcOffset >= buf.duration) continue;
    src.start(when, srcOffset, (t1 - t0) * spd);
    // volume (keyframes + fades) amostrado a cada 20 ms
    const steps = Math.max(2, Math.ceil((t1 - t0) * 50));
    const curve = new Float32Array(steps);
    for (let k = 0; k < steps; k++) {
      const lt = (t0 - c.start) + (k / (steps - 1)) * (t1 - t0);
      let v = valueAt(c, 'volume', clamp(lt, 0, c.duration));
      if (c.fadeIn > 0) v *= clamp(lt / c.fadeIn, 0, 1);
      if (c.fadeOut > 0) v *= clamp((c.duration - lt) / c.fadeOut, 0, 1);
      curve[k] = v;
    }
    try { g.gain.setValueCurveAtTime(curve, when, Math.max(0.01, t1 - t0)); } catch { g.gain.value = curve[0]; }
  }
  return ctx.startRendering();
}

export function wavFromBuffer(b) {
  const ch = 2, n = b.length;
  const out = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(out);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, b.sampleRate, true);
  v.setUint32(28, b.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
    v.setInt16(o, l < 0 ? l * 0x8000 : l * 0x7fff, true); v.setInt16(o + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    o += 4;
  }
  return out;
}

function avcCodec(W, H) {
  const px = W * H;
  if (px > 1920 * 1088) return 'avc1.640033'; // High 5.1 (até 4K)
  if (px > 1280 * 720) return 'avc1.64002A';  // High 4.2 (1080p60)
  return 'avc1.64001F';                       // High 3.1
}

// tempo da linha do tempo segundo o vídeo que está tocando agora
function videoClock(t) {
  for (const c of store.p.clips) {
    if (c.type !== 'video' || t < c.start || t >= c.start + c.duration) continue;
    const p = allPlayers().get(c.id);
    if (!p || p.el.paused || p.seeking || p.el.readyState < 2) continue;
    return c.start + (p.el.currentTime - (c.in || 0)) / (c.speed || 1);
  }
  return null;
}

// o vídeo tem clipes de vídeo dentro do intervalo?
const hasVideoIn = (start, dur) => store.p.clips.some((c) => c.type === 'video' && c.start < start + dur && c.start + c.duration > start && !store.track(c.trackId)?.hidden);

/**
 * Exporta rápido. ui: { setP(p, text), cancelled(), preview(canvas) }
 * Retorna o caminho do arquivo final (desktop).
 */
export async function fastExport(o, outPath, ui, tr) {
  const start = o.start || 0, dur = o.duration, fps = o.fps;
  const N = Math.max(1, Math.round(dur * fps));
  const audioOnly = o.format === 'mp3';
  await api.fxBegin();

  // 1) áudio offline
  ui.setP(0.02, tr('Mixando o áudio...'));
  const audio = await renderAudioOffline(start, dur, (p) => ui.setP(0.02 + p * 0.1));
  await api.fxAudio(wavFromBuffer(audio));
  if (ui.cancelled()) { await api.fxEnd({ cancel: true }); return null; }

  if (!audioOnly) {
    // 2) vídeo
    const canvas = document.createElement('canvas');
    canvas.width = o.W; canvas.height = o.H;
    const ctx = canvas.getContext('2d', { alpha: false });
    const config = { codec: avcCodec(o.W, o.H), width: o.W, height: o.H, bitrate: o.bitrate, framerate: fps, avc: { format: 'annexb' }, latencyMode: 'quality' };
    const sup = await VideoEncoder.isConfigSupported({ ...config, hardwareAcceleration: 'prefer-hardware' }).catch(() => ({ supported: false }));
    if (sup.supported) config.hardwareAcceleration = 'prefer-hardware';
    let pending = Promise.resolve();
    let encErr = null;
    const enc = new VideoEncoder({
      output: (chunk) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); pending = pending.then(() => api.fxVideo(b.buffer)); },
      error: (e) => { encErr = e; },
    });
    enc.configure(config);
    const gop = fps * 2;
    let encoded = 0;
    const encodeUpTo = async (idx) => {
      while (encoded <= idx && encoded < N) {
        const frame = new VideoFrame(canvas, { timestamp: Math.round(encoded * 1e6 / fps), duration: Math.round(1e6 / fps) });
        enc.encode(frame, { keyFrame: encoded % gop === 0 });
        frame.close();
        encoded++;
        if (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1));
      }
    };
    const prevGain = masterGain().gain.value;
    masterGain().gain.value = 0; // o áudio já foi mixado offline
    player.exporting = true;
    try {
      if (!hasVideoIn(start, dur)) {
        // sem vídeo: o mais rápido possível
        for (let f = 0; f < N; f++) {
          if (ui.cancelled() || encErr) break;
          renderFrame(ctx, start + f / fps);
          await encodeUpTo(f);
          if (f % 10 === 0) { ui.preview(canvas); ui.setP(0.12 + (f / N) * 0.8, tr('Renderizando {a} / {b}', { a: f, b: N })); await new Promise((r) => setTimeout(r, 0)); }
        }
      } else {
        // com vídeo: reprodução acelerada
        const RATE = 2;
        player.rateMul = RATE;
        syncMedia(start, false);
        await new Promise((r) => setTimeout(r, 800));
        let tt = 0, last = performance.now();
        await new Promise((resolve) => {
          const tick = async () => {
            if (ui.cancelled() || encErr) return resolve();
            const now = performance.now();
            tt += Math.min(0.1, (now - last) / 1000) * RATE;
            last = now;
            // usa o próprio vídeo como relógio (evita dessincronizar do áudio mixado)
            const vt = videoClock(start + tt);
            if (vt != null && Math.abs(vt - (start + tt)) < 0.5) tt = Math.max(0, vt - start);
            if (tt >= dur) { renderFrame(ctx, start + dur - 0.001); await encodeUpTo(N - 1); return resolve(); }
            syncMedia(start + tt, true);
            renderFrame(ctx, start + tt);
            await encodeUpTo(Math.floor(tt * fps));
            ui.preview(canvas);
            ui.setP(0.12 + (tt / dur) * 0.8, tr('Renderizando {a} / {b}', { a: Math.min(N, encoded), b: N }));
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }
      await enc.flush().catch(() => {});
      await pending;
    } finally {
      enc.close?.();
      player.rateMul = 1;
      player.exporting = false;
      for (const p of allPlayers().values()) p.el.pause();
      masterGain().gain.value = prevGain;
    }
    if (encErr) { await api.fxEnd({ cancel: true }); throw encErr; }
  }
  if (ui.cancelled()) { await api.fxEnd({ cancel: true }); return null; }
  ui.setP(0.93, tr('Finalizando o arquivo...'));
  return api.fxEnd({ outPath, format: o.format, fps, quality: o.quality, duration: dur });
}
