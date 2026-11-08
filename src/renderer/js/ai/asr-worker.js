// Worker de reconhecimento de fala (Whisper via Transformers.js) — roda no computador, sem servidor.
// Recebe áudio mono 16 kHz, divide em trechos de ~25 s nos pontos mais silenciosos e devolve as palavras com tempo.
import { pipeline, env } from '../../vendor/transformers/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('../../vendor/transformers/', import.meta.url).href;
try {
  if (typeof SharedArrayBuffer !== 'undefined') env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
} catch {}

const SR = 16000;
let asr = null, loadedKey = '';

const post = (m) => self.postMessage(m);

async function hasWebGPU() {
  try { return !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { return false; }
}

async function load(model, device) {
  const key = model + '|' + device;
  if (asr && loadedKey === key) return;
  if (asr) { try { await asr.dispose(); } catch {} asr = null; }
  const dtype = device === 'webgpu'
    ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
    : { encoder_model: model.includes('small') ? 'q8' : 'fp32', decoder_model_merged: 'q8' };
  const files = new Map();
  asr = await pipeline('automatic-speech-recognition', model, {
    device, dtype,
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        files.set(p.file, [p.loaded, p.total]);
        let a = 0, b = 0;
        for (const [l, t] of files.values()) { a += l; b += t; }
        post({ type: 'download', loaded: a, total: b });
      }
    },
  });
  loadedKey = key;
}

const rms = (a, s, e) => { let q = 0; for (let i = s; i < e; i++) q += a[i] * a[i]; return Math.sqrt(q / Math.max(1, e - s)); };

// pontos de corte: a cada ~25 s, no trecho de 100 ms mais silencioso entre 18 s e 28 s
function cutPoints(audio) {
  const cuts = [0];
  let pos = 0;
  while (audio.length - pos > 28 * SR) {
    let best = pos + 25 * SR, bestV = Infinity;
    for (let s = pos + 18 * SR; s < pos + 28 * SR; s += SR / 20) {
      const v = rms(audio, s, s + SR / 10);
      if (v < bestV) { bestV = v; best = s + SR / 20; }
    }
    cuts.push(best);
    pos = best;
  }
  cuts.push(audio.length);
  return cuts;
}

self.onmessage = async (e) => {
  const { audio, model, language } = e.data;
  try {
    let device = e.data.device || 'auto';
    if (device === 'auto') device = (await hasWebGPU()) ? 'webgpu' : 'wasm';
    post({ type: 'status', stage: 'load', device });
    try {
      await load(model, device);
    } catch (err) {
      if (device !== 'webgpu') throw err;
      device = 'wasm';
      post({ type: 'status', stage: 'load', device });
      await load(model, device);
    }
    const cuts = cutPoints(audio);
    const n = cuts.length - 1;
    const peak = rms(audio, 0, audio.length);
    for (let i = 0; i < n; i++) {
      const s = cuts[i], end = cuts[i + 1];
      post({ type: 'progress', i, n });
      const part = audio.subarray(s, end);
      // trecho praticamente mudo: o Whisper costuma "inventar" frases — pula
      if (rms(part, 0, part.length) < Math.max(0.002, peak * 0.05)) continue;
      const opts = { task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30 };
      if (language) opts.language = language;
      let r;
      try { r = await asr(part, opts); } catch (err) {
        if (device === 'webgpu') { device = 'wasm'; await load(model, device); r = await asr(part, opts); } else throw err;
      }
      const off = s / SR;
      const words = (r.chunks || []).map((c) => ({
        text: c.text,
        start: off + (c.timestamp?.[0] ?? 0),
        end: off + (c.timestamp?.[1] ?? (c.timestamp?.[0] ?? 0) + 0.3),
      }));
      post({ type: 'segment', i, n, words });
    }
    post({ type: 'done', device });
  } catch (err) {
    post({ type: 'error', message: String((err && err.message) || err) });
  }
};
