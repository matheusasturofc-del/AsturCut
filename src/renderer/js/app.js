// AsturCut — inicialização da interface
import { store, bus } from './store.js';
import { $, el, icon, toast, modal, confirmDialog, promptDialog, dropdownFrom, contextMenu } from './util.js';
import { settings, applyTheme } from './settings.js';
import { initLayout, usePreset, togglePanel, LAYOUT_PRESETS } from './layout.js';
import { initLibrary, openTab } from './library.js';
import { initPlayer, togglePlay, step, pause, player } from './player.js';
import { initTimeline, setMode, zoom, fit } from './timeline.js';
import { initInspector } from './inspector.js';
import { openExportDialog } from './exporter.js';
import { openCustomize } from './customize.js';
import { importViaDialog, importDropped, restoreProjectMedia, loadUserFonts, isDesktop, api } from './media.js';
import { addText } from './actions.js';

applyTheme();

// ---------- Barra de título ----------
function buildTitlebar() {
  const tb = $('#titlebar');
  tb.innerHTML = '';
  const nameEl = el('div', { class: 'tb-name', title: 'Clique para renomear', onclick: async () => { const n = await promptDialog('Nome do projeto', store.p.name); if (n) { store.begin(); store.p.name = n; store.commit('name'); updateTitle(); } } });
  tb.append(
    el('div', { class: 'tb-left' },
      el('div', { class: 'tb-logo' }, el('img', { src: 'assets/logo.svg', width: 18, height: 18 }), el('span', {}, 'AsturCut')),
      el('button', { class: 'tb-menu', onclick: (e) => mainMenu(e.currentTarget) }, 'Menu', el('span', { html: icon('chevDown', 12) })),
    ),
    el('div', { class: 'tb-center' }, nameEl, el('span', { class: 'tb-dirty', id: 'tb-dirty', title: 'Alterações não salvas' })),
    el('div', { class: 'tb-right' },
      el('button', { class: 'tb-btn', title: 'Layout do editor', onclick: (e) => layoutMenu(e.currentTarget), html: icon('layout', 15) + icon('chevDown', 11) }),
      el('button', { class: 'tb-btn', title: 'Atalhos do teclado', onclick: () => openCustomize('keys'), html: icon('keyboard', 15) }),
      el('button', { class: 'tb-btn pill', title: 'Personalizar (Ctrl+,)', onclick: () => openCustomize('theme'), html: icon('palette', 14) + '<span>Personalizar</span>' }),
      el('button', { class: 'tb-btn pill', title: 'Salvar (Ctrl+S)', onclick: () => saveProject(), html: icon('save', 14) + '<span>Salvar</span>' }),
      el('button', { class: 'tb-btn export', title: 'Exportar (Ctrl+E)', onclick: () => openExportDialog(), html: icon('export', 14) + '<span>Exportar</span>' }),
      isDesktop ? el('div', { class: 'win-ctrls' },
        el('button', { class: 'win-btn', title: 'Minimizar', onclick: () => api.minimize(), html: icon('min', 14) }),
        el('button', { class: 'win-btn', id: 'win-max', title: 'Maximizar', onclick: () => api.maximize(), html: icon('max', 12) }),
        el('button', { class: 'win-btn close', title: 'Fechar', onclick: () => api.close(), html: icon('close', 14) })) : null,
    ));
  updateTitle();
}

function updateTitle() {
  const n = $('.tb-name');
  if (n) n.textContent = store.p.name;
  document.title = `${store.p.name} — AsturCut`;
  $('#tb-dirty')?.classList.toggle('on', store.dirty);
}

function recentItems() {
  const rec = settings.get('recent') || [];
  if (!rec.length) return [{ label: 'Nenhum projeto recente', onClick: () => {} }];
  return rec.slice(0, 10).map((r) => ({ label: r.name + '  —  ' + r.path, onClick: () => openProject(r.path) }));
}

function mainMenu(anchor) {
  dropdownFrom(anchor, [
    { label: 'Novo projeto', shortcut: 'Ctrl+N', onClick: () => newProject() },
    { label: 'Abrir projeto...', shortcut: 'Ctrl+O', onClick: () => openProject() },
    isDesktop ? { label: 'Projetos recentes', submenu: recentItems() } : null,
    { label: 'Salvar', shortcut: 'Ctrl+S', onClick: () => saveProject() },
    { label: 'Salvar como...', shortcut: 'Ctrl+Shift+S', onClick: () => saveProject(true) },
    '-',
    { label: 'Importar mídia...', shortcut: 'Ctrl+I', onClick: () => importViaDialog() },
    { label: 'Exportar...', shortcut: 'Ctrl+E', onClick: () => openExportDialog() },
    '-',
    { label: 'Desfazer', shortcut: 'Ctrl+Z', onClick: () => store.undo() },
    { label: 'Refazer', shortcut: 'Ctrl+Y', onClick: () => store.redo() },
    '-',
    { label: 'Personalizar...', shortcut: 'Ctrl+,', onClick: () => openCustomize('theme') },
    { label: 'Atalhos do teclado', onClick: () => openCustomize('keys') },
    { label: 'Tela inicial', onClick: () => showHome() },
    { label: 'Sobre o AsturCut', onClick: () => openCustomize('about') },
    isDesktop ? '-' : null,
    isDesktop ? { label: 'Sair', onClick: () => api.close() } : null,
  ]);
}

function layoutMenu(anchor) {
  const cur = settings.get('layoutPreset');
  dropdownFrom(anchor, [
    ...Object.entries(LAYOUT_PRESETS).map(([id, l]) => ({ label: l.name, checked: cur === id, onClick: () => usePreset(id) })),
    '-',
    { label: 'Mostrar biblioteca', checked: settings.get('showLibrary'), onClick: () => togglePanel('library') },
    { label: 'Mostrar propriedades', checked: settings.get('showInspector'), onClick: () => togglePanel('inspector') },
    '-',
    { label: 'Mais opções de layout...', onClick: () => openCustomize('layout') },
  ]);
}

// ---------- Projetos ----------
function serialize() {
  const p = store.p;
  return { ...p, savedWith: 'AsturCut', savedAt: Date.now(), media: p.media.map(({ missing, ...m }) => m) };
}

function pushRecent(path, name) {
  if (!path) return;
  const rec = (settings.get('recent') || []).filter((r) => r.path !== path);
  rec.unshift({ path, name, date: Date.now() });
  settings.set('recent', rec.slice(0, 15), true);
}

export async function saveProject(saveAs = false) {
  if (!isDesktop) {
    const blob = new Blob([JSON.stringify(serialize(), null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${store.p.name}.astur` });
    document.body.append(a); a.click(); a.remove();
    store.dirty = false; updateTitle();
    toast('Projeto baixado', 'success');
    return true;
  }
  try {
    const path = await api.saveProject({ filePath: store.filePath, data: serialize(), saveAs });
    if (!path) return false;
    store.filePath = path;
    store.dirty = false;
    pushRecent(path, store.p.name);
    updateTitle();
    clearRecovery();
    toast('Projeto salvo', 'success', 1500);
    bus.emit('project-saved');
    return true;
  } catch (e) { toast('Erro ao salvar: ' + e.message, 'error'); return false; }
}

async function confirmDiscard() {
  if (!store.dirty || !store.p.clips.length) return true;
  return new Promise((res) => {
    let done = false;
    modal({
      title: 'Alterações não salvas', width: 440,
      body: el('p', { class: 'muted' }, `Deseja salvar as alterações em "${store.p.name}"?`),
      actions: [
        { label: 'Cancelar', onClick: () => { done = true; res(false); } },
        { label: 'Não salvar', danger: true, onClick: () => { done = true; res(true); } },
        { label: 'Salvar', primary: true, onClick: () => { done = true; saveProject().then((ok) => res(ok)); } },
      ],
      onClose: () => { if (!done) res(false); },
    });
  });
}

export async function newProject(name) {
  if (!(await confirmDiscard())) return;
  pause();
  store.newProject(name || 'Projeto ' + new Date().toLocaleDateString('pt-BR').replace(/\//g, '-'));
  updateTitle();
  hideHome();
}

export async function openProject(path) {
  if (!(await confirmDiscard())) return;
  try {
    let res;
    if (isDesktop) res = await api.openProject(path);
    else {
      res = await new Promise((resolve) => {
        const inp = el('input', { type: 'file', accept: '.astur,.json' });
        inp.onchange = async () => resolve({ data: JSON.parse(await inp.files[0].text()), filePath: null });
        inp.click();
      });
    }
    if (!res) return;
    pause();
    store.loadProject(res.data, res.filePath);
    await restoreProjectMedia();
    pushRecent(res.filePath, store.p.name);
    updateTitle();
    hideHome();
    setTimeout(() => fit(), 50);
    toast(`Projeto "${store.p.name}" aberto`, 'success');
  } catch (e) {
    toast('Não foi possível abrir: ' + e.message, 'error', 4000);
    if (path) settings.set('recent', (settings.get('recent') || []).filter((r) => r.path !== path), true);
  }
}

// ---------- Recuperação / salvamento automático ----------
const REC_KEY = 'asturcut.recovery';
let recTimer = null;
function scheduleRecovery() {
  clearTimeout(recTimer);
  recTimer = setTimeout(() => {
    if (!store.dirty || !store.p.clips.length) return;
    try { localStorage.setItem(REC_KEY, JSON.stringify({ data: serialize(), filePath: store.filePath, at: Date.now() })); } catch {}
  }, 3000);
}
function clearRecovery() { try { localStorage.removeItem(REC_KEY); } catch {} }
function getRecovery() { try { return JSON.parse(localStorage.getItem(REC_KEY) || 'null'); } catch { return null; } }

let lastAuto = Date.now();
setInterval(() => {
  const min = settings.get('autosave');
  if (!min || !isDesktop || !store.filePath || !store.dirty || player.exporting) return;
  if (Date.now() - lastAuto >= min * 60000) { lastAuto = Date.now(); saveProject(); }
}, 15000);

// ---------- Tela inicial ----------
function showHome() {
  hideHome();
  const rec = isDesktop ? (settings.get('recent') || []) : [];
  const recovery = getRecovery();
  const home = el('div', { class: 'home', id: 'home' },
    el('div', { class: 'home-card' },
      el('div', { class: 'home-head' },
        el('img', { src: 'assets/logo.svg', width: 44, height: 44 }),
        el('div', {}, el('h1', {}, 'AsturCut'), el('div', { class: 'muted' }, 'Editor de vídeo — crie sem limites')),
        el('div', { class: 'grow' }),
        store.p.clips.length ? el('button', { class: 'icon-btn', title: 'Fechar', onclick: hideHome, html: icon('close') }) : null),
      el('div', { class: 'home-actions' },
        el('button', { class: 'home-big', onclick: () => newProject() }, el('span', { class: 'home-plus', html: icon('plus', 26) }), el('b', {}, 'Criar projeto'), el('span', { class: 'muted small' }, 'Comece um vídeo do zero')),
        el('button', { class: 'home-big', onclick: () => openProject() }, el('span', { class: 'home-plus alt', html: icon('folder', 24) }), el('b', {}, 'Abrir projeto'), el('span', { class: 'muted small' }, 'Arquivo .astur')),
        el('div', { class: 'home-col' },
          el('div', { class: 'home-sub' }, 'Novo projeto com proporção:'),
          el('div', { class: 'chips' }, [['16:9', 'YouTube'], ['9:16', 'TikTok / Reels'], ['1:1', 'Quadrado'], ['4:5', 'Feed']].map(([a, n]) =>
            el('button', { class: 'chip', onclick: async () => { settings.set('defaultAspect', a, true); await newProject(); } }, `${a} · ${n}`))))),
      recovery ? el('div', { class: 'home-recovery' }, el('span', { html: icon('info', 14) }),
        el('span', {}, `Projeto não salvo encontrado: "${recovery.data?.name}"`),
        el('button', { class: 'btn sm primary', onclick: async () => { store.loadProject(recovery.data, recovery.filePath); store.dirty = true; await restoreProjectMedia(); updateTitle(); hideHome(); setTimeout(() => fit(), 50); } }, 'Recuperar'),
        el('button', { class: 'btn sm', onclick: (e) => { clearRecovery(); e.target.closest('.home-recovery').remove(); } }, 'Descartar')) : null,
      el('div', { class: 'home-sub' }, 'Projetos recentes'),
      el('div', { class: 'home-recent' }, rec.length ? rec.slice(0, 8).map((r) => el('button', { class: 'recent-item', onclick: () => openProject(r.path) },
        el('span', { html: icon('file', 18) }),
        el('div', { class: 'recent-info' }, el('b', {}, r.name), el('span', { class: 'muted small' }, r.path)),
        el('span', { class: 'muted small' }, new Date(r.date).toLocaleDateString('pt-BR'))))
        : el('div', { class: 'muted small' }, isDesktop ? 'Nenhum projeto recente.' : 'No navegador os projetos são baixados como arquivo .astur.')),
    ));
  document.body.append(home);
}
function hideHome() { $('#home')?.remove(); }

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
      z: () => (e.shiftKey ? store.redo() : store.undo()), y: () => store.redo(), b: () => store.splitAt(), c: () => { const n = store.copy(); if (n) toast(`${n} clipe(s) copiado(s)`, 'info', 1200); },
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
  if (e.dataTransfer?.files?.length) { e.preventDefault(); importDropped(e.dataTransfer.files); hideHome(); }
});
document.addEventListener('contextmenu', (e) => { if (!isTyping(e)) e.preventDefault(); });

// ---------- Inicialização ----------
async function boot() {
  buildTitlebar();
  initLayout();
  await initLibrary();
  initPlayer();
  initTimeline();
  initInspector();
  loadUserFonts();
  bus.on('change', () => { updateTitle(); scheduleRecovery(); });
  bus.on('project', updateTitle);
  bus.on('project-name', updateTitle);
  if (isDesktop) {
    api.on('win:state', (s) => { const b = $('#win-max'); if (b) b.innerHTML = icon(s.maximized ? 'copy' : 'max', 12); });
    api.on('project:open-file', (f) => openProject(f));
    api.on('app:before-close', async () => {
      if (player.exporting && !(await confirmDialog('Exportação em andamento', 'Fechar e cancelar a exportação?', 'Fechar', true))) return;
      if (await confirmDiscard()) { clearRecovery(); api.forceClose(); }
    });
    const info = await api.info();
    if (info.openFile) { await openProject(info.openFile); return; }
  }
  showHome();
}
boot();
window.__app = { store, settings, openTab };
