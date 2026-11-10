// Biblioteca de EFEITOS (todos grátis, renderizados em tempo real no canvas)
import { rand, clamp } from '../util.js';

// ---- Canvases auxiliares reutilizáveis ----
const scratch = [];
export function getScratch(i, W, H) {
  let c = scratch[i];
  if (!c) { c = document.createElement('canvas'); scratch[i] = c; }
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, W, H);
  return c;
}

let noiseCanvas = null;
function noise() {
  if (noiseCanvas) return noiseCanvas;
  noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = noiseCanvas.height = 256;
  const ctx = noiseCanvas.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return noiseCanvas;
}

function reset(ctx) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.setTransform(1, 0, 0, 1, 0, 0); }

// desenha algo recortado pelo alfa da camada (para não "vazar" fora do objeto)
function clipped(ctx, W, H, draw, mode = 'source-over', alpha = 1) {
  const s = getScratch(5, W, H);
  const sc = s.getContext('2d');
  draw(sc);
  sc.globalCompositeOperation = 'destination-in';
  sc.drawImage(ctx.canvas, 0, 0);
  reset(ctx);
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.drawImage(s, 0, 0);
  reset(ctx);
}

export function vignette(ctx, W, H, k) {
  if (k <= 0) return;
  reset(ctx);
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${clamp(k, 0, 1) * 0.95})`);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  reset(ctx);
}

// chuvisco de TV (canal fora do ar): ruído preto e branco, linhas e faixa rolando
let staticCv = null;
function tvStatic(ctx, W, H, t, k) {
  const w = Math.max(80, Math.round(W / 3)), h = Math.max(45, Math.round(H / 3));
  if (!staticCv) staticCv = document.createElement('canvas');
  if (staticCv.width !== w || staticCv.height !== h) { staticCv.width = w; staticCv.height = h; }
  const sx = staticCv.getContext('2d');
  const img = sx.createImageData(w, h), d = img.data;
  let seed = ((Math.floor(t * 30) + 1) * 2654435761) >>> 0;
  const roll = (t * 0.35) % 1;
  for (let y = 0; y < h; y++) {
    const yy = y / h;
    const band = 0.72 + 0.28 * Math.sin((yy * 9 + t * 4) * Math.PI);
    const bright = Math.abs(yy - roll) < 0.04 ? 1.35 : 1;
    for (let x = 0; x < w; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const v = Math.min(255, (seed >>> 24) * band * bright);
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
  }
  sx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = clamp(k, 0, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staticCv, 0, 0, W, H);
  ctx.globalAlpha = clamp(k, 0, 1) * 0.28; ctx.fillStyle = '#000';
  const step = Math.max(2, Math.round(H / 270));
  for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
  ctx.restore();
}

function grain(ctx, W, H, k, t) {
  const n = noise();
  clipped(ctx, W, H, (sc) => {
    const pat = sc.createPattern(n, 'repeat');
    sc.translate(-Math.floor(rand(Math.floor(t * 24)) * 256), -Math.floor(rand(Math.floor(t * 24) + 7) * 256));
    sc.fillStyle = pat;
    sc.fillRect(0, 0, W + 256, H + 256);
    sc.setTransform(1, 0, 0, 1, 0, 0);
  }, 'overlay', clamp(k, 0, 1) * 0.55);
}

function scanlines(ctx, W, H, k, S) {
  reset(ctx);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(0,0,0,${0.4 * k})`;
  const step = Math.max(2, Math.round(4 * S));
  for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, Math.max(1, step / 2));
  reset(ctx);
}

function channel(src, W, H, idx, color) {
  const c = getScratch(idx, W, H);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = color;
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(src, 0, 0);
  return c;
}

export function rgbSplit(ctx, W, H, off, offY = 0) {
  if (Math.abs(off) < 0.5 && Math.abs(offY) < 0.5) return;
  const src = ctx.canvas;
  const r = channel(src, W, H, 1, '#ff0000');
  const g = channel(src, W, H, 2, '#00ff00');
  const b = channel(src, W, H, 3, '#0000ff');
  reset(ctx);
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(r, -off, -offY);
  ctx.drawImage(g, 0, 0);
  ctx.drawImage(b, off, offY);
  reset(ctx);
}

function slices(ctx, W, H, k, t, S) {
  const s = getScratch(4, W, H);
  s.getContext('2d').drawImage(ctx.canvas, 0, 0);
  reset(ctx);
  const seed = Math.floor(t * 15);
  const n = 3 + Math.floor(rand(seed) * 6);
  for (let i = 0; i < n; i++) {
    const y = rand(seed * 3 + i) * H;
    const h = (0.02 + rand(seed * 5 + i) * 0.1) * H;
    const dx = (rand(seed * 7 + i) - 0.5) * 120 * k * S;
    ctx.clearRect(0, y, W, h);
    ctx.drawImage(s, 0, y, W, h, dx, y, W, h);
  }
}

function pixelate(ctx, W, H, block) {
  block = Math.max(2, Math.round(block));
  const w = Math.max(1, Math.ceil(W / block)), h = Math.max(1, Math.ceil(H / block));
  const s = getScratch(4, w, h);
  const sc = s.getContext('2d');
  sc.drawImage(ctx.canvas, 0, 0, w, h);
  reset(ctx);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s, 0, 0, w, h, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
}

function glow(ctx, W, H, k, S, extra = '') {
  const s = getScratch(4, W, H);
  const sc = s.getContext('2d');
  sc.filter = `blur(${Math.max(1, 24 * S * k)}px) brightness(1.3) ${extra}`;
  sc.drawImage(ctx.canvas, 0, 0);
  sc.filter = 'none';
  reset(ctx);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(k, 0, 1);
  ctx.drawImage(s, 0, 0);
  reset(ctx);
}

function motionBlur(ctx, W, H, k, S) {
  const s = getScratch(4, W, H);
  s.getContext('2d').drawImage(ctx.canvas, 0, 0);
  reset(ctx);
  const n = 6;
  const d = 30 * k * S;
  for (let i = 1; i <= n; i++) {
    ctx.globalAlpha = 0.18;
    ctx.drawImage(s, (i / n - 0.5) * d * 2, 0);
  }
  reset(ctx);
}

function particles(ctx, W, H, t, k, kind, S) {
  reset(ctx);
  const count = Math.round((kind === 'rain' ? 180 : kind === 'bokeh' ? 25 : 90) * (0.3 + k));
  for (let i = 0; i < count; i++) {
    const r1 = rand(i + 1), r2 = rand(i * 2 + 3), r3 = rand(i * 3 + 5);
    if (kind === 'rain') {
      const sp = (0.9 + r3) * H * 1.6;
      const x = (r1 * W + t * sp * 0.15) % W;
      const y = (r2 * H + t * sp) % (H + 60) - 30;
      ctx.strokeStyle = `rgba(200,220,255,${0.25 + r3 * 0.35})`;
      ctx.lineWidth = Math.max(1, 1.5 * S);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 * S, y + 28 * S); ctx.stroke();
    } else if (kind === 'snow') {
      const sp = (0.15 + r3 * 0.25) * H;
      const x = (r1 * W + Math.sin(t * (0.5 + r2) + i) * 30 * S) % W;
      const y = (r2 * H + t * sp) % (H + 20) - 10;
      ctx.fillStyle = `rgba(255,255,255,${0.5 + r3 * 0.5})`;
      ctx.beginPath(); ctx.arc(x, y, (1.5 + r3 * 3.5) * S, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'sparkle') {
      const x = r1 * W, y = r2 * H;
      const tw = Math.max(0, Math.sin(t * (2 + r3 * 4) + i * 1.7));
      const size = (4 + r3 * 12) * S * tw;
      if (size < 0.5) continue;
      ctx.fillStyle = `rgba(255,250,220,${tw})`;
      ctx.beginPath();
      ctx.moveTo(x, y - size); ctx.quadraticCurveTo(x, y, x + size, y); ctx.quadraticCurveTo(x, y, x, y + size);
      ctx.quadraticCurveTo(x, y, x - size, y); ctx.quadraticCurveTo(x, y, x, y - size); ctx.fill();
    } else if (kind === 'confetti') {
      const sp = (0.2 + r3 * 0.3) * H;
      const x = (r1 * W + Math.sin(t * 2 + i) * 20 * S) % W;
      const y = (r2 * H + t * sp) % (H + 40) - 20;
      const colors = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff', '#ff9f1c'];
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * (2 + r3 * 5) + i);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(-5 * S, -3 * S, 10 * S, 6 * S);
      ctx.restore();
    } else if (kind === 'hearts') {
      const sp = (0.08 + r3 * 0.15) * H;
      const x = r1 * W + Math.sin(t * 1.5 + i) * 25 * S;
      const y = H - ((r2 * H + t * sp) % (H + 60)) + 30;
      const s = (10 + r3 * 18) * S;
      ctx.fillStyle = `rgba(255,${60 + Math.floor(r2 * 80)},${120 + Math.floor(r1 * 60)},${0.6 + r3 * 0.4})`;
      ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-14, -5, -6, -16, 0, -8); ctx.bezierCurveTo(6, -16, 14, -5, 0, 5); ctx.fill();
      ctx.restore();
    } else if (kind === 'bokeh') {
      const x = (r1 * W + Math.sin(t * 0.3 + i) * 60 * S);
      const y = (r2 * H + Math.cos(t * 0.25 + i) * 40 * S);
      const rad = (30 + r3 * 70) * S;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const hue = Math.floor(r3 * 60 + 20);
      g.addColorStop(0, `hsla(${hue},100%,75%,${0.35 * k})`);
      g.addColorStop(1, `hsla(${hue},100%,60%,0)`);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  reset(ctx);
}

function lightLeak(ctx, W, H, t, k) {
  clipped(ctx, W, H, (sc) => {
    const x = W * (0.5 + 0.45 * Math.sin(t * 0.7));
    const y = H * (0.3 + 0.3 * Math.cos(t * 0.5));
    const g = sc.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,170,60,0.9)');
    g.addColorStop(0.4, 'rgba(255,60,120,0.45)');
    g.addColorStop(1, 'rgba(255,0,80,0)');
    sc.fillStyle = g;
    sc.fillRect(0, 0, W, H);
  }, 'screen', clamp(k, 0, 1));
}

function tint(ctx, W, H, color, mode, alpha) {
  clipped(ctx, W, H, (sc) => { sc.fillStyle = color; sc.fillRect(0, 0, W, H); }, mode, alpha);
}

function letterbox(ctx, W, H, k) {
  reset(ctx);
  ctx.fillStyle = '#000';
  const h = H * 0.13 * clamp(k * 1.4, 0, 1.4);
  ctx.fillRect(0, 0, W, h);
  ctx.fillRect(0, H - h, W, h);
}

function mirror(ctx, W, H) {
  const s = getScratch(4, W, H);
  s.getContext('2d').drawImage(ctx.canvas, 0, 0);
  reset(ctx);
  ctx.clearRect(W / 2, 0, W / 2, H);
  ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
  ctx.drawImage(s, 0, 0, W / 2, H, 0, 0, W / 2, H);
  ctx.restore();
}

function multiScreen(ctx, W, H, n) {
  const s = getScratch(4, W, H);
  s.getContext('2d').drawImage(ctx.canvas, 0, 0);
  reset(ctx);
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ctx.drawImage(s, i * W / n, j * H / n, W / n, H / n);
}

function frameBorder(ctx, W, H, k, S, color = '#ffffff') {
  reset(ctx);
  const b = Math.max(2, 40 * k * S);
  ctx.strokeStyle = color;
  ctx.lineWidth = b;
  ctx.strokeRect(b / 2, b / 2, W - b, H - b);
}

function filmScratches(ctx, W, H, t, k, S) {
  reset(ctx);
  ctx.globalCompositeOperation = 'source-atop';
  const seed = Math.floor(t * 18);
  const n = Math.floor(rand(seed) * 4 * k);
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = `rgba(255,255,240,${0.2 + rand(seed + i) * 0.4})`;
    ctx.lineWidth = Math.max(1, S * (1 + rand(seed * 2 + i) * 2));
    const x = rand(seed * 9 + i) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rand(i + seed) - 0.5) * 20, H); ctx.stroke();
  }
  reset(ctx);
}

function trackingBand(ctx, W, H, t, k) {
  const y = ((t * 0.35) % 1.2 - 0.1) * H;
  clipped(ctx, W, H, (sc) => {
    const pat = sc.createPattern(noise(), 'repeat');
    sc.fillStyle = pat;
    sc.translate(0, rand(Math.floor(t * 30)) * 256);
    sc.fillRect(0, y - 256, W, H * 0.06 + 256);
  }, 'screen', 0.35 * k);
}

/*
  Cada efeito pode ter:
   pre(state, t, k, ctx)  -> altera transformação/filtro antes de desenhar a mídia
   post(ctx, W, H, t, k, S) -> processa a camada já desenhada
*/
export const EFFECTS = [
  // ---- Básicos ----
  { id: 'blur', name: 'Desfoque', cat: 'Básicos', c: ['#4b6cb7', '#182848'], pre: (s, t, k) => s.filter.push(`blur(${(k * 22 * s.S).toFixed(1)}px)`) },
  { id: 'bw', name: 'Preto e branco', cat: 'Básicos', c: ['#eee', '#222'], pre: (s, t, k) => s.filter.push(`grayscale(${k})`) },
  { id: 'sepia', name: 'Sépia', cat: 'Básicos', c: ['#c79f6b', '#5b3e1d'], pre: (s, t, k) => s.filter.push(`sepia(${k})`) },
  { id: 'invert', name: 'Inverter cores', cat: 'Básicos', c: ['#00ffd5', '#ff004c'], pre: (s, t, k) => s.filter.push(`invert(${k})`) },
  { id: 'vignette', name: 'Vinheta', cat: 'Básicos', c: ['#777', '#000'], post: (ctx, W, H, t, k) => vignette(ctx, W, H, k) },
  { id: 'grain', name: 'Granulado', cat: 'Básicos', c: ['#999', '#333'], post: (ctx, W, H, t, k) => grain(ctx, W, H, k, t) },
  { id: 'pixelate', name: 'Pixelizar', cat: 'Básicos', c: ['#f7971e', '#ffd200'], post: (ctx, W, H, t, k, S) => pixelate(ctx, W, H, 4 + k * 50 * S) },
  { id: 'glow', name: 'Brilho suave', cat: 'Básicos', c: ['#fff1c1', '#f6a'], post: (ctx, W, H, t, k, S) => glow(ctx, W, H, k, S) },
  { id: 'mirror', name: 'Espelho', cat: 'Básicos', c: ['#89f7fe', '#66a6ff'], post: (ctx, W, H) => mirror(ctx, W, H) },
  { id: 'multi4', name: 'Multitela 4x', cat: 'Básicos', c: ['#43cea2', '#185a9d'], post: (ctx, W, H) => multiScreen(ctx, W, H, 2) },
  { id: 'multi9', name: 'Multitela 9x', cat: 'Básicos', c: ['#614385', '#516395'], post: (ctx, W, H) => multiScreen(ctx, W, H, 3) },
  { id: 'border', name: 'Moldura branca', cat: 'Básicos', c: ['#fff', '#bbb'], post: (ctx, W, H, t, k, S) => frameBorder(ctx, W, H, k, S) },
  { id: 'letterbox', name: 'Faixas de cinema', cat: 'Básicos', c: ['#000', '#444'], post: (ctx, W, H, t, k) => letterbox(ctx, W, H, k) },
  { id: 'motionblur', name: 'Desfoque de movimento', cat: 'Básicos', c: ['#536976', '#292e49'], post: (ctx, W, H, t, k, S) => motionBlur(ctx, W, H, k, S) },

  // ---- Dinâmicos ----
  { id: 'shake', name: 'Tremor', cat: 'Dinâmicos', c: ['#ff512f', '#dd2476'], pre: (s, t, k) => { const f = Math.floor(t * 30); s.dx += (rand(f) - 0.5) * 50 * k * s.S; s.dy += (rand(f + 99) - 0.5) * 50 * k * s.S; } },
  { id: 'quake', name: 'Terremoto', cat: 'Dinâmicos', c: ['#8e0e00', '#1f1c18'], pre: (s, t, k) => { const f = Math.floor(t * 30); s.dx += (rand(f) - 0.5) * 120 * k * s.S; s.dy += (rand(f + 9) - 0.5) * 120 * k * s.S; s.rot += (rand(f + 3) - 0.5) * 4 * k; s.scale *= 1.06; }, post: (ctx, W, H, t, k, S) => motionBlur(ctx, W, H, k * 0.6, S) },
  { id: 'zoompulse', name: 'Pulso de zoom', cat: 'Dinâmicos', c: ['#f953c6', '#b91d73'], pre: (s, t, k) => { s.scale *= 1 + 0.1 * k * (0.5 + 0.5 * Math.sin(t * Math.PI * 4)); } },
  { id: 'beat', name: 'Batida', cat: 'Dinâmicos', c: ['#fc4a1a', '#f7b733'], pre: (s, t, k) => { s.scale *= 1 + 0.16 * k * Math.max(0, 1 - ((t * 2) % 1) * 4); } },
  { id: 'kenburns', name: 'Zoom lento', cat: 'Dinâmicos', c: ['#c9d6ff', '#e2e2e2'], pre: (s, t, k) => { s.scale *= 1 + 0.25 * k * s.prog; } },
  { id: 'sway', name: 'Balanço', cat: 'Dinâmicos', c: ['#11998e', '#38ef7d'], pre: (s, t, k) => { s.rot += Math.sin(t * 3) * 7 * k; } },
  { id: 'strobe', name: 'Estroboscópio', cat: 'Dinâmicos', c: ['#fff', '#000'], pre: (s, t, k) => { if (Math.floor(t * 12) % 2) s.alpha *= 1 - k; } },
  { id: 'flash', name: 'Flash', cat: 'Dinâmicos', c: ['#ffffff', '#ffe259'], post: (ctx, W, H, t, k) => { const a = k * Math.max(0, 1 - ((t * 1.5) % 1) * 3); if (a <= 0) return; reset(ctx); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(0, 0, W, H); reset(ctx); } },
  { id: 'heartbeat', name: 'Coração batendo', cat: 'Dinâmicos', c: ['#ee0979', '#ff6a00'], pre: (s, t, k) => { const p = (t * 1.2) % 1; const b = p < 0.15 ? Math.sin(p / 0.15 * Math.PI) : p > 0.25 && p < 0.4 ? Math.sin((p - 0.25) / 0.15 * Math.PI) * 0.6 : 0; s.scale *= 1 + 0.12 * k * b; } },
  { id: 'spin', name: 'Girar', cat: 'Dinâmicos', c: ['#00c6ff', '#0072ff'], pre: (s, t, k) => { s.rot += t * 90 * k; } },

  // ---- Retrô ----
  { id: 'vhs', name: 'VHS', cat: 'Retrô', c: ['#8360c3', '#2ebf91'], pre: (s, t, k) => { s.filter.push(`saturate(${1 + 0.4 * k}) contrast(${1 + 0.1 * k})`); s.dy += (rand(Math.floor(t * 20)) - 0.5) * 6 * k * s.S; },
    post: (ctx, W, H, t, k, S) => { rgbSplit(ctx, W, H, 6 * k * S); scanlines(ctx, W, H, k * 0.7, S); grain(ctx, W, H, k * 0.6, t); trackingBand(ctx, W, H, t, k); } },
  { id: 'oldfilm', name: 'Filme antigo', cat: 'Retrô', c: ['#d8b78e', '#3e2c1c'], pre: (s, t, k) => s.filter.push(`sepia(${0.7 * k}) contrast(${1 + 0.15 * k}) brightness(${1 + (rand(Math.floor(t * 18)) - 0.5) * 0.25 * k})`),
    post: (ctx, W, H, t, k, S) => { grain(ctx, W, H, k * 0.8, t); filmScratches(ctx, W, H, t, k, S); vignette(ctx, W, H, k * 0.8); } },
  { id: 'zoomPulse', name: 'Pulso de zoom', cat: 'Dinâmicos', c: ['#f093fb', '#f5576c'], pre: (s, t, k) => { s.scale *= 1 + 0.06 * k * Math.max(0, Math.sin(t * Math.PI * 2)); } },
  { id: 'camShake', name: 'Câmera na mão', cat: 'Dinâmicos', c: ['#c3cfe2', '#7b8fa6'], pre: (s, t, k) => { s.dx += Math.sin(t * 2.3) * 8 * k * s.S + Math.sin(t * 7.1) * 2 * k * s.S; s.dy += Math.cos(t * 1.9) * 6 * k * s.S; s.rot += Math.sin(t * 1.3) * 0.6 * k; s.scale *= 1.03; } },
  { id: 'earthquake', name: 'Terremoto', cat: 'Dinâmicos', c: ['#8e2de2', '#4a00e0'], pre: (s, t, k) => { s.dx += (rand(Math.floor(t * 30)) - 0.5) * 40 * k * s.S; s.dy += (rand(Math.floor(t * 30) + 3) - 0.5) * 40 * k * s.S; s.scale *= 1.06; } },
  { id: 'strobe', name: 'Estroboscópio', cat: 'Dinâmicos', c: ['#ffffff', '#000000'], post: (ctx, W, H, t, k) => { if (Math.floor(t * 8) % 2 === 0) { ctx.save(); ctx.globalAlpha = 0.7 * k; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); } } },
  { id: 'psychedelic', name: 'Psicodélico', cat: 'Cor', c: ['#ff00c8', '#ffe600'], pre: (s, t, k) => { s.filter.push(`hue-rotate(${(t * 360 * k) % 360}deg) saturate(${1 + k * 1.5})`); s.scale *= 1 + 0.03 * Math.sin(t * 3); s.rot += 2 * k * Math.sin(t * 2); } },
  { id: 'nightVision', name: 'Visão noturna', cat: 'Cor', c: ['#00ff66', '#003314'], pre: (s, t, k) => s.filter.push(`grayscale(${k}) brightness(${1 + 0.3 * k}) contrast(1.2)`), post: (ctx, W, H, t, k) => { tint(ctx, W, H, '#00ff55', 'multiply', 0.6 * k); grain(ctx, W, H, k * 0.7, t); vignette(ctx, W, H, k); } },
  { id: 'thermal', name: 'Câmera térmica', cat: 'Cor', c: ['#ff0000', '#0000ff'], pre: (s, t, k) => s.filter.push(`invert(${k}) hue-rotate(${180 * k}deg) saturate(${1 + 2 * k})`) },
  { id: 'spotlight', name: 'Holofote', cat: 'Luz', c: ['#fff3b0', '#000000'], post: (ctx, W, H, t, k) => { const x = W * (0.5 + 0.25 * Math.sin(t * 0.8)), g = ctx.createRadialGradient(x, H / 2, H * 0.15, x, H / 2, H * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.85 * k})`); ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); } },
  { id: 'fireflies', name: 'Vaga-lumes', cat: 'Partículas', c: ['#ffe66d', '#1a1a2e'], post: (ctx, W, H, t, k, S) => { ctx.save(); ctx.globalCompositeOperation = 'screen'; for (let i = 0; i < 40 * k + 5; i++) { const x = (rand(i) * W + Math.sin(t * 0.7 + i) * 60 * S), y = (rand(i + 9) * H + Math.cos(t * 0.5 + i * 2) * 40 * S), a = 0.5 + 0.5 * Math.sin(t * 3 + i); const g = ctx.createRadialGradient(x, y, 0, x, y, 14 * S); g.addColorStop(0, `rgba(255,230,110,${a})`); g.addColorStop(1, 'rgba(255,230,110,0)'); ctx.fillStyle = g; ctx.fillRect(x - 14 * S, y - 14 * S, 28 * S, 28 * S); } ctx.restore(); } },
  { id: 'rainHeavy', name: 'Tempestade', cat: 'Partículas', c: ['#4b6cb7', '#182848'], pre: (s, t, k) => s.filter.push(`brightness(${1 - 0.25 * k}) saturate(${1 - 0.3 * k})`), post: (ctx, W, H, t, k, S) => { particles(ctx, W, H, t, Math.min(1, k * 1.5), 'rain', S); particles(ctx, W, H, t + 3, k, 'rain', S); if (rand(Math.floor(t * 4)) > 0.93) { ctx.save(); ctx.globalAlpha = 0.6 * k; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); } } },
  { id: 'tvstaticLight', name: 'Interferência leve', cat: 'Retrô', c: ['#bbbbbb', '#333333'], post: (ctx, W, H, t, k) => tvStatic(ctx, W, H, t, k * 0.25) },
  { id: 'camcorder', name: 'Filmadora (REC)', cat: 'Retrô', c: ['#ff3b30', '#222222'], post: (ctx, W, H, t, k, S) => { scanlines(ctx, W, H, k * 0.3, S); grain(ctx, W, H, k * 0.4, t); ctx.save(); ctx.fillStyle = '#ff3b30'; if (Math.floor(t * 1.5) % 2 === 0) { ctx.beginPath(); ctx.arc(W * 0.06, H * 0.08, 14 * S, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#fff'; ctx.font = `700 ${34 * S}px monospace`; ctx.fillText('REC', W * 0.06 + 26 * S, H * 0.08 + 12 * S); const s2 = Math.floor(t); ctx.fillText(`00:${String(Math.floor(s2 / 60)).padStart(2, '0')}:${String(s2 % 60).padStart(2, '0')}`, W * 0.78, H * 0.08 + 12 * S); ctx.restore(); } },
  { id: 'cinemaBars', name: 'Faixas de cinema', cat: 'Retrô', c: ['#000000', '#444444'], post: (ctx, W, H, t, k) => letterbox(ctx, W, H, k) },
  { id: 'dreamGlow', name: 'Brilho de sonho', cat: 'Cor', c: ['#ffd1f5', '#a18cd1'], post: (ctx, W, H, t, k, S) => glow(ctx, W, H, k * 0.9, S, 'saturate(1.3)') },
  { id: 'snowHeavy', name: 'Nevasca', cat: 'Partículas', c: ['#e0f7ff', '#89c2d9'], post: (ctx, W, H, t, k, S) => { particles(ctx, W, H, t, Math.min(1, k * 1.6), 'snow', S); particles(ctx, W, H, t + 7, k, 'snow', S); } },
  { id: 'party', name: 'Festa', cat: 'Partículas', c: ['#ff6ec7', '#ffd23f'], post: (ctx, W, H, t, k, S) => { particles(ctx, W, H, t, k, 'confetti', S); particles(ctx, W, H, t, k * 0.6, 'sparkle', S); } },
  { id: 'loveRain', name: 'Chuva de corações', cat: 'Partículas', c: ['#ff4d6d', '#ffb3c1'], post: (ctx, W, H, t, k, S) => { particles(ctx, W, H, t, Math.min(1, k * 1.5), 'hearts', S); } },
  { id: 'heatwave', name: 'Onda de calor', cat: 'Distorção', c: ['#ff9a3d', '#ff3d3d'], post: (ctx, W, H, t, k, S) => { const s = getScratch(2, W, H); const sc = s.getContext('2d'); sc.clearRect(0, 0, W, H); sc.drawImage(ctx.canvas, 0, 0); ctx.clearRect(0, 0, W, H); const n = 60; for (let i = 0; i < n; i++) { const y = i * H / n; ctx.drawImage(s, 0, y, W, H / n + 1, Math.sin(i * 0.5 + t * 6) * 8 * k * S, y, W, H / n + 1); } } },
  { id: 'mirrorH', name: 'Espelho', cat: 'Distorção', c: ['#89f7fe', '#66a6ff'], post: (ctx, W, H) => mirror(ctx, W, H) },
  { id: 'split4', name: 'Tela dividida 4x', cat: 'Distorção', c: ['#f6d365', '#fda085'], post: (ctx, W, H) => multiScreen(ctx, W, H, 2) },
  { id: 'tvstatic', name: 'Chuvisco de TV (sem sinal)', cat: 'Retrô', c: ['#9a9a9a', '#1a1a1a'], post: (ctx, W, H, t, k) => tvStatic(ctx, W, H, t, k) },
  { id: 'scanlines', name: 'Linhas de TV', cat: 'Retrô', c: ['#232526', '#414345'], post: (ctx, W, H, t, k, S) => scanlines(ctx, W, H, k, S) },
  { id: 'retro8', name: '8-bit', cat: 'Retrô', c: ['#56ab2f', '#a8e063'], pre: (s, t, k) => s.filter.push(`saturate(${1 + k}) contrast(1.2)`), post: (ctx, W, H, t, k, S) => pixelate(ctx, W, H, 8 + 14 * k * S) },
  { id: 'polaroid', name: 'Polaroid', cat: 'Retrô', c: ['#fdfcfb', '#e2d1c3'], pre: (s, t, k) => s.filter.push(`sepia(${0.2 * k}) contrast(${1 - 0.1 * k}) brightness(${1 + 0.08 * k})`), post: (ctx, W, H, t, k, S) => { vignette(ctx, W, H, 0.4 * k); frameBorder(ctx, W, H, k * 0.6, S, '#f4f1ea'); } },

  // ---- Glitch ----
  { id: 'rgbsplit', name: 'Aberração cromática', cat: 'Glitch', c: ['#ff0080', '#00e5ff'], post: (ctx, W, H, t, k, S) => rgbSplit(ctx, W, H, (8 + 4 * Math.sin(t * 6)) * k * S) },
  { id: 'glitch', name: 'Glitch', cat: 'Glitch', c: ['#00f260', '#0575e6'], post: (ctx, W, H, t, k, S) => { const on = rand(Math.floor(t * 10)) < 0.35 + 0.5 * k; if (!on) return; slices(ctx, W, H, k, t, S); rgbSplit(ctx, W, H, (rand(Math.floor(t * 20)) - 0.3) * 25 * k * S); } },
  { id: 'digital', name: 'Falha digital', cat: 'Glitch', c: ['#e1eec3', '#f05053'], post: (ctx, W, H, t, k, S) => { if (rand(Math.floor(t * 8)) < 0.5) pixelate(ctx, W, H, 10 + 30 * k * S); slices(ctx, W, H, k * 0.7, t, S); } },
  { id: 'holo', name: 'Holograma', cat: 'Glitch', c: ['#00f5ff', '#0072ff'], pre: (s, t, k) => { s.filter.push(`hue-rotate(${180 * k}deg) saturate(${1 + k})`); s.alpha *= 1 - 0.3 * k * rand(Math.floor(t * 20)); },
    post: (ctx, W, H, t, k, S) => { scanlines(ctx, W, H, k, S); glow(ctx, W, H, k * 0.6, S); } },

  // ---- Cor ----
  { id: 'rainbow', name: 'Arco-íris', cat: 'Cor', c: ['#f00', '#00f'], pre: (s, t, k) => s.filter.push(`hue-rotate(${(t * 200 * k) % 360}deg) saturate(1.3)`) },
  { id: 'neon', name: 'Neon', cat: 'Cor', c: ['#f0f', '#0ff'], pre: (s, t, k) => s.filter.push(`saturate(${1 + 1.5 * k}) contrast(${1 + 0.3 * k})`), post: (ctx, W, H, t, k, S) => glow(ctx, W, H, k, S, 'saturate(2)') },
  { id: 'duotone', name: 'Duotone', cat: 'Cor', c: ['#ff2d95', '#00e5ff'], pre: (s, t, k) => s.filter.push(`grayscale(${k}) contrast(${1 + 0.2 * k})`), post: (ctx, W, H, t, k) => { tint(ctx, W, H, '#ff2d95', 'multiply', k * 0.8); tint(ctx, W, H, '#00e5ff', 'screen', k * 0.35); } },
  { id: 'dream', name: 'Sonho', cat: 'Cor', c: ['#ffdde1', '#ee9ca7'], pre: (s, t, k) => s.filter.push(`brightness(${1 + 0.1 * k}) saturate(${1 - 0.2 * k})`), post: (ctx, W, H, t, k, S) => { glow(ctx, W, H, k * 0.9, S); tint(ctx, W, H, '#ffc0e0', 'soft-light', k * 0.5); } },
  { id: 'lightleak', name: 'Vazamento de luz', cat: 'Cor', c: ['#ff9966', '#ff5e62'], post: (ctx, W, H, t, k) => lightLeak(ctx, W, H, t, k) },
  { id: 'nightvision', name: 'Visão noturna', cat: 'Cor', c: ['#0f0', '#030'], pre: (s, t, k) => s.filter.push(`grayscale(${k}) brightness(${1 + 0.3 * k}) contrast(1.2)`), post: (ctx, W, H, t, k, S) => { tint(ctx, W, H, '#3bff3b', 'multiply', k); grain(ctx, W, H, 0.5 * k, t); vignette(ctx, W, H, k); } },
  { id: 'thermal', name: 'Térmico', cat: 'Cor', c: ['#ff0', '#f00'], pre: (s, t, k) => s.filter.push(`grayscale(1) contrast(1.4) invert(${0.15 * k})`), post: (ctx, W, H, t, k) => { tint(ctx, W, H, '#ff3d00', 'color', k); tint(ctx, W, H, '#2b00ff', 'soft-light', 0.4 * k); } },

  // ---- Partículas ----
  { id: 'rain', name: 'Chuva', cat: 'Partículas', c: ['#4ca1af', '#2c3e50'], post: (ctx, W, H, t, k, S) => particles(ctx, W, H, t, k, 'rain', S) },
  { id: 'snow', name: 'Neve', cat: 'Partículas', c: ['#e0eafc', '#cfdef3'], post: (ctx, W, H, t, k, S) => particles(ctx, W, H, t, k, 'snow', S) },
  { id: 'sparkle', name: 'Brilhos', cat: 'Partículas', c: ['#fceabb', '#f8b500'], post: (ctx, W, H, t, k, S) => particles(ctx, W, H, t, k, 'sparkle', S) },
  { id: 'confetti', name: 'Confete', cat: 'Partículas', c: ['#ff4d6d', '#06d6a0'], post: (ctx, W, H, t, k, S) => particles(ctx, W, H, t, k, 'confetti', S) },
  { id: 'hearts', name: 'Corações', cat: 'Partículas', c: ['#ff758c', '#ff7eb3'], post: (ctx, W, H, t, k, S) => particles(ctx, W, H, t, k, 'hearts', S) },
  { id: 'bokeh', name: 'Bokeh', cat: 'Partículas', c: ['#f7b733', '#fc4a1a'], post: (ctx, W, H, t, k, S) => particles(ctx, W, H, t, k, 'bokeh', S) },
];

export const EFFECT_MAP = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));
export const EFFECT_CATS = [...new Set(EFFECTS.map((e) => e.cat))];

// usado pelo painel "Ajuste" (temperatura e matiz)
export function applyAdjustPost(ctx, W, H, adj) {
  if (adj.temperature) tint(ctx, W, H, adj.temperature > 0 ? '#ff9a2e' : '#2e8bff', 'soft-light', Math.abs(adj.temperature) / 100 * 0.6);
  if (adj.tint) tint(ctx, W, H, adj.tint > 0 ? '#ff2ed1' : '#2eff6a', 'soft-light', Math.abs(adj.tint) / 100 * 0.5);
  if (adj.vignette) vignette(ctx, W, H, adj.vignette / 100);
}
export { tint };
