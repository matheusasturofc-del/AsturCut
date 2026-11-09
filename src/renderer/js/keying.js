// Remover fundo: chroma key (tela verde/azul) e recorte de pessoa com IA (MediaPipe, roda no computador)
// Processa o quadro do vídeo em WebGL e devolve um canvas com transparência para o compositor desenhar.
import { player } from './player.js';

export const keyBypass = new Set(); // clipes sem recorte temporariamente (conta-gotas)

export const DEFAULT_CHROMA = { on: false, color: '#00ff00', similarity: 0.4, smoothness: 0.08, spill: 0.1 };
export const DEFAULT_CUTOUT = { on: false, edge: 0.5, feather: 0.15 };

export const needsKeying = (c) => !!((c.chroma && c.chroma.on) || (c.cutout && c.cutout.on)) && (c.type === 'video' || c.type === 'image');

// ---------- WebGL ----------
let gl = null, glCanvas = null, prog = null, texSrc = null, texMask = null, uni = {};
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
  for (const n of ['src', 'mask', 'useChroma', 'useMask', 'key', 'similarity', 'smoothness', 'spill', 'edge', 'feather']) uni[n] = gl.getUniformLocation(prog, n);
  const mk = (unit) => { const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return tx; };
  texSrc = mk(0); texMask = mk(1);
  gl.uniform1i(uni.src, 0); gl.uniform1i(uni.mask, 1);
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
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return glCanvas;
}

// antes de exportar: garante que a IA está carregada
export async function prepareKeying(clips) {
  if (clips.some((c) => c.cutout && c.cutout.on)) await ensureSegmenter();
}
