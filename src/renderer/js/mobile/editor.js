// Editor de celular do AsturCut (no estilo dos editores de vídeo para celular):
// barra de cima · exibidor · barra de reprodução · linha do tempo com cursor no centro · ferramentas embaixo.
// A barra de ferramentas muda quando um clipe é selecionado (ferramentas do clipe).
import { $, el, icon, toast, fmtTime } from '../util.js';
import { t } from '../i18n.js';
import { store, bus, ASPECTS } from '../store.js';
import { openTab } from '../library.js';
import { inspectorFocus } from '../inspector.js';
import { player, togglePlay, pause, setAspect } from '../player.js';
import { importViaDialog, api, isMobile, importPaths } from '../media.js';
import { addMedia, addText } from '../actions.js';
import { openExportDialog } from '../exporter.js';
import { saveProject } from '../projects.js';
import { openCaptionsDialog } from '../captions.js';
import { removeSilencesDialog } from '../silence.js';
import { setSpeed } from '../timeline.js';
import { freezeFrame, detectScenes } from '../protools.js';
import { stabilize, autoReframeDialog, trackObject } from '../analysis.js';
import { textEditDialog } from '../textedit.js';
import { splitLayoutDialog, beatsDialog, normalizeDialog, closeAllGaps, exportFrame, autoEnhance } from '../extras.js';
import { initMobileTimeline, fitZoom } from './mtimeline.js';
import { openSheet, closeSheet, sheetOpen, parkPanel } from './sheets.js';

let toolbar, playBtn, timeEl, ctx = { showHome: null, isHomeVisible: null };
let menu = null; // submenu aberto (ex.: 'audio', 'text')

// ---------- montagem ----------
export function initMobileEditor({ showHome, isHomeVisible }) {
  ctx = { showHome, isHomeVisible };
  document.body.classList.add('mobile');
  const ws = $('#workspace');
  const lib = $('#panel-library'), insp = $('#panel-inspector'), playerPanel = $('#panel-player');
  parkPanel(lib); parkPanel(insp);

  const top = el('div', { id: 'm-top' },
    el('button', { class: 'm-ic', title: t('Tela inicial'), onclick: leave, html: icon('close', 22) }),
    el('div', { class: 'grow' }),
    el('button', { class: 'm-res', id: 'm-res', onclick: () => openExportDialog() }, resLabel(), el('span', { html: icon('chevDown', 12) })),
    el('button', { class: 'm-export', onclick: () => openExportDialog() }, t('Exportar')));

  playBtn = el('button', { class: 'm-play', onclick: () => togglePlay(), html: icon('play', 22) });
  timeEl = el('span', { class: 'm-time' }, '00:00 / 00:00');
  const playbar = el('div', { id: 'm-playbar' },
    timeEl,
    el('div', { class: 'grow' }),
    playBtn,
    el('div', { class: 'grow' }),
    el('button', { class: 'm-ic', title: t('Desfazer'), onclick: () => store.undo(), html: icon('undo', 19) }),
    el('button', { class: 'm-ic', title: t('Refazer'), onclick: () => store.redo(), html: icon('redo', 19) }),
    el('button', { class: 'm-ic', title: t('Tela cheia'), onclick: fullscreen, html: icon('fullscreen', 18) }));

  const tl = el('div', { id: 'm-tl' });
  toolbar = el('nav', { id: 'm-tools' });
  ws.innerHTML = '';
  ws.append(top, playerPanel, playbar, tl, toolbar);
  // a linha do tempo de PC continua existindo (escondida) para as funções que dependem dela
  const hidden = el('div', { id: 'm-desktop-hidden' }, $('#top-row') || el('div'), $('#hsplit') || el('div'), $('#panel-timeline') || el('div'));
  document.body.append(hidden);

  initMobileTimeline(tl, {
    onAddMain: () => addMain(),
    onTransition: () => openLibrary('transitions', t('Transições')),
    onSelect: () => { menu = null; renderTools(); },
  });

  bus.on('selection', () => { if (!store.selection.size && !store.selectedTransition) inspectorFocus(null); else menu = null; renderTools(); });
  bus.on('time', updateTime);
  bus.on('change', () => { updateTime(); const r = $('#m-res'); if (r) r.firstChild.textContent = resLabel(); });
  bus.on('play-state', (p) => { playBtn.innerHTML = icon(p ? 'pause' : 'play', 22); });
  bus.on('project', () => { menu = null; renderTools(); updateTime(); });
  window.__asturMobileBack = back;
  renderTools();
  updateTime();
}

const resLabel = () => { const s = store.p.settings; return Math.min(s.width, s.height) + 'p'; };
const mmss = (s) => fmtTime(s, 30, false);
function updateTime() { if (timeEl) timeEl.textContent = `${mmss(store.time)} / ${mmss(store.duration())}`; }

function fullscreen() {
  const st = $('#player-stage') || $('#panel-player');
  if (document.fullscreenElement) document.exitFullscreen?.(); else st.requestFullscreen?.().catch(() => {});
}

async function leave() {
  pause();
  closeSheet(true);
  if (store.p.clips.length && store.dirty) { try { await saveProject(); } catch {} }
  ctx.showHome();
}

function back() {
  if (sheetOpen()) { closeSheet(); return true; }
  if (menu) { menu = null; renderTools(); return true; }
  if (store.selection.size || store.selectedTransition) { store.clearSelection(); return true; }
  if (!ctx.isHomeVisible()) { leave(); return true; }
  return false;
}

// ---------- gavetas ----------
function openLibrary(tab, title, subId = null) {
  openTab(tab, subId);
  openSheet({ title, content: $('#panel-library'), keep: true });
}
function openInspector(tab, title) {
  inspectorFocus(tab);
  openSheet({ title, content: $('#panel-inspector'), keep: true, onClose: () => inspectorFocus(null) });
}

// ---------- barra de ferramentas ----------
const tool = (id, ic, label, fn, extra = '') => el('button', { class: 'm-tool ' + extra, dataset: { id }, onclick: fn }, el('span', { html: icon(ic, 21) }), el('small', {}, t(label)));

function rootTools() {
  return [
    tool('edit', 'blade', 'Editar', () => { const c = clipAtPlayhead(); if (c) store.select([c.id]); else toast(t('Coloque o cursor sobre um clipe'), 'info'); }),
    tool('audio', 'music', 'Áudio', () => { menu = 'audio'; renderTools(); }),
    tool('text', 'text', 'Texto', () => { menu = 'text'; renderTools(); }),
    tool('stickers', 'sticker', 'Stickers', () => openLibrary('stickers', t('Stickers'))),
    tool('overlay', 'layout', 'Sobreposição', () => addOverlay()),
    tool('effects', 'effects', 'Efeitos', () => openLibrary('effects', t('Efeitos'))),
    tool('filters', 'filters', 'Filtros', () => openLibrary('filters', t('Filtros'))),
    tool('transitions', 'transitions', 'Transições', () => openLibrary('transitions', t('Transições'))),
    tool('captions', 'captions', 'Legendas', () => openCaptionsDialog()),
    tool('aspect', 'fit', 'Proporção', () => aspectSheet()),
    tool('bg', 'palette', 'Fundo', () => bgSheet()),
    tool('silence', 'silence', 'Tirar silêncios', () => removeSilencesDialog()),
    tool('textedit', 'text', 'Editar pelo texto', () => textEditDialog()),
    tool('layout', 'gridview', 'Tela dividida', () => splitLayoutDialog()),
    tool('beats', 'music', 'Batidas', () => beatsDialog()),
    tool('normalize', 'volume', 'Normalizar volume', () => normalizeDialog()),
    tool('gaps', 'closeGaps', 'Fechar espaços', () => closeAllGaps()),
    tool('frame', 'image', 'Salvar quadro', () => exportFrame()),
  ];
}

function subTools(kind) {
  if (kind === 'audio') return [
    tool('music', 'music', 'Músicas', () => openLibrary('audio', t('Músicas'), 'music')),
    tool('sfx', 'sparkle', 'Efeitos sonoros', () => openLibrary('audio', t('Efeitos sonoros'), 'sfx:Transição')),
    tool('import-audio', 'import', 'Do celular', () => importAudio()),
    tool('voice', 'mic', 'Narração', () => voiceSheet()),
    tool('silence', 'silence', 'Tirar silêncios', () => removeSilencesDialog()),
  ];
  if (kind === 'text') return [
    tool('add-text', 'plus', 'Adicionar texto', () => { addText('default'); setTimeout(() => openInspector('text', t('Texto')), 50); }),
    tool('captions', 'captions', 'Legendas automáticas', () => openCaptionsDialog()),
    tool('text-tpl', 'text', 'Modelos de texto', () => openLibrary('text', t('Modelos de texto'))),
    tool('stickers', 'sticker', 'Stickers', () => openLibrary('stickers', t('Stickers'))),
  ];
  return [];
}

function clipTools(c) {
  const visual = c.type === 'video' || c.type === 'image';
  const list = [];
  const split = tool('split', 'split', 'Dividir', () => { const r = store.splitAt(store.time, [c.id]); if (!r.length) toast(t('Coloque o cursor dentro do clipe para dividir'), 'info'); });
  const del = tool('delete', 'trash', 'Excluir', () => { const tr = store.track(c.trackId); if (tr?.main) store.rippleDelete([c.id]); else store.deleteClips([c.id]); }, 'danger');
  const dup = tool('dup', 'duplicate', 'Duplicar', () => store.duplicate([c.id]));
  if (c.type === 'text' && c.autoCaption) list.push(tool('cap-style', 'captions', 'Estilo das legendas', () => openInspector('captions', t('Legendas'))));
  if (c.type === 'text') list.push(tool('edit-text', 'text', 'Editar', () => openInspector('text', t('Texto'))));
  if (['text', 'sticker', 'shape', 'image'].includes(c.type) && store.track(c.trackId) && !store.track(c.trackId).main) list.push(tool('track-obj', 'compare', 'Seguir objeto', () => trackObject(c)));
  if (c.type === 'video' || c.type === 'audio') list.push(tool('auto-cap', 'captions', 'Legendas automáticas', () => openCaptionsDialog([c])));
  list.push(split);
  if (c.type === 'video' || c.type === 'audio') {
    list.push(tool('speed', 'stopwatch', 'Velocidade', () => openInspector('speed', t('Velocidade'))));
    list.push(tool('volume', 'volume', 'Volume', () => openInspector('audio', t('Volume'))));
    list.push(tool('voice', 'mic', 'Efeitos de voz', () => openInspector('audio', t('Efeitos de voz'))));
  }
  if (c.type !== 'audio' && c.type !== 'effect' && c.type !== 'filter') list.push(tool('anim', 'wand', 'Animações', () => openInspector('anim', t('Animações'))));
  if (visual) {
    list.push(tool('adjust', 'adjust', 'Ajustar', () => openInspector('adjust', t('Ajustar'))));
    list.push(tool('color', 'palette', 'Cor', () => openInspector('color', t('Cor'))));
    list.push(tool('mask', 'compare', 'Máscara', () => openInspector('basic', t('Máscara'))));
    list.push(tool('filters', 'filters', 'Filtros', () => openLibrary('filters', t('Filtros'))));
    list.push(tool('effects', 'effects', 'Efeitos', () => openLibrary('effects', t('Efeitos'))));
    list.push(tool('cutout', 'person', 'Remover fundo', () => openInspector('keying', t('Remover fundo'))));
  }
  if (c.type === 'effect' || c.type === 'filter') list.push(tool('fx', 'effects', 'Ajustar', () => openInspector(c.type === 'filter' ? 'filter' : 'fx', t('Ajustar'))));
  if (c.type !== 'audio' && c.type !== 'effect' && c.type !== 'filter') list.push(tool('transform', 'rotate', 'Transformar', () => openInspector('basic', t('Transformar'))));
  if (visual) {
    list.push(tool('flip', 'flip', 'Espelhar', () => store.updateClip(c.id, { transform: { flipH: !c.transform.flipH } })));
    list.push(tool('rotate', 'rotate', 'Girar', () => store.updateClip(c.id, { transform: { rotation: ((c.transform.rotation || 0) + 90) % 360 } })));
  }
  if (c.type === 'video') list.push(tool('freeze', 'freeze', 'Congelar', () => freezeFrame()));
  if (c.type === 'video') list.push(tool('scenes', 'split', 'Detectar cenas', () => detectScenes(c)));
  if (c.type === 'video') list.push(tool('stab', 'wand', 'Estabilizar', () => stabilize(c)));
  if (c.type === 'video' || c.type === 'image') list.push(tool('auto', 'sparkle', 'Ajuste automático', () => autoEnhance(c)));
  if (c.type === 'video' || c.type === 'audio') list.push(tool('textedit', 'text', 'Editar pelo texto', () => { store.select([c.id]); textEditDialog(); }));
  if (c.type === 'video') list.push(tool('reframe', 'maximize', 'Reenquadrar', () => autoReframeDialog()));
  if (c.type === 'video' && !c.audioDetached) list.push(tool('detach', 'detach', 'Separar áudio', () => { store.detachAudio(c.id); toast(t('Áudio separado'), 'success'); }));
  if (c.type === 'audio' || c.type === 'video') list.push(tool('silence', 'silence', 'Tirar silêncios', () => removeSilencesDialog([c])));
  if (c.type === 'audio') list.push(tool('speed2x', 'forward', '2x', () => setSpeed(c, (c.speed || 1) === 2 ? 1 : 2)));
  list.push(dup, del);
  return list;
}

function renderTools() {
  if (!toolbar) return;
  toolbar.innerHTML = '';
  const c = store.primarySelected();
  const trId = store.selectedTransition;
  let items, title = null;
  if (trId && store.clip(trId)) {
    title = t('Transição');
    items = [
      tool('tr-edit', 'transitions', 'Trocar', () => openLibrary('transitions', t('Transições'))),
      tool('tr-dur', 'stopwatch', 'Duração', () => openSheet({ title: t('Transição'), content: $('#panel-inspector'), keep: true })),
      tool('tr-del', 'trash', 'Remover', () => { store.updateClip(trId, { transitionIn: null }); store.clearSelection(); }, 'danger'),
    ];
  } else if (c) items = clipTools(c);
  else if (menu) items = subTools(menu);
  else items = rootTools();
  const backBtn = (c || trId || menu) ? el('button', { class: 'm-tool back', onclick: () => { if (menu) { menu = null; renderTools(); } else store.clearSelection(); }, html: icon('chevRight', 22) }) : null;
  if (backBtn) toolbar.append(backBtn);
  toolbar.append(...items);
  toolbar.classList.toggle('ctx', !!backBtn);
  void title;
}

function clipAtPlayhead() {
  const main = store.mainTrack();
  const tt = store.time;
  return store.clipsOn(main.id).find((c) => tt >= c.start && tt < c.start + c.duration)
    || store.p.clips.find((c) => tt >= c.start && tt < c.start + c.duration) || null;
}

// ---------- ações ----------
async function addMain() {
  const added = await importViaDialog();
  if (!added?.length) return;
  const visual = added.filter((m) => m.type !== 'audio');
  const firstEver = !store.p.clips.some((c) => c.type === 'video' || c.type === 'image');
  for (const m of added) addMedia(m);
  if (firstEver && visual.length && store.p.settings.aspect !== 'custom') setAspect('original');
  store.clearSelection();
  store.setTime(0);
  fitZoom();
  bus.emit('change', 'add-media');
}

async function addOverlay() {
  const added = await importViaDialog();
  for (const m of added || []) {
    if (m.type === 'audio') { addMedia(m, { t: store.time, newzone: 'bottom' }); continue; }
    const c = addMedia(m, { t: store.time, newzone: 'top' });
    if (c) store.updateClip(c.id, { transform: { scale: 0.6 } });
  }
}

async function importAudio() {
  const added = await importViaDialog();
  for (const m of added || []) addMedia(m, { t: store.time, newzone: 'bottom' });
}

function aspectSheet() {
  const box = el('div', { class: 'm-grid' });
  const opts = [['original', t('Original'), '']].concat(Object.keys(ASPECTS).map((a) => [a, a, { '16:9': 'YouTube', '9:16': 'TikTok · Reels', '1:1': 'Instagram', '4:5': 'Feed', '4:3': 'TV', '21:9': t('Cinema') }[a] || '']));
  for (const [id, name, sub] of opts) {
    const [w, h] = id === 'original' ? [1, 1] : ASPECTS[id];
    const k = 34 / Math.max(w, h);
    box.append(el('button', { class: 'm-ar' + (store.p.settings.aspect === id ? ' on' : ''), onclick: () => { setAspect(id); aspectSheet(); } },
      el('i', { style: { width: Math.round(w * k) + 'px', height: Math.round(h * k) + 'px' }, class: id === 'original' ? 'orig' : '' }), el('b', {}, name), el('small', {}, sub)));
  }
  openSheet({ title: t('Proporção'), content: box });
}

function bgSheet() {
  const st = store.p.settings;
  const colors = ['#000000', '#ffffff', '#141416', '#1ccfdc', '#5b2bff', '#ef4444', '#f59e0b', '#22c55e', '#ec4899', '#3b82f6'];
  const box = el('div', { class: 'm-bg' },
    el('button', { class: 'm-bg-blur' + (st.bgMode === 'blur' ? ' on' : ''), onclick: () => { store.begin(); st.bgMode = st.bgMode === 'blur' ? 'color' : 'blur'; store.commit('bg'); bgSheet(); } }, el('span', { html: icon('filters', 20) }), t('Desfocado')),
    el('div', { class: 'm-swatches' }, colors.map((c) => el('button', { class: 'm-sw' + (st.bgMode !== 'blur' && st.background === c ? ' on' : ''), style: { background: c }, onclick: () => { store.begin(); st.background = c; st.bgMode = 'color'; store.commit('bg'); bgSheet(); } }))));
  openSheet({ title: t('Fundo'), content: box });
}

// narração com o microfone do celular
function voiceSheet() {
  let rec = null, stream = null, chunks = [], t0 = 0, timer = 0;
  const start = store.time;
  const label = el('div', { class: 'm-voice-time' }, '00:00');
  const hint = el('div', { class: 'muted small center' }, t('Toque para gravar a partir do cursor'));
  const btn = el('button', { class: 'm-voice-btn' }, el('i'));
  const stopAll = () => { clearInterval(timer); stream?.getTracks().forEach((x) => x.stop()); };
  btn.onclick = async () => {
    if (rec) { rec.stop(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch { toast(t('Não consegui abrir o microfone'), 'error'); return; }
    chunks = [];
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stopAll();
      btn.classList.remove('on');
      hint.textContent = t('Salvando a gravação...');
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const name = `${t('narração')} ${new Date().toLocaleTimeString().replace(/:/g, '-')}.${/mp4/.test(blob.type) ? 'm4a' : 'webm'}`;
        let media = null;
        if (isMobile && api.saveMedia) media = (await importPaths([await api.saveMedia(name, bytes)]))[0];
        else {
          const f = new File([blob], name, { type: blob.type });
          const { importDropped } = await import('../media.js');
          media = (await importDropped([f]))?.[0];
        }
        if (media) {
          store.begin();
          let tr = store.p.tracks.find((x) => x.type === 'audio' && x.narration && store.isFree(x.id, start, start + (media.duration || 1)));
          if (!tr) { tr = store.addTrack('audio', null, t('Narração')); tr.narration = true; }
          store.addClip({ trackId: tr.id, type: 'audio', mediaId: media.id, name: media.name, start, duration: media.duration || (performance.now() - t0) / 1000, in: 0 }, { commit: false });
          store.commit('voice');
          toast(t('Narração adicionada'), 'success');
        }
      } catch (e) { console.error(e); toast(t('Não foi possível salvar a gravação'), 'error'); }
      closeSheet();
    };
    store.setTime(start);
    rec.start(500);
    t0 = performance.now();
    btn.classList.add('on');
    hint.textContent = t('Gravando... toque de novo para parar');
    timer = setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); label.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 250);
  };
  openSheet({ title: t('Narração'), content: el('div', { class: 'm-voice' }, label, btn, hint), onClose: () => { if (rec && rec.state === 'recording') rec.stop(); else stopAll(); } });
}

// usado pela tela inicial: novo projeto direto da galeria
export async function quickStart(newProject, after) {
  const ok = await newProject({ aspect: '9:16' });
  if (!ok) return;
  await addMain();
  bus.emit('fit-timeline');
  if (after) setTimeout(after, 300);
}

void player;

// atalho da tela inicial: abre "Remover fundo" no primeiro clipe
export function openCutoutForFirst() {
  const c = store.clipsOn(store.mainTrack().id).find((x) => x.type === 'video' || x.type === 'image');
  if (!c) return;
  store.select([c.id]);
  openInspector('keying', t('Remover fundo'));
}
