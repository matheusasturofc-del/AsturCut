// Painel da biblioteca: Mídia, Áudio, Texto, Stickers, Efeitos, Transições, Filtros, Animações e Fontes
import { store, bus } from './store.js';
import { t } from './i18n.js';
import { $, el, icon, fmtShort, fmtBytes, contextMenu, toast, ease, promptDialog } from './util.js';
import { openSource } from './source.js';
import { runtime, importViaDialog, importDropped, BACKGROUNDS, addBackground, drawBackground, importFonts, customFonts, isDesktop, api } from './media.js';
import { settings } from './settings.js';
import { addMedia, addText, addSticker, addShape, applyEffect, applyFilter, applyTransition, applyAnimation, addAudio } from './actions.js';
import { TEXT_PRESETS } from './lib/textPresets.js';
import { EMOJI_CATS, SHAPES, drawShape } from './lib/stickers.js';
import { EFFECTS, EFFECT_CATS } from './lib/effects.js';
import { FILTERS, FILTER_CATS, filterPreviewCss } from './lib/filters.js';
import { TRANSITIONS, TRANSITION_CATS } from './lib/transitions.js';
import { ANIM_IN, ANIM_LOOP, clipAnimation } from './lib/animations.js';
import { SFX, MUSIC, renderSfx } from './lib/sfx.js';

export let FONTS = [];

const TABS = [
  { id: 'media', name: 'Mídia', icon: 'media' },
  { id: 'audio', name: 'Áudio', icon: 'audio' },
  { id: 'text', name: 'Texto', icon: 'text' },
  { id: 'stickers', name: 'Stickers', icon: 'sticker' },
  { id: 'effects', name: 'Efeitos', icon: 'effects' },
  { id: 'transitions', name: 'Transições', icon: 'transitions' },
  { id: 'filters', name: 'Filtros', icon: 'filters' },
  { id: 'anims', name: 'Animações', icon: 'wand' },
  { id: 'fonts', name: 'Fontes', icon: 'font' },
];

let tab = 'media';
let sub = {};
let search = '';
let body, nav, content;

export async function initLibrary() {
  try { FONTS = await (await fetch('assets/fonts/fonts.json')).json(); } catch { FONTS = []; }
  const panel = $('#panel-library');
  panel.innerHTML = '';
  const tabs = el('div', { class: 'lib-tabs', dataset: { drag: 'library' } });
  tabs.append(el('div', { class: 'panel-grip', title: 'Arraste para mover este painel', html: icon('drag', 14) }));
  for (const t of TABS) {
    tabs.append(el('button', { class: 'lib-tab', dataset: { tab: t.id }, onclick: () => openTab(t.id) }, el('span', { html: icon(t.icon, 18) }), el('span', {}, t.name)));
  }
  body = el('div', { class: 'lib-body' });
  nav = el('div', { class: 'lib-nav' });
  content = el('div', { class: 'lib-content' });
  body.append(nav, content);
  panel.append(tabs, body);
  bus.on('media', () => { if (tab === 'media' || tab === 'audio') renderContent(); });
  bus.on('media-analyzed', () => { if (tab === 'media') renderContent(); });
  bus.on('fonts', () => { if (tab === 'fonts' || tab === 'text') renderContent(); });
  bus.on('open-library', (t) => openTab(t));
  bus.on('selection', () => { if (tab === 'anims' || tab === 'fonts') renderContent(); });
  openTab('media');
}

export function openTab(id, subId = null) {
  tab = id; search = '';
  if (subId) sub[id] = subId;
  document.querySelectorAll('.lib-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  renderNav();
  renderContent();
}

function navDefs() {
  switch (tab) {
    case 'media': return [['import', 'Importar'], ['backgrounds', 'Fundos'], ['generate', 'Criar']];
    case 'audio': return [['music', 'Músicas'], ...[...new Set(SFX.map((s) => s.cat))].map((c) => ['sfx:' + c, c]), ['mine', 'Meus áudios']];
    case 'text': return [['all', 'Todos'], ...[...new Set(TEXT_PRESETS.map((p) => p.cat))].map((c) => [c, c])];
    case 'stickers': return [...Object.keys(EMOJI_CATS).map((c) => [c, c]), ['shapes', 'Formas']];
    case 'effects': return [['all', 'Todos'], ...EFFECT_CATS.map((c) => [c, c])];
    case 'transitions': return [['all', 'Todas'], ...TRANSITION_CATS.map((c) => [c, c])];
    case 'filters': return [['all', 'Todos'], ...FILTER_CATS.map((c) => [c, c])];
    case 'anims': return [['in', 'Entrada'], ['out', 'Saída'], ['loop', 'Loop']];
    case 'fonts': return [['all', 'Todas'], ['fav', '★ Favoritas'], ...[...new Set(FONTS.map((f) => f.category))].map((c) => [c, c]), ['custom', 'Minhas fontes']];
  }
  return [];
}

function renderNav() {
  nav.innerHTML = '';
  const defs = navDefs();
  if (!sub[tab] || !defs.some((d) => d[0] === sub[tab])) sub[tab] = defs[0]?.[0];
  for (const [id, name] of defs) {
    nav.append(el('button', { class: 'lib-nav-item' + (sub[tab] === id ? ' active' : ''), onclick: () => { sub[tab] = id; renderNav(); renderContent(); } }, name));
  }
}

function searchBox(placeholder) {
  const inp = el('input', { class: 'input search', placeholder, value: search });
  inp.addEventListener('input', () => { search = inp.value; const pos = inp.selectionStart; renderContent(); const ni = content.querySelector('.search'); ni?.focus(); ni?.setSelectionRange(pos, pos); });
  return el('div', { class: 'lib-search' }, el('span', { html: icon('search', 14) }), inp);
}

function setDrag(node, data) {
  node.draggable = true;
  node.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-astur', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copy';
  });
}

function tile({ title, sub: subtitle, thumb, onAdd, onClick, drag, cls = '', badge, extra, onContext, active }) {
  const t = el('div', { class: 'tile ' + cls + (active ? ' active' : ''), title },
    el('div', { class: 'tile-thumb' }, thumb, badge ? el('span', { class: 'tile-badge' }, badge) : null,
      onAdd ? el('button', { class: 'tile-add', title: 'Adicionar', onclick: (e) => { e.stopPropagation(); onAdd(); }, html: icon('plus', 14) }) : null, extra),
    el('div', { class: 'tile-name' }, title),
    subtitle ? el('div', { class: 'tile-sub' }, subtitle) : null);
  if (onClick) t.addEventListener('click', onClick);
  if (onAdd) t.addEventListener('dblclick', onAdd);
  if (drag) setDrag(t, drag);
  if (onContext) t.addEventListener('contextmenu', (e) => { e.preventDefault(); onContext(e); });
  return t;
}

function renderContent() {
  if (!content) return;
  content.innerHTML = '';
  content.scrollTop = 0;
  const fn = { media: renderMedia, audio: renderAudio, text: renderText, stickers: renderStickers, effects: renderEffects, transitions: renderTransitions, filters: renderFilters, anims: renderAnims, fonts: renderFonts }[tab];
  fn && fn();
}
const match = (s) => !search || s.toLowerCase().includes(search.toLowerCase()) || t(s).toLowerCase().includes(search.toLowerCase());

// ---------- Mídia ----------
function renderMedia() {
  const s = sub.media;
  if (s === 'backgrounds') {
    content.append(el('div', { class: 'lib-hint' }, 'Fundos e cores grátis. Clique em + para adicionar à linha do tempo.'));
    const grid = el('div', { class: 'grid' });
    for (const b of BACKGROUNDS) {
      const c = el('canvas', { width: 160, height: 90 });
      drawBackground(c.getContext('2d'), b, 160, 90);
      const add = async () => { const m = await addBackground(b.id); addMedia(m); };
      grid.append(tile({ title: b.label ? t(b.label[0], { c: b.label[1] }) : b.name, thumb: c, onAdd: add }));
    }
    content.append(grid);
    return;
  }
  if (s === 'generate') {
    content.append(el('div', { class: 'lib-hint' }, 'Sem mídia? Crie com estas ferramentas'));
    const tools = el('div', { class: 'create-tools' },
      el('button', { class: 'create-tool', onclick: () => addText('title') }, el('span', { html: icon('text', 22) }), 'Título'),
      el('button', { class: 'create-tool', onclick: async () => { const m = await addBackground('grad:#1ccfdc:#5b2bff'); addMedia(m); addText('title'); } }, el('span', { html: icon('sparkle', 22) }), 'Intro rápida'),
      el('button', { class: 'create-tool', onclick: () => addShape('subscribe') }, el('span', { html: icon('heart', 22) }), 'Botão inscrever'),
      el('button', { class: 'create-tool', onclick: () => addShape('lowerthird') }, el('span', { html: icon('layout', 22) }), 'Lower third'),
      el('button', { class: 'create-tool', onclick: () => applyEffect('confetti', { asLayer: true }) }, el('span', { html: icon('star', 22) }), 'Confete'),
      el('button', { class: 'create-tool', onclick: () => applyEffect('letterbox', { asLayer: true }) }, el('span', { html: icon('video', 22) }), 'Faixas de cinema'),
    );
    content.append(tools);
    return;
  }
  // importar
  const drop = el('div', { class: 'import-zone' + (store.p.media.filter((m) => !m.hidden).length ? ' compact' : '') },
    el('button', { class: 'import-btn', onclick: () => importViaDialog() }, el('span', { class: 'plus-circle', html: icon('plus', 14) }), 'Importar'),
    el('div', { class: 'muted small' }, 'Arraste e solte vídeos, fotos e arquivos de áudio aqui'));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) importDropped(e.dataTransfer.files); });
  content.append(drop);
  const list = store.p.media.filter((m) => !m.hidden && match(m.name));
  if (!list.length) {
    content.append(el('div', { class: 'lib-sep' }, el('span', {}, 'Sem mídia? Crie com estas ferramentas')));
    content.append(el('div', { class: 'create-tools three' },
      el('button', { class: 'create-tool', onclick: () => { sub.media = 'generate'; renderNav(); renderContent(); } }, el('span', { html: icon('wand', 22) }), 'Gerar'),
      el('button', { class: 'create-tool', onclick: () => { sub.media = 'backgrounds'; renderNav(); renderContent(); } }, el('span', { html: icon('image', 22) }), 'Fundos'),
      el('button', { class: 'create-tool', onclick: () => addText('default') }, el('span', { html: icon('text', 22) }), 'Texto'),
    ));
    return;
  }
  // barra: busca, ordenar, lista/grade, nova pasta
  const sortSel = el('select', { class: 'select sm' }, [['name', 'Nome'], ['type', 'Tipo'], ['duration', 'Duração'], ['date', 'Importação']].map(([v, n]) => el('option', { value: v, selected: settings.get('mediaSort') === v }, n)));
  sortSel.addEventListener('change', () => { settings.set('mediaSort', sortSel.value, true); renderContent(); });
  const view = settings.get('mediaView') || 'grid';
  content.append(el('div', { class: 'media-bar' }, searchBox('Buscar mídia...'),
    el('div', { class: 'media-bar-row' }, el('span', { class: 'muted small' }, t('Ordenar')), sortSel, el('div', { class: 'grow' }),
      el('button', { class: 'icon-btn sm' + (view === 'grid' ? ' on' : ''), title: 'Grade', onclick: () => { settings.set('mediaView', 'grid', true); renderContent(); }, html: icon('gridview', 14) }),
      el('button', { class: 'icon-btn sm' + (view === 'list' ? ' on' : ''), title: 'Lista', onclick: () => { settings.set('mediaView', 'list', true); renderContent(); }, html: icon('list', 14) }),
      el('button', { class: 'icon-btn sm', title: 'Nova pasta', onclick: newBin, html: icon('bin', 15) }))));
  store.p.bins = store.p.bins || [];
  if (currentBin && !store.p.bins.some((b) => b.id === currentBin)) currentBin = null;
  if (currentBin) {
    const b = store.p.bins.find((x) => x.id === currentBin);
    const crumb = el('div', { class: 'bin-crumb' }, el('button', { class: 'link-btn', onclick: () => { currentBin = null; renderContent(); } }, '← ' + t('Mídia')), el('span', { class: 'muted' }, ' / '), el('b', { class: 'no-tr' }, b.name));
    crumb.addEventListener('dragover', (e) => e.preventDefault());
    crumb.addEventListener('drop', (e) => { e.preventDefault(); moveToBin(e, null); });
    content.append(crumb);
  }
  const SORT = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
    type: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    duration: (a, b) => (b.duration || 0) - (a.duration || 0),
    date: () => 0,
  };
  const items = list.filter((m) => search || (m.binId || null) === currentBin).sort(SORT[settings.get('mediaSort')] || SORT.date);
  const grid = el('div', { class: view === 'list' ? 'media-list' : 'grid' });
  if (!currentBin && !search) {
    for (const b of store.p.bins) {
      const count = store.p.media.filter((m) => m.binId === b.id).length;
      const bt = view === 'list'
        ? el('div', { class: 'mrow bin' }, el('span', { class: 'mrow-ic', html: icon('folder', 18) }), el('div', { class: 'mrow-name no-tr' }, b.name), el('span', { class: 'muted small' }, count))
        : el('div', { class: 'tile bin-tile' }, el('div', { class: 'tile-thumb' }, el('div', { class: 'tile-ph', html: icon('folder', 34) }), el('span', { class: 'tile-badge' }, count)), el('div', { class: 'tile-name no-tr' }, b.name));
      bt.addEventListener('dblclick', () => { currentBin = b.id; renderContent(); });
      bt.addEventListener('click', () => { currentBin = b.id; renderContent(); });
      bt.addEventListener('dragover', (e) => { e.preventDefault(); bt.classList.add('drop-over'); });
      bt.addEventListener('dragleave', () => bt.classList.remove('drop-over'));
      bt.addEventListener('drop', (e) => { e.preventDefault(); bt.classList.remove('drop-over'); moveToBin(e, b.id); });
      bt.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenu(e.clientX, e.clientY, [
        { label: 'Abrir', onClick: () => { currentBin = b.id; renderContent(); } },
        { label: 'Renomear', onClick: async () => { const n = await promptDialog(t('Renomear pasta'), b.name); if (n) { b.name = n; store.dirty = true; renderContent(); } } },
        { label: 'Excluir pasta (mantém a mídia)', onClick: () => { store.p.media.forEach((m) => { if (m.binId === b.id) delete m.binId; }); store.p.bins = store.p.bins.filter((x) => x !== b); store.dirty = true; renderContent(); } },
      ]); });
      grid.append(bt);
    }
  }
  for (const m of items) {
    const rt = runtime.get(m.id) || {};
    const used = store.p.clips.some((c) => c.mediaId === m.id);
    const menu = (e) => contextMenu(e.clientX, e.clientY, [
      { label: 'Adicionar à linha do tempo', onClick: () => addMedia(m) },
      { label: 'Adicionar no cursor', onClick: () => addMedia(m, { t: store.time, trackId: null, newzone: 'top' }) },
      m.type !== 'image' ? { label: 'Abrir no visualizador de origem', onClick: () => openSource(m) } : null,
      { label: 'Mover para pasta', submenu: [{ label: t('Mídia') + ' (raiz)', onClick: () => { delete m.binId; store.dirty = true; renderContent(); } }, ...store.p.bins.map((b) => ({ label: b.name, checked: m.binId === b.id, onClick: () => { m.binId = b.id; store.dirty = true; renderContent(); } })), '-', { label: t('Nova pasta...'), onClick: () => newBin(m) }] },
      isDesktop && !api.isMobile && m.path ? { label: 'Mostrar na pasta', onClick: () => api.showItem(m.path) } : null,
      '-',
      { label: t('Informações: {info}', { info: `${m.width ? m.width + '×' + m.height + ' · ' : ''}${fmtBytes(m.size)}` }), disabled: true },
      { label: 'Remover do projeto', onClick: () => { store.begin(); store.p.clips = store.p.clips.filter((c) => c.mediaId !== m.id); store.p.media = store.p.media.filter((x) => x !== m); store.commit('rmmedia'); bus.emit('media'); } },
    ]);
    const srcBtn = m.type !== 'image' ? el('button', { class: 'tile-src', title: t('Abrir no visualizador de origem'), html: icon('eyePlay', 13) }) : null;
    srcBtn?.addEventListener('click', (e) => { e.stopPropagation(); openSource(m); });
    srcBtn?.addEventListener('dblclick', (e) => e.stopPropagation());
    if (view === 'list') {
      const row = el('div', { class: 'mrow' + (m.missing ? ' missing' : '') },
        rt.thumb ? el('img', { class: 'mrow-thumb', src: rt.thumb, draggable: 'false' }) : el('span', { class: 'mrow-ic', html: icon(m.type === 'audio' ? 'music' : m.type === 'image' ? 'image' : 'video', 16) }),
        el('div', { class: 'mrow-name no-tr', title: m.name }, m.name),
        el('span', { class: 'muted small' }, m.type === 'image' ? (m.width ? `${m.width}×${m.height}` : '') : fmtShort(m.duration)),
        used ? el('span', { class: 'tile-used static' }, '✓') : null,
        srcBtn,
        el('button', { class: 'icon-btn xs', title: 'Adicionar', onclick: (e) => { e.stopPropagation(); addMedia(m); }, html: icon('plus', 13) }));
      row.addEventListener('dblclick', () => addMedia(m));
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e); });
      setDrag(row, { kind: 'media', id: m.id });
      grid.append(row);
      continue;
    }
    const thumb = rt.thumb ? el('img', { src: rt.thumb, draggable: 'false' }) : el('div', { class: 'tile-ph', html: icon(m.type === 'audio' ? 'music' : m.type === 'image' ? 'image' : 'video', 26) });
    grid.append(tile({
      title: m.name, thumb, cls: (m.missing ? 'missing' : '') + ' no-tr-name',
      badge: m.type === 'image' ? null : fmtShort(m.duration),
      extra: [used ? el('span', { class: 'tile-used', title: 'Em uso' }, '✓') : null, srcBtn],
      onAdd: () => addMedia(m),
      drag: { kind: 'media', id: m.id },
      onContext: menu,
    }));
  }
  content.append(grid);
}

let currentBin = null;
async function newBin(m) {
  const n = await promptDialog(t('Nome da nova pasta'), t('Nova pasta'));
  if (!n) return;
  store.p.bins = store.p.bins || [];
  const b = { id: 'bin_' + Date.now().toString(36), name: n };
  store.p.bins.push(b);
  if (m && m.id) m.binId = b.id;
  store.dirty = true;
  renderContent();
}
function moveToBin(e, binId) {
  try {
    const d = JSON.parse(e.dataTransfer.getData('application/x-astur') || '{}');
    if (d.kind !== 'media') return;
    const m = store.media(d.id);
    if (!m) return;
    if (binId) m.binId = binId; else delete m.binId;
    store.dirty = true;
    renderContent();
  } catch {}
}

// ---------- Áudio ----------
let previewAudio = null, previewId = null;
async function preview(id, btn) {
  if (previewAudio) { previewAudio.pause(); previewAudio = null; document.querySelectorAll('.aud-play.on').forEach((b) => { b.classList.remove('on'); b.innerHTML = icon('play', 12); }); if (previewId === id) { previewId = null; return; } }
  previewId = id;
  const r = await renderSfx(id);
  previewAudio = new Audio(r.url);
  previewAudio.play();
  btn.classList.add('on'); btn.innerHTML = icon('pause', 12);
  previewAudio.onended = () => { btn.classList.remove('on'); btn.innerHTML = icon('play', 12); previewAudio = null; previewId = null; };
}
function renderAudio() {
  const s = sub.audio;
  content.append(searchBox('Buscar áudio...'));
  if (s === 'mine') {
    const list = store.p.media.filter((m) => m.type === 'audio' && !m.gen && match(m.name));
    content.append(el('button', { class: 'btn wide', onclick: () => importViaDialog(), html: icon('import', 14) + ' Importar música ou áudio' }));
    if (!list.length) content.append(el('div', { class: 'lib-hint' }, 'Nenhum áudio importado ainda. Formatos: MP3, WAV, OGG, M4A, AAC, FLAC.'));
    const box = el('div', { class: 'audio-list' });
    for (const m of list) box.append(audioRow(m.name, fmtShort(m.duration), null, () => addMedia(m), { kind: 'media', id: m.id }));
    content.append(box);
    return;
  }
  const defs = s === 'music' ? MUSIC : SFX.filter((x) => 'sfx:' + x.cat === s);
  content.append(el('div', { class: 'lib-hint' }, s === 'music' ? 'Músicas originais geradas pelo AsturCut — livres de direitos autorais.' : 'Efeitos sonoros grátis e livres de direitos.'));
  const box = el('div', { class: 'audio-list' });
  for (const d of defs.filter((x) => match(x.name))) box.append(audioRow(d.name, fmtShort(d.dur), d.id, () => addAudio(d.id), { kind: 'audio', id: d.id }));
  content.append(box);
}
function audioRow(name, dur, previewIdArg, onAdd, drag) {
  const playBtn = previewIdArg ? el('button', { class: 'aud-play', title: 'Ouvir', html: icon('play', 12) }) : el('span', { class: 'aud-play static', html: icon('music', 12) });
  if (previewIdArg) playBtn.addEventListener('click', (e) => { e.stopPropagation(); preview(previewIdArg, playBtn); });
  const row = el('div', { class: 'audio-row' }, playBtn,
    el('div', { class: 'aud-info' }, el('div', { class: 'aud-name' }, name), el('div', { class: 'aud-dur muted' }, dur)),
    el('button', { class: 'icon-btn sm accent-hover', title: 'Adicionar', onclick: (e) => { e.stopPropagation(); onAdd(); }, html: icon('plus', 14) }));
  row.addEventListener('dblclick', onAdd);
  setDrag(row, drag);
  return row;
}

// ---------- Texto ----------
function textPreviewStyle(t) {
  const st = {
    fontFamily: `"${t.font}"`, fontWeight: t.bold === false ? 400 : 700, fontStyle: t.italic ? 'italic' : 'normal',
    color: t.color || '#fff', letterSpacing: ((t.letterSpacing || 0) / 6) + 'px', fontSize: Math.min(26, Math.max(13, (t.size || 90) / 5.5)) + 'px',
  };
  const shadows = [];
  if (t.strokeWidth) { const w = Math.max(1, t.strokeWidth / 5); st.webkitTextStroke = `${w}px ${t.stroke}`; st.paintOrder = 'stroke fill'; }
  if (t.glow) shadows.push(`0 0 ${t.glow / 3}px ${t.glowColor}`, `0 0 ${t.glow / 1.5}px ${t.glowColor}`);
  if (t.shadow) shadows.push(`${(t.shadowX || 0) / 4}px ${(t.shadowY || 0) / 4}px ${(t.shadowBlur || 0) / 4}px ${t.shadowColor || '#000'}`);
  if (shadows.length) st.textShadow = shadows.join(',');
  if (t.bg) { st.background = t.bgColor; st.padding = '2px 8px'; st.borderRadius = Math.min(12, (t.bgRadius || 0) / 3) + 'px'; st.opacity = 1; }
  return st;
}
function renderText() {
  content.append(el('button', { class: 'btn primary wide', onclick: () => addText('default'), html: icon('plus', 14) + ' Adicionar texto' }));
  content.append(searchBox('Buscar modelos...'));
  const grid = el('div', { class: 'grid' });
  for (const p of TEXT_PRESETS.filter((p) => (sub.text === 'all' || p.cat === sub.text) && match(p.name))) {
    const ct = t(p.t.content);
    const sample = el('div', { class: 'text-sample no-tr' }, el('span', { style: textPreviewStyle({ bold: true, ...p.t }) }, ct.length > 14 ? ct.slice(0, 12) + '…' : ct));
    grid.append(tile({ title: p.name, thumb: sample, onAdd: () => addText(p.id), drag: { kind: 'text', id: p.id } }));
  }
  content.append(grid);
}

// ---------- Stickers ----------
function renderStickers() {
  const s = sub.stickers;
  if (s === 'shapes') {
    const grid = el('div', { class: 'grid' });
    for (const sh of SHAPES) {
      const c = el('canvas', { width: 160, height: 90 });
      const x = c.getContext('2d');
      x.translate(80, 45);
      drawShape(x, sh.id, sh.id === 'lowerthird' || sh.id === 'progress' ? 60 : sh.id === 'subscribe' || sh.id === 'like' ? 80 : 60, sh.id === 'like' ? '#1877f2' : settings.get('accent'));
      grid.append(tile({ title: sh.name, thumb: c, onAdd: () => addShape(sh.id), drag: { kind: 'shape', id: sh.id } }));
    }
    content.append(grid);
    return;
  }
  const grid = el('div', { class: 'emoji-grid' });
  for (const e of EMOJI_CATS[s] || []) {
    const b = el('button', { class: 'emoji', title: 'Clique para adicionar', onclick: () => addSticker(e) }, e);
    setDrag(b, { kind: 'sticker', id: e });
    grid.append(b);
  }
  content.append(el('div', { class: 'lib-hint' }, 'Clique ou arraste para a linha do tempo.'), grid);
}

// ---------- Cena de exemplo para prévias ----------
let sampleCanvas = null;
function sample() {
  if (sampleCanvas) return sampleCanvas;
  sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 192; sampleCanvas.height = 108;
  drawBackground(sampleCanvas.getContext('2d'), { kind: 'sunset', colors: [] }, 192, 108);
  return sampleCanvas;
}
let sampleUrl = null;
const sampleDataUrl = () => sampleUrl || (sampleUrl = sample().toDataURL());

function animatedPreview(drawFn, period = 1.6) {
  const c = el('canvas', { width: 192, height: 108 });
  const x = c.getContext('2d');
  let raf = null, t0 = 0;
  const frame = (ts) => { const t = (ts - t0) / 1000; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, 192, 108); drawFn(x, t, (t % period) / period); raf = requestAnimationFrame(frame); };
  const still = () => { x.clearRect(0, 0, 192, 108); drawFn(x, 0.7, 0.5); };
  c.addEventListener('mouseenter', () => { t0 = performance.now(); raf = requestAnimationFrame(frame); });
  c.addEventListener('mouseleave', () => { cancelAnimationFrame(raf); still(); });
  requestAnimationFrame(still);
  return c;
}

// ---------- Efeitos ----------
function renderEffects() {
  const sel = store.primarySelected();
  content.append(el('div', { class: 'lib-hint' }, sel && ['video', 'image', 'text', 'sticker', 'shape'].includes(sel.type) ? 'Clique para aplicar ao clipe selecionado. Arraste para a linha do tempo para criar uma camada de efeito.' : 'Clique em + para adicionar como camada na linha do tempo, ou arraste sobre um clipe.'));
  content.append(searchBox('Buscar efeitos...'));
  const grid = el('div', { class: 'grid' });
  for (const fx of EFFECTS.filter((e) => (sub.effects === 'all' || e.cat === sub.effects) && match(e.name))) {
    const prev = animatedPreview((x, t) => {
      const W = 192, H = 108, S = 0.1;
      const st = { filter: [], dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1, S, prog: (t % 3) / 3 };
      fx.pre && fx.pre(st, t, 0.7);
      x.save(); x.translate(W / 2 + st.dx, H / 2 + st.dy); x.rotate(st.rot * Math.PI / 180); x.scale(st.scale, st.scale);
      x.filter = st.filter.join(' ') || 'none'; x.globalAlpha = st.alpha;
      x.drawImage(sample(), -W / 2, -H / 2, W, H); x.restore();
      try { fx.post && fx.post(x, W, H, t, 0.7, S); } catch {}
    });
    grid.append(tile({ title: fx.name, thumb: prev, onAdd: () => applyEffect(fx.id, { asLayer: !(sel && ['video', 'image', 'text', 'sticker', 'shape'].includes(sel.type)) }), onClick: (e) => { if (e.detail === 1 && sel) applyEffect(fx.id); }, drag: { kind: 'effect', id: fx.id } }));
  }
  content.append(grid);
}

// ---------- Transições ----------
let sampleB = null;
function sample2() {
  if (sampleB) return sampleB;
  sampleB = document.createElement('canvas'); sampleB.width = 192; sampleB.height = 108;
  drawBackground(sampleB.getContext('2d'), { kind: 'grad', colors: ['#1ccfdc', '#5b2bff'] }, 192, 108);
  const x = sampleB.getContext('2d'); x.fillStyle = '#fff'; x.font = '700 30px Montserrat, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('B', 96, 54);
  return sampleB;
}
function renderTransitions() {
  const cur = store.selectedTransition ? store.clip(store.selectedTransition)?.transitionIn?.id : null;
  content.append(el('div', { class: 'lib-hint' }, 'Passe o mouse para ver a prévia. Clique para aplicar entre dois clipes (ou arraste até a junção).'));
  content.append(searchBox('Buscar transições...'));
  const grid = el('div', { class: 'grid' });
  for (const tr of TRANSITIONS.filter((t) => (sub.transitions === 'all' || t.cat === sub.transitions) && match(t.name))) {
    const prev = animatedPreview((x, t, p) => {
      const pp = Math.min(1, Math.max(0, p * 1.4 - 0.2));
      try { tr.render(x, sample(), sample2(), pp, 192, 108); } catch {}
    }, 1.8);
    grid.append(tile({ title: tr.name, thumb: prev, active: cur === tr.id, onClick: () => applyTransition(tr.id), drag: { kind: 'transition', id: tr.id } }));
  }
  content.append(grid);
}

// ---------- Filtros ----------
function renderFilters() {
  const sel = store.primarySelected();
  content.append(el('div', { class: 'lib-hint' }, sel ? 'Clique para aplicar ao clipe selecionado.' : 'Clique para adicionar uma camada de filtro (afeta tudo abaixo). Ou arraste sobre um clipe.'));
  content.append(searchBox('Buscar filtros...'));
  const grid = el('div', { class: 'grid' });
  grid.append(tile({ title: 'Nenhum', thumb: el('img', { src: sampleDataUrl() }), onClick: () => { const c = store.primarySelected(); if (c) store.updateClip(c.id, { filter: null }); } }));
  for (const f of FILTERS.filter((x) => (sub.filters === 'all' || x.cat === sub.filters) && match(x.name))) {
    const thumb = el('div', { class: 'filter-thumb' }, el('img', { src: sampleDataUrl(), style: { filter: filterPreviewCss(f) } }),
      f.overlay ? el('div', { class: 'filter-ov', style: { background: f.overlay[0], mixBlendMode: f.overlay[1], opacity: f.overlay[2] } }) : null);
    grid.append(tile({ title: f.name, thumb, active: sel?.filter?.id === f.id, onClick: () => applyFilter(f.id), drag: { kind: 'filter', id: f.id } }));
  }
  content.append(grid);
}

// ---------- Animações ----------
function renderAnims() {
  const s = sub.anims;
  const sel = store.primarySelected();
  const key = s === 'in' ? 'animIn' : s === 'out' ? 'animOut' : 'animLoop';
  content.append(el('div', { class: 'lib-hint' }, sel ? 'Clique para aplicar ao clipe selecionado. Ajuste a duração no painel à direita.' : 'Selecione um clipe na linha do tempo para aplicar animações.'));
  const list = s === 'loop' ? ANIM_LOOP : ANIM_IN.filter((a) => !a.textOnly || sel?.type === 'text' || !sel);
  const grid = el('div', { class: 'grid' });
  grid.append(tile({ title: 'Nenhuma', thumb: el('div', { class: 'tile-ph', html: icon('close', 22) }), active: sel && !sel[key], onClick: () => applyAnimation(s, null) }));
  for (const a of list) {
    const prev = animatedPreview((x, tm, p) => {
      const fake = { duration: 1.6, animIn: null, animOut: null, animLoop: null };
      let lt = p * 1.6;
      if (s === 'in') { fake.animIn = { id: a.id, dur: 1 }; } else if (s === 'out') { fake.animOut = { id: a.id, dur: 1 }; lt = p * 1.6; } else fake.animLoop = { id: a.id, speed: 1 };
      const st = clipAnimation(fake, s === 'loop' ? tm : lt);
      x.fillStyle = '#26262a'; x.fillRect(0, 0, 192, 108);
      x.save(); x.globalAlpha = st.alpha; x.translate(96 + st.dx * 192, 54 + st.dy * 108); x.rotate(st.rot * Math.PI / 180); x.scale(st.scale * st.sx, st.scale * st.sy);
      if (st.blur) x.filter = `blur(${st.blur / 6}px)`;
      if (a.textOnly) { x.fillStyle = '#fff'; x.font = '700 22px Montserrat'; x.textAlign = 'center'; x.textBaseline = 'middle'; const txt = t('Olá mundo'); x.fillText(a.id === 'typewriter' ? txt.slice(0, Math.floor(txt.length * st.chars)) : txt.split(' ').slice(0, Math.ceil(2 * st.words)).join(' '), 0, 0); }
      else { const g = x.createLinearGradient(-30, -20, 30, 20); g.addColorStop(0, settings.get('accent')); g.addColorStop(1, '#5b2bff'); x.fillStyle = g; x.beginPath(); x.roundRect(-32, -22, 64, 44, 8); x.fill(); }
      x.restore();
    }, 1.8);
    grid.append(tile({ title: a.name, thumb: prev, active: sel?.[key]?.id === a.id, onClick: () => { applyAnimation(s, a.id); renderContent(); } }));
  }
  content.append(grid);
}

// ---------- Fontes ----------
function renderFonts() {
  const sel = store.primarySelected();
  const isText = sel?.type === 'text';
  content.append(el('div', { class: 'row gap' },
    el('button', { class: 'btn', onclick: () => importFonts(), html: icon('import', 14) + ' Importar fonte (.ttf/.otf)' })));
  content.append(el('div', { class: 'lib-hint' }, isText ? 'Clique para aplicar ao texto selecionado.' : t('{n} fontes grátis incluídas. Clique para criar um texto com a fonte.', { n: FONTS.length })));
  content.append(searchBox('Buscar fontes...'));
  const favs = settings.get('favoriteFonts') || [];
  let list = FONTS.map((f) => ({ family: f.family, category: f.category }));
  for (const c of customFonts) list.push({ family: c, category: 'custom' });
  if (sub.fonts === 'fav') list = list.filter((f) => favs.includes(f.family));
  else if (sub.fonts === 'custom') list = list.filter((f) => f.category === 'custom');
  else if (sub.fonts !== 'all') list = list.filter((f) => f.category === sub.fonts);
  list = list.filter((f) => match(f.family));
  const box = el('div', { class: 'font-list' });
  for (const f of list) {
    const fav = favs.includes(f.family);
    const row = el('div', { class: 'font-row' + (isText && sel.text.font === f.family ? ' active' : '') },
      el('div', { class: 'font-prev', style: { fontFamily: `"${f.family}"` } }, 'AsturCut Aa 123'),
      el('div', { class: 'font-name muted' }, f.family),
      el('button', { class: 'icon-btn xs star' + (fav ? ' on' : ''), title: 'Favoritar', onclick: (e) => { e.stopPropagation(); const l = new Set(settings.get('favoriteFonts') || []); fav ? l.delete(f.family) : l.add(f.family); settings.set('favoriteFonts', [...l]); renderContent(); } }, fav ? '★' : '☆'));
    row.addEventListener('click', () => {
      if (isText) store.updateClip(sel.id, { text: { font: f.family } });
      else { const c = addText('default'); store.updateClip(c.id, { text: { font: f.family, content: f.family } }); }
      renderContent();
    });
    box.append(row);
  }
  if (!list.length) box.append(el('div', { class: 'lib-hint' }, sub.fonts === 'fav' ? 'Clique na ☆ para favoritar fontes.' : 'Nenhuma fonte encontrada.'));
  content.append(box);
}
