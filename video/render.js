// Renderiza o vídeo explicativo do AsturCut: mascote Astur (boneco de palito degradê ciano→roxo),
// telas reais com zoom/destaque, legendas sincronizadas, música do próprio AsturCut.
// Uso: node render.js [--preview tempos...] [--out arquivo.mp4]
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HERE = __dirname;
const W = 1920, H = 1080, FPS = 24;
const FONTS = '/home/user/AsturCut/src/renderer/assets/fonts';
GlobalFonts.registerFromPath(`${FONTS}/inter-latin-400-normal.woff2`, 'Inter');
GlobalFonts.registerFromPath(`${FONTS}/inter-latin-700-normal.woff2`, 'Inter');
GlobalFonts.registerFromPath(`${FONTS}/montserrat-latin-700-normal.woff2`, 'Montserrat');
GlobalFonts.registerFromPath(`${FONTS}/montserrat-latin-400-normal.woff2`, 'Montserrat');

const ACC = '#1ccfdc', VIO = '#5b2bff';
const script = require('./script.js');
const tts = JSON.parse(fs.readFileSync(`${HERE}/tts.json`, 'utf8'));
const meta = JSON.parse(fs.readFileSync(`${HERE}/shots/meta.json`, 'utf8'));
meta['wine-dd'] = { file: 'wine-dd.png', w: 1024, h: 700, boxes: {} };
meta['wine-3'] = { file: 'wine-3.png', w: 1024, h: 700, boxes: {} };
for (const k of ['inst-welcome', 'inst-progress', 'inst-done']) meta[k] = { file: `${k}.png`, w: 720, h: 490, boxes: {} };
meta.update = { file: 'update.png', w: 1440, h: 860, boxes: { card: [1043, 582, 378, 258], badge: [15, 684, 203, 62] } };

// ---------- utilidades ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const rand = (s) => { const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  const n = data.length / 2 / fmt.ch;
  const chans = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chans[c][i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
  return { sr: fmt.sr, chans };
}
function writeWav(file, L, R, sr) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

// ---------- linha do tempo ----------
const LEAD = 0.9, GAP = 0.34, TAIL = 0.9;
const scenes = [];
let T = 0.4;
script.forEach((sc, i) => {
  const st = tts.scenes[i];
  const s = { ...sc, start: T, sents: [] };
  let t = T + LEAD + (i === 0 ? 1.2 : 0);
  for (const se of st.sentences) { s.sents.push({ ...se, start: t, end: t + se.dur }); t += se.dur + GAP; }
  s.speechStart = s.sents[0].start;
  s.speechEnd = t - GAP;
  s.end = s.speechEnd + TAIL + (sc.kind === 'outro' ? 2.5 : 0);
  T = s.end;
  scenes.push(s);
});
const TOTAL = T + 0.5;
console.log(`Duração total: ${(TOTAL / 60).toFixed(2)} min (${scenes.length} cenas)`);

// ---------- áudio: narração + música (com ducking) + whoosh nas transições ----------
const SR = 44100;
const NS = Math.ceil(TOTAL * SR);
const narr = new Float32Array(NS);
for (const s of scenes) for (const se of s.sents) {
  const w = readWav(se.file);
  const ratio = w.sr / SR, src = w.chans[0], off = Math.floor(se.start * SR);
  const n = Math.floor(src.length / ratio);
  for (let i = 0; i < n && off + i < NS; i++) {
    const x = i * ratio, i0 = Math.floor(x), f = x - i0;
    narr[off + i] += (src[i0] * (1 - f) + (src[Math.min(src.length - 1, i0 + 1)] || 0) * f) * 0.95;
  }
}
// envelope para sincronizar a boca (por quadro)
const NF = Math.ceil(TOTAL * FPS);
const env = new Float32Array(NF);
{
  const win = Math.floor(SR / FPS);
  let mx = 0;
  for (let f = 0; f < NF; f++) {
    let s = 0; const o = f * win;
    for (let i = 0; i < win && o + i < NS; i++) s += narr[o + i] * narr[o + i];
    env[f] = Math.sqrt(s / win); mx = Math.max(mx, env[f]);
  }
  for (let f = 0; f < NF; f++) env[f] = clamp(env[f] / (mx * 0.55), 0, 1);
}
function buildAudio(outFile) {
  const L = new Float32Array(NS), R = new Float32Array(NS);
  const music = readWav(`${HERE}/audio/lofi.wav`);
  const upbeat = readWav(`${HERE}/audio/upbeat.wav`);
  const whoosh = readWav(`${HERE}/audio/whoosh.wav`);
  const ding = readWav(`${HERE}/audio/ding.wav`);
  // ducking: volume da música cai quando há voz
  const duckWin = Math.floor(SR * 0.05);
  let duck = 1;
  const introEnd = scenes[0].speechStart, outroStart = scenes[scenes.length - 1].speechEnd;
  for (let i = 0; i < NS; i++) {
    if (i % duckWin === 0) {
      let e = 0; for (let k = 0; k < duckWin && i + k < NS; k++) e = Math.max(e, Math.abs(narr[i + k]));
      const target = e > 0.02 ? 0.35 : 1;
      duck += (target - duck) * (target < duck ? 0.5 : 0.08);
    }
    const t = i / SR;
    const useUp = t < introEnd || t > outroStart;
    const m = useUp ? upbeat : music;
    const mi = Math.floor((i * m.sr / SR)) % m.chans[0].length;
    let fadeIn = clamp(t / 1.5, 0, 1), fadeOut = clamp((TOTAL - t) / 2.5, 0, 1);
    const gain = 0.16 * duck * fadeIn * fadeOut;
    L[i] = narr[i] + m.chans[0][mi] * gain;
    R[i] = narr[i] + (m.chans[1] || m.chans[0])[mi] * gain;
  }
  const place = (snd, t, g) => { const o = Math.floor(t * SR); const n = Math.floor(snd.chans[0].length * SR / snd.sr); for (let i = 0; i < n && o + i < NS; i++) { const j = Math.floor(i * snd.sr / SR); L[o + i] += snd.chans[0][j] * g; R[o + i] += (snd.chans[1] || snd.chans[0])[j] * g; } };
  scenes.forEach((s, i) => { if (i > 0) place(whoosh, s.start - 0.1, 0.22); });
  place(ding, scenes[0].start + 1.6, 0.25);
  place(ding, scenes[scenes.length - 1].speechEnd + 0.4, 0.25);
  // limitador suave
  for (let i = 0; i < NS; i++) { L[i] = Math.tanh(L[i] * 1.1) / 1.05; R[i] = Math.tanh(R[i] * 1.1) / 1.05; }
  writeWav(outFile, L, R, SR);
}

// ---------- imagens ----------
const images = {};
async function loadAll() {
  for (const [k, m] of Object.entries(meta)) images[k] = await loadImage(`${HERE}/shots/${m.file}`);
  images.logo = await loadImage('/home/user/AsturCut/build/icon.png');
}

// ---------- desenho: cenário ----------
function background(x, t) {
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0d0f15'); g.addColorStop(0.55, '#111019'); g.addColorStop(1, '#170f2b');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const orb = (cx, cy, r, c, a) => { const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, c.replace('A', a)); rg.addColorStop(1, c.replace('A', 0)); x.fillStyle = rg; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
  orb(300 + Math.sin(t * 0.13) * 160, 260 + Math.cos(t * 0.11) * 90, 620, 'rgba(28,207,220,A)', 0.13);
  orb(1600 + Math.cos(t * 0.09) * 200, 820 + Math.sin(t * 0.12) * 100, 720, 'rgba(91,43,255,A)', 0.16);
  orb(1100 + Math.sin(t * 0.07) * 300, 120, 420, 'rgba(255,59,167,A)', 0.05);
  x.fillStyle = 'rgba(255,255,255,0.035)';
  for (let yy = 40; yy < H; yy += 48) for (let xx = 40; xx < W; xx += 48) x.fillRect(xx, yy, 2, 2);
}

function topBar(x, s, t, alpha) {
  x.drawImage(images.logo, 48, 34, 44, 44);
  x.font = '700 28px Montserrat'; x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillText('AsturCut', 104, 57);
  if (s.title && s.kind !== 'title' && s.kind !== 'outro') {
    x.save(); x.globalAlpha = alpha;
    x.font = '700 30px Inter';
    const tw = x.measureText(s.title).width;
    const bx = W - 60 - tw - 56;
    x.fillStyle = 'rgba(28,207,220,0.12)'; rr(x, bx, 30, tw + 56, 54, 27); x.fill();
    x.strokeStyle = 'rgba(28,207,220,0.5)'; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = ACC; x.beginPath(); x.arc(bx + 26, 57, 6, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.fillText(s.title, bx + 42, 58);
    x.restore();
  }
}

function rr(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r); }

// ---------- mascote Astur ----------
const POSES = {
  idle:  { lu: -0.22, lf: -0.08, ru: 0.22, rf: 0.08, tilt: 0 },
  talk:  { lu: -0.35, lf: -1.2, ru: 0.35, rf: 1.2, tilt: 0 },
  point: { lu: -0.65, lf: 0.85, ru: 1.95, rf: 1.85, tilt: 0.06 },
  wave:  { lu: -0.22, lf: -0.1, ru: 2.55, rf: 2.95, tilt: -0.04 },
  cheer: { lu: -2.45, lf: -2.75, ru: 2.45, rf: 2.75, tilt: 0 },
  think: { lu: -0.2, lf: 0.9, ru: 0.55, rf: 2.75, tilt: 0.12 },
};
let poseCur = { ...POSES.idle }, poseFrom = { ...POSES.idle }, poseTo = POSES.idle, poseT0 = 0, lastPose = 'idle';
function poseAt(name, t) {
  if (name !== lastPose) { poseFrom = { ...poseCur }; poseTo = POSES[name] || POSES.idle; poseT0 = t; lastPose = name; }
  const k = easeInOut(clamp((t - poseT0) / 0.45, 0, 1));
  for (const key of Object.keys(POSES.idle)) poseCur[key] = lerp(poseFrom[key], poseTo[key], k);
  return poseCur;
}

const dir = (a) => [Math.sin(a), Math.cos(a)];
// boneco de palito: só traços grossos com o degradê ciano→roxo do logo (sem rosto, sem emblema)
function stickman(x, cx, footY, t, pose, e, poseName, walk = 0) {
  const LW = 28;
  const bob = Math.sin(t * 2.2) * 4 + (poseName === 'cheer' ? -Math.abs(Math.sin(t * 5)) * 22 : 0) - e * 5;
  const legLen = 122, torso = 150, armU = 84, armF = 80, headR = 52;
  const hipY = footY - legLen * 2 * 0.96 + bob;
  const shY = hipY - torso;
  const tilt = pose.tilt + Math.sin(t * 1.3) * 0.02 + Math.sin(t * 7) * e * 0.03;
  const grad = x.createLinearGradient(cx - 90, shY - 140, cx + 90, footY);
  grad.addColorStop(0, ACC); grad.addColorStop(1, VIO);
  // sombra no chão
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(cx, footY + 8, 100, 15, 0, 0, Math.PI * 2); x.fill();
  // brilho suave atrás
  const glow = x.createRadialGradient(cx, shY + 40, 10, cx, shY + 40, 280);
  glow.addColorStop(0, 'rgba(28,207,220,0.10)'); glow.addColorStop(1, 'rgba(28,207,220,0)');
  x.fillStyle = glow; x.fillRect(cx - 280, shY - 240, 560, 560);
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = grad; x.lineWidth = LW;
  const seg = (p, a, len) => { const [dx, dy] = dir(a); return [p[0] + dx * len, p[1] + dy * len]; };
  const hip = [cx, hipY], sh = [cx + Math.sin(tilt) * torso, shY];
  const path = (...pts) => { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.stroke(); };
  // pernas
  const sw = walk ? Math.sin(t * 9) * 0.45 : 0;
  for (const [a1, a2] of [[-0.14 + sw, -0.05 + sw * 0.6], [0.14 - sw, 0.05 - sw * 0.6]]) {
    const knee = seg(hip, a1, legLen), foot = seg(knee, a2, legLen);
    path(hip, knee, foot);
  }
  // tronco
  path(hip, sh);
  // braços
  const talkG = poseName === 'talk' ? e * 0.55 : poseName === 'idle' ? 0 : e * 0.15;
  const waveG = poseName === 'wave' ? Math.sin(t * 9) * 0.38 : 0;
  const lu = pose.lu + Math.sin(t * 1.7) * 0.05 - talkG * 0.4, lf = pose.lf - talkG;
  const ru = pose.ru + Math.sin(t * 1.5 + 1) * 0.05 + talkG * 0.3, rf = pose.rf + talkG * 0.8 + waveG;
  const shL = [sh[0], sh[1] + 12], shR = [sh[0], sh[1] + 12];
  const lel = seg(shL, lu, armU), lh = seg(lel, lf, armF);
  const rel = seg(shR, ru, armU), rh = seg(rel, rf, armF);
  path(shL, lel, lh); path(shR, rel, rh);
  // pescoço e cabeça (círculo cheio, sem rosto)
  const head = [sh[0] + Math.sin(tilt) * 70, sh[1] - headR - 16];
  path(sh, [head[0], head[1] + headR - 6]);
  const hg = x.createLinearGradient(head[0] - headR, head[1] - headR, head[0] + headR, head[1] + headR);
  hg.addColorStop(0, ACC); hg.addColorStop(1, VIO);
  x.fillStyle = hg; x.beginPath(); x.arc(head[0], head[1], headR, 0, Math.PI * 2); x.fill();
  return { rh };
}

// ---------- monitor com tela real ----------
const MON = { x: 650, y: 150, w: 1210, h: 1210 * 9 / 16 };
function camFor(img, m, step) {
  const iw = m.w, ih = m.h;
  const fit = Math.min(MON.w / iw, MON.h / ih);
  if (!step || !step.box) return { cx: iw / 2, cy: ih / 2, z: 1, fit, box: null };
  const b = Array.isArray(step.box) ? step.box : m.boxes[step.box];
  if (!b) return { cx: iw / 2, cy: ih / 2, z: 1, fit, box: null };
  const maxZ = Math.min((MON.w * 0.86) / (b[2] * fit), (MON.h * 0.82) / (b[3] * fit));
  const z = clamp(Math.min(step.zoom || 1.5, maxZ, 2.5), 1, 2.5);
  const vw = iw / z, vh = ih / z;
  const cx = clamp(b[0] + b[2] / 2, vw / 2, iw - vw / 2), cy = clamp(b[1] + b[3] / 2, vh / 2, ih - vh / 2);
  return { cx, cy, z, fit, box: b };
}

function drawMonitor(x, s, t, alpha, slide) {
  const key = s.kind === 'image' ? s.image.replace('.png', '') : s.shot;
  const m = meta[key], img = images[key];
  if (!m || !img) return null;
  const dur = s.speechEnd - s.speechStart;
  const prog = (t - s.speechStart) / Math.max(1, dur);
  const steps = s.focus || [{ at: 0, box: null, zoom: 1 }];
  let idx = 0;
  for (let i = 0; i < steps.length; i++) if (prog >= steps[i].at) idx = i;
  const tStep = s.speechStart + steps[idx].at * dur;
  const prev = camFor(img, m, steps[idx - 1] || { box: null });
  const cur = camFor(img, m, steps[idx]);
  const k = idx === 0 ? 1 : easeInOut(clamp((t - tStep) / 0.9, 0, 1));
  const cam = { cx: lerp(prev.cx, cur.cx, k), cy: lerp(prev.cy, cur.cy, k), z: Math.exp(lerp(Math.log(prev.z), Math.log(cur.z), k)) };
  const Y = MON.y + slide;
  x.save();
  x.globalAlpha = alpha;
  // sombra + moldura
  x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 60; x.shadowOffsetY = 20;
  x.fillStyle = '#08090c'; rr(x, MON.x - 10, Y - 10, MON.w + 20, MON.h + 20, 24); x.fill();
  x.shadowColor = 'transparent';
  const bg = x.createLinearGradient(MON.x, Y, MON.x + MON.w, Y + MON.h);
  bg.addColorStop(0, 'rgba(28,207,220,0.55)'); bg.addColorStop(1, 'rgba(91,43,255,0.55)');
  x.strokeStyle = bg; x.lineWidth = 2.5; rr(x, MON.x - 10, Y - 10, MON.w + 20, MON.h + 20, 24); x.stroke();
  x.save(); rr(x, MON.x, Y, MON.w, MON.h, 14); x.clip();
  x.fillStyle = '#0b0c10'; x.fillRect(MON.x, Y, MON.w, MON.h);
  const sc = cur.fit * cam.z;
  const ox = MON.x + MON.w / 2 - cam.cx * sc, oy = Y + MON.h / 2 - cam.cy * sc;
  x.drawImage(img, ox, oy, m.w * sc, m.h * sc);
  // destaque do elemento
  let target = null;
  if (cur.box && k > 0.85) {
    const b = cur.box, a = clamp((t - tStep - 0.75) / 0.35, 0, 1);
    const bx = ox + b[0] * sc - 8, by = oy + b[1] * sc - 8, bw = b[2] * sc + 16, bh = b[3] * sc + 16;
    if (cam.z > 1.05) {
      x.fillStyle = `rgba(5,6,10,${0.42 * a})`;
      x.beginPath(); x.rect(MON.x, Y, MON.w, MON.h); x.roundRect(bx, by, bw, bh, 12); x.fill('evenodd');
    }
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    x.strokeStyle = `rgba(28,207,220,${a})`; x.lineWidth = 4;
    x.shadowColor = `rgba(28,207,220,${0.8 * a * pulse})`; x.shadowBlur = 22;
    rr(x, bx, by, bw, bh, 12); x.stroke(); x.shadowColor = 'transparent';
    target = { x: bx + bw * 0.5, y: by + bh * 0.5, t0: tStep };
  }
  x.restore();
  x.restore();
  // cursor do mouse indo até o elemento
  if (target) drawCursor(x, target, t, alpha);
  return target;
}

function drawCursor(x, target, t, alpha) {
  const k = easeOut(clamp((t - target.t0 - 0.2) / 0.7, 0, 1));
  const sx = MON.x + MON.w * 0.92, sy = MON.y + MON.h * 0.95;
  const px = lerp(sx, target.x + 10, k), py = lerp(sy, target.y + 10, k);
  const clickT = t - target.t0 - 0.95;
  if (clickT > 0 && clickT < 0.6) {
    x.strokeStyle = `rgba(255,255,255,${(1 - clickT / 0.6) * alpha})`; x.lineWidth = 3;
    x.beginPath(); x.arc(px, py, 8 + clickT * 60, 0, Math.PI * 2); x.stroke();
  }
  x.save(); x.globalAlpha = alpha; x.translate(px, py);
  x.fillStyle = '#fff'; x.strokeStyle = '#111'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 30); x.lineTo(8, 23); x.lineTo(14, 36); x.lineTo(19, 34); x.lineTo(13, 21); x.lineTo(23, 21); x.closePath(); x.fill(); x.stroke();
  x.restore();
}

// ---------- legendas ----------
function wrap(x, text, maxW) {
  const words = text.split(' '); const lines = []; let cur = '';
  for (const w of words) { const test = cur ? cur + ' ' + w : w; if (x.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur);
  return lines;
}
function subtitle(x, s, t) {
  const se = s.sents.find((q) => t >= q.start - 0.05 && t <= q.end + 0.25);
  if (!se) return;
  x.font = '600 38px Inter';
  let lines = wrap(x, se.text, 1480);
  // frase longa: mostra em partes de até 2 linhas, proporcionais ao tempo
  if (lines.length > 2) {
    const chunks = []; for (let i = 0; i < lines.length; i += 2) chunks.push(lines.slice(i, i + 2));
    const total = lines.join(' ').length; let acc = 0, pick = chunks[chunks.length - 1];
    const p = (t - se.start) / (se.end - se.start);
    for (const c of chunks) { acc += c.join(' ').length; if (p <= acc / total) { pick = c; break; } }
    lines = pick;
  }
  const lh = 50, bh = lines.length * lh + 26;
  const maxw = Math.max(...lines.map((l) => x.measureText(l).width));
  const y = H - 46 - bh;
  const a = clamp((t - se.start + 0.05) / 0.15, 0, 1) * clamp((se.end + 0.25 - t) / 0.15, 0, 1);
  x.save(); x.globalAlpha = a;
  x.fillStyle = 'rgba(8,8,14,0.72)'; rr(x, W / 2 - maxw / 2 - 30, y, maxw + 60, bh, 16); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, W / 2, y + 13 + lh / 2 + i * lh));
  x.restore();
}

// ---------- cenas especiais ----------
function titleCard(x, s, t, alpha, outro) {
  const k = easeOut(clamp((t - s.start - 0.3) / 0.9, 0, 1));
  x.save(); x.globalAlpha = alpha;
  const cx = 1180, cy = 430;
  const sz = 230 * (0.6 + 0.4 * k);
  x.shadowColor = 'rgba(28,207,220,0.6)'; x.shadowBlur = 60;
  x.drawImage(images.logo, cx - sz / 2, cy - sz / 2 - 40, sz, sz);
  x.shadowColor = 'transparent';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 104px Montserrat';
  const tg = x.createLinearGradient(cx - 300, 0, cx + 300, 0); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#bfefff');
  x.fillStyle = tg; x.globalAlpha = alpha * k;
  x.fillText(s.title, cx, cy + 170);
  x.font = '400 40px Inter'; x.fillStyle = 'rgba(255,255,255,0.8)';
  x.fillText(s.subtitle || '', cx, cy + 250);
  // brilhos / confete
  for (let i = 0; i < (outro ? 90 : 40); i++) {
    const r1 = rand(i + 1), r2 = rand(i * 3 + 7), r3 = rand(i * 7 + 3);
    const px = 650 + r1 * 1200, py = outro ? ((r2 * H + (t - s.start) * (80 + r3 * 120)) % H) : 120 + r2 * 640;
    const tw = outro ? 1 : Math.max(0, Math.sin(t * (2 + r3 * 3) + i));
    x.globalAlpha = alpha * tw * 0.9;
    if (outro) { x.fillStyle = ['#1ccfdc', '#5b2bff', '#ff3ba7', '#ffd23f', '#fff'][i % 5]; x.save(); x.translate(px, py); x.rotate(t * 2 + i); x.fillRect(-6, -3, 12, 6); x.restore(); }
    else { x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py, 1.5 + r3 * 3, 0, Math.PI * 2); x.fill(); }
  }
  x.restore();
}

function listCard(x, s, t, alpha) {
  x.save(); x.globalAlpha = alpha;
  x.textAlign = 'left'; x.textBaseline = 'middle';
  x.font = '700 64px Montserrat'; x.fillStyle = '#fff';
  x.fillText(s.title, 700, 220);
  const g = x.createLinearGradient(700, 0, 1000, 0); g.addColorStop(0, ACC); g.addColorStop(1, VIO);
  x.fillStyle = g; x.fillRect(700, 268, 160, 6);
  const dur = s.speechEnd - s.speechStart;
  s.items.forEach((it, i) => {
    const appear = s.speechStart + (i / s.items.length) * dur * 0.85;
    const k = easeOut(clamp((t - appear) / 0.5, 0, 1));
    if (k <= 0) return;
    const y = 340 + i * 96;
    x.save(); x.globalAlpha = alpha * k; x.translate((1 - k) * 60, 0);
    x.fillStyle = 'rgba(255,255,255,0.05)'; rr(x, 700, y, 1120, 76, 18); x.fill();
    x.strokeStyle = 'rgba(28,207,220,0.25)'; x.lineWidth = 1.5; x.stroke();
    const cg = x.createLinearGradient(722, y + 14, 770, y + 62); cg.addColorStop(0, ACC); cg.addColorStop(1, VIO);
    x.fillStyle = cg; rr(x, 722, y + 14, 48, 48, 14); x.fill();
    x.fillStyle = '#fff'; x.font = '700 26px Inter'; x.textAlign = 'center'; x.fillText(String(i + 1), 746, y + 39);
    x.textAlign = 'left'; x.font = '600 34px Inter'; x.fillStyle = '#fff'; x.fillText(it, 796, y + 39);
    x.restore();
  });
  x.restore();
}

// ---------- quadro ----------
function frame(x, t, f) {
  background(x, t);
  const s = scenes.find((q) => t >= q.start && t < q.end) || scenes[scenes.length - 1];
  const si = scenes.indexOf(s);
  const inA = easeOut(clamp((t - s.start) / 0.55, 0, 1));
  const outA = clamp((s.end - t) / 0.4, 0, 1);
  const alpha = Math.min(inA, si === scenes.length - 1 ? 1 : outA);
  topBar(x, s, t, alpha);
  const e = env[Math.min(env.length - 1, f)] || 0;
  // pose: durante a fala usa a pose da cena; nas pausas, 'talk' vira 'idle'
  const speaking = s.sents.some((q) => t >= q.start && t <= q.end);
  let poseName = s.pose || 'talk';
  if (!speaking && poseName === 'talk') poseName = 'idle';
  if (s.kind === 'title' && t < s.speechStart) poseName = 'wave';
  const pose = poseAt(poseName, t);
  if (s.kind === 'shot' || s.kind === 'image') drawMonitor(x, s, t, alpha, (1 - inA) * 40);
  else if (s.kind === 'list') listCard(x, s, t, alpha);
  else titleCard(x, s, t, alpha, s.kind === 'outro');
  // mascote: entra andando no começo
  const walkIn = clamp((t - 0.2) / 1.6, 0, 1);
  const cx = lerp(-200, 330, easeOut(walkIn));
  stickman(x, cx, 868, t, pose, speaking ? e : 0, poseName, walkIn < 1 ? 1 : 0);
  subtitle(x, s, t);
  // barra de progresso
  const pg = x.createLinearGradient(0, 0, W, 0); pg.addColorStop(0, ACC); pg.addColorStop(1, VIO);
  x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(0, H - 6, W, 6);
  x.fillStyle = pg; x.fillRect(0, H - 6, W * (t / TOTAL), 6);
}

// ---------- principal ----------
(async () => {
  await loadAll();
  const args = process.argv.slice(2);
  const canvas = createCanvas(W, H);
  const x = canvas.getContext('2d');
  if (args[0] === '--preview') {
    fs.mkdirSync(`${HERE}/preview`, { recursive: true });
    const times = args.slice(1).map(Number);
    for (const tt of times) {
      // aquece o estado de pose
      for (let k = Math.max(0, tt - 1); k < tt; k += 1 / FPS) frame(x, k, Math.floor(k * FPS));
      frame(x, tt, Math.floor(tt * FPS));
      fs.writeFileSync(`${HERE}/preview/f_${tt.toFixed(1)}.png`, await canvas.encode('png'));
      console.log('preview', tt);
    }
    return;
  }
  if (args[0] === '--scenes') { for (const s of scenes) console.log(s.id, s.start.toFixed(1), s.end.toFixed(1)); return; }
  const out = args[args.indexOf('--out') + 1] && args.includes('--out') ? args[args.indexOf('--out') + 1] : `${HERE}/AsturCut-guia-completo.mp4`;
  const wav = `${HERE}/mix.wav`;
  console.log('Mixando áudio...');
  buildAudio(wav);
  console.log('Renderizando', NF, 'quadros...');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-i', wav, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < NF; f++) {
    frame(x, f / FPS, f);
    const ok = ff.stdin.write(canvas.data());
    if (!ok) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 480 === 0) console.log(`${f}/${NF} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('Pronto:', out, ((Date.now() - t0) / 60000).toFixed(1), 'min');
})();
