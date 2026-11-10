// TRANSIÇÕES entre clipes (todas grátis)
import { ease, rand } from '../util.js';
import { rgbSplit, getScratch } from './effects.js';

function draw(ctx, img, { x = 0, y = 0, s = 1, r = 0, a = 1, W, H, filter = 'none', sx = s, sy = s }) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.filter = filter;
  ctx.translate(W / 2 + x, H / 2 + y);
  ctx.rotate((r * Math.PI) / 180);
  ctx.scale(sx, sy);
  ctx.drawImage(img, -W / 2, -H / 2, W, H);
  ctx.restore();
}

export const TRANSITIONS = [
  { id: 'fade', name: 'Dissolver', cat: 'Básicas', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H, a: 1 }); draw(ctx, B, { W, H, a: p }); } },
  { id: 'black', name: 'Fade preto', cat: 'Básicas', render(ctx, A, B, p, W, H) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); if (p < 0.5) draw(ctx, A, { W, H, a: 1 - p * 2 }); else draw(ctx, B, { W, H, a: p * 2 - 1 }); } },
  { id: 'white', name: 'Fade branco', cat: 'Básicas', render(ctx, A, B, p, W, H) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); if (p < 0.5) draw(ctx, A, { W, H, a: 1 - p * 2 }); else draw(ctx, B, { W, H, a: p * 2 - 1 }); } },
  { id: 'flash', name: 'Flash', cat: 'Básicas', render(ctx, A, B, p, W, H) { draw(ctx, p < 0.5 ? A : B, { W, H }); ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(p * 2 - 1)})`; ctx.fillRect(0, 0, W, H); } },
  { id: 'blur', name: 'Desfoque', cat: 'Básicas', render(ctx, A, B, p, W, H) { const b = (1 - Math.abs(p * 2 - 1)) * 40 * (W / 1920); draw(ctx, A, { W, H, filter: `blur(${b}px)` }); draw(ctx, B, { W, H, a: ease.inOut(p), filter: `blur(${b}px)` }); } },
  { id: 'pushL', name: 'Empurrar ←', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); draw(ctx, A, { W, H, x: -e * W }); draw(ctx, B, { W, H, x: (1 - e) * W }); } },
  { id: 'pushR', name: 'Empurrar →', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); draw(ctx, A, { W, H, x: e * W }); draw(ctx, B, { W, H, x: -(1 - e) * W }); } },
  { id: 'pushU', name: 'Empurrar ↑', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); draw(ctx, A, { W, H, y: -e * H }); draw(ctx, B, { W, H, y: (1 - e) * H }); } },
  { id: 'pushD', name: 'Empurrar ↓', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); draw(ctx, A, { W, H, y: e * H }); draw(ctx, B, { W, H, y: -(1 - e) * H }); } },
  { id: 'slideOver', name: 'Deslizar sobre', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.out(p); draw(ctx, A, { W, H, s: 1 - 0.1 * e, a: 1 - 0.5 * e }); draw(ctx, B, { W, H, x: (1 - e) * W }); } },
  { id: 'whip', name: 'Chicote', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); const bl = Math.sin(p * Math.PI) * 50 * (W / 1920); draw(ctx, A, { W, H, x: -e * W * 1.2, filter: `blur(${bl}px)` }); draw(ctx, B, { W, H, x: (1 - e) * W * 1.2, filter: `blur(${bl}px)` }); } },
  { id: 'wipeL', name: 'Cortina ←', cat: 'Cortes', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); ctx.save(); ctx.beginPath(); ctx.rect(W * (1 - p), 0, W * p, H); ctx.clip(); draw(ctx, B, { W, H }); ctx.restore(); } },
  { id: 'wipeR', name: 'Cortina →', cat: 'Cortes', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * p, H); ctx.clip(); draw(ctx, B, { W, H }); ctx.restore(); } },
  { id: 'wipeD', name: 'Cortina ↓', cat: 'Cortes', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H * p); ctx.clip(); draw(ctx, B, { W, H }); ctx.restore(); } },
  { id: 'doors', name: 'Portas', cat: 'Cortes', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); ctx.save(); ctx.beginPath(); ctx.rect(W / 2 * (1 - p), 0, W * p, H); ctx.clip(); draw(ctx, B, { W, H }); ctx.restore(); } },
  { id: 'iris', name: 'Círculo', cat: 'Cortes', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * ease.inOut(p), 0, Math.PI * 2); ctx.clip(); draw(ctx, B, { W, H }); ctx.restore(); } },
  { id: 'clock', name: 'Relógio', cat: 'Cortes', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); ctx.save(); ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.closePath(); ctx.clip(); draw(ctx, B, { W, H }); ctx.restore(); } },
  { id: 'diag', name: 'Diagonal', cat: 'Cortes', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); ctx.save(); ctx.beginPath(); const d = (W + H) * p; ctx.moveTo(0, 0); ctx.lineTo(d, 0); ctx.lineTo(d - H, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip(); draw(ctx, B, { W, H }); ctx.restore(); } },
  { id: 'zoomIn', name: 'Zoom in', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); draw(ctx, B, { W, H, s: 0.6 + 0.4 * e, a: e }); draw(ctx, A, { W, H, s: 1 + 1.5 * e, a: 1 - e }); } },
  { id: 'zoomOut', name: 'Zoom out', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); draw(ctx, A, { W, H, s: 1 - 0.5 * e, a: 1 - e }); draw(ctx, B, { W, H, s: 2 - e, a: e }); } },
  { id: 'zoomBlur', name: 'Zoom com desfoque', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); const bl = Math.sin(p * Math.PI) * 30 * (W / 1920); if (p < 0.5) draw(ctx, A, { W, H, s: 1 + e * 1.2, filter: `blur(${bl}px)` }); else draw(ctx, B, { W, H, s: 1 + (1 - e) * 1.2, filter: `blur(${bl}px)` }); } },
  { id: 'spin', name: 'Girar', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); if (p < 0.5) draw(ctx, A, { W, H, r: e * 180, s: 1 - e * 1.2 }); else draw(ctx, B, { W, H, r: (e - 1) * 180, s: 1 - (1 - e) * 1.2 }); } },
  { id: 'flipX', name: 'Virar', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); if (p < 0.5) draw(ctx, A, { W, H, sx: Math.cos(e * Math.PI), sy: 1 }); else draw(ctx, B, { W, H, sx: -Math.cos(e * Math.PI), sy: 1 }); } },
  { id: 'glitch', name: 'Glitch', cat: 'Especiais', render(ctx, A, B, p, W, H) {
      draw(ctx, rand(Math.floor(p * 30)) < p ? B : A, { W, H });
      const k = Math.sin(p * Math.PI);
      const s = getScratch(4, W, H); const sc = s.getContext('2d'); sc.drawImage(ctx.canvas, 0, 0);
      for (let i = 0; i < 6; i++) { const y = rand(i + Math.floor(p * 40)) * H, h = H * 0.06; ctx.drawImage(s, 0, y, W, h, (rand(i * 7 + Math.floor(p * 40)) - 0.5) * 160 * k, y, W, h); }
      rgbSplit(ctx, W, H, 20 * k * (W / 1920));
    } },
  { id: 'pixel', name: 'Pixelizar', cat: 'Especiais', render(ctx, A, B, p, W, H) {
      const k = Math.sin(p * Math.PI); const block = Math.max(1, Math.round(k * 60 * (W / 1920)));
      const src = p < 0.5 ? A : B;
      if (block <= 1) { draw(ctx, src, { W, H }); return; }
      const w = Math.ceil(W / block), h = Math.ceil(H / block);
      const s = getScratch(4, w, h); s.getContext('2d').drawImage(src, 0, 0, w, h);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(s, 0, 0, w, h, 0, 0, W, H); ctx.imageSmoothingEnabled = true;
    } },
  { id: 'burn', name: 'Queimar luz', cat: 'Especiais', render(ctx, A, B, p, W, H) {
      draw(ctx, A, { W, H }); draw(ctx, B, { W, H, a: ease.inOut(p) });
      const k = Math.sin(p * Math.PI);
      const g = ctx.createRadialGradient(W * p, H / 2, 0, W * p, H / 2, W * 0.8);
      g.addColorStop(0, `rgba(255,200,80,${k})`); g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    } },
  { id: 'shake', name: 'Impacto', cat: 'Especiais', render(ctx, A, B, p, W, H) { const k = Math.sin(p * Math.PI) * 40 * (W / 1920); const dx = (rand(Math.floor(p * 50)) - 0.5) * k * 2, dy = (rand(Math.floor(p * 50) + 3) - 0.5) * k * 2; draw(ctx, p < 0.5 ? A : B, { W, H, x: dx, y: dy, s: 1 + Math.sin(p * Math.PI) * 0.15 }); } },

  // ---------- 1.5: mais transições ----------
  { id: 'coverL', name: 'Cobrir ←', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.out(p); draw(ctx, A, { W, H }); draw(ctx, B, { W, H, x: (1 - e) * W }); } },
  { id: 'coverU', name: 'Cobrir ↑', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.out(p); draw(ctx, A, { W, H }); draw(ctx, B, { W, H, y: (1 - e) * H }); } },
  { id: 'revealL', name: 'Revelar ←', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.in ? ease.in(p) : p * p; draw(ctx, B, { W, H }); draw(ctx, A, { W, H, x: -e * W }); } },
  { id: 'whipV', name: 'Chicote vertical', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); const bl = Math.sin(p * Math.PI) * 50 * (W / 1920); draw(ctx, A, { W, H, y: -e * H * 1.2, filter: `blur(${bl}px)` }); draw(ctx, B, { W, H, y: (1 - e) * H * 1.2, filter: `blur(${bl}px)` }); } },
  { id: 'swingIn', name: 'Balanço', cat: 'Movimento', render(ctx, A, B, p, W, H) { const e = ease.out(p); draw(ctx, A, { W, H, a: 1 - p }); draw(ctx, B, { W, H, r: (1 - e) * -12, s: 0.85 + 0.15 * e, a: Math.min(1, p * 2) }); } },
  { id: 'wipeU', name: 'Cortina ↑', cat: 'Cortes', render(ctx, A, B, p, W, H) { clipTo(ctx, A, B, W, H, (c) => c.rect(0, H * (1 - p), W, H * p)); } },
  { id: 'split', name: 'Abrir ao meio', cat: 'Cortes', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); clipTo(ctx, A, B, W, H, (c) => c.rect(0, H / 2 * (1 - e), W, H * e)); } },
  { id: 'blinds', name: 'Persiana', cat: 'Cortes', render(ctx, A, B, p, W, H) { const n = 10; clipTo(ctx, A, B, W, H, (c) => { for (let i = 0; i < n; i++) c.rect(0, i * H / n, W, H / n * ease.inOut(p)); }); } },
  { id: 'blindsV', name: 'Persiana vertical', cat: 'Cortes', render(ctx, A, B, p, W, H) { const n = 12; clipTo(ctx, A, B, W, H, (c) => { for (let i = 0; i < n; i++) c.rect(i * W / n, 0, W / n * ease.inOut(p), H); }); } },
  { id: 'checker', name: 'Xadrez', cat: 'Cortes', render(ctx, A, B, p, W, H) { const n = 8, m = Math.ceil(n * H / W); clipTo(ctx, A, B, W, H, (c) => { for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) { const d = clampP(p * 2 - ((x + y) % 2) * 0.6); c.rect(x * W / n, y * H / m, W / n * d, H / m); } }); } },
  { id: 'mosaic', name: 'Mosaico', cat: 'Cortes', render(ctx, A, B, p, W, H) { const n = 12, m = Math.ceil(n * H / W); clipTo(ctx, A, B, W, H, (c) => { for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) if (rand(x * 31 + y * 7) < p) c.rect(x * W / n, y * H / m, W / n + 1, H / m + 1); }); } },
  { id: 'heart', name: 'Coração', cat: 'Formas', render(ctx, A, B, p, W, H) { const r = Math.hypot(W, H) * 0.9 * ease.inOut(p); clipTo(ctx, A, B, W, H, (c) => heartPath(c, W / 2, H / 2 + r * 0.1, r)); } },
  { id: 'star', name: 'Estrela', cat: 'Formas', render(ctx, A, B, p, W, H) { const r = Math.hypot(W, H) * ease.inOut(p); clipTo(ctx, A, B, W, H, (c) => starPath(c, W / 2, H / 2, r, r * 0.45, 5, p * 1.2)); } },
  { id: 'diamond', name: 'Losango', cat: 'Formas', render(ctx, A, B, p, W, H) { const r = (W + H) * 0.6 * ease.inOut(p); clipTo(ctx, A, B, W, H, (c) => { c.moveTo(W / 2, H / 2 - r); c.lineTo(W / 2 + r, H / 2); c.lineTo(W / 2, H / 2 + r); c.lineTo(W / 2 - r, H / 2); c.closePath(); }); } },
  { id: 'circles', name: 'Bolhas', cat: 'Formas', render(ctx, A, B, p, W, H) { const n = 14; clipTo(ctx, A, B, W, H, (c) => { for (let i = 0; i < n; i++) { const r = Math.max(0, (p * 1.6 - rand(i) * 0.6)) * W * 0.35; c.moveTo(rand(i + 3) * W + r, rand(i + 9) * H); c.arc(rand(i + 3) * W, rand(i + 9) * H, r, 0, Math.PI * 2); } }); } },
  { id: 'irisOut', name: 'Fechar e abrir', cat: 'Formas', render(ctx, A, B, p, W, H) { const R = Math.hypot(W, H) / 2; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.beginPath(); const r = p < 0.5 ? R * (1 - ease.inOut(p * 2)) : R * ease.inOut(p * 2 - 1); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.clip(); draw(ctx, p < 0.5 ? A : B, { W, H }); ctx.restore(); } },
  { id: 'zoomRotate', name: 'Zoom e giro', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); if (p < 0.5) draw(ctx, A, { W, H, s: 1 + e * 1.4, r: e * 90, a: 1 - e }); draw(ctx, B, { W, H, s: 0.4 + 0.6 * e, r: (1 - e) * -90, a: e }); } },
  { id: 'dolly', name: 'Atravessar', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.in ? ease.in(p) : p * p; draw(ctx, B, { W, H, s: 1.3 - 0.3 * p }); draw(ctx, A, { W, H, s: 1 + e * 4, a: 1 - p }); } },
  { id: 'cube', name: 'Cubo', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(-e * W / 2, 0); draw(ctx, A, { W, H, sx: Math.max(0.001, 1 - e), sy: 1 - 0.1 * Math.sin(e * Math.PI), x: -e * W / 2 }); ctx.restore();
      ctx.save(); draw(ctx, B, { W, H, sx: Math.max(0.001, e), sy: 1 - 0.1 * Math.sin(e * Math.PI), x: (1 - e) * W / 2 }); ctx.restore(); } },
  { id: 'page', name: 'Virar página', cat: 'Zoom', render(ctx, A, B, p, W, H) { const e = ease.inOut(p); draw(ctx, B, { W, H }); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * (1 - e), H); ctx.clip(); draw(ctx, A, { W, H }); ctx.restore();
      const g = ctx.createLinearGradient(W * (1 - e) - 60, 0, W * (1 - e) + 20, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.5 * Math.sin(e * Math.PI)})`); ctx.fillStyle = g; ctx.fillRect(W * (1 - e) - 60, 0, 80, H); } },
  { id: 'inkDissolve', name: 'Tinta', cat: 'Especiais', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); const m = noiseMask(W, H, p); const s = getScratch(5, W, H); const sc = s.getContext('2d'); sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, W, H); sc.drawImage(m, 0, 0, W, H); sc.globalCompositeOperation = 'source-in'; sc.drawImage(B, 0, 0, W, H); sc.globalCompositeOperation = 'source-over'; ctx.drawImage(s, 0, 0); } },
  { id: 'colorWash', name: 'Lavagem de cor', cat: 'Especiais', render(ctx, A, B, p, W, H) { draw(ctx, p < 0.5 ? A : B, { W, H }); const k = Math.sin(p * Math.PI); const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, `rgba(28,207,220,${k})`); g.addColorStop(1, `rgba(91,43,255,${k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } },
  { id: 'lightLeak', name: 'Vazamento de luz', cat: 'Especiais', render(ctx, A, B, p, W, H) { draw(ctx, A, { W, H }); draw(ctx, B, { W, H, a: ease.inOut(p) }); const k = Math.sin(p * Math.PI); ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const [cx, col] of [[0.2 + p * 0.6, '255,120,40'], [0.9 - p * 0.5, '255,40,120']]) { const g = ctx.createRadialGradient(W * cx, H * 0.4, 0, W * cx, H * 0.4, W * 0.7); g.addColorStop(0, `rgba(${col},${0.9 * k})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } ctx.restore(); } },
  { id: 'tvOff', name: 'TV desligando', cat: 'Especiais', render(ctx, A, B, p, W, H) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (p < 0.5) { const q = p * 2; const sy = Math.max(0.004, 1 - ease.inOut(Math.min(1, q * 1.2))); const sx = q > 0.8 ? Math.max(0.01, 1 - (q - 0.8) * 5) : 1; draw(ctx, A, { W, H, sx, sy, filter: `brightness(${1 + q * 2})` }); }
      else { const q = (p - 0.5) * 2; const sy = Math.max(0.004, ease.out(q)); draw(ctx, B, { W, H, sx: 1, sy, filter: `brightness(${1 + (1 - q) * 2})` }); } } },
  { id: 'static', name: 'Chuvisco de TV', cat: 'Especiais', render(ctx, A, B, p, W, H) { draw(ctx, p < 0.5 ? A : B, { W, H }); const k = Math.sin(p * Math.PI); staticNoise(ctx, W, H, p, Math.min(1, k * 1.4)); } },
  { id: 'rgbShift', name: 'RGB deslocado', cat: 'Especiais', render(ctx, A, B, p, W, H) { draw(ctx, p < 0.5 ? A : B, { W, H, s: 1 + Math.sin(p * Math.PI) * 0.08 }); rgbSplit(ctx, W, H, Math.sin(p * Math.PI) * 40 * (W / 1920)); } },
  { id: 'wave', name: 'Onda', cat: 'Especiais', render(ctx, A, B, p, W, H) { draw(ctx, p < 0.5 ? A : B, { W, H }); const k = Math.sin(p * Math.PI); const s = getScratch(4, W, H); const sc = s.getContext('2d'); sc.clearRect(0, 0, W, H); sc.drawImage(ctx.canvas, 0, 0);
      const n = 40; for (let i = 0; i < n; i++) { const y = i * H / n; ctx.drawImage(s, 0, y, W, H / n + 1, Math.sin(i * 0.6 + p * 20) * 60 * k * (W / 1920), y, W, H / n + 1); } } },
];

// utilidades das transições novas
function clampP(x) { return Math.max(0, Math.min(1, x)); }
function clipTo(ctx, A, B, W, H, shape) { draw(ctx, A, { W, H }); ctx.save(); ctx.beginPath(); shape(ctx); ctx.clip(); draw(ctx, B, { W, H }); ctx.restore(); }
function heartPath(c, x, y, r) { c.moveTo(x, y + r * 0.35); c.bezierCurveTo(x - r * 1.1, y - r * 0.35, x - r * 0.55, y - r * 1.05, x, y - r * 0.45); c.bezierCurveTo(x + r * 0.55, y - r * 1.05, x + r * 1.1, y - r * 0.35, x, y + r * 0.35); c.closePath(); }
function starPath(c, x, y, R, r, n, rot) { for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n - Math.PI / 2, rr = i % 2 ? r : R; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
let inkBase = null;
function noiseMask(W, H, p) {
  const w = 96, h = 54;
  if (!inkBase) { inkBase = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let o = 1; o <= 4; o++) v += rand(Math.floor(x / (8 / o)) * 131 + Math.floor(y / (8 / o)) * 977 + o * 13) / o; inkBase[y * w + x] = v / 2.08; } }
  const c = getScratch(6, w, h), x = c.getContext('2d'), img = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const a = clampP((p * 1.4 - inkBase[i]) * 6); img.data[i * 4 + 3] = a * 255; }
  x.putImageData(img, 0, 0);
  return c;
}
function staticNoise(ctx, W, H, p, k) {
  const w = 160, h = 90, c = getScratch(7, w, h), x = c.getContext('2d'), img = x.createImageData(w, h);
  let seed = ((Math.floor(p * 60) + 1) * 2654435761) >>> 0;
  for (let i = 0; i < w * h; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const v = seed >>> 24; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  ctx.save(); ctx.globalAlpha = k; ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 0, 0, W, H); ctx.restore();
}
export const TRANSITION_MAP = Object.fromEntries(TRANSITIONS.map((t) => [t.id, t]));
export const TRANSITION_CATS = [...new Set(TRANSITIONS.map((t) => t.cat))];
