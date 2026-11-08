// AsturCut — inicialização da interface
import { store, bus } from './store.js';
import { $, el, icon, toast, promptDialog, dropdownFrom, confirmDialog } from './util.js';
import { settings, applyTheme } from './settings.js';
import { initLayout, usePreset, togglePanel, LAYOUT_PRESETS } from './layout.js';
import { initLibrary, openTab } from './library.js';
import { initPlayer, togglePlay, step, pause, player } from './player.js';
import { initTimeline, setMode, zoom, fit } from './timeline.js';
import { initInspector } from './inspector.js';
import { openExportDialog } from './exporter.js';
import { openCustomize } from './customize.js';
import { importViaDialog, importDropped, loadUserFonts, isDesktop, api } from './media.js';
import { addText } from './actions.js';
import { t, initLang, detectLang, startAutoTranslate } from './i18n.js';
import { saveProject, newProject, openProject, confirmDiscard, getRecent, scheduleRecovery, clearRecovery, defaultName } from './projects.js';
import { showHome, hideHome, isHomeVisible } from './home.js';

// ---------- Barra de título ----------
function buildTitlebar() {
  const tb = $('#titlebar');
  tb.innerHTML = '';
  const nameEl = el('div', { class: 'tb-name tb-editor no-tr', title: t('Clique para renomear'), onclick: async () => { const n = await promptDialog(t('Nome do projeto'), store.p.name); if (n) { store.begin(); store.p.name = n; store.commit('name'); updateTitle(); } } });
  tb.append(
    el('div', { class: 'tb-left' },
      el('button', { class: 'tb-logo', title: t('Tela inicial'), onclick: () => showHome() }, el('img', { src: 'assets/logo.svg', width: 18, height: 18 }), el('span', {}, 'AsturCut')),
      el('button', { class: 'tb-menu tb-editor', onclick: (e) => mainMenu(e.currentTarget) }, t('Menu'), el('span', { html: icon('chevDown', 12) })),
    ),
    el('div', { class: 'tb-center' }, nameEl, el('span', { class: 'tb-dirty tb-editor', id: 'tb-dirty', title: t('Alterações não salvas') })),
    el('div', { class: 'tb-right' },
      el('button', { class: 'tb-btn tb-editor', title: t('Layout do editor'), onclick: (e) => layoutMenu(e.currentTarget), html: icon('layout', 15) + icon('chevDown', 11) }),
      el('button', { class: 'tb-btn tb-editor', title: t('Atalhos do teclado'), onclick: () => openCustomize('keys'), html: icon('keyboard', 15) }),
      el('button', { class: 'tb-btn pill', title: t('Personalizar (Ctrl+,)'), onclick: () => openCustomize('theme'), html: icon('palette', 14) + `<span>${t('Personalizar')}</span>` }),
      el('button', { class: 'tb-btn pill tb-editor', title: t('Salvar (Ctrl+S)'), onclick: () => saveProject(), html: icon('save', 14) + `<span>${t('Salvar')}</span>` }),
      el('button', { class: 'tb-btn export tb-editor', title: t('Exportar (Ctrl+E)'), onclick: () => openExportDialog(), html: icon('export', 14) + `<span>${t('Exportar')}</span>` }),
      isDesktop ? el('div', { class: 'win-ctrls' },
        el('button', { class: 'win-btn', title: t('Minimizar'), onclick: () => api.minimize(), html: icon('min', 14) }),
        el('button', { class: 'win-btn', id: 'win-max', title: t('Maximizar'), onclick: () => api.maximize(), html: icon('max', 12) }),
        el('button', { class: 'win-btn close', title: t('Fechar'), onclick: () => api.close(), html: icon('close', 14) })) : null,
    ));
  updateTitle();
}

function updateTitle() {
  const n = $('.tb-name');
  if (n) n.textContent = store.p.name;
  document.title = isHomeVisible() ? 'AsturCut' : `${store.p.name} — AsturCut`;
  $('#tb-dirty')?.classList.toggle('on', store.dirty);
}

function recentItems() {
  const rec = getRecent();
  if (!rec.length) return [{ label: t('Nenhum projeto recente'), onClick: () => {} }];
  return rec.slice(0, 10).map((r) => ({ label: r.name + '  —  ' + r.path, onClick: () => openProject(r.path) }));
}

function mainMenu(anchor) {
  dropdownFrom(anchor, [
    { label: t('Novo projeto'), shortcut: 'Ctrl+N', onClick: () => newProject() },
    { label: t('Abrir projeto...'), shortcut: 'Ctrl+O', onClick: () => openProject() },
    isDesktop ? { label: t('Projetos recentes'), submenu: recentItems() } : null,
    { label: t('Salvar'), shortcut: 'Ctrl+S', onClick: () => saveProject() },
    { label: t('Salvar como...'), shortcut: 'Ctrl+Shift+S', onClick: () => saveProject(true) },
    '-',
    { label: t('Importar mídia...'), shortcut: 'Ctrl+I', onClick: () => importViaDialog() },
    { label: t('Exportar...'), shortcut: 'Ctrl+E', onClick: () => openExportDialog() },
    '-',
    { label: t('Desfazer'), shortcut: 'Ctrl+Z', onClick: () => store.undo() },
    { label: t('Refazer'), shortcut: 'Ctrl+Y', onClick: () => store.redo() },
    '-',
    { label: t('Personalizar...'), shortcut: 'Ctrl+,', onClick: () => openCustomize('theme') },
    { label: t('Atalhos do teclado'), onClick: () => openCustomize('keys') },
    { label: t('Tela inicial'), onClick: () => showHome() },
    { label: t('Sobre o AsturCut'), onClick: () => openCustomize('about') },
    isDesktop ? '-' : null,
    isDesktop ? { label: t('Sair'), onClick: () => api.close() } : null,
  ]);
}

function layoutMenu(anchor) {
  const cur = settings.get('layoutPreset');
  dropdownFrom(anchor, [
    ...Object.entries(LAYOUT_PRESETS).map(([id, l]) => ({ label: t(l.name), checked: cur === id, onClick: () => usePreset(id) })),
    '-',
    { label: t('Mostrar biblioteca'), checked: settings.get('showLibrary'), onClick: () => togglePanel('library') },
    { label: t('Mostrar propriedades'), checked: settings.get('showInspector'), onClick: () => togglePanel('inspector') },
    '-',
    { label: t('Mais opções de layout...'), onClick: () => openCustomize('layout') },
  ]);
}

// ---------- Atalhos ----------
function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes(t.type) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
function editPoints() {
  const pts = new Set([0]);
  for (const c of store.p.clips) { pts.add(+c.start.toFixed(4)); pts.add(+(c.start + c.duration).toFixed(4)); }
  return [...pts].sort((a, b) => a - b);
}
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-overlay')) return;
  if (isHomeVisible()) { if ((e.ctrlKey || e.metaKey) && ['n', 'o', ','].includes(e.key.toLowerCase())) { e.preventDefault(); ({ n: () => newProject(), o: () => openProject(), ',': () => openCustomize('theme') })[e.key.toLowerCase()](); } return; }
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl) {
    const map = {
      s: () => saveProject(e.shiftKey), o: () => openProject(), n: () => newProject(), i: () => importViaDialog(), e: () => openExportDialog(),
      ',': () => openCustomize('theme'),
    };
    if (map[k]) { e.preventDefault(); map[k](); return; }
  }
  if (isTyping(e)) return;
  if (ctrl) {
    const map = {
      z: () => (e.shiftKey ? store.redo() : store.undo()), y: () => store.redo(), b: () => store.splitAt(), c: () => { const n = store.copy(); if (n) toast(t('{n} clipe(s) copiado(s)', { n }), 'info', 1200); },
      v: () => store.paste(), d: () => store.duplicate(), a: () => store.select(store.p.clips.map((c) => c.id)),
    };
    if (map[k]) { e.preventDefault(); map[k](); }
    return;
  }
  switch (e.key) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': e.preventDefault(); e.shiftKey ? (pause(), store.setTime(store.time - 1)) : step(-1); break;
    case 'ArrowRight': e.preventDefault(); e.shiftKey ? (pause(), store.setTime(store.time + 1)) : step(1); break;
    case 'ArrowUp': { e.preventDefault(); pause(); const p = editPoints().filter((x) => x < store.time - 1e-3); store.setTime(p.length ? p[p.length - 1] : 0); break; }
    case 'ArrowDown': { e.preventDefault(); pause(); const p = editPoints().find((x) => x > store.time + 1e-3); if (p != null) store.setTime(p); break; }
    case 'Home': pause(); store.setTime(0); break;
    case 'End': pause(); store.setTime(store.duration()); break;
    case 'Delete': case 'Backspace': if (store.selectedTransition) { store.updateClip(store.selectedTransition, { transitionIn: null }); store.clearSelection(); } else store.deleteClips(); break;
    case 'Escape': store.clearSelection(); break;
    case 'F11': if (isDesktop) { e.preventDefault(); api.toggleFullscreen(); } break;
    default:
      if (k === 's') store.splitAt();
      else if (k === 'q') store.deleteLeft();
      else if (k === 'w') store.deleteRight();
      else if (k === 'v') setMode('select');
      else if (k === 'b') setMode('blade');
      else if (k === 'm') store.addMarker();
      else if (k === 't') addText('default');
      else if (e.key === '+' || e.key === '=') zoom(1.3);
      else if (e.key === '-') zoom(1 / 1.3);
  }
});

// arrastar arquivos do sistema para qualquer lugar
document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (e.defaultPrevented) return;
  if (e.dataTransfer?.files?.length) { e.preventDefault(); if (isHomeVisible()) { newProject().then((ok) => ok && importDropped(e.dataTransfer.files)); } else importDropped(e.dataTransfer.files); }
});
document.addEventListener('contextmenu', (e) => { if (!isTyping(e)) e.preventDefault(); });

// ---------- Inicialização ----------
async function boot() {
  const info = isDesktop ? await api.info().catch(() => ({})) : {};
  initLang(detectLang(info.installerLang));
  store.newProject(defaultName());
  applyTheme();
  buildTitlebar();
  initLayout();
  await initLibrary();
  initPlayer();
  initTimeline();
  initInspector();
  startAutoTranslate();
  loadUserFonts();
  bus.on('change', () => { updateTitle(); scheduleRecovery(); });
  bus.on('project', updateTitle);
  bus.on('project-name', updateTitle);
  bus.on('title', updateTitle);
  bus.on('editor-shown', () => { updateTitle(); setTimeout(() => window.dispatchEvent(new Event('resize')), 0); });
  bus.on('fit-timeline', () => setTimeout(() => fit(), 60));
  if (isDesktop) {
    api.on('win:state', (s) => { const b = $('#win-max'); if (b) b.innerHTML = icon(s.maximized ? 'copy' : 'max', 12); });
    api.on('project:open-file', (f) => openProject(f));
    api.on('app:before-close', async () => {
      if (player.exporting && !(await confirmDialog(t('Exportação em andamento'), t('Fechar e cancelar a exportação?'), t('Fechar'), true))) return;
      if (await confirmDiscard()) { clearRecovery(); api.forceClose(); }
    });
    if (info.openFile) { showHome(); await openProject(info.openFile); return; }
  }
  showHome();
}
boot();
window.__app = { store, settings, openTab, showHome };
