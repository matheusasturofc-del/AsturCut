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
];
export const TRANSITION_MAP = Object.fromEntries(TRANSITIONS.map((t) => [t.id, t]));
export const TRANSITION_CATS = [...new Set(TRANSITIONS.map((t) => t.cat))];
