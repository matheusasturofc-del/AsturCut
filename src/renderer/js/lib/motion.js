// Funções puras de movimento usadas pelo compositor: estabilização e rastreamento de máscara
export const interp = (arr, tt, keyT = 0) => {
  if (!arr.length) return null;
  if (tt <= arr[0][keyT]) return arr[0];
  if (tt >= arr[arr.length - 1][keyT]) return arr[arr.length - 1];
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid][keyT] <= tt) lo = mid; else hi = mid; }
  const a = arr[lo], b = arr[hi], p = (tt - a[keyT]) / Math.max(1e-6, b[keyT] - a[keyT]);
  return a.map((v, i) => v + (b[i] - v) * p);
};

// correção (dx, dy em fração do quadro) e zoom no tempo da mídia st
const stabCache = new WeakMap();
export function stabAt(c, st) {
  const s = c.stab;
  if (!s || !s.on || !s.raw || s.raw.length < 3) return null;
  const key = s.smooth + '|' + s.raw.length;
  let e = stabCache.get(c);
  if (!e || e.key !== key) {
    const raw = s.raw, n = raw.length, out = [];
    let maxC = 0;
    for (let i = 0; i < n; i++) {
      const tt = raw[i][0];
      let sx = 0, sy = 0, sw = 0;
      for (let j = i; j >= 0 && tt - raw[j][0] <= s.smooth * 1.5; j--) { const wgt = Math.exp(-(((tt - raw[j][0]) / s.smooth) ** 2) * 2); sx += raw[j][1] * wgt; sy += raw[j][2] * wgt; sw += wgt; }
      for (let j = i + 1; j < n && raw[j][0] - tt <= s.smooth * 1.5; j++) { const wgt = Math.exp(-(((raw[j][0] - tt) / s.smooth) ** 2) * 2); sx += raw[j][1] * wgt; sy += raw[j][2] * wgt; sw += wgt; }
      const cx = sx / sw - raw[i][1], cy = sy / sw - raw[i][2];
      maxC = Math.max(maxC, Math.abs(cx), Math.abs(cy));
      out.push([tt, cx, cy]);
    }
    e = { key, out, zoom: Math.min(1.3, 1 + maxC * 2.2) };
    stabCache.set(c, e);
  }
  const r = interp(e.out, st);
  return { dx: r[1], dy: r[2], zoom: s.zoom || e.zoom };
}

export function maskPosAt(mask, lt) {
  if (!mask.track || mask.track.length < 2) return { x: mask.x, y: mask.y };
  const r = interp(mask.track.map((p) => [p.t, p.x, p.y]), lt);
  return { x: r[1], y: r[2] };
}

