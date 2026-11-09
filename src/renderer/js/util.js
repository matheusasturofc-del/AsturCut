// Utilitários gerais da interface
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const deepClone = (o) => JSON.parse(JSON.stringify(o));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) node.style.setProperty(sk, sv); else node.style[sk] = sv; } }
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function fmtTime(sec, fps = 30, withFrames = true) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec - Math.floor(sec)) * fps + 1e-6);
  const p = (n) => String(n).padStart(2, '0');
  return withFrames ? `${p(h)}:${p(m)}:${p(s)}:${p(f)}` : `${h ? p(h) + ':' : ''}${p(m)}:${p(s)}`;
}

export function fmtShort(sec) {
  sec = Math.max(0, sec || 0);
  if (sec < 60) return sec.toFixed(1) + 's';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export function fmtBytes(b) {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i ? 1 : 0) + ' ' + u[i];
}

// Gerador pseudo-aleatório determinístico (para efeitos de partículas estáveis no tempo)
export function rand(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  bounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

// Mini emissor de eventos
export class Emitter {
  constructor() { this.map = new Map(); }
  on(ev, fn) { if (!this.map.has(ev)) this.map.set(ev, new Set()); this.map.get(ev).add(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this.map.get(ev)?.delete(fn); }
  emit(ev, ...a) { this.map.get(ev)?.forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } }); }
}

// ---------- Toast ----------
export function toast(msg, type = 'info', ms = 2600) {
  let box = $('#toasts');
  if (!box) { box = el('div', { id: 'toasts' }); document.body.append(box); }
  const t = el('div', { class: 'toast ' + type }, msg);
  box.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  return t;
}

// ---------- Modal ----------
export function modal({ title, body, actions = [], width = 520, onClose, className = '' }) {
  const overlay = el('div', { class: 'modal-overlay' });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const box = el('div', { class: 'modal ' + className, style: { width: typeof width === 'number' ? width + 'px' : width } },
    el('div', { class: 'modal-head' }, el('span', {}, title || ''), el('button', { class: 'icon-btn', title: 'Fechar', onclick: close, html: icon('close') })),
    el('div', { class: 'modal-body' }, body),
    actions.length ? el('div', { class: 'modal-foot' }, actions.map((a) =>
      el('button', { class: 'btn ' + (a.primary ? 'primary' : '') + (a.danger ? ' danger' : ''), onclick: () => { const r = a.onClick && a.onClick(close); if (r !== false && !a.keepOpen) close(); } }, a.label))) : null);
  overlay.append(box);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  return { close, box, overlay };
}

export function confirmDialog(title, text, okLabel = 'OK', danger = false) {
  return new Promise((res) => {
    let done = false;
    modal({
      title, width: 420,
      body: el('p', { class: 'muted' }, text),
      actions: [
        { label: 'Cancelar', onClick: () => { done = true; res(false); } },
        { label: okLabel, primary: !danger, danger, onClick: () => { done = true; res(true); } },
      ],
      onClose: () => { if (!done) res(false); },
    });
  });
}

export function promptDialog(title, value = '') {
  return new Promise((res) => {
    const input = el('input', { class: 'input', value, style: { width: '100%' } });
    let done = false;
    const m = modal({
      title, width: 420, body: input,
      actions: [
        { label: 'Cancelar', onClick: () => { done = true; res(null); } },
        { label: 'OK', primary: true, onClick: () => { done = true; res(input.value); } },
      ],
      onClose: () => { if (!done) res(null); },
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; res(input.value); m.close(); } });
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

// ---------- Menu de contexto / dropdown ----------
let openMenu = null;
export function closeMenus() { if (openMenu) { openMenu.remove(); openMenu = null; } }
document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenus(); }, true);
window.addEventListener('blur', closeMenus);

export function contextMenu(x, y, items) {
  closeMenus();
  const menu = el('div', { class: 'ctx-menu' });
  for (const it of items) {
    if (it === '-') { menu.append(el('div', { class: 'ctx-sep' })); continue; }
    if (!it) continue;
    const row = el('div', { class: 'ctx-item' + (it.disabled ? ' disabled' : '') + (it.checked ? ' checked' : '') },
      el('span', { class: 'ctx-check' }, it.checked ? '✓' : ''),
      el('span', { class: 'ctx-label' }, it.color ? el('i', { class: 'ctx-swatch', style: { background: it.color } }) : null, it.color ? it.label.replace('● ', '') : it.label),
      it.shortcut ? el('span', { class: 'ctx-short' }, it.shortcut) : null,
      it.submenu ? el('span', { class: 'ctx-short' }, '›') : null);
    if (it.submenu) {
      row.addEventListener('mouseenter', () => {
        menu.querySelectorAll('.ctx-menu').forEach((m) => m.remove());
        const r = row.getBoundingClientRect();
        const sub = buildSub(it.submenu);
        menu.append(sub);
        const mr = menu.getBoundingClientRect();
        sub.style.left = (r.right - mr.left) + 'px';
        sub.style.top = (r.top - mr.top) + 'px';
      });
    } else if (!it.disabled) {
      row.addEventListener('click', () => { closeMenus(); it.onClick && it.onClick(); });
    }
    menu.append(row);
  }
  function buildSub(sitems) {
    const sub = el('div', { class: 'ctx-menu sub' });
    for (const s of sitems) {
      if (s === '-') { sub.append(el('div', { class: 'ctx-sep' })); continue; }
      sub.append(el('div', { class: 'ctx-item' + (s.checked ? ' checked' : ''), onclick: () => { closeMenus(); s.onClick && s.onClick(); } },
        el('span', { class: 'ctx-check' }, s.checked ? '✓' : ''), el('span', { class: 'ctx-label' }, s.color ? el('i', { class: 'ctx-swatch', style: { background: s.color } }) : null, s.color ? s.label.replace('● ', '') : s.label)));
    }
    return sub;
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 6) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 6) + 'px';
  openMenu = menu;
  return menu;
}

export function dropdownFrom(anchor, items) {
  const r = anchor.getBoundingClientRect();
  return contextMenu(r.left, r.bottom + 4, items);
}

// ---------- Arrastar genérico ----------
export function dragHandler(e, onMove, onUp, cursor) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  if (cursor) document.body.style.cursor = cursor;
  document.body.classList.add('dragging');
  const move = (ev) => onMove(ev, ev.clientX - sx, ev.clientY - sy);
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.style.cursor = '';
    document.body.classList.remove('dragging');
    onUp && onUp(ev, ev.clientX - sx, ev.clientY - sy);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  // toque: o sistema pode cancelar o gesto (rolagem) — trata como soltar
  window.addEventListener('pointercancel', up, { once: true });
}

// ---------- Ícones SVG (traço) ----------
const P = {
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  forward: '<path d="M4 5v14"/><path d="M8 12h12M15 7l5 5-5 5"/>',
  ripple: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/><path d="M2 21h20" stroke-dasharray="2 2"/>',
  mixer: '<path d="M6 4v16M12 4v16M18 4v16"/><rect x="4" y="13" width="4" height="3" rx="1" fill="currentColor"/><rect x="10" y="7" width="4" height="3" rx="1" fill="currentColor"/><rect x="16" y="10" width="4" height="3" rx="1" fill="currentColor"/>',
  stopwatch: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  diamond: '<path d="M12 3l9 9-9 9-9-9z"/>',
  pipette: '<path d="M14 4l6 6-2 2-6-6zM12 8L4 16v4h4l8-8"/>',
  compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/><path d="M12 4h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7z" fill="currentColor" opacity=".35"/>',
  bin: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v4M10 13h4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  gridview: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  eyePlay: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>',
  maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>',
  audio: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  sticker: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M21 12a9 9 0 0 1-9-9v5a4 4 0 0 0 4 4z"/><circle cx="9" cy="11" r="1" fill="currentColor"/><path d="M8.5 15a4 4 0 0 0 6 0"/>',
  effects: '<path d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.7z"/>',
  transitions: '<path d="M4 5l8 7-8 7zM20 5l-8 7 8 7z"/>',
  filters: '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>',
  adjust: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  font: '<path d="M4 19l6-14h1l6 14M6.5 14h8"/><path d="M18 19v-6"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
  prev: '<path d="M6 5v14M19 5L9 12l10 7z"/>',
  next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  split: '<path d="M12 3v18"/><path d="M8 7l-4 5 4 5M16 7l4 5-4 5"/>',
  splitL: '<path d="M14 3v18"/><path d="M4 8h6v8H4z"/><path d="M5 9l4 6M9 9l-4 6"/>',
  splitR: '<path d="M10 3v18"/><path d="M14 8h6v8h-6z"/><path d="M15 9l4 6M19 9l-4 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  cursor: '<path d="M5 3l14 8-6 2-3 6z"/>',
  blade: '<path d="M14 4l6 6-11 11H3v-6z"/><path d="M11 7l6 6"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/>',
  snap: '<path d="M4 12h6M14 12h6M12 4v16"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  min: '<path d="M5 12h14"/>',
  max: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  import: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
  export: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 22 9.7C22 5.9 17.5 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7" r="1.2" fill="currentColor"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 13h18M9 4v9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevDown: '<path d="M6 9l6 6 6-6"/>',
  chevRight: '<path d="M9 6l6 6-6 6"/>',
  loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  grid: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
  flip: '<path d="M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  detach: '<path d="M3 17h7M14 17h7"/><path d="M5 13l2-6h10l2 6"/><path d="M9 21l3-4 3 4"/>',
  freeze: '<path d="M12 2v20M4.9 7l14.2 10M19.1 7L4.9 17"/>',
  star: '<path d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.7z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  marker: '<path d="M6 3h12v14l-6 4-6-4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  wand: '<path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20L14 10"/><path d="M18.5 9.5l1 1M18.5 2.5l1-1"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  silence: '<path d="M3 12h2M7 8v8M10 10v4M14 12h2M18 12h3" /><path d="M13 6l-2 12" stroke-dasharray="2 2"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3"/>',
  record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  screen: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  webcam: '<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="2.5"/><path d="M8 21h8M12 17v4"/>',
  drag: '<circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/>',
};
export function icon(name, size = 16) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.dot}</svg>`;
}
