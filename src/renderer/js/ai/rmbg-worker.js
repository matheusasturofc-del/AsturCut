// Worker de recorte de fundo por IA — roda no computador, sem servidor.
// Com placa de vídeo (WebGPU): BiRefNet Lite (MIT, melhor nos detalhes, ex.: cabelo).
// Sem WebGPU: ormbg (Apache-2.0, ~44 MB), leve o bastante para qualquer PC ou celular.
// Recebe uma imagem (ImageBitmap) e devolve a máscara de transparência (0..255) no tamanho original.
const MODELS = {
  birefnet: { id: 'onnx-community/BiRefNet_lite-ONNX', mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
  ormbg: { id: 'onnx-community/ormbg-ONNX', mean: [0, 0, 0], std: [1, 1, 1] },
};
let T = null; // biblioteca Transformers.js
let model = null, cfg = null, loadedKey = '';

const post = (m) => self.postMessage(m);

async function lib(vendor) {
  if (T) return;
  const base = vendor || new URL('../../vendor/transformers/', import.meta.url).href;
  T = await import(base + 'transformers.min.js');
  T.env.allowLocalModels = false;
  T.env.useBrowserCache = true;
  T.env.backends.onnx.wasm.wasmPaths = base;
  try { if (typeof SharedArrayBuffer !== 'undefined') T.env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)); } catch {}
}
async function hasWebGPU() {
  try { return !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { return false; }
}
function plan(gpu, force) {
  if (force === 'ormbg') return [['ormbg', 'wasm', 'q8']];
  return gpu ? [['birefnet', 'webgpu', 'fp16'], ['ormbg', 'webgpu', 'fp16'], ['ormbg', 'wasm', 'q8']] : [['ormbg', 'wasm', 'q8']];
}
async function loadOne(name, device, dtype) {
  const key = name + device + dtype;
  if (model && loadedKey === key) return;
  if (model) { try { await model.dispose(); } catch {} model = null; }
  const files = new Map();
  model = await T.AutoModel.from_pretrained(MODELS[name].id, {
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
  cfg = MODELS[name]; loadedKey = key;
}

// pré-processamento: 1024×1024, escala 0..1 e normalização do modelo
function toTensor(bitmap) {
  const S = 1024;
  const cv = new OffscreenCanvas(S, S);
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.drawImage(bitmap, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S).data;
  const { mean, std } = cfg;
  const f = new Float32Array(3 * S * S);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    f[p] = (d[i] / 255 - mean[0]) / std[0];
    f[S * S + p] = (d[i + 1] / 255 - mean[1]) / std[1];
    f[2 * S * S + p] = (d[i + 2] / 255 - mean[2]) / std[2];
  }
  return new T.Tensor('float32', f, [1, 3, S, S]);
}

async function infer(bitmap) {
  const input = toTensor(bitmap);
  const names = model.sessions?.model?.inputNames || Object.values(model.sessions || {})[0]?.inputNames || ['input'];
  const out = await model({ [names[0]]: input });
  const t = out.output_image || out.output || out[Object.keys(out)[0]];
  return t;
}

self.onmessage = async (e) => {
  const { bitmap, vendor, force } = e.data;
  try {
    await lib(vendor);
    const gpu = await hasWebGPU();
    let mask = null, used = '', lastErr = null;
    for (const [name, device, dtype] of plan(gpu, force)) {
      try {
        post({ type: 'status', text: 'load', model: name, device });
        await loadOne(name, device, dtype);
        post({ type: 'status', text: 'run', model: name, device });
        mask = await infer(bitmap);
        used = name + '/' + device;
        break;
      } catch (err) { lastErr = err; model = null; loadedKey = ''; }
    }
    if (!mask) throw lastErr || new Error('modelo');
    const W = bitmap.width, H = bitmap.height;
    const dims = mask.dims, S = dims[dims.length - 1], R = dims[dims.length - 2];
    const m = mask.data;
    // a saída pode vir já com sigmoid ou não
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < m.length; i += 97) { const v = Number(m[i]); mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const needSig = mn < -0.01 || mx > 1.01;
    // normaliza (ISNet às vezes não vai exatamente de 0 a 1)
    const lo = needSig ? 0 : Math.min(0, mn), hi = needSig ? 1 : Math.max(1e-3, mx > 0.5 ? mx : 1);
    const small = new ImageData(S, R);
    for (let i = 0; i < S * R; i++) {
      let v = Number(m[i]);
      if (needSig) v = 1 / (1 + Math.exp(-v));
      v = (v - lo) / (hi - lo);
      small.data[i * 4] = small.data[i * 4 + 1] = small.data[i * 4 + 2] = 255;
      small.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
    // volta para o tamanho original com interpolação suave
    const c1 = new OffscreenCanvas(S, R); c1.getContext('2d').putImageData(small, 0, 0);
    const c2 = new OffscreenCanvas(W, H); const x2 = c2.getContext('2d', { willReadFrequently: true });
    x2.imageSmoothingQuality = 'high'; x2.drawImage(c1, 0, 0, W, H);
    const big = x2.getImageData(0, 0, W, H).data;
    const alpha = new Uint8Array(W * H);
    for (let i = 0; i < alpha.length; i++) alpha[i] = big[i * 4 + 3];
    bitmap.close?.();
    post({ type: 'done', alpha, width: W, height: H, model: used }, [alpha.buffer]);
  } catch (err) {
    post({ type: 'error', message: String(err && err.message || err) });
  }
};
