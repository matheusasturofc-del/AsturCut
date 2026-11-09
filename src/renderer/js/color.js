// Cor profissional (estilo Lumetri): rodas de cor (sombras / meios-tons / realces), curvas RGB,
// LUTs .cube e scopes (forma de onda, vetorscópio e histograma).
import { store, bus } from './store.js';
import { el, icon, clamp, uid, toast } from './util.js';
import { t } from './i18n.js';
import { player } from './player.js';

const SVGNS = 'http://www.w3.org/2000/svg';
export const defaultGrade = () => ({
  lift: { x: 0, y: 0, l: 0 }, gamma: { x: 0, y: 0, l: 0 }, gain: { x: 0, y: 0, l: 0 },
  curves: { m: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] },
  lut: null, lutMix: 1,
});

const isId = (p) => p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1;
export function gradeActive(g) {
  if (!g) return false;
  const w = (o) => o && (o.x || o.y || o.l);
  return !!(w(g.lift) || w(g.gamma) || w(g.gain) || (g.curves && ['m', 'r', 'g', 'b'].some((k) => g.curves[k] && !isId(g.curves[k]))));
}

// cor da roda (x,y em -1..1) -> deslocamento por canal (soma zero) + luminância
function wheelRGB(o, k) {
  if (!o) return [0, 0, 0];
  const ang = Math.atan2(o.y, o.x), mag = Math.min(1, Math.hypot(o.x, o.y));
  const h = (ang / (Math.PI * 2) + 1) % 1;
  const f = (n) => { const kk = (n + h * 6) % 6; return 1 - Math.max(0, Math.min(kk, 4 - kk, 1)); };
  const rgb = [f(5), f(3), f(1)];
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return rgb.map((v) => (v - mean) * mag * k + (o.l || 0) * k * 0.6);
}

// curva monótona (Fritsch–Carlson) pelos pontos
export function curveFn(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0]);
  const n = p.length;
  if (n < 2) return (x) => x;
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / Math.max(1e-6, p[i + 1][0] - p[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const tt = 3 / Math.sqrt(s); m[i] = tt * a * d[i]; m[i + 1] = tt * b * d[i]; }
  }
  return (x) => {
    if (x <= p[0][0]) return p[0][1];
    if (x >= p[n - 1][0]) return p[n - 1][1];
    let i = 0;
    while (i < n - 2 && x > p[i + 1][0]) i++;
    const h = p[i + 1][0] - p[i][0], tt = (x - p[i][0]) / h;
    const t2 = tt * tt, t3 = t2 * tt;
    return (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + tt) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}

// tabela final por canal (rodas + curvas) como filtro SVG reutilizável
const cache = new Map();
let svg = null;
export function gradeFilter(g) {
  if (!gradeActive(g)) return '';
  const key = JSON.stringify([g.lift, g.gamma, g.gain, g.curves]);
  if (cache.has(key)) return cache.get(key);
  if (!svg) {
    svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    document.body.append(svg);
  }
  const L = wheelRGB(g.lift, 0.18), M = wheelRGB(g.gamma, 0.5), G = wheelRGB(g.gain, 0.45);
  const cm = curveFn(g.curves?.m || [[0, 0], [1, 1]]);
  const cc = ['r', 'g', 'b'].map((k) => curveFn(g.curves?.[k] || [[0, 0], [1, 1]]));
  const N = 64;
  const f = document.createElementNS(SVGNS, 'filter');
  const id = 'grade_' + cache.size;
  f.setAttribute('id', id);
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const ct = document.createElementNS(SVGNS, 'feComponentTransfer');
  ['R', 'G', 'B'].forEach((ch, i) => {
    const vals = [];
    for (let k = 0; k <= N; k++) {
      let x = k / N;
      x = x + L[i] * (1 - x);                         // sombras (lift)
      x = Math.pow(clamp(x, 0, 1), 1 / Math.max(0.2, 1 + M[i])); // meios-tons (gamma)
      x = x * (1 + G[i]);                              // realces (gain)
      x = cc[i](cm(clamp(x, 0, 1)));                   // curvas
      vals.push(clamp(x, 0, 1).toFixed(4));
    }
    const fn = document.createElementNS(SVGNS, 'feFunc' + ch);
    fn.setAttribute('type', 'table'); fn.setAttribute('tableValues', vals.join(' '));
    ct.append(fn);
  });
  f.append(ct); svg.append(f);
  const css = `url(#${id})`;
  cache.set(key, css);
  return css;
}

// ---------- LUT .cube ----------
export function parseCube(text) {
  let size = 0;
  const vals = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^LUT_3D_SIZE\s+(\d+)/i.exec(line);
    if (m) { size = +m[1]; continue; }
    if (/^[A-Z_]/i.test(line)) continue; // TITLE, DOMAIN_MIN...
    const p = line.split(/\s+/).map(Number);
    if (p.length >= 3 && p.every((v) => !isNaN(v))) vals.push(p[0], p[1], p[2]);
  }
  if (!size || vals.length < size * size * size * 3) throw new Error('LUT inválida');
  const data = new Uint8Array(size * size * size * 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(clamp(vals[i], 0, 1) * 255);
  return { size, data };
}
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const lutMem = new Map();
export function lutData(id) {
  if (lutMem.has(id)) return lutMem.get(id);
  const l = store.p.luts?.[id];
  if (!l) return null;
  const r = { size: l.size, data: unb64(l.data), name: l.name };
  lutMem.set(id, r);
  return r;
}
export function importLut(onDone) {
  const inp = el('input', { type: 'file', accept: '.cube' });
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const { size, data } = parseCube(await f.text());
      const id = uid('lut');
      store.p.luts = store.p.luts || {};
      store.p.luts[id] = { name: f.name.replace(/\.cube$/i, ''), size, data: b64(data) };
      store.dirty = true;
      onDone && onDone(id);
      toast(t('LUT "{name}" importada', { name: f.name }), 'success');
    } catch { toast(t('Arquivo .cube inválido'), 'error'); }
  };
  inp.click();
}

// ---------- interface: rodas de cor ----------
export function colorWheel(label, val, onChange) {
  const S = 112;
  const cv = el('canvas', { class: 'cw-wheel', width: S * 2, height: S * 2 });
  const x = cv.getContext('2d');
  const draw = () => {
    x.setTransform(2, 0, 0, 2, 0, 0);
    x.clearRect(0, 0, S, S);
    const r = S / 2 - 4;
    const conic = x.createConicGradient(0, S / 2, S / 2);
    for (let i = 0; i <= 6; i++) conic.addColorStop(i / 6, `hsl(${(i * 60) % 360} 85% 55%)`);
    x.fillStyle = conic; x.beginPath(); x.arc(S / 2, S / 2, r, 0, Math.PI * 2); x.fill();
    const rad = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, r);
    rad.addColorStop(0, 'rgba(60,60,64,1)'); rad.addColorStop(1, 'rgba(60,60,64,0)');
    x.fillStyle = rad; x.beginPath(); x.arc(S / 2, S / 2, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(S / 2 - 6, S / 2); x.lineTo(S / 2 + 6, S / 2); x.moveTo(S / 2, S / 2 - 6); x.lineTo(S / 2, S / 2 + 6); x.stroke();
    const px = S / 2 + val.x * r, py = S / 2 - val.y * r;
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fill(); x.stroke();
  };
  const pick = (e) => {
    const b = cv.getBoundingClientRect(), r = b.width / 2 - 4 * (b.width / S);
    let dx = (e.clientX - b.left - b.width / 2) / r, dy = -(e.clientY - b.top - b.height / 2) / r;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    val.x = +dx.toFixed(3); val.y = +dy.toFixed(3);
    draw(); onChange(false);
  };
  cv.addEventListener('pointerdown', (e) => { store.begin(); cv.setPointerCapture(e.pointerId); pick(e); });
  cv.addEventListener('pointermove', (e) => { if (e.buttons) pick(e); });
  cv.addEventListener('pointerup', () => onChange(true));
  cv.addEventListener('dblclick', () => { store.begin(); val.x = 0; val.y = 0; val.l = 0; draw(); lum.value = 0; onChange(true); });
  const lum = el('input', { type: 'range', class: 'cw-lum', min: -100, max: 100, value: Math.round((val.l || 0) * 100), title: t('Luminância') });
  lum.addEventListener('pointerdown', () => store.begin());
  lum.addEventListener('input', () => { val.l = +lum.value / 100; onChange(false); });
  lum.addEventListener('change', () => onChange(true));
  draw();
  return el('div', { class: 'cw' }, el('div', { class: 'cw-label' }, t(label)), cv, lum);
}

// ---------- interface: curvas ----------
export function curvesEditor(curves, onChange) {
  let ch = 'm';
  const S = 220;
  const cv = el('canvas', { class: 'cv-curves', width: S * 2, height: S * 2 });
  const x = cv.getContext('2d');
  const COLORS = { m: '#e9e9ec', r: '#ff5a5a', g: '#4ade80', b: '#60a5fa' };
  const draw = () => {
    x.setTransform(2, 0, 0, 2, 0, 0);
    x.clearRect(0, 0, S, S);
    x.fillStyle = '#18181b'; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(255,255,255,.08)';
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * S / 4, 0); x.lineTo(i * S / 4, S); x.moveTo(0, i * S / 4); x.lineTo(S, i * S / 4); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.15)'; x.beginPath(); x.moveTo(0, S); x.lineTo(S, 0); x.stroke();
    for (const k of ['r', 'g', 'b', 'm']) {
      if (k !== ch && isId(curves[k])) continue;
      const f = curveFn(curves[k]);
      x.strokeStyle = COLORS[k]; x.globalAlpha = k === ch ? 1 : 0.35; x.lineWidth = k === ch ? 2 : 1;
      x.beginPath();
      for (let i = 0; i <= S; i++) { const y = S - clamp(f(i / S), 0, 1) * S; i ? x.lineTo(i, y) : x.moveTo(i, y); }
      x.stroke();
    }
    x.globalAlpha = 1;
    for (const p of curves[ch]) { x.fillStyle = COLORS[ch]; x.beginPath(); x.arc(p[0] * S, S - p[1] * S, 4.5, 0, Math.PI * 2); x.fill(); }
  };
  let drag = null;
  const pos = (e) => { const b = cv.getBoundingClientRect(); return [clamp((e.clientX - b.left) / b.width, 0, 1), clamp(1 - (e.clientY - b.top) / b.height, 0, 1)]; };
  cv.addEventListener('pointerdown', (e) => {
    store.begin();
    cv.setPointerCapture(e.pointerId);
    const [px, py] = pos(e);
    const pts = curves[ch];
    let i = pts.findIndex((p) => Math.hypot(p[0] - px, p[1] - py) < 0.05);
    if (i < 0) { pts.push([px, py]); pts.sort((a, b) => a[0] - b[0]); i = pts.findIndex((p) => p[0] === px); }
    drag = i;
    draw(); onChange(false);
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag == null) return;
    const pts = curves[ch];
    const [px, py] = pos(e);
    const lo = drag > 0 ? pts[drag - 1][0] + 0.01 : 0, hi = drag < pts.length - 1 ? pts[drag + 1][0] - 0.01 : 1;
    pts[drag] = [drag === 0 ? 0 : drag === pts.length - 1 ? 1 : clamp(px, lo, hi), py];
    draw(); onChange(false);
  });
  cv.addEventListener('pointerup', () => { drag = null; onChange(true); });
  cv.addEventListener('dblclick', (e) => {
    const [px, py] = pos(e);
    const pts = curves[ch];
    const i = pts.findIndex((p, k) => k > 0 && k < pts.length - 1 && Math.hypot(p[0] - px, p[1] - py) < 0.06);
    store.begin();
    if (i > 0) pts.splice(i, 1); else curves[ch] = [[0, 0], [1, 1]];
    draw(); onChange(true);
  });
  const tabs = el('div', { class: 'segmented cv-tabs' }, [['m', 'RGB'], ['r', 'R'], ['g', 'G'], ['b', 'B']].map(([k, n]) =>
    el('button', { class: k === ch ? 'on' : '', style: { color: k === 'm' ? '' : COLORS[k] }, onclick: (e) => { ch = k; tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); draw(); } }, n)));
  draw();
  return el('div', { class: 'cv-wrap' }, tabs, cv, el('div', { class: 'muted small' }, t('Toque para criar pontos e arraste. Toque duplo apaga o ponto (ou zera a curva).')));
}

// ---------- scopes ----------
let scopes = null;
export function toggleScopes() {
  if (scopes) { scopes.remove(); scopes = null; return; }
  let kind = 'wave';
  const cv = el('canvas', { width: 512, height: 256, class: 'sc-canvas' });
  const tabs = el('div', { class: 'segmented' }, [['wave', t('Forma de onda')], ['vector', t('Vetorscópio')], ['hist', t('Histograma')]].map(([k, n]) =>
    el('button', { class: k === kind ? 'on' : '', onclick: (e) => { kind = k; tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, n)));
  const head = el('div', { class: 'sc-head' }, el('b', {}, t('Scopes')), tabs, el('div', { class: 'grow' }), el('button', { class: 'icon-btn xs', onclick: () => toggleScopes(), html: icon('close', 13) }));
  scopes = el('div', { class: 'scopes' }, head, cv);
  document.body.append(scopes);
  // arrastar pela barra
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = scopes.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top;
    const mv = (ev) => { scopes.style.left = (ev.clientX - x0) + 'px'; scopes.style.top = (ev.clientY - y0) + 'px'; scopes.style.right = 'auto'; scopes.style.bottom = 'auto'; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  const small = document.createElement('canvas'); small.width = 256; small.height = 144;
  const sx = small.getContext('2d', { willReadFrequently: true });
  const x = cv.getContext('2d');
  let last = 0;
  const loop = (ts) => {
    if (!scopes) return;
    requestAnimationFrame(loop);
    if (ts - last < 120 || !player.canvas) return;
    last = ts;
    sx.drawImage(player.canvas, 0, 0, small.width, small.height);
    const d = sx.getImageData(0, 0, small.width, small.height).data;
    x.fillStyle = '#0b0b0d'; x.fillRect(0, 0, cv.width, cv.height);
    if (kind === 'wave') drawWave(x, d, small.width, small.height, cv.width, cv.height);
    else if (kind === 'vector') drawVector(x, d, cv.width, cv.height);
    else drawHist(x, d, cv.width, cv.height);
  };
  requestAnimationFrame(loop);
}

function drawWave(x, d, w, h, W, H) {
  const img = x.createImageData(W, H);
  const o = img.data;
  for (let px = 0; px < w; px++) {
    const X = Math.floor(px * W / w);
    for (let py = 0; py < h; py++) {
      const i = (py * w + px) * 4;
      for (let c = 0; c < 3; c++) {
        const Y = H - 1 - Math.floor(d[i + c] / 255 * (H - 1));
        const j = (Y * W + X) * 4;
        o[j + c] = Math.min(255, o[j + c] + 40); o[j + 3] = 255;
        if (X + 1 < W) { o[j + 4 + c] = Math.min(255, o[j + 4 + c] + 20); o[j + 7] = 255; }
      }
    }
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(255,255,255,.12)'; x.fillStyle = 'rgba(255,255,255,.4)'; x.font = '10px sans-serif';
  for (const v of [0, 25, 50, 75, 100]) { const y = H - 1 - v / 100 * (H - 1); x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); x.fillText(String(v), 3, Math.max(10, y - 2)); }
}

function drawVector(x, d, W, H) {
  const R = H / 2 - 8, cx = W / 2, cy = H / 2;
  x.strokeStyle = 'rgba(255,255,255,.15)'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
  // linha de tom de pele
  x.strokeStyle = 'rgba(255,200,150,.35)'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(-2.15) * R, cy + Math.sin(-2.15) * R); x.stroke();
  x.fillStyle = 'rgba(160,255,200,.18)';
  for (let i = 0; i < d.length; i += 8) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const cb = -0.1687 * r - 0.3313 * g + 0.5 * b, cr = 0.5 * r - 0.4187 * g - 0.0813 * b;
    x.fillRect(cx + cb * 2 * R, cy - cr * 2 * R, 1.5, 1.5);
  }
  const lab = [['R', 1, 0, 0], ['G', 0, 1, 0], ['B', 0, 0, 1], ['Y', 1, 1, 0], ['C', 0, 1, 1], ['M', 1, 0, 1]];
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '10px sans-serif';
  for (const [n, r, g, b] of lab) { const cb = -0.1687 * r - 0.3313 * g + 0.5 * b, cr = 0.5 * r - 0.4187 * g - 0.0813 * b; x.fillText(n, cx + cb * 2 * R * 0.75 - 3, cy - cr * 2 * R * 0.75 + 3); }
}

function drawHist(x, d, W, H) {
  const hs = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < d.length; i += 4) { hs[0][d[i]]++; hs[1][d[i + 1]]++; hs[2][d[i + 2]]++; }
  const max = Math.max(...hs.map((h) => Math.max(...h)));
  x.globalCompositeOperation = 'lighter';
  ['rgba(255,80,80,.7)', 'rgba(80,220,120,.7)', 'rgba(90,150,255,.7)'].forEach((col, c) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    for (let v = 0; v < 256; v++) x.lineTo(v / 255 * W, H - Math.sqrt(hs[c][v] / max) * (H - 4));
    x.lineTo(W, H); x.fill();
  });
  x.globalCompositeOperation = 'source-over';
}

void bus;
