// Preferências e personalização (tema, layout, editor). Salvas no computador do usuário.
import { Emitter } from './util.js';

const KEY = 'asturcut.settings.v1';

// Temas prontos. "astur" é o padrão: escuro com destaque ciano (estilo do usuário).
export const THEMES = {
  astur:   { name: 'Astur Ciano (padrão)', accent: '#1ccfdc', bg: '#141416', panel: '#1e1e21', panel2: '#26262a', panel3: '#2f2f34', border: '#2c2c31', text: '#e9e9ec', muted: '#8d8d96' },
  roxo:    { name: 'Roxo Neon', accent: '#a855f7', bg: '#120f18', panel: '#1b1723', panel2: '#241f2e', panel3: '#2e2839', border: '#2c2638', text: '#ece8f3', muted: '#948ca3' },
  vermelho:{ name: 'Vermelho Studio', accent: '#ef4444', bg: '#141212', panel: '#1f1b1b', panel2: '#282222', panel3: '#322a2a', border: '#302828', text: '#efe9e9', muted: '#998f8f' },
  lima:    { name: 'Verde Lima', accent: '#84cc16', bg: '#121411', panel: '#1b1e19', panel2: '#232720', panel3: '#2c3128', border: '#2a2e26', text: '#eaeee7', muted: '#8e9688' },
  laranja: { name: 'Laranja Pôr do Sol', accent: '#f97316', bg: '#151311', panel: '#201c19', panel2: '#29241f', panel3: '#332d27', border: '#312a24', text: '#f0ebe6', muted: '#9a9087' },
  rosa:    { name: 'Rosa Pop', accent: '#ec4899', bg: '#151114', panel: '#201a1e', panel2: '#2a2127', panel3: '#342a31', border: '#33272f', text: '#f1e8ee', muted: '#9c8c97' },
  oceano:  { name: 'Azul Oceano', accent: '#3b82f6', bg: '#0e1218', panel: '#151b24', panel2: '#1c2430', panel3: '#242e3c', border: '#222c3a', text: '#e6ecf4', muted: '#8592a5' },
  dourado: { name: 'Dourado Premium', accent: '#eab308', bg: '#121110', panel: '#1c1a17', panel2: '#25221e', panel3: '#2f2b26', border: '#2d2924', text: '#f1ede4', muted: '#9a9384' },
  oled:    { name: 'OLED Preto', accent: '#1ccfdc', bg: '#000000', panel: '#0b0b0c', panel2: '#141416', panel3: '#1c1c1f', border: '#1d1d20', text: '#f2f2f4', muted: '#85858e' },
  claro:   { name: 'Claro', accent: '#0aa5b3', bg: '#e9eaee', panel: '#ffffff', panel2: '#f3f4f6', panel3: '#e6e7eb', border: '#dcdde2', text: '#1b1c20', muted: '#6b6e78' },
};

export const DEFAULTS = {
  theme: 'astur',
  accent: THEMES.astur.accent,
  bg: THEMES.astur.bg, panel: THEMES.astur.panel, panel2: THEMES.astur.panel2, panel3: THEMES.astur.panel3,
  border: THEMES.astur.border, text: THEMES.astur.text, muted: THEMES.astur.muted,
  radius: 8,
  uiScale: 100,
  uiFont: 'Inter',
  gap: 6,
  // layout
  layoutPreset: 'padrao',
  libWidth: 470,
  inspWidth: 420,
  timelineHeight: 340,
  panelOrder: ['library', 'player', 'inspector'],
  showLibrary: true,
  showInspector: true,
  playerBg: 'dark',
  trackHeight: 54,
  showThumbs: true,
  showWaves: true,
  // editor
  imageDuration: 5,
  textDuration: 4,
  transitionDuration: 0.6,
  snapping: true,
  magnet: false,
  autosave: 2,
  previewQuality: 0.5,
  defaultAspect: '16:9',
  defaultFps: 30,
  loopPlayback: false,
  showGrid: false,
  favoriteFonts: [],
  recent: [],
};

class Settings extends Emitter {
  constructor() {
    super();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
    this.data = { ...DEFAULTS, ...saved };
  }
  get(k) { return this.data[k]; }
  set(k, v, silent = false) {
    this.data[k] = v;
    this.save();
    if (!silent) this.emit('change', k, v);
    if (['accent', 'bg', 'panel', 'panel2', 'panel3', 'border', 'text', 'muted', 'radius', 'uiScale', 'uiFont', 'gap', 'playerBg', 'trackHeight'].includes(k)) applyTheme();
  }
  patch(obj) {
    Object.assign(this.data, obj);
    this.save();
    for (const k of Object.keys(obj)) this.emit('change', k, obj[k]);
    applyTheme();
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {} }
  reset(keys) {
    const obj = {};
    for (const k of keys || Object.keys(DEFAULTS)) if (k !== 'recent') obj[k] = structuredClone(DEFAULTS[k]);
    this.patch(obj);
  }
  useTheme(id) {
    const t = THEMES[id];
    if (!t) return;
    const { name, ...colors } = t;
    this.patch({ theme: id, ...colors });
  }
}

export const settings = new Settings();

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyTheme() {
  const d = settings.data;
  const r = document.documentElement.style;
  const [ar, ag, ab] = hexToRgb(d.accent);
  r.setProperty('--accent', d.accent);
  r.setProperty('--accent-rgb', `${ar},${ag},${ab}`);
  r.setProperty('--accent-ink', luminance(d.accent) > 0.55 ? '#0b0b0c' : '#ffffff');
  r.setProperty('--bg', d.bg);
  r.setProperty('--panel', d.panel);
  r.setProperty('--panel2', d.panel2);
  r.setProperty('--panel3', d.panel3);
  r.setProperty('--border', d.border);
  r.setProperty('--text', d.text);
  r.setProperty('--muted', d.muted);
  r.setProperty('--radius', d.radius + 'px');
  r.setProperty('--gap', d.gap + 'px');
  r.setProperty('--ui-font', `'${d.uiFont}', 'Segoe UI', system-ui, sans-serif`);
  r.setProperty('--track-h', d.trackHeight + 'px');
  document.documentElement.classList.toggle('light', luminance(d.bg) > 0.5);
  try { window.astur?.setZoom?.(d.uiScale / 100); } catch {}
  const pbg = { dark: '#0c0c0d', black: '#000', gray: '#3a3a3f', checker: 'checker' }[d.playerBg] || '#0c0c0d';
  r.setProperty('--player-bg', pbg === 'checker' ? 'repeating-conic-gradient(#2a2a2e 0 25%, #1f1f22 0 50%) 50% / 24px 24px' : pbg);
}
