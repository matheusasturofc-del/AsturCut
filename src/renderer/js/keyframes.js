// Keyframes: animar posição, escala, rotação, opacidade e volume ao longo do clipe
import { store } from './store.js';
import { clamp, ease } from './util.js';

// propriedades animáveis: onde fica o valor base no clipe
export const KF_PROPS = {
  x: { get: (c) => c.transform.x, set: (c, v) => (c.transform.x = v) },
  y: { get: (c) => c.transform.y, set: (c, v) => (c.transform.y = v) },
  scale: { get: (c) => c.transform.scale, set: (c, v) => (c.transform.scale = v) },
  rotation: { get: (c) => c.transform.rotation, set: (c, v) => (c.transform.rotation = v) },
  opacity: { get: (c) => c.transform.opacity, set: (c, v) => (c.transform.opacity = v) },
  volume: { get: (c) => c.volume ?? 1, set: (c, v) => (c.volume = v) },
};

export const EASINGS = [
  ['linear', 'Linear'],
  ['easeIn', 'Ease in (acelerar)'],
  ['easeOut', 'Ease out (desacelerar)'],
  ['ease', 'Ease in-out (suave)'],
  ['hold', 'Constante (salto)'],
];

const EASE_FN = {
  linear: (p) => p,
  easeIn: (p) => p * p * p,
  easeOut: ease.out,
  ease: ease.inOut,
  hold: () => 0,
};

export const hasKf = (c, prop) => !!(c && c.kf && c.kf[prop] && c.kf[prop].length);
export const anyKf = (c) => !!(c && c.kf && Object.values(c.kf).some((a) => a && a.length));

// valor de uma propriedade no tempo local lt do clipe
export function valueAt(c, prop, lt) {
  const base = KF_PROPS[prop].get(c);
  if (!hasKf(c, prop)) return base;
  const a = c.kf[prop];
  if (lt <= a[0].t) return a[0].v;
  const last = a[a.length - 1];
  if (lt >= last.t) return last.v;
  for (let i = 0; i < a.length - 1; i++) {
    const k0 = a[i], k1 = a[i + 1];
    if (lt >= k0.t && lt <= k1.t) {
      const p = (lt - k0.t) / Math.max(1e-6, k1.t - k0.t);
      const e = (EASE_FN[k0.e || 'linear'] || EASE_FN.linear)(p);
      return k0.v + (k1.v - k0.v) * e;
    }
  }
  return base;
}

// transformação efetiva (com keyframes) no tempo local lt
export function transformAt(c, lt) {
  if (!anyKf(c)) return c.transform;
  return {
    ...c.transform,
    x: valueAt(c, 'x', lt), y: valueAt(c, 'y', lt), scale: valueAt(c, 'scale', lt),
    rotation: valueAt(c, 'rotation', lt), opacity: valueAt(c, 'opacity', lt),
  };
}

export const localTime = (c, t = store.time) => clamp(t - c.start, 0, c.duration);
const EPS = 1 / 120;

// define o valor: se a propriedade está animada, cria/atualiza o keyframe no cursor
export function setValue(c, prop, v, t = store.time) {
  if (!hasKf(c, prop)) { KF_PROPS[prop].set(c, v); return; }
  const lt = localTime(c, t);
  const a = c.kf[prop];
  const k = a.find((f) => Math.abs(f.t - lt) < EPS);
  if (k) k.v = v;
  else { a.push({ t: lt, v, e: 'linear' }); a.sort((x, y) => x.t - y.t); }
}

// liga/desliga a animação (cronômetro) de uma propriedade
export function toggleAnim(c, prop) {
  c.kf = c.kf || {};
  if (hasKf(c, prop)) {
    KF_PROPS[prop].set(c, valueAt(c, prop, localTime(c)));
    delete c.kf[prop];
  } else {
    c.kf[prop] = [{ t: localTime(c), v: KF_PROPS[prop].get(c), e: 'linear' }];
  }
}

export function keyAtCursor(c, prop) {
  if (!hasKf(c, prop)) return null;
  const lt = localTime(c);
  return c.kf[prop].find((f) => Math.abs(f.t - lt) < EPS) || null;
}

// adiciona ou remove o keyframe no cursor
export function toggleKey(c, prop) {
  if (!hasKf(c, prop)) { toggleAnim(c, prop); return; }
  const k = keyAtCursor(c, prop);
  if (k) {
    c.kf[prop] = c.kf[prop].filter((f) => f !== k);
    if (!c.kf[prop].length) { KF_PROPS[prop].set(c, k.v); delete c.kf[prop]; }
  } else setValue(c, prop, valueAt(c, prop, localTime(c)));
}

// todos os tempos de keyframe do clipe (para navegação e desenho na timeline)
export function keyTimes(c) {
  if (!anyKf(c)) return [];
  const s = new Set();
  for (const a of Object.values(c.kf)) for (const f of a || []) s.add(Math.round(f.t * 1000) / 1000);
  return [...s].sort((a, b) => a - b);
}

export function jumpKey(c, dir) {
  const lt = localTime(c);
  const ts = keyTimes(c);
  const target = dir > 0 ? ts.find((x) => x > lt + EPS) : [...ts].reverse().find((x) => x < lt - EPS);
  if (target != null) store.setTime(c.start + target);
}

// suavização dos keyframes que estão no cursor
export function setEaseAtCursor(c, e) {
  const lt = localTime(c);
  for (const a of Object.values(c.kf || {})) for (const f of a || []) if (Math.abs(f.t - lt) < EPS) f.e = e;
}
export function easeAtCursor(c) {
  const lt = localTime(c);
  for (const a of Object.values(c.kf || {})) for (const f of a || []) if (Math.abs(f.t - lt) < EPS) return f.e || 'linear';
  return null;
}
