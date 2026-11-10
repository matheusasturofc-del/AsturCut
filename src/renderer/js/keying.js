// Remover fundo: chroma key (tela verde/azul) e recorte de pessoa com IA (MediaPipe, roda no computador)
// Processa o quadro do vídeo em WebGL e devolve um canvas com transparência para o compositor desenhar.
import { player } from './player.js';
import { lutData } from './color.js';

export const keyBypass = new Set(); // clipes sem recorte temporariamente (conta-gotas)

export const DEFAULT_CHROMA = { on: false, color: '#00ff00', similarity: 0.4, smoothness: 0.08, spill: 0.1 };
export const DEFAULT_CUTOUT = { on: false, edge: 0.5, feather: 0.15 };

export const HSL_BANDS = [['red', 'Vermelho', '#ff3b30', 0], ['orange', 'Laranja', '#ff9500', 30], ['yellow', 'Amarelo', '#ffd60a', 60], ['green', 'Verde', '#34c759', 120], ['aqua', 'Ciano', '#32d4de', 180], ['blue', 'Azul', '#0a84ff', 225], ['purple', 'Roxo', '#9b5de5', 275], ['magenta', 'Magenta', '#ff2d95', 320]];
export const hasHsl = (g) => !!(g && g.hsl && Object.values(g.hsl).some((v) => v && (v.h || v.s || v.l)));
export const needsKeying = (c) => !!((c.chroma && c.chroma.on) || (c.cutout && c.cutout.on) || (c.grade && (c.grade.lut || hasHsl(c.grade)))) && (c.type === 'video' || c.type === 'image');

// ---------- WebGL ----------
let gl = null, glCanvas = null, prog = null, texSrc = null, texMask = null, uni = {};
const lutTex = new Map();
const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = vec2((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform sampler2D mask;
uniform int useChroma; uniform int useMask;
uniform vec3 key; uniform float similarity; uniform float smoothness; uniform float spill;
uniform float edge; uniform float feather;
uniform sampler2D lut; uniform int useLut; uniform float lutSize; uniform float lutMix;
uniform int useHsl; uniform vec3 hslAdj[8]; uniform float hslCenter[8];
vec3 rgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
vec3 applyHsl(vec3 rgb) {
  vec3 h = rgb2hsv(rgb);
  float gate = smoothstep(0.04, 0.18, h.y);
  // interpolação entre as duas cores vizinhas (exata no centro de cada cor)
  vec3 adj = hslAdj[7]; vec3 nxt = hslAdj[0];
  float c0 = hslCenter[7] - 1.0, c1 = hslCenter[0];
  for (int i = 0; i < 8; i++) {
    float a0 = i == 0 ? hslCenter[7] - 1.0 : hslCenter[i - 1];
    float a1 = hslCenter[i];
    if (h.x >= a0 && h.x < a1) { c0 = a0; c1 = a1; adj = i == 0 ? hslAdj[7] : hslAdj[i - 1]; nxt = hslAdj[i]; }
  }
  if (h.x >= hslCenter[7]) { c0 = hslCenter[7]; c1 = hslCenter[0] + 1.0; adj = hslAdj[7]; nxt = hslAdj[0]; }
  float tt = clamp((h.x - c0) / max(1e-4, c1 - c0), 0.0, 1.0);
  tt = tt * tt * (3.0 - 2.0 * tt);
  vec3 dv = mix(adj, nxt, tt);
  float dh = dv.x, ds = dv.y, dl = dv.z;
  h.x = fract(h.x + dh * gate * 0.083);
  vec3 c = hsv2rgb(h);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(luma), c, 1.0 + ds * gate), 0.0, 1.0);
  c = clamp(c * (1.0 + dl * gate * 0.6), 0.0, 1.0);
  return c;
}
vec3 lutLookup(vec3 c) {
  float n = lutSize;
  vec3 s = clamp(c, 0.0, 1.0) * (n - 1.0);
  float b0 = floor(s.b), b1 = min(b0 + 1.0, n - 1.0), fb = s.b - b0;
  vec2 uv0 = vec2((s.r + b0 * n + 0.5) / (n * n), (s.g + 0.5) / n);
  vec2 uv1 = vec2((s.r + b1 * n + 0.5) / (n * n), (s.g + 0.5) / n);
  return mix(texture(lut, uv0).rgb, texture(lut, uv1).rgb, fb);
}
vec2 cbcr(vec3 c) { return vec2(-0.1146 * c.r - 0.3854 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4542 * c.g - 0.0458 * c.b); }
void main() {
  vec4 c = texture(src, uv);
  float a = 1.0;
  vec3 rgb = c.rgb;
  if (useChroma == 1) {
    float d = distance(cbcr(rgb), cbcr(key));
    float base = d - similarity;
    a *= pow(clamp(base / max(0.002, smoothness), 0.0, 1.0), 1.5);
    float sp = pow(clamp(base / max(0.002, spill), 0.0, 1.0), 1.5);
    float lum = clamp(dot(rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    rgb = mix(vec3(lum), rgb, sp);
  }
  if (useHsl == 1) rgb = applyHsl(rgb);
  if (useLut == 1) rgb = mix(rgb, lutLookup(rgb), lutMix);
  if (useMask == 1) {
    float m = texture(mask, uv).r;
    a *= smoothstep(edge - feather, edge + feather, m);
  }
  o = vec4(rgb * a, a * c.a);
}`;

function initGL() {
  if (gl) return true;
  glCanvas = document.createElement('canvas');
  gl = glCanvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
  if (!gl) return false;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['src', 'mask', 'useChroma', 'useMask', 'key', 'similarity', 'smoothness', 'spill', 'edge', 'feather', 'lut', 'useLut', 'lutSize', 'lutMix', 'useHsl']) uni[n] = gl.getUniformLocation(prog, n);
  uni.hslAdj = gl.getUniformLocation(prog, 'hslAdj'); uni.hslCenter = gl.getUniformLocation(prog, 'hslCenter');
  const mk = (unit) => { const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return tx; };
  texSrc = mk(0); texMask = mk(1);
  gl.uniform1i(uni.src, 0); gl.uniform1i(uni.mask, 1); gl.uniform1i(uni.lut, 2);
  return true;
}

const hexRgb = (h) => { const n = parseInt((h || '#00ff00').slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// ---------- IA (MediaPipe) ----------
let seg = null, segLoading = null, segError = null;
const maskCache = new Map(); // clipId -> { key, data, w, h }

export function cutoutState() { return seg ? 'ready' : segError ? 'error' : segLoading ? 'loading' : 'idle'; }

export function ensureSegmenter() {
  if (seg) return Promise.resolve(seg);
  if (segLoading) return segLoading;
  segLoading = (async () => {
    const base = window.ASTUR_VENDOR?.mediapipe || new URL('../vendor/mediapipe/', import.meta.url).href;
    const { FilesetResolver, ImageSegmenter } = await import(base + 'vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(base + 'wasm');
    const model = new URL('../assets/models/selfie_segmenter.tflite', import.meta.url).href;
    const mk = (delegate) => ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    });
    try { seg = await mk('GPU'); } catch { seg = await mk('CPU'); }
    player.needsRender = true;
    return seg;
  })().catch((e) => { segError = e; console.error('remover fundo:', e); throw e; });
  return segLoading;
}

let lastTs = 0;
function maskFor(clip, src, w, h) {
  if (!seg) { ensureSegmenter().catch(() => {}); return null; }
  const t = src.currentTime != null ? src.currentTime : 0;
  const key = clip.mediaId + ':' + t.toFixed(3) + ':' + w + 'x' + h;
  const cached = maskCache.get(clip.id);
  if (cached && cached.key === key) return cached;
  let out = null;
  try {
    const ts = Math.max(lastTs + 1, performance.now());
    lastTs = ts;
    seg.segmentForVideo(src, ts, (res) => {
      const m = res.confidenceMasks && res.confidenceMasks[0];
      if (!m) return;
      const f = m.getAsFloat32Array();
      const data = new Uint8Array(f.length);
      for (let i = 0; i < f.length; i++) data[i] = f[i] * 255;
      out = { key, data, w: m.width, h: m.height };
    });
  } catch (e) { console.error(e); }
  if (out) maskCache.set(clip.id, out);
  return out || cached || null;
}

// devolve um canvas com o recorte aplicado (ou null se não precisar/conseguir)
export function keyFrame(clip, src, mw, mh) {
  if (!needsKeying(clip) || keyBypass.has(clip.id) || !src) return null;
  if (!initGL()) return null;
  const k = Math.min(1, 1920 / Math.max(mw, mh));
  const w = Math.max(2, Math.round(mw * k)), h = Math.max(2, Math.round(mh * k));
  if (glCanvas.width !== w || glCanvas.height !== h) { glCanvas.width = w; glCanvas.height = h; }
  gl.viewport(0, 0, w, h);
  const ch = clip.chroma && clip.chroma.on ? { ...DEFAULT_CHROMA, ...clip.chroma } : null;
  const cu = clip.cutout && clip.cutout.on ? { ...DEFAULT_CUTOUT, ...clip.cutout } : null;
  let mask = null;
  if (cu) {
    mask = maskFor(clip, src, w, h);
    if (!mask) return 'wait';
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texSrc);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch { return null; }
  gl.uniform1i(uni.useChroma, ch ? 1 : 0);
  gl.uniform1i(uni.useMask, mask ? 1 : 0);
  if (ch) {
    gl.uniform3fv(uni.key, hexRgb(ch.color));
    gl.uniform1f(uni.similarity, ch.similarity);
    gl.uniform1f(uni.smoothness, ch.smoothness);
    gl.uniform1f(uni.spill, ch.spill);
  }
  if (mask) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texMask);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mask.w, mask.h, 0, gl.RED, gl.UNSIGNED_BYTE, mask.data);
    gl.uniform1f(uni.edge, cu.edge);
    gl.uniform1f(uni.feather, Math.max(0.01, cu.feather));
  }
  const hs = hasHsl(clip.grade);
  gl.uniform1i(uni.useHsl, hs ? 1 : 0);
  if (hs) {
    const adj = new Float32Array(24), cen = new Float32Array(8);
    HSL_BANDS.forEach(([id, , , hue], i) => { const v = clip.grade.hsl[id] || {}; adj[i * 3] = (v.h || 0) / 100; adj[i * 3 + 1] = (v.s || 0) / 100; adj[i * 3 + 2] = (v.l || 0) / 100; cen[i] = hue / 360; });
    gl.uniform3fv(uni.hslAdj, adj); gl.uniform1fv(uni.hslCenter, cen);
  }
  const lid = clip.grade && clip.grade.lut;
  const L = lid ? lutData(lid) : null;
  gl.uniform1i(uni.useLut, L ? 1 : 0);
  if (L) {
    gl.activeTexture(gl.TEXTURE2);
    let tx = lutTex.get(lid);
    if (!tx) {
      tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      // .cube: r varia mais rápido, depois g, depois b -> textura (N*N) x N com as fatias de b lado a lado
      const n = L.size, out = new Uint8Array(n * n * n * 3);
      for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
        const si = ((b * n + g) * n + r) * 3, di = (g * n * n + b * n + r) * 3;
        out[di] = L.data[si]; out[di + 1] = L.data[si + 1]; out[di + 2] = L.data[si + 2];
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, n * n, n, 0, gl.RGB, gl.UNSIGNED_BYTE, out);
      lutTex.set(lid, tx);
    } else gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.uniform1f(uni.lutSize, L.size);
    gl.uniform1f(uni.lutMix, clip.grade.lutMix ?? 1);
  }
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return glCanvas;
}

// antes de exportar: garante que a IA está carregada
export async function prepareKeying(clips) {
  if (clips.some((c) => c.cutout && c.cutout.on)) await ensureSegmenter();
}

// centro da pessoa no quadro (para o reenquadramento automático): { x, y, conf } em 0..1
export async function personCenter(video) {
  await ensureSegmenter();
  let out = null;
  const ts = Math.max(lastTs + 1, performance.now());
  lastTs = ts;
  seg.segmentForVideo(video, ts, (res) => {
    const m = res.confidenceMasks && res.confidenceMasks[0];
    if (!m) return;
    const f = m.getAsFloat32Array(), w = m.width, h = m.height;
    let sx = 0, sy = 0, s = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const v = f[y * w + x]; if (v > 0.5) { sx += x * v; sy += y * v; s += v; } }
    out = s > 0 ? { x: sx / s / w, y: sy / s / h, conf: Math.min(1, s / ((w * h) / 4) * 4) } : { x: 0.5, y: 0.5, conf: 0 };
  });
  return out || { x: 0.5, y: 0.5, conf: 0 };
}
