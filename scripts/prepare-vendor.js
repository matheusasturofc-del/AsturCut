// Copia as bibliotecas de IA que rodam 100% no computador (sem servidor):
// - Transformers.js + ONNX Runtime Web (legendas automáticas com Whisper)
// - MediaPipe Tasks Vision (remover fundo)
// para src/renderer/vendor (não vai para o git; é gerado no npm install).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'src', 'renderer', 'vendor');

const copies = [
  ['@huggingface/transformers/dist/transformers.min.js', 'transformers/transformers.min.js'],
  ['@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs', 'transformers/ort-wasm-simd-threaded.jsep.mjs'],
  ['@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm', 'transformers/ort-wasm-simd-threaded.jsep.wasm'],
  ['@mediapipe/tasks-vision/vision_bundle.mjs', 'mediapipe/vision_bundle.mjs'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', 'mediapipe/wasm/vision_wasm_internal.js'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', 'mediapipe/wasm/vision_wasm_internal.wasm'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js', 'mediapipe/wasm/vision_wasm_nosimd_internal.js'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm', 'mediapipe/wasm/vision_wasm_nosimd_internal.wasm'],
];

let n = 0;
for (const [from, to] of copies) {
  const src = path.join(nm, from);
  if (!fs.existsSync(src)) { console.log('[vendor] faltando', from); continue; }
  const dst = path.join(out, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  n++;
}
// tira a referência ao source map (o .map não é copiado)
for (const f of ['transformers/transformers.min.js', 'mediapipe/vision_bundle.mjs']) {
  const p = path.join(out, f);
  if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, '\n'));
}
console.log(`[vendor] ${n}/${copies.length} arquivos em src/renderer/vendor`);
