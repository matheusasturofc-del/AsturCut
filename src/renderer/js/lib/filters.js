// FILTROS de cor (predefinições estilo "LUT"), todos grátis
import { lerp } from '../util.js';

// valores = alvo com intensidade 100%. overlay = camada de cor com modo de mistura
export const FILTERS = [
  { id: 'vivid', name: 'Vívido', cat: 'Populares', v: { saturate: 1.45, contrast: 1.1 } },
  { id: 'cinema', name: 'Cinema', cat: 'Populares', v: { contrast: 1.2, saturate: 0.85, brightness: 0.96 }, overlay: ['#00707a', 'soft-light', 0.35] },
  { id: 'tealorange', name: 'Teal & Orange', cat: 'Populares', v: { contrast: 1.15, saturate: 1.2 }, overlay: ['#ff8a3d', 'soft-light', 0.3], overlay2: ['#007a8a', 'multiply', 0.12] },
  { id: 'warm', name: 'Quente', cat: 'Populares', v: { sepia: 0.25, saturate: 1.2, brightness: 1.03 }, overlay: ['#ff9a3d', 'soft-light', 0.3] },
  { id: 'cool', name: 'Frio', cat: 'Populares', v: { hue: -10, saturate: 0.95, brightness: 1.02 }, overlay: ['#3d8bff', 'soft-light', 0.35] },
  { id: 'moody', name: 'Moody', cat: 'Populares', v: { contrast: 1.15, saturate: 0.7, brightness: 0.9 }, overlay: ['#1b2a3a', 'soft-light', 0.4] },
  { id: 'bw', name: 'P&B', cat: 'Preto e branco', v: { grayscale: 1 } },
  { id: 'bwdrama', name: 'P&B Drama', cat: 'Preto e branco', v: { grayscale: 1, contrast: 1.5, brightness: 0.95 } },
  { id: 'noir', name: 'Noir', cat: 'Preto e branco', v: { grayscale: 1, contrast: 1.7, brightness: 0.85 } },
  { id: 'silver', name: 'Prata', cat: 'Preto e branco', v: { grayscale: 1, contrast: 0.9, brightness: 1.1 } },
  { id: 'vintage', name: 'Vintage', cat: 'Retrô', v: { sepia: 0.5, contrast: 0.9, brightness: 1.05, saturate: 0.9 } },
  { id: 'retro70', name: 'Retrô 70', cat: 'Retrô', v: { sepia: 0.35, saturate: 1.3, contrast: 1.05 }, overlay: ['#ff6b3d', 'overlay', 0.18] },
  { id: 'faded', name: 'Desbotado', cat: 'Retrô', v: { contrast: 0.8, saturate: 0.7, brightness: 1.08 } },
  { id: 'lomo', name: 'Lomo', cat: 'Retrô', v: { contrast: 1.35, saturate: 1.3 }, overlay: ['#ffe066', 'soft-light', 0.25] },
  { id: 'matte', name: 'Matte', cat: 'Retrô', v: { contrast: 0.85, brightness: 1.05, saturate: 0.9 }, overlay: ['#40382f', 'lighten', 0.25] },
  { id: 'summer', name: 'Verão', cat: 'Estações', v: { saturate: 1.35, brightness: 1.06 }, overlay: ['#ffcc33', 'soft-light', 0.25] },
  { id: 'autumn', name: 'Outono', cat: 'Estações', v: { sepia: 0.3, saturate: 1.2, hue: -8 }, overlay: ['#c2571a', 'soft-light', 0.3] },
  { id: 'winter', name: 'Inverno', cat: 'Estações', v: { saturate: 0.7, brightness: 1.08 }, overlay: ['#a8d8ff', 'soft-light', 0.35] },
  { id: 'spring', name: 'Primavera', cat: 'Estações', v: { saturate: 1.2, brightness: 1.05 }, overlay: ['#ffb3d9', 'soft-light', 0.25] },
  { id: 'neonnight', name: 'Neon noturno', cat: 'Criativos', v: { saturate: 1.6, contrast: 1.2 }, overlay: ['#b026ff', 'soft-light', 0.4] },
  { id: 'golden', name: 'Dourado', cat: 'Criativos', v: { sepia: 0.2, saturate: 1.15 }, overlay: ['#ffbf00', 'soft-light', 0.4] },
  { id: 'rose', name: 'Rosé', cat: 'Criativos', v: { saturate: 1.1, brightness: 1.04 }, overlay: ['#ff6fa8', 'soft-light', 0.35] },
  { id: 'emerald', name: 'Esmeralda', cat: 'Criativos', v: { saturate: 1.1, hue: 10 }, overlay: ['#00c27a', 'soft-light', 0.35] },
  { id: 'lilac', name: 'Lilás', cat: 'Criativos', v: { saturate: 0.95, brightness: 1.05 }, overlay: ['#b794ff', 'soft-light', 0.4] },
  { id: 'cyber', name: 'Cyberpunk', cat: 'Criativos', v: { saturate: 1.4, contrast: 1.25 }, overlay: ['#ff00c8', 'soft-light', 0.3], overlay2: ['#00e5ff', 'soft-light', 0.25] },
  { id: 'sunset', name: 'Pôr do sol', cat: 'Criativos', v: { saturate: 1.25, contrast: 1.05 }, overlay: ['#ff5e3a', 'soft-light', 0.4] },
  { id: 'arctic', name: 'Ártico', cat: 'Criativos', v: { saturate: 0.6, brightness: 1.12, contrast: 1.05 }, overlay: ['#7fe8ff', 'soft-light', 0.3] },
  { id: 'sepiaplus', name: 'Sépia forte', cat: 'Retrô', v: { sepia: 1, contrast: 1.1 } },
];
export const FILTER_MAP = Object.fromEntries(FILTERS.map((f) => [f.id, f]));
export const FILTER_CATS = [...new Set(FILTERS.map((f) => f.cat))];

const NEUTRAL = { brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0, hue: 0 };

export function filterCss(f, k = 1) {
  if (!f) return '';
  const parts = [];
  for (const [key, val] of Object.entries(f.v)) {
    const v = lerp(NEUTRAL[key], val, k);
    if (key === 'hue') parts.push(`hue-rotate(${v}deg)`);
    else parts.push(`${key}(${v.toFixed(3)})`);
  }
  return parts.join(' ');
}

// CSS para miniaturas
export function filterPreviewCss(f) { return filterCss(f, 1); }
