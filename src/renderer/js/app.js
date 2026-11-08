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
import { actionFor, GLOBAL } from './keymap.js';
import { openNewProjectDialog } from './newProject.js';
import { checkForUpdates, startUpdateChecks } from './updates.js';
import { speedDialog, gainDialog, setLabel, LABELS, pasteAttributesDialog } from './editTools.js';
import { openMixer } from './audiomix.js';

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
    { label: t('Novo projeto'), shortcut: 'Ctrl+N', onClick: () => openNewProjectDialog() },
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
    { label: t('Mixer de áudio'), shortcut: 'Ctrl+Alt+M', onClick: () => openMixer() },
    { label: t('Maximizar painel sob o mouse'), shortcut: '`', onClick: () => toggleMaximize() },
    '-',
    { label: t('Personalizar...'), shortcut: 'Ctrl+,', onClick: () => openCustomize('theme') },
    { label: t('Atalhos do teclado'), onClick: () => openCustomize('keys') },
    { label: t('Tela inicial'), onClick: () => showHome() },
    isDesktop ? { label: t('Verificar atualizações...'), onClick: () => checkForUpdates({ manual: true }) } : null,
    { label: t('Sobre o AsturCut'), onClick: () => openCustomize('about') },
    isDesktop ? '-' : null,
    isDesktop ? { label: t('Sair'), onClick: () => api.close() } : null,
  ]);
}

function customLayoutItems() {
  const list = settings.get('customLayouts') || [];
  if (!list.length) return [];
  return ['-', ...list.map((l) => ({ label: '★ ' + l.name, onClick: () => { settings.patch({ ...l.data, layoutPreset: 'custom' }); toast(t('Layout: {name}', { name: l.name }), 'info', 1500); } })),
    { label: t('Excluir layouts salvos...'), submenu: list.map((l) => ({ label: l.name, onClick: () => settings.set('customLayouts', (settings.get('customLayouts') || []).filter((x) => x !== l), true) })) }];
}
async function saveCustomLayout() {
  const n = await promptDialog(t('Nome do layout'), t('Meu layout'));
  if (!n) return;
  const keys = ['panelOrder', 'libWidth', 'inspWidth', 'timelineHeight', 'showLibrary', 'showInspector'];
  const data = Object.fromEntries(keys.map((k) => [k, structuredClone(settings.get(k))]));
  settings.set('customLayouts', [...(settings.get('customLayouts') || []).filter((l) => l.name !== n), { name: n, data }], true);
  toast(t('Layout salvo'), 'success');
}

function layoutMenu(anchor) {
  const cur = settings.get('layoutPreset');
  dropdownFrom(anchor, [
    ...Object.entries(LAYOUT_PRESETS).map(([id, l]) => ({ label: t(l.name), checked: cur === id, onClick: () => usePreset(id) })),
    '-',
    { label: t('Mostrar biblioteca'), checked: settings.get('showLibrary'), onClick: () => togglePanel('library') },
    { label: t('Mostrar propriedades'), checked: settings.get('showInspector'), onClick: () => togglePanel('inspector') },
    '-',
    ...customLayoutItems(),
    { label: t('Salvar layout atual...'), onClick: () => saveCustomLayout() },
    '-',
    { label: t('Mais opções de layout...'), onClick: () => openCustomize('layout') },
  ]);
}

// ---------- Atalhos ----------
function isTyping(e) {
  const tg = e.target;
  return tg && (tg.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes(tg.type) || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable);
}
function editPoints() {
  const pts = new Set([0]);
  for (const c of store.p.clips) { pts.add(+c.start.toFixed(4)); pts.add(+(c.start + c.duration).toFixed(4)); }
  return [...pts].sort((x, y) => x - y);
}
let labelIdx = 0;
const ACTION_FN = {
  play: () => togglePlay(),
  frameBack: () => step(-1),
  frameFwd: () => step(1),
  secBack: () => { pause(); store.setTime(store.time - 1); },
  secFwd: () => { pause(); store.setTime(store.time + 1); },
  prevEdit: () => { pause(); const p = editPoints().filter((x) => x < store.time - 1e-3); store.setTime(p.length ? p[p.length - 1] : 0); },
  nextEdit: () => { pause(); const p = editPoints().find((x) => x > store.time + 1e-3); if (p != null) store.setTime(p); },
  home: () => { pause(); store.setTime(0); },
  end: () => { pause(); store.setTime(store.duration()); },
  split: () => store.splitAt(store.time, store.selection.size ? store.withLinked([...store.selection]) : null),
  deleteLeft: () => store.deleteLeft(),
  deleteRight: () => store.deleteRight(),
  delete: () => {
    if (store.selectedTransition) { store.updateClip(store.selectedTransition, { transitionIn: null }); store.clearSelection(); }
    else if (store.selectedGap) store.deleteGap();
    else store.deleteClips();
  },
  rippleDelete: () => (store.selectedGap ? store.deleteGap() : store.rippleDelete()),
  toolSelect: () => setMode('select'),
  toolBlade: () => setMode('blade'),
  toolForward: () => setMode('forward'),
  markIn: () => store.setRange('in'),
  markOut: () => store.setRange('out'),
  clearInOut: () => store.clearRange(),
  marker: () => store.addMarker(),
  text: () => addText('default'),
  speed: () => speedDialog(),
  gain: () => gainDialog(),
  label: () => { if (!store.selection.size) return; setLabel(LABELS[labelIdx % LABELS.length][0]); labelIdx++; },
  zoomIn: () => zoom(1.3),
  zoomOut: () => zoom(1 / 1.3),
  zoomFit: () => fit(),
  maximize: () => toggleMaximize(),
  undo: () => store.undo(),
  redo: () => store.redo(),
  copy: () => { const n = store.copy(); if (n) toast(t('{n} clipe(s) copiado(s)', { n }), 'info', 1200); },
  paste: () => store.paste(),
  pasteAttr: () => pasteAttributesDialog(),
  duplicate: () => store.duplicate(),
  selectAll: () => store.select(store.p.clips.map((c) => c.id)),
  deselect: () => store.clearSelection(),
  mixer: () => openMixer(),
  save: () => saveProject(),
  saveAs: () => saveProject(true),
  open: () => openProject(),
  new: () => openNewProjectDialog(),
  import: () => importViaDialog(),
  export: () => openExportDialog(),
  customize: () => openCustomize('theme'),
  fullscreen: () => { if (isDesktop) api.toggleFullscreen(); },
};

// maximizar o painel sob o mouse (tecla `)
let hovered = null;
document.addEventListener('pointerover', (e) => { const p = e.target.closest?.('.panel'); if (p) hovered = p; });
function toggleMaximize() {
  const ws = $('#workspace');
  if (ws.dataset.max) { delete ws.dataset.max; document.querySelectorAll('.panel.maxed').forEach((n) => n.classList.remove('maxed')); }
  else if (hovered) { ws.dataset.max = '1'; hovered.classList.add('maxed'); }
  window.dispatchEvent(new Event('resize'));
}

document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-overlay')) return;
  const id = actionFor(e);
  if (isHomeVisible()) { if (['new', 'open', 'customize', 'fullscreen'].includes(id)) { e.preventDefault(); ACTION_FN[id](); } return; }
  if (!id) return;
  if (isTyping(e) && !GLOBAL.has(id)) return;
  e.preventDefault();
  ACTION_FN[id]?.();
});

// arrastar arquivos do sistema para qualquer lugar
document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (e.defaultPrevented) return;
  if (e.dataTransfer?.files?.length) { e.preventDefault(); if (isHomeVisible()) { openNewProjectDialog().then((ok) => ok && importDropped(e.dataTransfer.files)); } else importDropped(e.dataTransfer.files); }
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
  window.astur?.bootStep?.('library');
  await initLibrary();
  initPlayer();
  initTimeline();
  initInspector();
  startAutoTranslate();
  window.astur?.bootStep?.('fonts');
  await Promise.race([loadUserFonts(), new Promise((r) => setTimeout(r, 2500))]);
  window.astur?.bootStep?.('almost');
  if (isDesktop) startUpdateChecks();
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
    if (info.openFile) { showHome(); window.astur.ready(); await openProject(info.openFile); return; }
  }
  showHome();
  // espera as fontes da interface antes de mostrar a janela
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  window.astur?.ready?.();
}
boot();
window.__app = { store, settings, openTab, showHome };
