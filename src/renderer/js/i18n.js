// Idiomas do AsturCut: Português (padrão), English e Español.
// O código usa textos em português; a tradução é feita por dicionário (i18n-dict.js).
// Textos estáticos da interface são traduzidos automaticamente; textos com variáveis usam t('... {x}', { x }).
import { DICT } from './i18n-dict.js';

export const LANGS = [
  { id: 'pt', name: 'Português', locale: 'pt-BR' },
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
];
const COL = { en: 0, es: 1 };
const KEY = 'asturcut.lang';

export let LANG = 'pt';

export function detectLang(installerLang) {
  // idioma escolhido no instalador vale quando muda (nova instalação em outro idioma)
  try {
    if (installerLang && LANGS.some((l) => l.id === installerLang) && localStorage.getItem('asturcut.instLang') !== installerLang) {
      localStorage.setItem('asturcut.instLang', installerLang);
      return installerLang;
    }
  } catch {}
  try { const saved = localStorage.getItem(KEY); if (saved && LANGS.some((l) => l.id === saved)) return saved; } catch {}
  if (installerLang && LANGS.some((l) => l.id === installerLang)) return installerLang;
  const nav = (navigator.language || 'pt').slice(0, 2).toLowerCase();
  return LANGS.some((l) => l.id === nav) ? nav : 'pt';
}

export function initLang(id) {
  LANG = LANGS.some((l) => l.id === id) ? id : 'pt';
  try { localStorage.setItem(KEY, LANG); } catch {}
  document.documentElement.lang = locale();
  window.astur?.setLang?.(LANG);
}

export function saveLang(id) { try { localStorage.setItem(KEY, id); } catch {} }
export const locale = () => LANGS.find((l) => l.id === LANG)?.locale || 'pt-BR';
export const langName = (id = LANG) => LANGS.find((l) => l.id === id)?.name || id;

export function t(s, vars) {
  let r = s;
  if (LANG !== 'pt' && s) {
    const e = DICT[s];
    if (e && e[COL[LANG]]) r = e[COL[LANG]];
  }
  if (vars) r = r.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return r;
}

// ---------- Tradução automática do DOM ----------
const SKIP = new Set(['TEXTAREA', 'INPUT', 'SCRIPT', 'STYLE', 'CANVAS', 'svg', 'SVG']);
const done = new WeakMap();

function trText(node) {
  const v = node.nodeValue;
  if (!v || done.get(node) === v) return;
  const s = v.trim();
  if (s.length < 1 || !/[A-Za-zÀ-ú]/.test(s)) return;
  const e = DICT[s];
  if (e) {
    const tr = e[COL[LANG]];
    if (tr && tr !== s) {
      const nv = v.replace(s, tr);
      done.set(node, nv);
      node.nodeValue = nv;
      return;
    }
  }
  done.set(node, v);
}
function trAttrs(elm) {
  for (const a of ['title', 'placeholder', 'aria-label']) {
    const v = elm.getAttribute && elm.getAttribute(a);
    if (!v) continue;
    const e = DICT[v.trim()];
    const tr = e && e[COL[LANG]];
    if (tr && tr !== v) elm.setAttribute(a, tr);
  }
}
function skipped(n) {
  for (let p = n.parentNode; p && p !== document.body; p = p.parentNode) {
    if (SKIP.has(p.nodeName) || (p.classList && p.classList.contains('no-tr'))) return true;
  }
  return false;
}
function translateTree(root) {
  if (root.nodeType === 3) { if (!skipped(root)) trText(root); return; }
  if (root.nodeType === 1 && (root.nodeName === 'INPUT' || root.nodeName === 'TEXTAREA')) { trAttrs(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName) || root.classList?.contains('no-tr')) return;
  if (skipped(root)) return;
  trAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType === 1 && (SKIP.has(n.nodeName) || n.classList?.contains('no-tr'))) {
        if (n.nodeName === 'INPUT' || n.nodeName === 'TEXTAREA') trAttrs(n);
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = w.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
}

export function startAutoTranslate() {
  if (LANG === 'pt') return;
  translateTree(document.body);
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateTree);
      else if (m.type === 'characterData') { if (!skipped(m.target)) trText(m.target); }
      else if (m.type === 'attributes') trAttrs(m.target);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
  const origTitle = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  void origTitle;
}
