// Compositor: desenha um quadro do projeto em um canvas (prévia e exportação)
import { store } from './store.js';
import { clamp } from './util.js';
import { getPlayer, imageFor } from './media.js';
import { EFFECT_MAP, applyAdjustPost, tint } from './lib/effects.js';
import { FILTER_MAP, filterCss } from './lib/filters.js';
import { TRANSITION_MAP } from './lib/transitions.js';
import { clipAnimation } from './lib/animations.js';
import { drawShape } from './lib/stickers.js';
import { transformAt } from './keyframes.js';
import { needsKeying, keyFrame } from './keying.js';
import { gradeFilter } from './color.js';

// clipes com "antes/depois" ativo (mostra sem correção de cor) — só em tempo de execução
export const colorBypass = new Set();
const NEUTRAL_ADJ = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, hue: 0, blur: 0, vignette: 0, sharpen: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 };

// curva de tons (realces, sombras, brancos, pretos) como filtro SVG reutilizável
const toneCache = new Map();
let toneSvg = null;
function toneFilter(a) {
  const h = a.highlights || 0, sh = a.shadows || 0, w = a.whites || 0, b = a.blacks || 0;
  if (!h && !sh && !w && !b) return '';
  const key = `${h}_${sh}_${w}_${b}`;
  if (toneCache.has(key)) return toneCache.get(key);
  if (!toneSvg) {
    toneSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    toneSvg.setAttribute('width', '0'); toneSvg.setAttribute('height', '0');
    toneSvg.style.position = 'absolute';
    document.body.append(toneSvg);
  }
  const g = (x, c, wd) => Math.exp(-((x - c) ** 2) / (2 * wd * wd));
  const vals = [];
  for (let i = 0; i <= 32; i++) {
    const x = i / 32;
    let y = x + 0.22 * ((sh / 100) * g(x, 0.28, 0.16) + (h / 100) * g(x, 0.72, 0.16)) + 0.16 * ((b / 100) * g(x, 0.02, 0.1) + (w / 100) * g(x, 0.98, 0.1));
    vals.push(Math.min(1, Math.max(0, y)).toFixed(4));
  }
  const id = 'tone_' + toneCache.size;
  const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  f.setAttribute('id', id);
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const ct = document.createElementNS('http://www.w3.org/2000/svg', 'feComponentTransfer');
  for (const ch of ['R', 'G', 'B']) {
    const fn = document.createElementNS('http://www.w3.org/2000/svg', 'feFunc' + ch);
    fn.setAttribute('type', 'table'); fn.setAttribute('tableValues', vals.join(' '));
    ct.append(fn);
  }
  f.append(ct); toneSvg.append(f);
  const css = `url(#${id})`;
  toneCache.set(key, css);
  return css;
}

const layers = [];
function layer(i, W, H) {
  let c = layers[i];
  if (!c) { c = document.createElement('canvas'); layers[i] = c; }
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  x.clearRect(0, 0, W, H);
  return c;
}

export const VISUAL = ['video', 'image', 'text', 'sticker', 'shape', 'effect', 'filter'];
export const hasMedia = (c) => c.type === 'video' || c.type === 'audio';

// tempo da mídia de origem para um clipe
export function sourceTime(clip, lt) {
  if (clip.freeze) return clip.in || 0; // quadro congelado
  const m = store.media(clip.mediaId);
  const t = (clip.in || 0) + lt * (clip.speed || 1);
  return clamp(t, 0, Math.max(0, (m?.duration || 0) - 0.04));
}

// janela da transição na entrada de um clipe (ou null)
export function transitionWindow(clip, sorted) {
  if (!clip.transitionIn || !TRANSITION_MAP[clip.transitionIn.id]) return null;
  const idx = sorted.indexOf(clip);
  const prev = sorted[idx - 1];
  if (!prev || Math.abs(prev.start + prev.duration - clip.start) > 0.05) return null;
  const d = Math.min(clip.transitionIn.dur || 0.6, clip.duration, prev.duration);
  return { prev, start: clip.start - d / 2, end: clip.start + d / 2, d };
}

// clipes ativos em t por trilha (incluindo sobreposição de transições)
export function activeAt(t) {
  const out = [];
  const tracks = store.p.tracks;
  for (let ti = tracks.length - 1; ti >= 0; ti--) {
    const tr = tracks[ti];
    const sorted = store.clipsOn(tr.id);
    const entry = { track: tr, items: [], trans: null };
    for (const c of sorted) {
      if (t >= c.start && t < c.start + c.duration) entry.items.push(c);
    }
    for (const c of sorted) {
      const w = transitionWindow(c, sorted);
      if (w && t >= w.start && t < w.end) {
        entry.trans = { A: w.prev, B: c, p: (t - w.start) / w.d, def: TRANSITION_MAP[c.transitionIn.id] };
        if (!entry.items.includes(w.prev)) entry.items.push(w.prev);
        if (!entry.items.includes(c)) entry.items.push(c);
      }
    }
    out.push(entry);
  }
  return out; // ordem: de baixo para cima
}

function adjustCss(a) {
  if (!a) return '';
  const p = [];
  if (a.brightness || a.exposure) p.push(`brightness(${(1 + a.brightness / 200 + a.exposure / 150).toFixed(3)})`);
  if (a.contrast) p.push(`contrast(${(1 + a.contrast / 100).toFixed(3)})`);
  if (a.saturation) p.push(`saturate(${(1 + a.saturation / 100).toFixed(3)})`);
  if (a.hue) p.push(`hue-rotate(${(a.hue * 1.8).toFixed(1)}deg)`);
  if (a.sharpen > 0) p.push(`url(#sharpen${a.sharpen > 66 ? 3 : a.sharpen > 33 ? 2 : 1})`);
  const tone = toneFilter(a);
  if (tone) p.push(tone);
  return p.join(' ');
}

function textLines(tx, anim) {
  let s = tx.uppercase ? tx.content.toUpperCase() : tx.content;
  if (anim.chars < 1) s = s.slice(0, Math.floor(s.length * anim.chars));
  if (anim.words < 1) { const w = s.split(/(\s+)/); s = w.slice(0, Math.ceil(w.length * anim.words)).join(''); }
  return s.split('\n');
}

function measureText(ctx, tx, S, anim) {
  const size = tx.size * S;
  ctx.font = `${tx.italic ? 'italic ' : ''}${tx.bold ? 700 : 400} ${size}px "${tx.font}", "Inter", sans-serif`;
  ctx.letterSpacing = `${tx.letterSpacing * S}px`;
  const all = (tx.uppercase ? tx.content.toUpperCase() : tx.content).split('\n');
  const lh = size * tx.lineHeight;
  let w = 0;
  for (const l of all) w = Math.max(w, ctx.measureText(l || ' ').width);
  const lines = textLines(tx, anim);
  return { size, lh, w, h: lh * all.length, lines, allCount: all.length };
}

export function drawText(ctx, tx, S, anim, lt = 0) {
  const m = measureText(ctx, tx, S, anim);
  const { size, lh, w, h, lines } = m;
  ctx.textBaseline = 'middle';
  ctx.textAlign = tx.align;
  const x0 = tx.align === 'left' ? -w / 2 : tx.align === 'right' ? w / 2 : 0;
  if (tx.bg) {
    const pad = tx.bgPadding * S;
    ctx.save();
    ctx.globalAlpha *= tx.bgOpacity;
    ctx.fillStyle = tx.bgColor;
    ctx.beginPath();
    ctx.roundRect(-w / 2 - pad, -h / 2 - pad * 0.6, w + pad * 2, h + pad * 1.2, tx.bgRadius * S);
    ctx.fill();
    ctx.restore();
  }
  const y0 = -h / 2 + lh / 2;
  const each = (fn) => lines.forEach((l, i) => fn(l, x0, y0 + i * lh));
  ctx.lineJoin = 'round';
  if (tx.glow > 0) {
    ctx.save();
    ctx.shadowColor = tx.glowColor; ctx.shadowBlur = tx.glow * S * 1.5;
    ctx.fillStyle = tx.glowColor;
    each((l, x, y) => ctx.fillText(l, x, y));
    ctx.shadowBlur = tx.glow * S * 0.6;
    each((l, x, y) => ctx.fillText(l, x, y));
    ctx.restore();
  }
  if (tx.shadow) {
    ctx.shadowColor = tx.shadowColor; ctx.shadowBlur = tx.shadowBlur * S;
    ctx.shadowOffsetX = tx.shadowX * S; ctx.shadowOffsetY = tx.shadowY * S;
  }
  if (tx.strokeWidth > 0) {
    ctx.strokeStyle = tx.stroke; ctx.lineWidth = tx.strokeWidth * S * 2;
    each((l, x, y) => ctx.strokeText(l, x, y));
    ctx.shadowColor = 'transparent';
  }
  ctx.fillStyle = tx.color;
  each((l, x, y) => ctx.fillText(l, x, y));
  if (tx.karaoke && tx.karaoke.words?.length) drawKaraoke(ctx, tx, lines, x0, y0, lh, lt);
  if (tx.underline) {
    ctx.shadowColor = 'transparent';
    ctx.fillRect(-w / 2, h / 2 - size * 0.05, w, Math.max(2, size * 0.06));
  }
  return { w: w + (tx.bg ? tx.bgPadding * S * 2 : 0), h: h + (tx.bg ? tx.bgPadding * S * 1.2 : 0) };
}

// legenda estilo karaokê: pinta a palavra que está sendo falada
function drawKaraoke(ctx, tx, lines, x0, y0, lh, lt) {
  const K = tx.karaoke;
  let k = -1;
  for (let i = 0; i < K.words.length; i++) { if (K.words[i][0] <= lt + 1e-3) k = i; else break; }
  if (k < 0) return;
  // se o texto foi editado e o número de palavras mudou, distribui proporcionalmente
  const total = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (total !== K.words.length) k = Math.min(total - 1, Math.floor(((k + 0.5) / K.words.length) * total));
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.textAlign = 'left';
  let idx = 0;
  lines.forEach((line, li) => {
    const parts = line.split(/(\s+)/);
    const lw = ctx.measureText(line).width;
    let x = tx.align === 'left' ? x0 : tx.align === 'right' ? x0 - lw : x0 - lw / 2;
    for (const p of parts) {
      const w = ctx.measureText(p).width;
      if (p && !/^\s+$/.test(p)) {
        if (K.mode === 'fill' ? idx <= k : idx === k) {
          if (K.box) {
            const pad = lh * 0.08;
            ctx.fillStyle = K.color;
            ctx.beginPath(); ctx.roundRect(x - pad * 1.5, y0 + li * lh - lh * 0.46, w + pad * 3, lh * 0.92, lh * 0.16); ctx.fill();
            ctx.fillStyle = K.ink || '#000000';
          } else ctx.fillStyle = K.color;
          ctx.fillText(p, x, y0 + li * lh);
        }
        idx++;
      }
      x += w;
    }
  });
  ctx.restore();
}

// tamanho "natural" do conteúdo de um clipe em px do canvas (antes da escala do usuário)
function contentSize(clip, W, H, S, ctx) {
  if (clip.type === 'video' || clip.type === 'image') {
    const m = store.media(clip.mediaId);
    const mw = m?.width || W, mh = m?.height || H;
    const fit = clip.fit || 'contain';
    if (fit === 'fill') return { w: W, h: H, mw, mh };
    const s = fit === 'cover' ? Math.max(W / mw, H / mh) : Math.min(W / mw, H / mh);
    return { w: mw * s, h: mh * s, mw, mh };
  }
  if (clip.type === 'text') { const r = measureText(ctx, clip.text, S, { chars: 1, words: 1 }); const pad = clip.text.bg ? clip.text.bgPadding * S : 0; return { w: r.w + pad * 2, h: r.h + pad * 1.2 }; }
  if (clip.type === 'sticker') { const s = 220 * S; return { w: s, h: s }; }
  if (clip.type === 'shape') { return { w: 300 * S * 1.2, h: 300 * S * 0.9 }; }
  return { w: W, h: H };
}

function mediaSource(clip, lt) {
  if (clip.type === 'image') return imageFor(clip.mediaId);
  if (clip.type === 'video') {
    const p = getPlayer(clip);
    if (!p || p.el.readyState < 2) return null;
    return p.el;
  }
  return null;
}

// desenha um clipe visual em uma camada e retorna { canvas, alpha, blend }
function renderClip(idx, clip, t, W, H, S, hits) {
  const lc = layer(idx, W, H);
  const ctx = lc.getContext('2d');
  const lt = t - clip.start;
  const ltc = clamp(lt, 0, clip.duration);
  const anim = clipAnimation(clip, ltc);
  const st = { filter: [], dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1, S, prog: ltc / Math.max(0.01, clip.duration) };
  for (const e of clip.effects) { const def = EFFECT_MAP[e.id]; if (def?.pre) def.pre(st, ltc, e.intensity ?? 0.6); }
  const tr = transformAt(clip, ltc);
  const bypass = colorBypass.has(clip.id);
  const adj = bypass ? NEUTRAL_ADJ : clip.adjust;
  const flt = bypass ? null : clip.filter;
  const filters = [adjustCss(adj)];
  if (!bypass && clip.grade) filters.push(gradeFilter(clip.grade));
  if (adj.blur) filters.push(`blur(${(adj.blur / 100 * 20 * S).toFixed(1)}px)`);
  if (flt && FILTER_MAP[flt.id]) filters.push(filterCss(FILTER_MAP[flt.id], flt.intensity ?? 1));
  filters.push(...st.filter);
  if (anim.blur > 0) filters.push(`blur(${(anim.blur * S).toFixed(1)}px)`);
  const filterStr = filters.filter(Boolean).join(' ') || 'none';

  const size = contentSize(clip, W, H, S, ctx);
  const cx = W / 2 + (tr.x + anim.dx) * W + st.dx;
  const cy = H / 2 + (tr.y + anim.dy) * H + st.dy;
  const sc = tr.scale * anim.scale * st.scale;
  const rot = tr.rotation + anim.rot + st.rot;

  // fundo desfocado (trilha principal)
  const isMain = store.track(clip.trackId)?.main;
  const src = mediaSource(clip, lt);
  if (isMain && src && store.p.settings.bgMode === 'blur' && (clip.type === 'video' || clip.type === 'image')) {
    const cover = Math.max(W / size.mw, H / size.mh) * 1.1;
    ctx.save();
    ctx.filter = `blur(${40 * S}px) brightness(0.8)`;
    ctx.drawImage(src, W / 2 - size.mw * cover / 2, H / 2 - size.mh * cover / 2, size.mw * cover, size.mh * cover);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(sc * anim.sx * (tr.flipH ? -1 : 1), sc * anim.sy * (tr.flipV ? -1 : 1));
  ctx.filter = filterStr;
  if (clip.type === 'video' || clip.type === 'image') {
    let img = src;
    if (src && needsKeying(clip)) { const kf = keyFrame(clip, src, size.mw, size.mh); if (kf && kf !== 'wait') img = kf; }
    if (img) {
      const cr = clip.crop;
      if (cr && (cr.l || cr.r || cr.t || cr.b)) {
        const sx = cr.l * size.mw, sy = cr.t * size.mh, sw = size.mw * (1 - cr.l - cr.r), sh = size.mh * (1 - cr.t - cr.b);
        const k = size.w / size.mw;
        const r = img === src ? 1 : img.width / size.mw;
        ctx.drawImage(img, sx * r, sy * r, sw * r, sh * r, -size.w / 2 + sx * k, -size.h / 2 + sy * k, sw * k, sh * k);
      } else ctx.drawImage(img, -size.w / 2, -size.h / 2, size.w, size.h);
    }
  } else if (clip.type === 'text') {
    drawText(ctx, clip.text, S, anim, ltc);
  } else if (clip.type === 'sticker') {
    const s = 220 * S;
    ctx.font = `${s * 0.86}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(clip.sticker?.emoji || '⭐', 0, s * 0.05);
  } else if (clip.type === 'shape') {
    const sh = clip.shape || {};
    drawShape(ctx, sh.kind || 'rect', 300 * S, sh.color || '#ffffff', sh.stroke, (sh.strokeWidth || 0) * S, { ...sh, progress: sh.kind === 'progress' ? ltc / clip.duration : undefined });
  }
  ctx.restore();

  for (const e of clip.effects) { const def = EFFECT_MAP[e.id]; if (def?.post) def.post(ctx, W, H, ltc, e.intensity ?? 0.6, S); }
  applyAdjustPost(ctx, W, H, adj);
  if (flt && FILTER_MAP[flt.id]) {
    const f = FILTER_MAP[flt.id], k = flt.intensity ?? 1;
    if (f.overlay) tint(ctx, W, H, f.overlay[0], f.overlay[1], f.overlay[2] * k);
    if (f.overlay2) tint(ctx, W, H, f.overlay2[0], f.overlay2[1], f.overlay2[2] * k);
  }

  if (clip.masks && clip.masks.length) applyMasks(lc, clip, cx, cy, rot, sc * anim.sx * (tr.flipH ? -1 : 1), sc * anim.sy * (tr.flipV ? -1 : 1), size, S, W, H);

  if (hits) hits.push({ id: clip.id, cx: W / 2 + tr.x * W, cy: H / 2 + tr.y * H, w: size.w * tr.scale, h: size.h * tr.scale, rot: tr.rotation, W, H });
  return { canvas: lc, alpha: tr.opacity * anim.alpha * st.alpha, blend: clip.blend || 'source-over' };
}

// máscaras (retângulo/elipse) com suavização, expansão, opacidade e inversão
let maskCv = null;
export const defaultMask = (shape = 'ellipse') => ({ id: Math.random().toString(36).slice(2, 8), shape, x: 0, y: 0, w: 0.6, h: 0.6, rot: 0, feather: 20, expand: 0, opacity: 1, invert: false });
function applyMasks(lc, clip, cx, cy, rot, sx, sy, size, S, W, H) {
  if (!maskCv) maskCv = document.createElement('canvas');
  if (maskCv.width !== W || maskCv.height !== H) { maskCv.width = W; maskCv.height = H; }
  const m = maskCv.getContext('2d');
  m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.filter = 'none'; m.globalAlpha = 1;
  m.clearRect(0, 0, W, H);
  if (clip.masks.every((k) => k.invert)) { m.fillStyle = '#fff'; m.fillRect(0, 0, W, H); }
  for (const k of clip.masks) {
    m.save();
    m.translate(cx, cy); m.rotate((rot * Math.PI) / 180); m.scale(sx, sy);
    m.translate(k.x * size.w, k.y * size.h); m.rotate(((k.rot || 0) * Math.PI) / 180);
    const ex = (k.expand || 0) * S * 2;
    const w = Math.max(1, k.w * size.w + ex), h = Math.max(1, k.h * size.h + ex);
    const scale = Math.max(0.01, Math.abs(sx));
    m.filter = k.feather > 0 ? `blur(${(k.feather * S / scale).toFixed(1)}px)` : 'none';
    m.globalAlpha = k.opacity ?? 1;
    m.globalCompositeOperation = k.invert ? 'destination-out' : 'source-over';
    m.fillStyle = '#fff';
    m.beginPath();
    if (k.shape === 'rect') m.rect(-w / 2, -h / 2, w, h); else m.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    m.fill();
    m.restore();
  }
  const c = lc.getContext('2d');
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalAlpha = 1;
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(maskCv, 0, 0);
  c.restore();
}

// aplica um clipe de efeito/filtro sobre tudo que está abaixo
function applyGlobal(main, clip, t, W, H, S) {
  const lt = clamp(t - clip.start, 0, clip.duration);
  const lc = layer(3, W, H);
  const ctx = lc.getContext('2d');
  const st = { filter: [], dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1, S, prog: lt / Math.max(0.01, clip.duration) };
  for (const e of clip.effects) { const def = EFFECT_MAP[e.id]; if (def?.pre) def.pre(st, lt, e.intensity ?? 0.6); }
  const filters = [adjustCss(clip.adjust), clip.grade ? gradeFilter(clip.grade) : '', ...st.filter];
  if (clip.adjust.blur) filters.push(`blur(${(clip.adjust.blur / 100 * 20 * S).toFixed(1)}px)`);
  if (clip.filter && FILTER_MAP[clip.filter.id]) filters.push(filterCss(FILTER_MAP[clip.filter.id], clip.filter.intensity ?? 1));
  ctx.fillStyle = store.p.settings.background || '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 + st.dx, H / 2 + st.dy);
  ctx.rotate((st.rot * Math.PI) / 180);
  ctx.scale(st.scale, st.scale);
  ctx.filter = filters.filter(Boolean).join(' ') || 'none';
  ctx.globalAlpha = st.alpha;
  ctx.drawImage(main.canvas, -W / 2, -H / 2);
  ctx.restore();
  for (const e of clip.effects) { const def = EFFECT_MAP[e.id]; if (def?.post) def.post(ctx, W, H, lt, e.intensity ?? 0.6, S); }
  applyAdjustPost(ctx, W, H, clip.adjust);
  if (clip.filter && FILTER_MAP[clip.filter.id]) {
    const f = FILTER_MAP[clip.filter.id], k = clip.filter.intensity ?? 1;
    if (f.overlay) tint(ctx, W, H, f.overlay[0], f.overlay[1], f.overlay[2] * k);
    if (f.overlay2) tint(ctx, W, H, f.overlay2[0], f.overlay2[1], f.overlay2[2] * k);
  }
  main.save();
  main.setTransform(1, 0, 0, 1, 0, 0);
  main.globalAlpha = 1; main.globalCompositeOperation = 'source-over'; main.filter = 'none';
  main.drawImage(lc, 0, 0);
  main.restore();
}

// ---------- Renderização de quadro ----------
export function renderFrame(main, t, hits = null) {
  const W = main.canvas.width, H = main.canvas.height;
  const S = Math.min(W, H) / 1080;
  main.setTransform(1, 0, 0, 1, 0, 0);
  main.globalAlpha = 1; main.globalCompositeOperation = 'source-over'; main.filter = 'none';
  main.fillStyle = store.p.settings.background || '#000';
  main.fillRect(0, 0, W, H);
  const act = activeAt(t);
  for (const entry of act) {
    const tr = entry.track;
    if (tr.type !== 'video' || tr.hidden) continue;
    const vis = entry.items.filter((c) => VISUAL.includes(c.type));
    if (!vis.length) continue;
    if (entry.trans) {
      const { A, B, p, def } = entry.trans;
      const a = renderClip(0, A, t, W, H, S, null);
      const b = renderClip(1, B, t, W, H, S, null);
      // aplica opacidade de cada camada antes da transição
      const tl = layer(2, W, H); const tctx = tl.getContext('2d');
      tctx.save();
      try { def.render(tctx, withAlpha(a, 4, W, H), withAlpha(b, 5, W, H), clamp(p, 0, 1), W, H); } catch (e) { console.warn(e); }
      tctx.restore();
      main.drawImage(tl, 0, 0);
      if (hits) { const c = p < 0.5 ? A : B; hits.push(hitFor(c, W, H, S, main, t)); }
      for (const c of vis) if (c !== A && c !== B) compose(main, renderClip(0, c, t, W, H, S, hits));
      continue;
    }
    for (const c of vis) {
      if (c.type === 'effect' || c.type === 'filter') { applyGlobal(main, c, t, W, H, S); continue; }
      compose(main, renderClip(0, c, t, W, H, S, hits));
    }
  }
  if (hits) hits.reverse(); // topo primeiro
}

function withAlpha(r, idx, W, H) {
  if (r.alpha >= 0.999) return r.canvas;
  const c = layer(idx, W, H);
  const x = c.getContext('2d');
  x.globalAlpha = r.alpha;
  x.drawImage(r.canvas, 0, 0);
  return c;
}

function compose(main, r) {
  main.save();
  main.globalAlpha = clamp(r.alpha, 0, 1);
  main.globalCompositeOperation = r.blend;
  main.drawImage(r.canvas, 0, 0);
  main.restore();
}

function hitFor(clip, W, H, S, ctx, t) {
  const tr = transformAt(clip, clamp(t - clip.start, 0, clip.duration));
  const size = contentSize(clip, W, H, S, ctx);
  return { id: clip.id, cx: W / 2 + tr.x * W, cy: H / 2 + tr.y * H, w: size.w * tr.scale, h: size.h * tr.scale, rot: tr.rotation, W, H };
}
