// Linha do tempo: trilhas, clipes, arrastar/aparar/dividir, régua, zoom e soltar da biblioteca
import { store, bus } from './store.js';
import { $, el, icon, fmtTime, fmtShort, clamp, dragHandler, contextMenu, promptDialog, toast } from './util.js';
import { t } from './i18n.js';
import { runtime, canRecordScreen } from './media.js';
import { mobileUI } from './mobile/detect.js';
import { settings } from './settings.js';
import { player, pause } from './player.js';
import { handleDrop } from './actions.js';
import { keyTimes } from './keyframes.js';
import { removeSilencesDialog } from './silence.js';
import { openCaptionsDialog } from './captions.js';
import { openRecorder } from './recorder.js';
import { stabilize, trackObject } from './analysis.js';
import { textEditDialog } from './textedit.js';
import { denoiseDialog } from './denoise.js';
import { closeAllGaps, ttsDialog, editMarker, markerAt, reverseClip, colorMatchSelected, splitLayoutDialog, beatsDialog, normalizeDialog } from './extras.js';
import { multicamDialog, openMulticamMonitor, isMulticamSeq } from './multicam.js';
import { sequences, switchSequence, newSequence, renameSequence, duplicateSequence, deleteSequence, nestSelection, seqDuration, insertSequenceClip, seqData, angleTracks } from './sequences.js';
import { freezeFrame, detectScenes, audioCrossfades, openHistory } from './protools.js';
import { labelMenu, speedDialog, gainDialog, copyAttributes, pasteAttributesDialog, hasAttributes } from './editTools.js';
import { openMixer } from './audiomix.js';
import { openSource } from './source.js';

const HEAD_W = mobileUI ? 72 : 112;
const RULER_H = 28;
let pps = 60; // pixels por segundo
let mode = 'select';
let root, scroller, inner, rulerCanvas, playheadEl;
let renderQueued = false;
let dropIndicator = null;
let seqBar = null;

// abas das sequências do projeto
function renderSeqBar() {
  if (!seqBar) return;
  const list = sequences();
  seqBar.innerHTML = '';
  seqBar.classList.toggle('single', list.length < 2);
  for (const s of list) {
    const on = s.id === store.p.seqId;
    const tab = el('button', { class: 'seq-tab' + (on ? ' on' : ''), title: on ? t('Sequência aberta — duplo clique para renomear') : t('Abrir esta sequência'),
      onclick: () => switchSequence(s.id), ondblclick: () => renameSequence(s.id) }, el('span', { html: icon('layout', 12) }), el('span', {}, s.name));
    tab.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenu(e.clientX, e.clientY, [
      { label: t('Abrir'), onClick: () => switchSequence(s.id) },
      { label: t('Renomear...'), onClick: () => renameSequence(s.id) },
      { label: t('Duplicar'), onClick: () => duplicateSequence(s.id) },
      !on ? { label: t('Inserir no cursor (aninhar)'), onClick: () => insertSequenceClip(s.id) } : null,
      '-',
      { label: t('Excluir sequência'), disabled: list.length < 2, onClick: () => deleteSequence(s.id) },
    ]); });
    seqBar.append(tab);
  }
  seqBar.append(el('button', { class: 'seq-tab add', title: t('Nova sequência'), onclick: () => newSequence() }, '+ ' + t('Sequência')));
}

export function initTimeline() {
  root = $('#panel-timeline');
  root.innerHTML = '';
  const tb = el('div', { class: 'tl-toolbar' });
  const btn = (ic, title, fn, id) => el('button', { class: 'icon-btn', title, id, onclick: fn, html: icon(ic) });
  tb.append(
    btn('cursor', 'Selecionar (V)', () => setMode('select'), 'tl-mode-select'),
    btn('blade', 'Lâmina — clique para cortar (C)', () => setMode('blade'), 'tl-mode-blade'),
    btn('rippleTool', 'Edição ripple — aparar empurra os clipes seguintes (B)', () => setMode('ripple'), 'tl-mode-ripple'),
    btn('rollTool', 'Edição rolante — move o ponto de corte entre dois clipes (N)', () => setMode('rolling'), 'tl-mode-rolling'),
    btn('rateTool', 'Alongar taxa — aparar muda a velocidade (R)', () => setMode('rate'), 'tl-mode-rate'),
    btn('slipTool', 'Deslizar conteúdo (slip) — muda o trecho mostrado sem mover o clipe (Y)', () => setMode('slip'), 'tl-mode-slip'),
    btn('slideTool', 'Deslizar clipe (slide) — move o clipe ajustando os vizinhos (U)', () => setMode('slide'), 'tl-mode-slide'),
    btn('forward', 'Selecionar à frente — seleciona tudo à direita do clique (A)', () => setMode('forward'), 'tl-mode-forward'),
    el('div', { class: 'tb-sep' }),
    btn('undo', 'Desfazer (Ctrl+Z)', () => store.undo()),
    btn('redo', 'Refazer (Ctrl+Y)', () => store.redo()),
    el('div', { class: 'tb-sep' }),
    btn('split', 'Dividir no cursor (Ctrl+B)', () => store.splitAt()),
    btn('splitL', 'Excluir à esquerda (Q)', () => store.deleteLeft()),
    btn('splitR', 'Excluir à direita (W)', () => store.deleteRight()),
    btn('trash', 'Excluir (Delete)', () => store.deleteClips()),
    btn('ripple', 'Excluir e fechar o espaço — ripple (Shift+Delete)', () => (store.selectedGap ? store.deleteGap() : store.rippleDelete())),
    btn('duplicate', 'Duplicar (Ctrl+D)', () => store.duplicate()),
    btn('closeGaps', 'Fechar todos os espaços vazios', () => closeAllGaps()),
    btn('detach', 'Separar áudio', () => { const c = store.primarySelected(); if (c?.type === 'video') { store.detachAudio(c.id); toast('Áudio separado', 'success'); } else toast('Selecione um vídeo', 'error'); }),
    btn('marker', 'Adicionar marcador (M)', () => store.addMarker()),
    btn('history', 'Histórico de ações (Ctrl+H)', () => openHistory()),
    el('div', { class: 'tb-sep' }),
    btn('silence', 'Tirar silêncios automaticamente', () => removeSilencesDialog()),
    btn('captions', 'Legendas automáticas', () => openCaptionsDialog()),
    btn('text', 'Editar pelo texto — apague palavras e o vídeo é cortado', () => textEditDialog()),
    ...(canRecordScreen ? [btn('record', 'Gravar tela e webcam', () => openRecorder())] : []),
    el('div', { class: 'grow' }),
    btn('gridview', 'Multicâmera — juntar várias câmeras e cortar entre elas', () => (store.p.clips.some((c) => c.type === 'sequence' && isMulticamSeq(c.seqId)) ? openMulticamMonitor() : multicamDialog())),
    btn('mixer', 'Mixer de áudio (efeitos por trilha)', () => openMixer()),
    el('div', { class: 'tb-sep' }),
    el('button', { class: 'icon-btn toggle', id: 'tl-magnet', title: 'Trilha principal magnética', onclick: () => { settings.set('magnet', !settings.get('magnet')); store.applyMagnet(); bus.emit('change', 'magnet'); syncToggles(); }, html: icon('magnet') }),
    el('button', { class: 'icon-btn toggle', id: 'tl-snap', title: 'Encaixe automático', onclick: () => { settings.set('snapping', !settings.get('snapping')); syncToggles(); }, html: icon('snap') }),
    el('div', { class: 'tb-sep' }),
    btn('zoomOut', 'Diminuir zoom (-)', () => zoom(1 / 1.3)),
    el('input', { type: 'range', class: 'zoom-slider', id: 'tl-zoom', min: 0, max: 100, value: ppsToSlider(pps), oninput: (e) => setPps(sliderToPps(+e.target.value)) }),
    btn('zoomIn', 'Aumentar zoom (+)', () => zoom(1.3)),
    btn('fit', 'Ajustar à janela', () => fit()),
  );
  scroller = el('div', { class: 'tl-scroll', id: 'tl-scroll' });
  inner = el('div', { class: 'tl-inner' });
  scroller.append(inner);
  seqBar = el('div', { class: 'tl-seqbar' });
  root.append(tb, seqBar, scroller);
  renderSeqBar();
  bus.on('sequences', renderSeqBar);
  bus.on('project', renderSeqBar);

  scroller.addEventListener('scroll', () => drawRuler());
  scroller.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const r = scroller.getBoundingClientRect();
      const x = e.clientX - r.left - HEAD_W + scroller.scrollLeft;
      const t = x / pps;
      setPps(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      scroller.scrollLeft = t * pps - (e.clientX - r.left - HEAD_W);
    } else if (e.shiftKey) { e.preventDefault(); scroller.scrollLeft += e.deltaY; }
  }, { passive: false });
  scroller.addEventListener('dragover', onDragOver);
  scroller.addEventListener('dragleave', (e) => { if (!scroller.contains(e.relatedTarget)) clearDrop(); });
  scroller.addEventListener('drop', onDrop);

  bus.on('change', queueRender);
  bus.on('selection', queueRender);
  bus.on('media-analyzed', queueRender);
  bus.on('media', queueRender);
  bus.on('time', onTime);
  settings.on('change', (k) => { if (['trackHeight', 'showThumbs', 'showWaves'].includes(k)) queueRender(); });
  new ResizeObserver(() => { drawRuler(); }).observe(scroller);
  setMode('select');
  syncToggles();
  render();
}

function syncToggles() {
  $('#tl-magnet')?.classList.toggle('on', !!settings.get('magnet'));
  $('#tl-snap')?.classList.toggle('on', !!settings.get('snapping'));
}
export function setMode(m) {
  mode = m;
  $('#tl-mode-select')?.classList.toggle('on', m === 'select');
  $('#tl-mode-blade')?.classList.toggle('on', m === 'blade');
  $('#tl-mode-forward')?.classList.toggle('on', m === 'forward');
  for (const k of ['ripple', 'rolling', 'rate', 'slip', 'slide']) $('#tl-mode-' + k)?.classList.toggle('on', m === k);
  root?.classList.toggle('pro-tool', ['ripple', 'rolling', 'rate', 'slip', 'slide'].includes(m));
  root?.classList.toggle('blade-mode', m === 'blade');
  root?.classList.toggle('forward-mode', m === 'forward');
}
export function getMode() { return mode; }

const ppsToSlider = (p) => Math.round((Math.log(p / 4) / Math.log(400 / 4)) * 100);
const sliderToPps = (v) => 4 * Math.pow(400 / 4, v / 100);
function setPps(p) {
  pps = clamp(p, 2, 600);
  const z = $('#tl-zoom'); if (z) z.value = ppsToSlider(pps);
  render();
}
export function zoom(f) {
  const center = store.time;
  setPps(pps * f);
  scroller.scrollLeft = center * pps - (scroller.clientWidth - HEAD_W) / 2;
}
export function fit() {
  const d = Math.max(store.duration(), 5);
  setPps((scroller.clientWidth - HEAD_W - 60) / d);
  scroller.scrollLeft = 0;
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function contentWidth() {
  return Math.max((store.duration() + 30) * pps, scroller.clientWidth - HEAD_W + 200);
}

function trackHeight(tr) {
  const h = settings.get('trackHeight') || 54;
  if (tr.type === 'audio') return Math.round(h * 0.8);
  return tr.main ? h + 8 : h;
}

// ---------- Renderização ----------
function render() {
  if (!inner) return;
  const W = contentWidth();
  inner.style.width = (HEAD_W + W) + 'px';
  inner.innerHTML = '';
  // régua
  const rulerRow = el('div', { class: 'tl-ruler-row', style: { height: RULER_H + 'px' } });
  const corner = el('div', { class: 'tl-corner', style: { width: HEAD_W + 'px' } },
    el('button', { class: 'icon-btn sm', title: 'Adicionar trilha', onclick: (e) => contextMenu(e.clientX, e.clientY, [
      { label: 'Nova trilha de vídeo/camada', onClick: () => { store.begin(); store.addTrack('video'); store.commit('track'); } },
      { label: 'Nova trilha de áudio', onClick: () => { store.begin(); store.addTrack('audio'); store.commit('track'); } },
    ]), html: icon('plus', 14) }));
  rulerCanvas = el('canvas', { class: 'tl-ruler' });
  const rulerLane = el('div', { class: 'tl-ruler-lane', style: { width: W + 'px' } }, rulerCanvas);
  rulerLane.addEventListener('dblclick', (e) => {
    const r = rulerLane.getBoundingClientRect();
    const mk = markerAt((e.clientX - r.left) / pps, 8 / pps);
    if (mk) editMarker(mk);
  });
  rulerLane.addEventListener('contextmenu', (e) => {
    const r = rulerLane.getBoundingClientRect();
    const mk = markerAt((e.clientX - r.left) / pps, 8 / pps);
    if (!mk) return;
    e.preventDefault();
    contextMenu(e.clientX, e.clientY, [
      { label: 'Editar marcador...', onClick: () => editMarker(mk) },
      { label: 'Excluir marcador', onClick: () => { store.begin(); store.p.markers = store.p.markers.filter((x) => x !== mk); store.commit('marker'); } },
      { label: 'Excluir todos os marcadores', onClick: () => { store.begin(); store.p.markers = []; store.commit('marker'); } },
    ]);
  });
  rulerLane.addEventListener('pointerdown', (e) => {
    pause();
    const seek = (ev) => { const r = rulerLane.getBoundingClientRect(); store.setTime(Math.max(0, (ev.clientX - r.left) / pps)); };
    seek(e);
    dragHandler(e, seek, null, 'ew-resize');
  });
  rulerRow.append(corner, rulerLane);
  inner.append(rulerRow);

  const tracksBox = el('div', { class: 'tl-tracks' });
  // zona para nova trilha no topo
  tracksBox.append(el('div', { class: 'tl-newzone top', dataset: { newzone: 'top' } }, el('div', { class: 'tl-track-head ghost', style: { width: HEAD_W + 'px' } }), el('div', { class: 'tl-lane-ghost' })));
  for (const tr of store.p.tracks) tracksBox.append(renderTrack(tr, W));
  tracksBox.append(el('div', { class: 'tl-newzone bottom', dataset: { newzone: 'bottom' } },
    el('div', { class: 'tl-track-head ghost', style: { width: HEAD_W + 'px' } }),
    el('div', { class: 'tl-lane-ghost' }, store.p.clips.length ? '' : el('div', { class: 'tl-empty-hint', html: icon('video', 16) + '<span>Arraste o material aqui e comece a criar</span>' }))));
  inner.append(tracksBox);

  playheadEl = el('div', { class: 'tl-playhead' }, el('div', { class: 'tl-playhead-knob' }));
  playheadEl.querySelector('.tl-playhead-knob').addEventListener('pointerdown', (e) => {
    pause();
    dragHandler(e, (ev) => { const r = inner.getBoundingClientRect(); store.setTime(Math.max(0, (ev.clientX - r.left - HEAD_W) / pps)); }, null, 'ew-resize');
  });
  inner.append(playheadEl);
  if (dropIndicator) inner.append(dropIndicator);
  positionPlayhead();
  drawRuler();
}

function renderTrack(tr, W) {
  const h = trackHeight(tr);
  const row = el('div', { class: `tl-track ${tr.type}${tr.main ? ' main' : ''}${tr.locked ? ' locked' : ''}${tr.hidden || tr.muted ? ' dim' : ''}`, style: { height: h + 'px' }, dataset: { track: tr.id } });
  const head = el('div', { class: 'tl-track-head', style: { width: HEAD_W + 'px' } },
    el('div', { class: 'th-name', title: 'Duplo clique para renomear', ondblclick: async () => { const n = await promptDialog('Renomear trilha', tr.name); if (n) { store.begin(); tr.name = n; store.commit('rename'); } } },
      el('span', { html: icon(tr.type === 'audio' ? 'music' : tr.main ? 'video' : 'image', 12) }), el('span', { class: 'th-label' }, tr.name)),
    el('div', { class: 'th-btns' },
      el('button', { class: 'icon-btn xs' + (tr.locked ? ' on' : ''), title: tr.locked ? 'Desbloquear' : 'Bloquear', onclick: () => { store.begin(); tr.locked = !tr.locked; store.commit('lock'); }, html: icon(tr.locked ? 'lock' : 'unlock', 13) }),
      tr.type === 'video'
        ? el('button', { class: 'icon-btn xs' + (tr.hidden ? ' on' : ''), title: tr.hidden ? 'Mostrar' : 'Ocultar', onclick: () => { store.begin(); tr.hidden = !tr.hidden; store.commit('hide'); }, html: icon(tr.hidden ? 'eyeOff' : 'eye', 13) })
        : null,
      el('button', { class: 'icon-btn xs' + (tr.muted ? ' on' : ''), title: tr.muted ? 'Ativar som' : 'Silenciar', onclick: () => { store.begin(); tr.muted = !tr.muted; store.commit('mute'); }, html: icon(tr.muted ? 'mute' : 'volume', 13) }),
      el('button', { class: 'icon-btn xs solo' + (tr.solo ? ' on' : ''), title: 'Solo (ouvir só esta trilha)', onclick: () => { store.begin(); tr.solo = !tr.solo; store.commit('solo'); } }, 'S'),
    ));
  head.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu(e.clientX, e.clientY, [
      { label: 'Renomear', onClick: async () => { const n = await promptDialog('Renomear trilha', tr.name); if (n) { store.begin(); tr.name = n; store.commit('rename'); } } },
      { label: 'Mover para cima', onClick: () => moveTrack(tr, -1) },
      { label: 'Mover para baixo', onClick: () => moveTrack(tr, 1) },
      { label: 'Efeitos de áudio da trilha...', onClick: () => openMixer(tr.id) },
      { label: 'Selecionar todos os clipes da trilha', onClick: () => store.select(store.clipsOn(tr.id).map((c) => c.id)) },
      '-',
      { label: 'Excluir trilha', disabled: tr.main, onClick: () => { store.begin(); store.p.clips = store.p.clips.filter((c) => c.trackId !== tr.id); store.p.tracks = store.p.tracks.filter((t) => t !== tr); store.commit('deltrack'); } },
    ]);
  });
  const lane = el('div', { class: 'tl-lane', style: { width: W + 'px' } });
  lane.addEventListener('pointerdown', (e) => {
    if (e.target !== lane || e.button !== 0) return;
    const r = lane.getBoundingClientRect();
    const tt = Math.max(0, (e.clientX - r.left) / pps);
    if (mode === 'forward') { selectForward(tt, e.shiftKey ? tr.id : null, e); return; }
    pause();
    const g = store.gapAt(tr.id, tt);
    if (g) store.selectGap(g); else store.clearSelection();
    store.setTime(tt);
  });
  lane.addEventListener('contextmenu', (e) => {
    if (e.target !== lane) return;
    e.preventDefault();
    const r = lane.getBoundingClientRect();
    const g = store.gapAt(tr.id, Math.max(0, (e.clientX - r.left) / pps));
    contextMenu(e.clientX, e.clientY, [
      { label: 'Excluir espaço vazio (ripple)', disabled: !g, onClick: () => store.deleteGap(g) },
      { label: 'Colar', shortcut: 'Ctrl+V', disabled: !store.clipboard.length, onClick: () => store.paste() },
    ]);
  });
  if (store.selectedGap && store.selectedGap.trackId === tr.id) {
    const g = store.selectedGap;
    lane.append(el('div', { class: 'tl-gap-sel', style: { left: (g.start * pps) + 'px', width: ((g.end - g.start) * pps) + 'px' } }));
  }
  const sorted = store.clipsOn(tr.id);
  for (const c of sorted) lane.append(renderClip(c, tr, h));
  // botões de transição entre clipes adjacentes
  if (tr.type === 'video') {
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (Math.abs(a.start + a.duration - b.start) > 0.05) continue;
      if (![a, b].every((c) => ['video', 'image'].includes(c.type))) continue;
      const has = !!b.transitionIn;
      const j = el('div', { class: 'tl-junction' + (has ? ' has' : '') + (store.selectedTransition === b.id ? ' sel' : ''), title: has ? 'Editar transição' : 'Adicionar transição', style: { left: (b.start * pps) + 'px' }, html: icon(has ? 'transitions' : 'plus', 11) });
      j.addEventListener('pointerdown', (e) => e.stopPropagation());
      j.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!has) { store.updateClip(b.id, { transitionIn: { id: 'fade', dur: settings.get('transitionDuration') } }); }
        store.selectTransition(b.id);
        bus.emit('open-library', 'transitions');
      });
      lane.append(j);
    }
  }
  row.append(head, lane);
  return row;
}

function moveTrack(tr, dir) {
  const arr = store.p.tracks;
  const i = arr.indexOf(tr), j = i + dir;
  if (j < 0 || j >= arr.length) return;
  store.begin();
  [arr[i], arr[j]] = [arr[j], arr[i]];
  store.commit('movetrack');
}

const TYPE_LABEL = { sequence: 'Sequência', video: 'Vídeo', image: 'Imagem', audio: 'Áudio', text: 'Texto', sticker: 'Sticker', shape: 'Forma', effect: 'Efeito', filter: 'Filtro' };

function clipLabel(c) {
  if (c.type === 'text') return c.text.content.split('\n')[0] || 'Texto';
  if (c.type === 'sticker') return (c.sticker?.emoji || '') + ' Sticker';
  return c.name || TYPE_LABEL[c.type];
}

function renderClip(c, tr, h) {
  const w = Math.max(2, c.duration * pps);
  const sel = store.selection.has(c.id);
  const node = el('div', { class: `tl-clip ${c.type}${sel ? ' selected' : ''}${c.label ? ' labeled' : ''}${c.linkId ? ' linked' : ''}`, style: { left: (c.start * pps) + 'px', width: w + 'px', ...(c.label ? { '--label': c.label } : {}) }, dataset: { clip: c.id } });
  const m = c.mediaId ? store.media(c.mediaId) : null;
  const rt = m ? runtime.get(m.id) : null;
  if ((c.type === 'video' || c.type === 'image') && settings.get('showThumbs')) {
    const strip = el('div', { class: 'clip-strip' });
    const ar = m && m.width ? m.width / m.height : 16 / 9;
    let tileW = Math.max(30, (h - 2) * ar);
    let n = Math.ceil(w / tileW);
    if (n > 120) { tileW = w / 120; n = 120; }
    const frames = rt?.frames;
    for (let i = 0; i < n; i++) {
      let src = rt?.thumb;
      if (frames && frames.length && c.type === 'video') {
        const st = (c.in || 0) + (i * tileW / pps) * (c.speed || 1);
        let best = frames[0];
        for (const f of frames) if (Math.abs(f.t - st) < Math.abs(best.t - st)) best = f;
        src = best.src;
      }
      if (src) strip.append(el('img', { src, draggable: 'false', style: { left: (i * tileW) + 'px', width: tileW + 'px' } }));
    }
    node.append(strip);
  }
  if ((c.type === 'audio' || (c.type === 'video' && !c.audioDetached)) && settings.get('showWaves') && rt?.peaks) {
    const cv = el('canvas', { class: 'clip-wave' + (c.type === 'video' ? ' small' : '') });
    drawWave(cv, c, rt, Math.min(w, 6000), c.type === 'video' ? 16 : h - 18);
    node.append(cv);
  }
  if (c.type === 'text' || c.type === 'sticker' || c.type === 'shape' || c.type === 'effect' || c.type === 'filter' || c.type === 'sequence') {
    node.append(el('div', { class: 'clip-icon', html: icon({ text: 'text', sticker: 'sticker', shape: 'star', effect: 'effects', filter: 'filters', sequence: 'layout' }[c.type], 13) }));
  }
  const badges = [];
  if (c.speed && c.speed !== 1) badges.push(c.speed + 'x');
  if (c.effects?.length && c.type !== 'effect') badges.push('✦' + c.effects.length);
  if (c.filter && c.type !== 'filter') badges.push('◐');
  if (c.animIn || c.animOut || c.animLoop) badges.push('↻');
  if (c.volume === 0 && hasAudio(c)) badges.push('🔇');
  node.append(el('div', { class: 'clip-label' },
    el('span', { class: 'clip-name' }, clipLabel(c)),
    el('span', { class: 'clip-dur' }, fmtShort(c.duration)),
    badges.length ? el('span', { class: 'clip-badges' }, badges.join(' ')) : null));
  // fades de áudio
  if (hasAudio(c) && (c.fadeIn || c.fadeOut)) {
    if (c.fadeIn) node.append(el('div', { class: 'clip-fade in', style: { width: (c.fadeIn * pps) + 'px' } }));
    if (c.fadeOut) node.append(el('div', { class: 'clip-fade out', style: { width: (c.fadeOut * pps) + 'px' } }));
  }
  if (sel) for (const kt of keyTimes(c)) {
    const d = el('div', { class: 'clip-kf', title: 'Keyframe', style: { left: (kt * pps) + 'px' } });
    d.addEventListener('pointerdown', (e) => { e.stopPropagation(); pause(); store.setTime(c.start + kt); });
    node.append(d);
  }
  const hl = el('div', { class: 'clip-handle l' });
  const hr = el('div', { class: 'clip-handle r' });
  node.append(hl, hr);
  if (tr.locked) return node;
  hl.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button === 0) startTrim(e, c, 'l'); });
  hr.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button === 0) startTrim(e, c, 'r'); });
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (mode === 'blade') {
      const r = node.getBoundingClientRect();
      const t = c.start + (e.clientX - r.left) / pps;
      store.splitAt(t, store.withLinked([c.id]));
      return;
    }
    if (mode === 'forward') {
      const r = node.getBoundingClientRect();
      selectForward(c.start + (e.clientX - r.left) / pps, e.shiftKey ? tr.id : null, e);
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) { store.select(c.id, true); return; }
    if (!store.selection.has(c.id)) store.select(c.id);
    if (mode === 'slip') { startSlip(e, c); return; }
    if (mode === 'slide') { startSlide(e, c); return; }
    startMove(e, c);
  });
  node.addEventListener('dblclick', () => { if (c.type === 'text') bus.emit('edit-text', c.id); else if (c.type === 'sequence') switchSequence(c.seqId); });
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!store.selection.has(c.id)) store.select(c.id);
    clipMenu(e.clientX, e.clientY, c);
  });
  return node;
}

function angleNames(c) { const d = seqData(c.seqId); return d ? angleTracks(d).map((tr) => tr.name) : []; }
function hasAudio(c) { return c.type === 'audio' || c.type === 'video'; }

function drawWave(cv, c, rt, w, h) {
  cv.width = Math.max(1, Math.floor(w)); cv.height = Math.max(4, h);
  cv.style.height = h + 'px';
  const x = cv.getContext('2d');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--wave').trim() || 'rgba(255,255,255,0.55)';
  x.fillStyle = accent;
  const peaks = rt.peaks, ps = rt.peaksPerSec;
  const spd = c.speed || 1;
  const vol = Math.min(1.5, c.volume ?? 1);
  for (let i = 0; i < cv.width; i++) {
    const t = (c.in || 0) + (i / cv.width) * c.duration * spd;
    const v = peaks[Math.min(peaks.length - 1, Math.floor(t * ps))] || 0;
    const bh = Math.max(1, v * h * 0.9 * vol);
    x.fillRect(i, (h - bh) / 2, 1, bh);
  }
}

// ferramenta "selecionar à frente": tudo que começa depois do clique (Shift = só esta trilha)
function selectForward(tt, trackId, e) {
  const clips = store.p.clips.filter((c) => c.start + c.duration > tt + 1e-4 && (!trackId || c.trackId === trackId) && !store.track(c.trackId)?.locked);
  if (!clips.length) { store.clearSelection(); return; }
  store.select(clips.map((c) => c.id));
  const first = clips.reduce((a, b) => (a.start <= b.start ? a : b));
  startMove(e, first);
}

export function clipMenu(x, y, c) {
  const isVis = ['video', 'image', 'text', 'sticker', 'shape'].includes(c.type);
  const multi = store.selection.size > 1;
  const linked = !!c.linkId;
  contextMenu(x, y, [
    { label: 'Dividir', shortcut: 'Ctrl+B', onClick: () => store.splitAt() },
    { label: 'Duplicar', shortcut: 'Ctrl+D', onClick: () => store.duplicate() },
    { label: 'Copiar', shortcut: 'Ctrl+C', onClick: () => store.copy() },
    { label: 'Colar', shortcut: 'Ctrl+V', disabled: !store.clipboard.length, onClick: () => store.paste() },
    '-',
    c.type === 'video' ? { label: 'Separar áudio', onClick: () => store.detachAudio(c.id) } : null,
    isVis ? { label: 'Espelhar', onClick: () => store.updateClip(c.id, { transform: { flipH: !c.transform.flipH } }) } : null,
    isVis ? { label: 'Girar 90°', onClick: () => store.updateClip(c.id, { transform: { rotation: (c.transform.rotation + 90) % 360 } }) } : null,
    hasAudio(c) ? { label: c.volume === 0 ? 'Ativar som do clipe' : 'Silenciar clipe', onClick: () => store.updateClip(c.id, { volume: c.volume === 0 ? 1 : 0 }) } : null,
    c.type === 'sequence' ? { label: 'Abrir sequência aninhada', onClick: () => switchSequence(c.seqId) } : null,
    c.type === 'sequence' && isMulticamSeq(c.seqId) ? { label: 'Câmera', submenu: angleNames(c).map((n, i) => ({ label: (i + 1) + ' — ' + n, checked: (c.mcAngle ?? 0) === i, onClick: () => { store.updateClip(c.id, { mcAngle: i }); } })) } : null,
    c.type === 'sequence' && isMulticamSeq(c.seqId) ? { label: 'Monitor multicâmera', onClick: () => openMulticamMonitor() } : null,
    { label: multi ? 'Aninhar clipes selecionados' : 'Aninhar (transformar em sequência)', onClick: () => nestSelection() },
    { label: 'Velocidade', submenu: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5].map((s) => ({ label: s + 'x', checked: (c.speed || 1) === s, onClick: () => setSpeed(c, s) })) },
    { label: 'Velocidade e duração...', shortcut: 'Ctrl+R', onClick: () => speedDialog() },
    hasAudio(c) ? { label: 'Ganho de áudio...', shortcut: 'G', onClick: () => gainDialog() } : null,
    hasAudio(c) ? { label: 'Legendas automáticas...', onClick: () => openCaptionsDialog(store.withLinked([c.id]).map((id) => store.clip(id))) } : null,
    hasAudio(c) ? { label: 'Tirar silêncios...', onClick: () => removeSilencesDialog() } : null,
    hasAudio(c) ? { label: 'Editar pelo texto...', onClick: () => textEditDialog() } : null,
    hasAudio(c) ? { label: 'Reduzir ruído...', onClick: () => denoiseDialog(c) } : null,
    c.type === 'video' ? { label: 'Congelar quadro', shortcut: 'Shift+F', onClick: () => freezeFrame() } : null,
    c.type === 'video' ? { label: 'Detectar cenas e cortar...', onClick: () => detectScenes(c) } : null,
    c.type === 'video' ? { label: 'Estabilizar vídeo', onClick: () => stabilize(c) } : null,
    ['text', 'sticker', 'shape', 'image'].includes(c.type) ? { label: 'Seguir objeto no vídeo (rastrear)', onClick: () => trackObject(c) } : null,
    c.type === 'video' ? { label: 'Inverter (de trás para frente)', shortcut: 'Ctrl+Alt+R', onClick: () => reverseClip(c) } : null,
    multi && isVis ? { label: 'Igualar cor (do primeiro selecionado)', onClick: () => colorMatchSelected() } : null,
    multi && isVis ? { label: 'Tela dividida...', onClick: () => splitLayoutDialog() } : null,
    c.type === 'audio' ? { label: 'Batidas da música / cortar no ritmo...', onClick: () => beatsDialog() } : null,
    c.type === 'text' ? { label: 'Converter texto em fala...', onClick: () => ttsDialog(c) } : null,
    hasAudio(c) ? { label: 'Normalizar volume...', onClick: () => normalizeDialog() } : null,
    hasAudio(c) ? { label: 'Crossfade de áudio nas emendas', onClick: () => audioCrossfades() } : null,
    { label: 'Rótulo', submenu: labelMenu() },
    linked ? { label: 'Desvincular áudio e vídeo', onClick: () => store.unlink() } : multi ? { label: 'Vincular clipes', onClick: () => store.link() } : null,
    c.mediaId && store.media(c.mediaId) && store.media(c.mediaId).type !== 'image' ? { label: 'Abrir no visualizador de origem', onClick: () => openSource(store.media(c.mediaId)) } : null,
    '-',
    { label: 'Copiar atributos', onClick: () => copyAttributes(c) },
    { label: 'Colar atributos...', shortcut: 'Ctrl+Alt+V', disabled: !hasAttributes(), onClick: () => pasteAttributesDialog() },
    '-',
    { label: 'Excluir', shortcut: 'Del', onClick: () => store.deleteClips() },
    { label: 'Excluir e fechar espaço (ripple)', shortcut: 'Shift+Del', onClick: () => store.rippleDelete() },
  ]);
}

export function setSpeed(c, s) {
  store.begin();
  const srcLen = c.duration * (c.speed || 1);
  c.speed = s;
  c.duration = srcLen / s;
  store.commit('speed');
}

// ---------- Encaixe ----------
function snapPoints(exclude) {
  const pts = [0, store.time];
  for (const c of store.p.clips) {
    if (exclude.includes(c.id)) continue;
    pts.push(c.start, c.start + c.duration);
  }
  for (const m of store.p.markers || []) pts.push(m.time);
  return pts;
}
function snap(t, pts, extra = []) {
  if (!settings.get('snapping')) return { t, snapped: null };
  const th = 8 / pps;
  let best = null, bd = th;
  for (const p of pts) {
    for (const off of [0, ...extra]) {
      const d = Math.abs(t + off - p);
      if (d < bd) { bd = d; best = p - off; }
    }
  }
  return best == null ? { t, snapped: null } : { t: best, snapped: best };
}

// ---------- Mover clipes ----------
function rowAt(clientY) {
  const rows = [...inner.querySelectorAll('.tl-track, .tl-newzone')];
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    if (clientY >= b.top && clientY < b.bottom) return r;
  }
  const first = rows[0]?.getBoundingClientRect();
  if (first && clientY < first.top) return rows[0];
  return rows[rows.length - 1];
}

function startMove(e, c) {
  const moving = store.selectedClips().filter((x) => !store.track(x.trackId)?.locked);
  const orig = moving.map((x) => ({ c: x, start: x.start, trackId: x.trackId }));
  const pts = snapPoints(moving.map((x) => x.id));
  const minStart = Math.min(...orig.map((o) => o.start));
  let moved = false, targetRow = null;
  store.begin();
  dragHandler(e, (ev, dx, dy) => {
    if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    moved = true;
    let dt = dx / pps;
    dt = Math.max(dt, -minStart);
    const primary = orig.find((o) => o.c === c);
    const s = snap(primary.start + dt, pts, [c.duration]);
    dt = s.t - primary.start;
    dt = Math.max(dt, -minStart);
    for (const o of orig) o.c.start = Math.max(0, o.start + dt);
    showSnap(s.snapped);
    // mudança vertical (apenas um clipe)
    if (orig.length === 1) {
      targetRow = rowAt(ev.clientY);
      inner.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
      if (targetRow) {
        if (targetRow.dataset.track) {
          const tr = store.track(targetRow.dataset.track);
          if (tr && compatible(c, tr) && !tr.locked) c.trackId = tr.id;
        } else targetRow.classList.add('drop-target');
      }
    }
    store.touch();
  }, (ev) => {
    showSnap(null);
    inner.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
    if (!moved) { store._last = null; return; }
    // soltou em zona de nova trilha
    if (orig.length === 1 && targetRow && targetRow.dataset.newzone) {
      const type = c.type === 'audio' ? 'audio' : 'video';
      const idx = targetRow.dataset.newzone === 'top' ? 0 : store.p.tracks.length;
      const tr = store.addTrack(type, type === 'audio' ? store.p.tracks.length : (idx === 0 ? 0 : indexAboveMain()));
      c.trackId = tr.id;
    }
    // resolve sobreposições
    for (const o of orig) {
      const tr = store.track(o.c.trackId);
      if (tr.main && settings.get('magnet')) continue;
      if (!store.isFree(o.c.trackId, o.c.start, o.c.start + o.c.duration, moving.map((x) => x.id))) {
        if (tr.main) {
          // insere empurrando os clipes seguintes
          const after = store.clipsOn(tr.id).filter((x) => !moving.includes(x) && x.start + x.duration > o.c.start);
          const first = after[0];
          if (first && o.c.start > first.start && o.c.start < first.start + first.duration) o.c.start = first.start + first.duration;
          let t = o.c.start + o.c.duration;
          for (const x of store.clipsOn(tr.id).filter((x) => !moving.includes(x) && x.start >= o.c.start - 1e-4)) { if (x.start < t) x.start = t; t = x.start + x.duration; }
        } else {
          const nt = store.findTrackFor(tr.type, o.c.start, o.c.start + o.c.duration);
          o.c.trackId = nt.id;
        }
      }
    }
    store.removeEmptyTracks();
    store.commit('move');
  }, 'grabbing');
}

function indexAboveMain() {
  const i = store.p.tracks.findIndex((t) => t.main);
  return Math.max(0, i);
}

function compatible(c, tr) {
  return c.type === 'audio' ? tr.type === 'audio' : tr.type === 'video';
}

// vizinhos encostados na mesma trilha
function touching(c) {
  const list = store.clipsOn(c.trackId);
  const i = list.indexOf(c);
  const prev = list[i - 1], next = list[i + 1];
  return {
    prev: prev && Math.abs(prev.start + prev.duration - c.start) < 0.02 ? prev : null,
    next: next && Math.abs(c.start + c.duration - next.start) < 0.02 ? next : null,
  };
}
const mediaLen = (c) => { if (c.type === 'sequence') return seqDuration(c.seqId) || Infinity; const m = c.mediaId && store.media(c.mediaId); return m && (m.type === 'video' || m.type === 'audio') && m.duration ? m.duration : Infinity; };

// edição ripple: aparar empurra/puxa os clipes seguintes da trilha
function startRippleTrim(e, c, side) {
  const spd = c.speed || 1, o = { start: c.start, duration: c.duration, in: c.in || 0 };
  const after = store.clipsOn(c.trackId).filter((x) => x !== c && x.start >= o.start + o.duration - 1e-3).map((x) => ({ x, s: x.start }));
  const maxLen = mediaLen(c);
  store.begin();
  dragHandler(e, (ev, dx) => {
    let dt = dx / pps;
    if (side === 'r') {
      const nd = clamp(o.duration + dt, 0.1, (maxLen - o.in) / spd);
      dt = nd - o.duration; c.duration = nd;
    } else {
      dt = clamp(dt, -o.in / spd, o.duration - 0.1);
      c.in = o.in + dt * spd; c.duration = o.duration - dt; dt = -dt;
    }
    for (const a of after) a.x.start = Math.max(0, a.s + dt);
    store.touch();
  }, () => store.commit('ripple-trim'), 'ew-resize');
}

// edição rolante: move o ponto de corte entre dois clipes encostados
function startRollTrim(e, c, side) {
  const nb = touching(c);
  const a = side === 'r' ? c : nb.prev, b = side === 'r' ? nb.next : c;
  if (!a || !b) return startTrim(e, c, side, true);
  const oa = { duration: a.duration, in: a.in || 0 }, ob = { start: b.start, duration: b.duration, in: b.in || 0 };
  const sa = a.speed || 1, sb = b.speed || 1;
  store.begin();
  dragHandler(e, (ev, dx) => {
    let dt = dx / pps;
    dt = Math.min(dt, (mediaLen(a) - oa.in) / sa - oa.duration, ob.duration - 0.1);
    dt = Math.max(dt, -oa.duration + 0.1, -ob.in / sb);
    a.duration = oa.duration + dt;
    b.start = ob.start + dt; b.duration = ob.duration - dt; b.in = ob.in + dt * sb;
    store.setTime(b.start);
    store.touch();
  }, () => store.commit('roll-trim'), 'col-resize');
}

// alongar taxa: aparar muda a velocidade (o conteúdo inteiro cabe no novo tamanho)
function startRateTrim(e, c, side) {
  const o = { start: c.start, duration: c.duration, speed: c.speed || 1 };
  const src = o.duration * o.speed;
  store.begin();
  dragHandler(e, (ev, dx) => {
    const dt = dx / pps;
    let nd = side === 'r' ? o.duration + dt : o.duration - dt;
    nd = clamp(nd, src / 16, src / 0.1);
    c.speed = +(src / nd).toFixed(4);
    c.duration = nd;
    if (side === 'l') c.start = Math.max(0, o.start + o.duration - nd);
    store.touch();
  }, () => store.commit('rate-stretch'), 'ew-resize');
}

// slip: muda o trecho da mídia mostrado, sem mover o clipe
function startSlip(e, c) {
  if (!(c.type === 'video' || c.type === 'audio')) return startMove(e, c);
  const spd = c.speed || 1, i0 = c.in || 0, maxIn = Math.max(0, mediaLen(c) - c.duration * spd);
  store.begin();
  dragHandler(e, (ev, dx) => {
    c.in = clamp(i0 - (dx / pps) * spd, 0, maxIn);
    store.setTime(c.start);
    store.touch();
  }, () => store.commit('slip'), 'ew-resize');
}

// slide: move o clipe entre os vizinhos, encurtando um e alongando o outro
function startSlide(e, c) {
  const nb = touching(c);
  if (!nb.prev && !nb.next) return startMove(e, c);
  const o = { start: c.start };
  const p = nb.prev ? { d: nb.prev.duration, in: nb.prev.in || 0, sp: nb.prev.speed || 1 } : null;
  const n = nb.next ? { s: nb.next.start, d: nb.next.duration, in: nb.next.in || 0, sp: nb.next.speed || 1 } : null;
  store.begin();
  dragHandler(e, (ev, dx) => {
    let dt = dx / pps;
    if (p) dt = clamp(dt, -p.d + 0.1, (mediaLen(nb.prev) - p.in) / p.sp - p.d);
    if (n) dt = clamp(dt, -n.in / n.sp, n.d - 0.1);
    dt = Math.max(dt, -o.start);
    c.start = o.start + dt;
    if (p) nb.prev.duration = p.d + dt;
    if (n) { nb.next.start = n.s + dt; nb.next.duration = n.d - dt; nb.next.in = n.in + dt * n.sp; }
    store.touch();
  }, () => store.commit('slide'), 'ew-resize');
}

function startTrim(e, c, side, plain = false) {
  if (!plain && mode === 'ripple') return startRippleTrim(e, c, side);
  if (!plain && mode === 'rolling') return startRollTrim(e, c, side);
  if (!plain && mode === 'rate') return startRateTrim(e, c, side);
  const o = { start: c.start, duration: c.duration, in: c.in || 0 };
  const m = c.mediaId ? store.media(c.mediaId) : null;
  const spd = c.speed || 1;
  const seqLen = c.type === 'sequence' ? seqDuration(c.seqId) : 0;
  const limited = (m && (m.type === 'video' || m.type === 'audio') && m.duration) || seqLen;
  const pts = snapPoints([c.id]);
  const neighbors = store.clipsOn(c.trackId).filter((x) => x.id !== c.id);
  const prevEnd = Math.max(0, ...neighbors.filter((x) => x.start + x.duration <= o.start + 1e-3).map((x) => x.start + x.duration));
  const nextStart = Math.min(Infinity, ...neighbors.filter((x) => x.start >= o.start + o.duration - 1e-3).map((x) => x.start));
  const magnetMain = store.track(c.trackId)?.main && settings.get('magnet');
  store.begin();
  dragHandler(e, (ev, dx) => {
    let dt = dx / pps;
    if (side === 'l') {
      let ns = snap(o.start + dt, pts).t;
      dt = ns - o.start;
      if (limited) dt = Math.max(dt, -o.in / spd);
      if (!magnetMain) dt = Math.max(dt, prevEnd - o.start);
      dt = Math.min(dt, o.duration - 0.1);
      dt = Math.max(dt, -o.start);
      c.start = o.start + dt;
      c.duration = o.duration - dt;
      c.in = o.in + dt * spd;
      if (magnetMain) c.start = o.start; // trilha magnética mantém posição
      showSnap(c.start === ns ? ns : null);
    } else {
      let ne = snap(o.start + o.duration + dt, pts).t;
      let nd = ne - o.start;
      if (limited) nd = Math.min(nd, ((m?.duration || seqLen) - o.in) / spd);
      if (!magnetMain) nd = Math.min(nd, nextStart - o.start);
      c.duration = Math.max(0.1, nd);
      showSnap(Math.abs(o.start + c.duration - ne) < 1e-6 ? ne : null);
    }
    store.touch();
  }, () => { showSnap(null); store.commit('trim'); }, 'ew-resize');
}

let snapLine = null;
function showSnap(t) {
  if (t == null) { snapLine?.remove(); snapLine = null; return; }
  if (!snapLine) snapLine = el('div', { class: 'tl-snapline' });
  if (!snapLine.isConnected) inner.append(snapLine);
  snapLine.style.left = (HEAD_W + t * pps) + 'px';
}

// ---------- Playhead / régua ----------
function positionPlayhead() {
  if (!playheadEl) return;
  playheadEl.style.left = (HEAD_W + store.time * pps) + 'px';
}
function onTime() {
  positionPlayhead();
  if (player.playing && scroller) {
    const x = store.time * pps;
    const vw = scroller.clientWidth - HEAD_W;
    if (x > scroller.scrollLeft + vw - 40 || x < scroller.scrollLeft) scroller.scrollLeft = x - 40;
  }
}

function drawRuler() {
  if (!rulerCanvas || !scroller) return;
  const vw = Math.max(10, scroller.clientWidth - HEAD_W);
  const dpr = window.devicePixelRatio || 1;
  rulerCanvas.width = vw * dpr; rulerCanvas.height = RULER_H * dpr;
  rulerCanvas.style.width = vw + 'px'; rulerCanvas.style.height = RULER_H + 'px';
  rulerCanvas.style.left = scroller.scrollLeft + 'px';
  const x = rulerCanvas.getContext('2d');
  x.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const muted = cs.getPropertyValue('--muted').trim() || '#888';
  x.clearRect(0, 0, vw, RULER_H);
  x.fillStyle = muted; x.strokeStyle = muted;
  x.font = '10px ' + (cs.getPropertyValue('--ui-font') || 'sans-serif');
  const steps = [1 / 30, 1 / 10, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  let major = steps.find((s) => s * pps >= 70) || 600;
  const minor = major / 5;
  const t0 = scroller.scrollLeft / pps, t1 = t0 + vw / pps;
  x.lineWidth = 1;
  for (let i = Math.floor(t0 / minor); i * minor <= t1; i++) {
    const t = Math.round(i * minor * 1000) / 1000;
    const px = Math.round((t - t0) * pps) + 0.5;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    x.globalAlpha = isMajor ? 0.9 : 0.4;
    x.beginPath(); x.moveTo(px, RULER_H); x.lineTo(px, RULER_H - (isMajor ? 10 : 5)); x.stroke();
    if (isMajor) { x.globalAlpha = 0.85; x.fillText(major < 1 ? fmtTime(t, store.p.settings.fps).slice(3) : fmtTime(t, 30, false), px + 3, 11); }
  }
  x.globalAlpha = 1;
  const accent = cs.getPropertyValue('--accent').trim();
  const rg = store.p.range;
  if (rg && (rg.in != null || rg.out != null)) {
    const a = ((rg.in ?? 0) - t0) * pps, b = ((rg.out ?? store.duration()) - t0) * pps;
    x.fillStyle = accent; x.globalAlpha = 0.22; x.fillRect(a, 0, b - a, RULER_H); x.globalAlpha = 1;
    x.fillRect(a, RULER_H - 3, b - a, 3);
    x.font = '700 10px sans-serif';
    if (rg.in != null) x.fillText('{', a + 2, 22);
    if (rg.out != null) x.fillText('}', b - 8, 22);
  }
  for (const m of store.p.markers || []) {
    const px = (m.time - t0) * pps;
    if (px < -6 || px > vw + 6) continue;
    x.fillStyle = m.color || accent;
    x.beginPath(); x.moveTo(px - 5, 14); x.lineTo(px + 5, 14); x.lineTo(px + 5, 22); x.lineTo(px, 27); x.lineTo(px - 5, 22); x.closePath(); x.fill();
  }
}

// ---------- Soltar itens da biblioteca / arquivos ----------
function dropInfo(e) {
  const r = inner.getBoundingClientRect();
  const t = Math.max(0, (e.clientX - r.left - HEAD_W) / pps);
  const row = rowAt(e.clientY);
  const clipEl = e.target.closest?.('.tl-clip');
  return { t, row, trackId: row?.dataset.track || null, newzone: row?.dataset.newzone || null, clipId: clipEl?.dataset.clip || null };
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  const info = dropInfo(e);
  inner.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  if (info.clipId) inner.querySelector(`[data-clip="${info.clipId}"]`)?.classList.add('drop-target');
  else info.row?.classList.add('drop-target');
  if (!dropIndicator) dropIndicator = el('div', { class: 'tl-drop-ind' });
  if (!dropIndicator.isConnected) inner.append(dropIndicator);
  dropIndicator.style.left = (HEAD_W + info.t * pps) + 'px';
}
function clearDrop() {
  inner.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  dropIndicator?.remove(); dropIndicator = null;
}
async function onDrop(e) {
  e.preventDefault();
  const info = dropInfo(e);
  clearDrop();
  await handleDrop(e.dataTransfer, info);
}

export function timelinePps() { return pps; }
