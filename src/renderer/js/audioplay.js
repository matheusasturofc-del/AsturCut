// Motor de áudio da prévia: toca o som dos clipes direto de buffers decodificados (Web Audio),
// no ponto exato da mídia. Sem a demora/imprecisão do player do navegador ao pular ou recomeçar
// (que fazia o som "voltar muito" ou repetir um trecho depois de um corte).
import { store, bus } from './store.js';
import { audioCtx, mediaUrl, makeVoiceChain, makePitchNode, isMobile } from './media.js';
import { busFor } from './audiomix.js';
import { clamp } from './util.js';

const MAX_SECS = (isMobile ? 12 : 25) * 60;   // mídias muito longas continuam no player do navegador
const MAX_BYTES = isMobile ? 4.5e8 : 1.6e9;   // limite de memória dos áudios decodificados
const bufs = new Map();            // mediaId -> { buf, bytes, used } | { pending: Promise } | { failed: true }
const nodes = new Map();           // chave -> nó tocando
let frame = 0;

function evict() {
  let total = 0;
  for (const e of bufs.values()) if (e.buf) total += e.bytes;
  if (total <= MAX_BYTES) return;
  const list = [...bufs.entries()].filter(([, e]) => e.buf).sort((a, b) => a[1].used - b[1].used);
  for (const [id, e] of list) { if (total <= MAX_BYTES) break; if ([...nodes.values()].some((n) => n.buf === e.buf)) continue; total -= e.bytes; bufs.delete(id); }
}

// começa a decodificar (sem travar); devolve o buffer se já estiver pronto
export function audioBuffer(m) {
  if (!m || (m.type !== 'audio' && m.type !== 'video') || m.missing) return null;
  if (m.duration && m.duration > MAX_SECS) return null;
  const e = bufs.get(m.id);
  if (e) { if (e.buf) { e.used = performance.now(); return e.buf; } return null; }
  const url = mediaUrl(m, true);
  if (!url) return null;
  const entry = { pending: true };
  bufs.set(m.id, entry);
  (async () => {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      const buf = await audioCtx().decodeAudioData(data);
      bufs.set(m.id, { buf, bytes: buf.length * buf.numberOfChannels * 4, used: performance.now() });
      evict();
    } catch { bufs.set(m.id, { failed: true }); }
  })();
  return null;
}
export function forgetAudio(mediaId) { bufs.delete(mediaId); }
bus.on('project', () => { stopAll(); bufs.clear(); });

function stopNode(n, fade = 0.012) {
  const ctx = audioCtx(), now = ctx.currentTime;
  try { n.gain.gain.cancelScheduledValues(now); n.gain.gain.setValueAtTime(n.gain.gain.value, now); n.gain.gain.linearRampToValueAtTime(0, now + fade); } catch {}
  try { n.src.stop(now + fade + 0.005); } catch {}
  setTimeout(() => { try { n.src.disconnect(); n.gain.disconnect(); if (n.pitch) n.pitch.disconnect(); if (n.voice && n.voice.stop) n.voice.stop(); } catch {} }, (fade + 0.05) * 1000);
}
export function stopAll() { for (const n of nodes.values()) stopNode(n); nodes.clear(); }

// chamado a cada quadro para cada clipe com som ativo: garante que está tocando no ponto certo
// pos = tempo na mídia (s), rate = velocidade, vol = volume já com fades/keyframes
export function playAt(key, buf, pos, rate, vol, trackId, voiceId, keepPitch = true) {
  const ctx = audioCtx(), now = ctx.currentTime;
  let n = nodes.get(key);
  if (n) { n.est += (now - n.last) * n.rate; n.last = now; }
  const vkey = voiceId || '';
  const needPitch = keepPitch && Math.abs(rate - 1) > 1e-3;
  if (n && (n.buf !== buf || n.vkey !== vkey || n.trackId !== trackId || (needPitch && !n.pitch) || Math.abs(n.est - pos) > 0.05)) { stopNode(n); nodes.delete(key); n = null; }
  if (!n) {
    if (pos < 0 || pos >= buf.duration - 0.01) return true;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.008); // sem estalo ao começar
    const voice = makeVoiceChain(vkey);
    if (voice === 'wait') return false; // efeito de tom ainda carregando: usa o player do navegador por enquanto
    let pitch = null;
    if (needPitch) { pitch = makePitchNode(); if (pitch === 'wait') return false; pitch.parameters.get('ratio').value = clamp(1 / rate, 0.25, 4); }
    let head = src;
    if (pitch) { src.connect(pitch); head = pitch; }
    if (voice) { head.connect(voice.input); voice.output.connect(gain); } else head.connect(gain);
    gain.connect(busFor(trackId).input);
    src.start(now, clamp(pos, 0, buf.duration));
    n = { src, gain, buf, est: pos, last: now, rate, vkey, trackId, voice, pitch, keepPitch };
    nodes.set(key, n);
  } else {
    if (Math.abs(n.rate - rate) > 1e-4) {
      n.src.playbackRate.setValueAtTime(rate, now); n.rate = rate;
      if (n.pitch) n.pitch.parameters.get('ratio').setValueAtTime(n.keepPitch ? clamp(1 / rate, 0.25, 4) : 1, now);
    }
    if (Math.abs(n.gain.gain.value - vol) > 1e-3) n.gain.gain.setTargetAtTime(vol, now, 0.012);
  }
  n.frame = frame;
  return true;
}
// fim do quadro: para o que não tocou neste quadro
export function endFrame() {
  for (const [k, n] of nodes) if (n.frame !== frame) { stopNode(n); nodes.delete(k); }
  frame++;
}
export const audioActive = () => nodes.size > 0;
