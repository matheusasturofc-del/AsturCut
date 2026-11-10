// ANIMAÇÕES de entrada, saída e loop (para vídeos, imagens, textos e stickers)
import { ease } from '../util.js';

// p: 0 (início) -> 1 (totalmente visível). Retorna modificações.
export const ANIM_IN = [
  { id: 'fade', name: 'Aparecer', f: (p) => ({ alpha: p }) },
  { id: 'zoomIn', name: 'Zoom in', f: (p) => ({ scale: 0.3 + 0.7 * ease.out(p), alpha: p }) },
  { id: 'zoomOut', name: 'Zoom out', f: (p) => ({ scale: 1.8 - 0.8 * ease.out(p), alpha: p }) },
  { id: 'slideL', name: 'Deslizar da esquerda', f: (p) => ({ dx: -(1 - ease.out(p)) * 0.6, alpha: p }) },
  { id: 'slideR', name: 'Deslizar da direita', f: (p) => ({ dx: (1 - ease.out(p)) * 0.6, alpha: p }) },
  { id: 'slideU', name: 'Subir', f: (p) => ({ dy: (1 - ease.out(p)) * 0.5, alpha: p }) },
  { id: 'slideD', name: 'Descer', f: (p) => ({ dy: -(1 - ease.out(p)) * 0.5, alpha: p }) },
  { id: 'pop', name: 'Pop', f: (p) => ({ scale: Math.max(0, ease.back(p)), alpha: Math.min(1, p * 3) }) },
  { id: 'elastic', name: 'Elástico', f: (p) => ({ scale: Math.max(0, ease.elastic(p)) }) },
  { id: 'drop', name: 'Cair e quicar', f: (p) => ({ dy: -(1 - ease.bounce(p)) * 0.8 }) },
  { id: 'spin', name: 'Girar', f: (p) => ({ rot: (1 - ease.out(p)) * -360, scale: ease.out(p), alpha: p }) },
  { id: 'swing', name: 'Pêndulo', f: (p) => ({ rot: Math.sin((1 - p) * Math.PI * 3) * (1 - p) * 30, alpha: Math.min(1, p * 2) }) },
  { id: 'flip', name: 'Virar', f: (p) => ({ sx: ease.out(p), alpha: p }) },
  { id: 'blurIn', name: 'Desfocar', f: (p) => ({ blur: (1 - p) * 30, alpha: p }) },
  { id: 'stretch', name: 'Esticar', f: (p) => ({ sx: 1 + (1 - ease.out(p)) * 1.5, sy: ease.out(p), alpha: p }) },
  { id: 'typewriter', name: 'Máquina de escrever', textOnly: true, f: (p) => ({ chars: p }) },
  { id: 'wordByWord', name: 'Palavra por palavra', textOnly: true, f: (p) => ({ words: p }) },
  // 1.5: mais animações
  { id: 'zoomBlur', name: 'Zoom com desfoque', f: (p) => ({ scale: 1.6 - 0.6 * ease.out(p), blur: (1 - p) * 25, alpha: p }) },
  { id: 'rise', name: 'Surgir de baixo', f: (p) => ({ dy: (1 - ease.out(p)) * 0.15, scale: 0.9 + 0.1 * ease.out(p), alpha: p }) },
  { id: 'fall', name: 'Cair de cima', f: (p) => ({ dy: -(1 - ease.out(p)) * 0.15, scale: 0.9 + 0.1 * ease.out(p), alpha: p }) },
  { id: 'bounceIn', name: 'Quicar', f: (p) => ({ scale: Math.max(0, ease.bounce(p)), alpha: Math.min(1, p * 4) }) },
  { id: 'rollL', name: 'Rolar da esquerda', f: (p) => ({ dx: -(1 - ease.out(p)) * 0.6, rot: (1 - ease.out(p)) * -180, alpha: p }) },
  { id: 'rollR', name: 'Rolar da direita', f: (p) => ({ dx: (1 - ease.out(p)) * 0.6, rot: (1 - ease.out(p)) * 180, alpha: p }) },
  { id: 'flipY', name: 'Virar vertical', f: (p) => ({ sy: ease.out(p), alpha: p }) },
  { id: 'squash', name: 'Amassar', f: (p) => ({ sx: 1 + 0.4 * (1 - ease.elastic(p)), sy: Math.max(0.01, ease.elastic(p)) }) },
  { id: 'tada', name: 'Tcharam', f: (p) => ({ scale: p < 0.3 ? 0.9 + p : 1 + 0.1 * Math.sin((p - 0.3) * 20) * (1 - p), rot: p > 0.3 ? 4 * Math.sin((p - 0.3) * 25) * (1 - p) : -3, alpha: Math.min(1, p * 4) }) },
  { id: 'glitchIn', name: 'Glitch', f: (p) => ({ dx: p < 0.8 ? (Math.sin(p * 90) * 0.04) * (1 - p) : 0, alpha: p < 0.8 ? (Math.floor(p * 20) % 2 ? 1 : 0.3) : 1 }) },
  { id: 'unfold', name: 'Desdobrar', f: (p) => ({ sx: ease.out(Math.min(1, p * 2)), sy: Math.max(0.05, ease.out(Math.max(0, p * 2 - 1))), alpha: Math.min(1, p * 3) }) },
  { id: 'swirl', name: 'Redemoinho', f: (p) => ({ rot: (1 - ease.out(p)) * 720, scale: ease.out(p), alpha: p }) },
  { id: 'slideUBounce', name: 'Subir e quicar', f: (p) => ({ dy: (1 - ease.bounce(p)) * 0.5 }) },
  { id: 'focus', name: 'Entrar em foco', f: (p) => ({ blur: (1 - ease.out(p)) * 40, alpha: Math.min(1, p * 1.5) }) },
  { id: 'letterSpread', name: 'Letras surgindo', textOnly: true, f: (p) => ({ chars: ease.out(p), alpha: Math.min(1, p * 3) }) },
];

export const ANIM_LOOP = [
  { id: 'pulse', name: 'Pulsar', f: (t) => ({ scale: 1 + 0.06 * Math.sin(t * Math.PI * 2) }) },
  { id: 'float', name: 'Flutuar', f: (t) => ({ dy: 0.02 * Math.sin(t * Math.PI) }) },
  { id: 'wiggle', name: 'Balançar', f: (t) => ({ rot: 6 * Math.sin(t * Math.PI * 2) }) },
  { id: 'blink', name: 'Piscar', f: (t) => ({ alpha: Math.floor(t * 3) % 2 ? 0.25 : 1 }) },
  { id: 'spinLoop', name: 'Girar contínuo', f: (t) => ({ rot: (t * 120) % 360 }) },
  { id: 'heartbeat', name: 'Batimento', f: (t) => { const p = t % 1; return { scale: 1 + (p < 0.15 ? Math.sin(p / 0.15 * Math.PI) * 0.12 : 0) }; } },
  { id: 'jello', name: 'Gelatina', f: (t) => ({ sx: 1 + 0.08 * Math.sin(t * 8), sy: 1 - 0.08 * Math.sin(t * 8) }) },
  { id: 'shakeLoop', name: 'Tremer', f: (t) => ({ dx: 0.004 * Math.sin(t * 60), dy: 0.004 * Math.cos(t * 53) }) },
  { id: 'breathe', name: 'Respirar', f: (t) => ({ scale: 1 + 0.03 * Math.sin(t * Math.PI), alpha: 0.85 + 0.15 * Math.sin(t * Math.PI) }) },
  { id: 'swingLoop', name: 'Pêndulo contínuo', f: (t) => ({ rot: 10 * Math.sin(t * Math.PI * 1.5) }) },
  { id: 'bounceLoop', name: 'Quicar contínuo', f: (t) => ({ dy: -Math.abs(Math.sin(t * Math.PI * 1.5)) * 0.04 }) },
  { id: 'orbit', name: 'Órbita', f: (t) => ({ dx: 0.03 * Math.cos(t * Math.PI), dy: 0.03 * Math.sin(t * Math.PI) }) },
  { id: 'flicker', name: 'Lâmpada falhando', f: (t) => ({ alpha: Math.sin(t * 37) > 0.85 || Math.sin(t * 13) > 0.95 ? 0.3 : 1 }) },
  { id: 'zoomLoop', name: 'Aproximar devagar (Ken Burns)', f: (t) => ({ scale: 1 + 0.015 * t }) },
  { id: 'rubber', name: 'Borracha', f: (t) => { const p = t % 1.2; return p < 0.4 ? { sx: 1 + 0.15 * Math.sin(p / 0.4 * Math.PI), sy: 1 - 0.12 * Math.sin(p / 0.4 * Math.PI) } : {}; } },
  { id: 'glitchLoop', name: 'Glitch contínuo', f: (t) => (Math.sin(t * 9) > 0.92 ? { dx: 0.02 * Math.sin(t * 200), alpha: 0.7 } : {}) },
];

export const ANIM_IN_MAP = Object.fromEntries(ANIM_IN.map((a) => [a.id, a]));
export const ANIM_LOOP_MAP = Object.fromEntries(ANIM_LOOP.map((a) => [a.id, a]));

export function combine(base, m) {
  if (!m) return base;
  if (m.alpha != null) base.alpha *= m.alpha;
  if (m.scale != null) base.scale *= m.scale;
  if (m.sx != null) base.sx *= m.sx;
  if (m.sy != null) base.sy *= m.sy;
  if (m.dx != null) base.dx += m.dx;
  if (m.dy != null) base.dy += m.dy;
  if (m.rot != null) base.rot += m.rot;
  if (m.blur != null) base.blur += m.blur;
  if (m.chars != null) base.chars = Math.min(base.chars, m.chars);
  if (m.words != null) base.words = Math.min(base.words, m.words);
  return base;
}

// calcula animação de um clipe no tempo local lt
export function clipAnimation(clip, lt) {
  const st = { alpha: 1, scale: 1, sx: 1, sy: 1, dx: 0, dy: 0, rot: 0, blur: 0, chars: 1, words: 1 };
  const d = clip.duration;
  if (clip.animIn && ANIM_IN_MAP[clip.animIn.id]) {
    const ad = Math.min(clip.animIn.dur || 0.5, d);
    if (lt < ad) combine(st, ANIM_IN_MAP[clip.animIn.id].f(Math.max(0, lt / ad)));
  }
  if (clip.animOut && ANIM_IN_MAP[clip.animOut.id]) {
    const ad = Math.min(clip.animOut.dur || 0.5, d);
    const rem = d - lt;
    if (rem < ad) combine(st, ANIM_IN_MAP[clip.animOut.id].f(Math.max(0, rem / ad)));
  }
  if (clip.animLoop && ANIM_LOOP_MAP[clip.animLoop.id]) {
    combine(st, ANIM_LOOP_MAP[clip.animLoop.id].f(lt * (clip.animLoop.speed || 1)));
  }
  return st;
}
