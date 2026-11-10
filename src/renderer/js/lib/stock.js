// BANCO DE MÍDIA: vídeos genéricos gerados na hora (sem arquivo, qualquer resolução, 100% livres)
// Cada um desenha um quadro no tempo t. sfx = som que acompanha (opcional, da biblioteca de áudio).
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

let noiseCv = null;
function staticFrame(ctx, W, H, t) {
  const w = Math.max(80, Math.round(W / 3)), h = Math.max(45, Math.round(H / 3));
  if (!noiseCv) noiseCv = document.createElement('canvas');
  if (noiseCv.width !== w || noiseCv.height !== h) { noiseCv.width = w; noiseCv.height = h; }
  const x = noiseCv.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  let seed = ((Math.floor(t * 30) + 1) * 2654435761) >>> 0;
  const roll = (t * 0.35) % 1;
  for (let y = 0; y < h; y++) {
    const band = 0.72 + 0.28 * Math.sin(((y / h) * 9 + t * 4) * Math.PI), br = Math.abs(y / h - roll) < 0.04 ? 1.35 : 1;
    for (let i = 0; i < w; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const v = Math.min(255, (seed >>> 24) * band * br); const k = (y * w + i) * 4; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(noiseCv, 0, 0, W, H); ctx.imageSmoothingEnabled = true;
}

function bars(ctx, W, H) {
  const top = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const mid = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
  const bw = W / 7;
  top.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, 0, bw + 1, H * 0.67); });
  mid.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, H * 0.67, bw + 1, H * 0.08); });
  const bot = [['#00214c', 1.25], ['#ffffff', 1.25], ['#32006a', 1.25], ['#131313', 1.25], ['#090909', 0.42], ['#131313', 0.42], ['#1d1d1d', 0.41], ['#131313', 1]];
  let x = 0; for (const [c, w] of bot) { ctx.fillStyle = c; ctx.fillRect(x, H * 0.75, bw * w + 1, H * 0.25); x += bw * w; }
}

function centerText(ctx, txt, W, H, size, color = '#fff', y = H / 2, font = '800 {s}px "Montserrat", sans-serif') {
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font.replace('{s}', Math.round(size));
  ctx.fillText(txt, W / 2, y);
}

export const STOCK_VIDEOS = [
  { id: 'tvstatic', name: 'Chuvisco de TV', cat: 'TV', sfx: 'tvstatic10', draw: (ctx, W, H, t) => { staticFrame(ctx, W, H, t); } },
  { id: 'nosignal', name: 'Sem sinal (barras)', cat: 'TV', sfx: 'tone1k', draw: (ctx, W, H) => { bars(ctx, W, H); ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(W * 0.3, H * 0.4, W * 0.4, H * 0.18); centerText(ctx, 'SEM SINAL', W, H, H * 0.09, '#fff', H * 0.49); } },
  { id: 'bars', name: 'Barras de cor', cat: 'TV', sfx: 'tone1k', draw: (ctx, W, H) => bars(ctx, W, H) },
  { id: 'tvoffline', name: 'Canal fora do ar', cat: 'TV', sfx: 'tvstatic10', draw: (ctx, W, H, t) => { staticFrame(ctx, W, H, t); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, H * 0.42, W, H * 0.16); centerText(ctx, 'CANAL 03', W, H, H * 0.08, '#4cff4c', H * 0.5, '400 {s}px "VT323", monospace'); } },
  { id: 'countdown10', name: 'Contagem de filme (10)', cat: 'Contagem', sfx: 'countBeeps10', dur: 10, draw: (ctx, W, H, t) => {
      const n = Math.max(1, 10 - Math.floor(t)), f = t % 1;
      ctx.fillStyle = '#d9d2c3'; ctx.fillRect(0, 0, W, H);
      const R = Math.min(W, H) * 0.42;
      ctx.fillStyle = '#9b9384'; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, R * 1.6, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(2, H / 180);
      for (const r of [R, R * 0.82]) { ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      centerText(ctx, String(n), W, H, R * 1.1, '#1a1a1a', H / 2 + R * 0.05, '700 {s}px "Bebas Neue", sans-serif');
      ctx.fillStyle = `rgba(0,0,0,${0.06 + 0.05 * rnd(Math.floor(t * 24))})`; ctx.fillRect(0, 0, W, H);
    } },
  { id: 'countdown3', name: 'Contagem 3-2-1', cat: 'Contagem', sfx: 'countBeeps3', dur: 3, draw: (ctx, W, H, t) => {
      const n = Math.max(1, 3 - Math.floor(t)), f = t % 1;
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1ccfdc'); g.addColorStop(1, '#5b2bff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const s = 1 + 0.25 * (1 - Math.min(1, f * 3));
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.globalAlpha = f > 0.85 ? (1 - f) / 0.15 : 1;
      centerText(ctx, String(n), 0, 0, Math.min(W, H) * 0.5, '#fff', 0, '900 {s}px "Montserrat", sans-serif'); ctx.restore();
    } },
  { id: 'gradientLoop', name: 'Gradiente animado', cat: 'Fundos animados', draw: (ctx, W, H, t) => {
      const a = t * 0.4, g = ctx.createLinearGradient(W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * H, W / 2 - Math.cos(a) * W, H / 2 - Math.sin(a) * H);
      g.addColorStop(0, '#1ccfdc'); g.addColorStop(0.5, '#3b82f6'); g.addColorStop(1, '#5b2bff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } },
  { id: 'aurora', name: 'Aurora', cat: 'Fundos animados', draw: (ctx, W, H, t) => {
      ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';
      [['28,207,220', 0], ['91,43,255', 2], ['236,72,153', 4]].forEach(([c, o]) => {
        const x = W * (0.5 + 0.35 * Math.sin(t * 0.3 + o)), y = H * (0.5 + 0.3 * Math.cos(t * 0.23 + o));
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.6); g.addColorStop(0, `rgba(${c},.75)`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });
      ctx.globalCompositeOperation = 'source-over';
    } },
  { id: 'bokeh', name: 'Luzes desfocadas', cat: 'Fundos animados', draw: (ctx, W, H, t) => {
      ctx.fillStyle = '#0b0b14'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 28; i++) {
        const x = ((rnd(i) * W + t * 20 * (0.3 + rnd(i + 5))) % (W + 200)) - 100, y = rnd(i + 9) * H + Math.sin(t + i) * 20, r = (0.03 + rnd(i + 2) * 0.08) * W;
        const hue = 180 + rnd(i + 4) * 120;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `hsla(${hue},90%,65%,.45)`); g.addColorStop(1, `hsla(${hue},90%,65%,0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    } },
  { id: 'particlesUp', name: 'Partículas subindo', cat: 'Fundos animados', draw: (ctx, W, H, t) => {
      ctx.fillStyle = '#070712'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 120; i++) { const sp = 0.03 + rnd(i) * 0.1, y = H - (((rnd(i + 1) + t * sp) % 1) * (H + 40)) + 20, x = rnd(i + 2) * W + Math.sin(t + i) * 10, r = (1 + rnd(i + 3) * 3) * (H / 1080) * 2; ctx.fillStyle = `rgba(160,240,255,${0.3 + rnd(i + 4) * 0.6})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    } },
  { id: 'starfield', name: 'Viagem nas estrelas', cat: 'Fundos animados', draw: (ctx, W, H, t) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) { const z = 1 - ((rnd(i) + t * 0.25) % 1), a = rnd(i + 1) * Math.PI * 2, d = rnd(i + 2) * 0.5 + 0.02; const k = 1 / Math.max(0.05, z); const x = W / 2 + Math.cos(a) * d * W * k * 0.25, y = H / 2 + Math.sin(a) * d * H * k * 0.25; if (x < 0 || x > W || y < 0 || y > H) continue; ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (1 - z) * 1.5)})`; const s = (1 - z) * 4 * (H / 1080) + 0.5; ctx.fillRect(x, y, s, s); }
    } },
  { id: 'matrix', name: 'Chuva de código', cat: 'Fundos animados', draw: (ctx, W, H, t) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const cs = Math.round(H / 36); ctx.font = `${cs}px "VT323", monospace`; ctx.textAlign = 'center';
      const cols = Math.ceil(W / cs);
      for (let c = 0; c < cols; c++) {
        const sp = 4 + rnd(c) * 8, head = ((t * sp + rnd(c + 3) * 40) % (H / cs + 20));
        for (let j = 0; j < 20; j++) { const row = Math.floor(head - j); if (row < 0) continue; ctx.fillStyle = j === 0 ? '#d7ffd9' : `rgba(0,255,90,${1 - j / 20})`; ctx.fillText(String.fromCharCode(0x30A0 + Math.floor(rnd(c * 99 + row + Math.floor(t * 6)) * 90)), c * cs + cs / 2, row * cs); }
      }
    } },
  { id: 'glitchScreen', name: 'Tela glitch', cat: 'Fundos animados', draw: (ctx, W, H, t) => {
      const f = Math.floor(t * 12);
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 18; i++) { const y = rnd(f * 31 + i) * H, h = rnd(f + i * 7) * H * 0.08; ctx.fillStyle = ['#ff00c8', '#00e5ff', '#ffe600', '#ffffff'][i % 4]; ctx.globalAlpha = 0.5 + rnd(i + f) * 0.5; ctx.fillRect(rnd(i * 3 + f) * W * 0.3 - W * 0.1, y, W * (0.5 + rnd(i + f * 2)), h); }
      ctx.globalAlpha = 1;
    } },
  { id: 'loading', name: 'Carregando...', cat: 'Telas', draw: (ctx, W, H, t) => {
      ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
      const R = Math.min(W, H) * 0.08;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + t * 4; ctx.fillStyle = `rgba(28,207,220,${(i + 1) / 12})`; ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * R, H / 2 + Math.sin(a) * R, R * 0.14, 0, Math.PI * 2); ctx.fill(); }
      centerText(ctx, 'Carregando' + '.'.repeat(1 + Math.floor(t * 2) % 3), W, H, H * 0.045, '#e9e9ec', H / 2 + R * 2);
    } },
  { id: 'theend', name: 'Fim', cat: 'Telas', draw: (ctx, W, H, t) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = Math.min(1, t / 1.2); centerText(ctx, 'FIM', W, H, H * 0.2, '#fff', H / 2, 'italic 700 {s}px "Playfair Display", serif'); ctx.globalAlpha = 1; } },
  { id: 'filmleader', name: 'Película antiga', cat: 'Telas', draw: (ctx, W, H, t) => {
      ctx.fillStyle = '#1b1712'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) { if (rnd(Math.floor(t * 18) * 7 + i) < 0.5) continue; ctx.fillStyle = 'rgba(255,240,210,.25)'; ctx.fillRect(rnd(Math.floor(t * 18) + i) * W, 0, Math.max(1, W / 900), H); }
      for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(255,240,210,.35)'; ctx.fillRect(rnd(Math.floor(t * 24) * 13 + i) * W, rnd(Math.floor(t * 24) * 17 + i) * H, 2, 2); }
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } },
];
export const STOCK_MAP = Object.fromEntries(STOCK_VIDEOS.map((v) => [v.id, v]));

export function drawGen(ctx, gen, t, W, H) {
  const v = STOCK_MAP[gen?.kind];
  if (!v) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  ctx.save();
  try { v.draw(ctx, W, H, t); } finally { ctx.restore(); }
}
