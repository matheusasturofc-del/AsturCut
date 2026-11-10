// Painel de propriedades (Detalhes / Vídeo / Texto / Áudio / Velocidade / Animação / Ajuste / Efeitos)
import { store, bus, ASPECTS, defaultAdjust } from './store.js';
import { t } from './i18n.js';
import { $, el, icon, fmtTime, fmtShort, clamp, promptDialog, toast } from './util.js';
import { settings } from './settings.js';
import { FONTS } from './library.js';
import { customFonts, isDesktop, api } from './media.js';
import { EFFECTS, EFFECT_MAP } from './lib/effects.js';
import { FILTERS, FILTER_MAP } from './lib/filters.js';
import { TRANSITIONS, TRANSITION_MAP } from './lib/transitions.js';
import { ANIM_IN, ANIM_LOOP } from './lib/animations.js';
import { setSpeed } from './timeline.js';
import { setAspect } from './player.js';
import { openTab } from './library.js';
import { player, startPick } from './player.js';
import { DEFAULT_CHROMA, DEFAULT_CUTOUT, cutoutState, ensureSegmenter, keyBypass } from './keying.js';
import { hasKf, anyKf, valueAt, setValue, toggleAnim, toggleKey, keyAtCursor, jumpKey, localTime, EASINGS, setEaseAtCursor, easeAtCursor } from './keyframes.js';
import { colorBypass, defaultMask, MASK_SHAPES } from './compositor.js';
import { defaultGrade, colorWheel, curvesEditor, importLut, toggleScopes } from './color.js';
import { captionsPanel } from './captions.js';
import { stabilize, trackMask, autoReframeDialog } from './analysis.js';
import { switchSequence, renameSequence } from './sequences.js';
import { VOICES } from './lib/voice.js';
const tr = (s, v) => t(s, v);
import { whiteBalanceFrom, applyColorToMedia, copyAttributes, pasteAttributesDialog, hasAttributes, gainDialog, speedDialog, toDb } from './editTools.js';

let panel, bodyEl;
const lastTab = {};

export function initInspector() {
  panel = $('#panel-inspector');
  panel.innerHTML = '';
  bodyEl = el('div', { class: 'insp-body' });
  panel.append(bodyEl);
  bus.on('selection', render);
  bus.on('change', (label) => { if (label !== 'touch') render(); });
  // com keyframes, os valores mudam com o tempo: atualiza ao mover o cursor (pausado)
  let tTimer = null;
  bus.on('time', () => {
    if (player.playing) return;
    const c = store.primarySelected();
    if (!c || !anyKf(c)) return;
    clearTimeout(tTimer); tTimer = setTimeout(render, 60);
  });
  bus.on('project', render);
  bus.on('edit-text', () => { lastTab.text = 'text'; render(); setTimeout(() => { const ta = panel.querySelector('textarea'); ta?.focus(); ta?.select(); }, 30); });
  render();
}

// ---------- Controles ----------
function row(label, ...ctrl) { return el('div', { class: 'prop-row' }, el('label', { class: 'prop-label' }, label), el('div', { class: 'prop-ctrl' }, ...ctrl)); }
function section(title, ...children) { return el('div', { class: 'prop-section' }, title ? el('div', { class: 'prop-title' }, title) : null, ...children); }

function slider(label, value, { min = 0, max = 100, step = 1, unit = '', onInput, def = null, fmt }) {
  const show = (v) => (fmt ? fmt(v) : (Math.round(v * 100) / 100) + unit);
  const range = el('input', { type: 'range', min, max, step, value, class: 'slider' });
  const num = el('input', { type: 'number', min, max, step, value: Math.round(value * 100) / 100, class: 'num' });
  const paint = () => { const p = ((range.value - min) / (max - min)) * 100; range.style.setProperty('--p', p + '%'); };
  paint();
  let started = false;
  const begin = () => { if (!started) { store.begin(); started = true; } };
  range.addEventListener('pointerdown', begin);
  range.addEventListener('input', () => { begin(); num.value = Math.round(range.value * 100) / 100; paint(); onInput(+range.value); });
  range.addEventListener('change', () => { started = false; store.commit('slider'); });
  num.addEventListener('change', () => { store.begin(); const v = clamp(+num.value, min, max); range.value = v; paint(); onInput(v); store.commit('slider'); });
  const reset = def != null ? el('button', { class: 'icon-btn xs', title: 'Redefinir', onclick: () => { store.begin(); range.value = def; num.value = def; paint(); onInput(def); store.commit('reset'); }, html: icon('undo', 12) }) : null;
  void show;
  return row(label, range, num, reset);
}

// controle com keyframes: ⏱ liga a animação; ‹ ◆ › navega/adiciona/remove keyframes no cursor
function animSlider(c, prop, label, { mul = 1, ...opts }) {
  const v = valueAt(c, prop, localTime(c)) * mul;
  const r = slider(label, Math.round(v * 100) / 100, { ...opts, def: opts.def, onInput: (x) => { setValue(c, prop, x / mul); store.touch(); } });
  const on = hasKf(c, prop);
  const ctrl = r.querySelector('.prop-ctrl');
  const kfBox = el('div', { class: 'kf-ctrl' },
    el('button', { class: 'kf-watch' + (on ? ' on' : ''), title: on ? t('Desativar animação (remove keyframes)') : t('Animar com keyframes'), onclick: () => { store.begin(); toggleAnim(c, prop); store.commit('kf'); }, html: icon('stopwatch', 13) }),
    on ? el('button', { class: 'kf-nav', title: t('Keyframe anterior'), onclick: () => jumpKey(c, -1) }, '‹') : null,
    on ? el('button', { class: 'kf-dia' + (keyAtCursor(c, prop) ? ' on' : ''), title: t('Adicionar/remover keyframe'), onclick: () => { store.begin(); toggleKey(c, prop); store.commit('kf'); }, html: icon('diamond', 11) }) : null,
    on ? el('button', { class: 'kf-nav', title: t('Próximo keyframe'), onclick: () => jumpKey(c, 1) }, '›') : null);
  ctrl.append(kfBox);
  if (on) r.classList.add('animated');
  return r;
}

function kfSection(c) {
  if (!anyKf(c)) return null;
  const e = easeAtCursor(c);
  return section(t('Keyframes'),
    e ? select(t('Suavização:'), e, EASINGS.map(([v, n]) => [v, t(n)]), (v) => { store.begin(); setEaseAtCursor(c, v); store.commit('ease'); })
      : el('div', { class: 'muted small' }, t('Posicione o cursor sobre um keyframe (◆) para escolher a suavização.')),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm', onclick: () => jumpKey(c, -1) }, '‹ ' + t('Anterior')),
      el('button', { class: 'btn sm', onclick: () => jumpKey(c, 1) }, t('Próximo') + ' ›'),
      el('button', { class: 'btn sm danger', onclick: () => { store.begin(); for (const k of Object.keys(c.kf)) { const pr = k; const val = valueAt(c, pr, localTime(c)); delete c.kf[pr]; if (pr === 'volume') c.volume = val; else if (pr === 'speed') c.speed = val; else c.transform[pr] = val; } store.commit('kf'); } }, t('Remover todos'))));
}

function color(label, value, onInput) {
  const inp = el('input', { type: 'color', value: toHex(value), class: 'color' });
  let started = false;
  inp.addEventListener('input', () => { if (!started) { store.begin(); started = true; } onInput(inp.value); });
  inp.addEventListener('change', () => { started = false; store.commit('color'); });
  return row(label, inp, el('span', { class: 'muted small mono' }, toHex(value)));
}
function toHex(c) {
  if (!c || c.startsWith('rgba(0,0,0,0)')) return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = c; return ctx.fillStyle.startsWith('#') ? ctx.fillStyle : '#000000';
}
function toggle(label, value, onChange) {
  const sw = el('button', { class: 'switch' + (value ? ' on' : ''), onclick: () => onChange(!value) }, el('span'));
  return row(label, sw);
}
function select(label, value, options, onChange) {
  const s = el('select', { class: 'select' }, options.map(([v, n]) => el('option', { value: v, selected: String(v) === String(value) }, n)));
  s.addEventListener('change', () => onChange(s.value));
  return row(label, s);
}
function segmented(label, value, options, onChange) {
  return row(label, el('div', { class: 'segmented' }, options.map(([v, n, ic]) =>
    el('button', { class: value === v ? 'on' : '', title: n, onclick: () => onChange(v), html: ic ? icon(ic, 14) : n }))));
}

const upd = (c, patch) => store.updateClip(c.id, patch, { commit: false });
const updC = (c, patch) => store.updateClip(c.id, patch);

// ---------- Render ----------
function render() {
  if (!bodyEl) return;
  const scroll = bodyEl.scrollTop;
  bodyEl.innerHTML = '';
  const sel = store.selectedClips();
  if (store.selectedTransition && store.clip(store.selectedTransition)) renderTransition(store.clip(store.selectedTransition));
  else if (sel.length > 1) renderMulti(sel);
  else if (sel.length === 1) renderClip(sel[0]);
  else renderProject();
  bodyEl.scrollTop = scroll;
}

function header(title, tabs, active, onTab) {
  const h = el('div', { class: 'insp-head' });
  h.append(el('div', { class: 'panel-grip', title: 'Arraste para mover este painel', html: icon('drag', 14) }));
  if (tabs && tabs.length > 1) {
    h.append(el('div', { class: 'insp-tabs' }, tabs.map(([id, name]) => el('button', { class: 'insp-tab' + (id === active ? ' active' : ''), onclick: () => onTab(id) }, name))));
  } else h.append(el('div', { class: 'insp-title' }, title));
  bodyEl.append(h);
}

function renderProject() {
  header('Detalhes');
  const p = store.p, st = p.settings;
  const name = el('input', { class: 'input', value: p.name });
  name.addEventListener('change', () => { store.begin(); p.name = name.value || 'Projeto'; store.commit('name'); bus.emit('project-name'); });
  const aspectOpts = [['original', 'Original'], ...Object.keys(ASPECTS).map((a) => [a, a])];
  const short = Math.min(st.width, st.height);
  const res = [[720, '720p'], [1080, '1080p'], [1440, '2K'], [2160, '4K']];
  const box = el('div', { class: 'details' },
    row('Nome:', name),
    row('Caminho:', el('span', { class: 'path', title: store.filePath || '' }, store.filePath || 'Não salvo')),
    row('Mídia importada:', el('span', {}, t('{n} arquivo(s)', { n: p.media.filter((m) => !m.hidden).length }))),
    row('Duração:', el('span', {}, fmtTime(store.duration(), st.fps))),
    el('div', { class: 'divider' }),
    select('Proporção de aspecto:', st.aspect, aspectOpts, (v) => setAspect(v)),
    select('Resolução:', res.find((r) => r[0] === short)?.[0] || 'custom', [...res, ['custom', t('Personalizada...')]], async (v) => {
      if (v === 'custom') {
        const val = await promptDialog(t('Resolução personalizada (largura x altura)'), `${st.width}x${st.height}`);
        const m = val && /(\d+)\s*[x×*]\s*(\d+)/i.exec(val);
        if (!m) { render(); return; }
        store.begin(); st.width = Math.max(16, Math.round(+m[1] / 2) * 2); st.height = Math.max(16, Math.round(+m[2] / 2) * 2); st.aspect = 'custom'; store.commit('res'); bus.emit('settings-project');
        return;
      }
      store.begin(); const k = +v / Math.min(st.width, st.height); st.width = Math.round(st.width * k / 2) * 2; st.height = Math.round(st.height * k / 2) * 2; store.commit('res'); bus.emit('settings-project');
    }),
    row('Tamanho:', el('span', { class: 'muted' }, `${st.width} × ${st.height}`)),
    select('Taxa de quadros:', st.fps, [[24, '24 fps'], [25, '25 fps'], [30, '30.00 fps'], [50, '50 fps'], [60, '60 fps']], (v) => { store.begin(); st.fps = +v; store.commit('fps'); }),
    el('div', { class: 'divider' }),
    segmented('Fundo:', st.bgMode || 'color', [['color', 'Cor'], ['blur', 'Desfocado']], (v) => { store.begin(); st.bgMode = v; store.commit('bg'); }),
    color('Cor de fundo:', st.background, (v) => { st.background = v; store.touch(); }),
  );
  bodyEl.append(box);
  bodyEl.append(el('div', { class: 'insp-tip' }, el('span', { html: icon('info', 14) }), el('span', {}, 'Selecione um clipe na linha do tempo para editar suas propriedades. Dica: arraste as bordas dos painéis para reorganizar o editor.')));
}

function renderMulti(sel) {
  header(t('{n} clipes selecionados', { n: sel.length }));
  bodyEl.append(section('Ações em grupo',
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn', onclick: () => store.duplicate() }, 'Duplicar'),
      el('button', { class: 'btn', onclick: () => store.splitAt() }, 'Dividir'),
      el('button', { class: 'btn danger', onclick: () => store.deleteClips() }, 'Excluir')),
    slider('Opacidade', 100, { min: 0, max: 100, onInput: (v) => { sel.forEach((c) => c.transform && (c.transform.opacity = v / 100)); store.touch(); } }),
    slider('Volume', 100, { min: 0, max: 200, unit: '%', onInput: (v) => { sel.forEach((c) => (c.volume = v / 100)); store.touch(); } }),
  ));
}

function renderTransition(c) {
  header('Transição');
  const t = c.transitionIn;
  bodyEl.append(section(null,
    select('Tipo:', t.id, TRANSITIONS.map((x) => [x.id, x.name]), (v) => updC(c, { transitionIn: { id: v } })),
    slider('Duração', t.dur, { min: 0.1, max: 3, step: 0.05, unit: 's', def: 0.6, onInput: (v) => upd(c, { transitionIn: { dur: v } }) }),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn', onclick: () => openTab('transitions') }, 'Ver todas'),
      el('button', { class: 'btn', onclick: () => { store.begin(); const d = t.dur; store.clipsOn(c.trackId).forEach((x, i, arr) => { if (i > 0 && Math.abs(arr[i - 1].start + arr[i - 1].duration - x.start) < 0.05) x.transitionIn = { id: t.id, dur: d }; }); store.commit('applyall'); } }, 'Aplicar a todos'),
      el('button', { class: 'btn danger', onclick: () => { updC(c, { transitionIn: null }); store.clearSelection(); } }, 'Remover')),
  ));
}

function tabsFor(c) {
  switch (c.type) {
    case 'video': return [['basic', 'Vídeo'], ['audio', 'Áudio'], ['speed', 'Velocidade'], ['anim', 'Animação'], ['adjust', 'Ajuste'], ['color', 'Cor'], ['fx', 'Efeitos']];
    case 'image': return [['basic', 'Imagem'], ['anim', 'Animação'], ['adjust', 'Ajuste'], ['color', 'Cor'], ['fx', 'Efeitos']];
    case 'sequence': return [['basic', 'Sequência'], ['audio', 'Áudio'], ['speed', 'Velocidade'], ['anim', 'Animação'], ['adjust', 'Ajuste'], ['color', 'Cor'], ['fx', 'Efeitos']];
    case 'gen': return [['basic', 'Vídeo'], ['anim', 'Animação'], ['adjust', 'Ajuste'], ['color', 'Cor'], ['fx', 'Efeitos']];
    case 'text': return c.autoCaption ? [['captions', 'Legendas'], ['text', 'Texto'], ['basic', 'Transformar'], ['anim', 'Animação']] : [['text', 'Texto'], ['basic', 'Transformar'], ['anim', 'Animação'], ['fx', 'Efeitos']];
    case 'sticker': case 'shape': return [['basic', c.type === 'shape' ? 'Forma' : 'Sticker'], ['anim', 'Animação'], ['fx', 'Efeitos']];
    case 'audio': return [['audio', 'Áudio'], ['speed', 'Velocidade']];
    case 'effect': return [['fx', 'Efeito'], ['timing', 'Tempo']];
    case 'filter': return [['filter', 'Filtro'], ['adjust', 'Ajuste'], ['color', 'Cor'], ['timing', 'Tempo']];
  }
  return [['basic', 'Básico']];
}

// celular: mostra só uma ferramenta por vez (ex.: 'speed', 'anim', 'keying')
let focusTab = null;
export function inspectorFocus(tab) { focusTab = tab; render(); }

function renderClip(c) {
  const tabs = tabsFor(c);
  let active = lastTab[c.type];
  if (focusTab === 'keying' && (c.type === 'video' || c.type === 'image')) active = 'keying';
  else if (focusTab && tabs.some((x) => x[0] === focusTab)) active = focusTab;
  if (!tabs.some((t) => t[0] === active) && active !== 'keying') active = tabs[0][0];
  if (!focusTab) header('', tabs, active, (id) => { lastTab[c.type] = id; render(); });
  const fn = { basic: basicTab, text: textTab, audio: audioTab, speed: speedTab, anim: animTab, adjust: adjustTab, fx: fxTab, filter: filterTab, timing: timingTab, color: colorTab, captions: (x) => bodyEl.append(captionsPanel(x)), keying: (x) => bodyEl.append(keyingSection(x)) }[active];
  fn(c);
  bodyEl.append(el('div', { class: 'insp-foot muted small' }, t('Início {a} · Duração {b}', { a: fmtShort(c.start), b: fmtShort(c.duration) })));
}

function basicTab(c) {
  const t = c.transform;
  if (c.type === 'sequence') {
    bodyEl.append(section(tr('Sequência aninhada'),
      el('div', { class: 'muted small' }, tr('Este clipe mostra outra sequência inteira. Edite a sequência e ele muda junto.')),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn sm primary', onclick: () => switchSequence(c.seqId) }, tr('Abrir sequência')),
        el('button', { class: 'btn sm', onclick: () => renameSequence(c.seqId) }, tr('Renomear')))));
  }
  if (c.type === 'sticker') {
    bodyEl.append(section('Sticker', row('Emoji:', (() => { const i = el('input', { class: 'input', value: c.sticker?.emoji || '' }); i.addEventListener('change', () => updC(c, { sticker: { emoji: i.value } })); return i; })())));
  }
  if (c.type === 'shape') {
    const sh = c.shape;
    bodyEl.append(section('Forma',
      color('Cor', sh.color, (v) => upd(c, { shape: { color: v } })),
      color('Contorno', sh.stroke || '#ffffff', (v) => upd(c, { shape: { stroke: v } })),
      slider('Espessura', sh.strokeWidth || 0, { min: 0, max: 30, onInput: (v) => upd(c, { shape: { strokeWidth: v } }) }),
      sh.kind === 'lowerthird' ? row('Título:', (() => { const i = el('input', { class: 'input', value: sh.title || '' }); i.addEventListener('change', () => updC(c, { shape: { title: i.value } })); return i; })()) : null,
      sh.kind === 'lowerthird' ? row('Subtítulo:', (() => { const i = el('input', { class: 'input', value: sh.subtitle || '' }); i.addEventListener('change', () => updC(c, { shape: { subtitle: i.value } })); return i; })()) : null,
    ));
  }
  const media = c.type === 'video' || c.type === 'image';
  bodyEl.append(section('Transformar',
    animSlider(c, 'scale', 'Escala', { mul: 100, min: 1, max: 500, unit: '%', def: 100 }),
    animSlider(c, 'x', 'Posição X', { mul: 100, min: -100, max: 100, step: 0.1, def: 0 }),
    animSlider(c, 'y', 'Posição Y', { mul: 100, min: -100, max: 100, step: 0.1, def: 0 }),
    animSlider(c, 'rotation', 'Rotação', { min: -360, max: 360, step: 0.5, unit: '°', def: 0 }),
    animSlider(c, 'opacity', 'Opacidade', { mul: 100, min: 0, max: 100, unit: '%', def: 100 }),
    row('Espelhar:', el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm' + (t.flipH ? ' on' : ''), onclick: () => updC(c, { transform: { flipH: !t.flipH } }) }, '↔ Horizontal'),
      el('button', { class: 'btn sm' + (t.flipV ? ' on' : ''), onclick: () => updC(c, { transform: { flipV: !t.flipV } }) }, '↕ Vertical'))),
    row('Alinhar:', el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm', title: 'Centralizar', onclick: () => updC(c, { transform: { x: 0, y: 0 } }) }, 'Centro'),
      el('button', { class: 'btn sm', onclick: () => updC(c, { transform: { y: -0.35 } }) }, 'Topo'),
      el('button', { class: 'btn sm', onclick: () => updC(c, { transform: { y: 0.35 } }) }, 'Base'),
      el('button', { class: 'btn sm', onclick: () => updC(c, { transform: { x: 0, y: 0, scale: 1, rotation: 0 } }) }, 'Redefinir'))),
  ));
  const kfs = kfSection(c);
  if (kfs) bodyEl.append(kfs);
  if (media) {
    const cr = c.crop || { l: 0, r: 0, t: 0, b: 0 };
    bodyEl.append(section('Enquadramento',
      segmented('Ajuste:', c.fit || 'contain', [['contain', 'Conter'], ['cover', 'Preencher'], ['fill', 'Esticar']], (v) => updC(c, { fit: v })),
      slider('Cortar esquerda', Math.round(cr.l * 100), { min: 0, max: 90, unit: '%', def: 0, onInput: (v) => upd(c, { crop: { ...cr, ...(c.crop || {}), l: v / 100 } }) }),
      slider('Cortar direita', Math.round(cr.r * 100), { min: 0, max: 90, unit: '%', def: 0, onInput: (v) => upd(c, { crop: { ...cr, ...(c.crop || {}), r: v / 100 } }) }),
      slider('Cortar topo', Math.round(cr.t * 100), { min: 0, max: 90, unit: '%', def: 0, onInput: (v) => upd(c, { crop: { ...cr, ...(c.crop || {}), t: v / 100 } }) }),
      slider('Cortar base', Math.round(cr.b * 100), { min: 0, max: 90, unit: '%', def: 0, onInput: (v) => upd(c, { crop: { ...cr, ...(c.crop || {}), b: v / 100 } }) }),
    ));
  }
  if (c.type === 'video') bodyEl.append(stabSection(c));
  if (c.type !== 'audio') bodyEl.append(masksSection(c));
  if (media && focusTab !== 'basic') bodyEl.append(keyingSection(c));
  bodyEl.append(section('Mistura',
    select('Modo:', c.blend, [['source-over', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Tela'], ['overlay', 'Sobrepor'], ['darken', 'Escurecer'], ['lighten', 'Clarear'], ['color-dodge', 'Subexposição de cor'], ['color-burn', 'Superexposição de cor'], ['hard-light', 'Luz forte'], ['soft-light', 'Luz suave'], ['difference', 'Diferença'], ['exclusion', 'Exclusão'], ['hue', 'Matiz'], ['saturation', 'Saturação'], ['color', 'Cor'], ['luminosity', 'Luminosidade']], (v) => updC(c, { blend: v })),
  ));
}

// remover fundo: IA (pessoa) e chroma key
function keyingSection(c) {
  const cu = { ...DEFAULT_CUTOUT, ...(c.cutout || {}) };
  const ch = { ...DEFAULT_CHROMA, ...(c.chroma || {}) };
  const state = cutoutState();
  const pick = () => {
    keyBypass.add(c.id); player.needsRender = true;
    toast(t('Clique na cor do fundo no vídeo'), 'info', 2500);
    startPick((r, g, b) => {
      keyBypass.delete(c.id);
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      updC(c, { chroma: { on: true, color: hex } });
    });
  };
  const presets = el('div', { class: 'btn-row' },
    el('button', { class: 'btn sm', onclick: () => updC(c, { chroma: { on: true, color: '#00ff00' } }) }, t('Verde')),
    el('button', { class: 'btn sm', onclick: () => updC(c, { chroma: { on: true, color: '#0047ff' } }) }, t('Azul')),
    el('button', { class: 'btn sm', title: t('Clique no conta-gotas e depois no fundo do vídeo'), onclick: pick, html: icon('pipette', 13) + `<span>${t('Pegar cor')}</span>` }));
  return section('Remover fundo',
    toggle('Recortar pessoa (IA)', cu.on, (v) => { updC(c, { cutout: { on: v } }); if (v) ensureSegmenter().then(() => render()).catch(() => { toast(t('Não foi possível carregar a IA de recorte'), 'error'); render(); }); }),
    cu.on && state === 'loading' ? el('div', { class: 'muted small' }, t('Carregando a IA de recorte...')) : null,
    cu.on && state === 'error' ? el('div', { class: 'muted small' }, t('Não foi possível carregar a IA de recorte')) : null,
    cu.on ? slider('Ajuste da borda', Math.round(cu.edge * 100), { min: 10, max: 90, def: 50, onInput: (v) => upd(c, { cutout: { edge: v / 100 } }) }) : null,
    cu.on ? slider('Suavizar borda', Math.round(cu.feather * 100), { min: 1, max: 40, def: 15, onInput: (v) => upd(c, { cutout: { feather: v / 100 } }) }) : null,
    cu.on ? el('div', { class: 'muted small' }, t('Funciona melhor com uma pessoa em primeiro plano. Coloque outro vídeo ou imagem na trilha de baixo para trocar o fundo.')) : null,
    toggle('Chroma key (tela verde/azul)', ch.on, (v) => updC(c, { chroma: { on: v } })),
    ch.on ? row('Cor do fundo:', el('input', { type: 'color', class: 'color', value: ch.color, onchange: (e) => updC(c, { chroma: { color: e.target.value } }) }), el('span', { class: 'muted small mono' }, ch.color)) : null,
    ch.on ? presets : null,
    ch.on ? slider('Intensidade', Math.round(ch.similarity * 100), { min: 1, max: 100, def: 40, onInput: (v) => upd(c, { chroma: { similarity: v / 100 } }) }) : null,
    ch.on ? slider('Suavidade', Math.round(ch.smoothness * 100), { min: 1, max: 60, def: 8, onInput: (v) => upd(c, { chroma: { smoothness: v / 100 } }) }) : null,
    ch.on ? slider('Tirar reflexo da cor', Math.round(ch.spill * 100), { min: 1, max: 60, def: 10, onInput: (v) => upd(c, { chroma: { spill: v / 100 } }) }) : null,
  );
}

function fontOptions() {
  const list = FONTS.map((f) => f.family);
  for (const f of customFonts) list.push(f);
  return list.sort((a, b) => a.localeCompare(b));
}

function textTab(c) {
  const tx = c.text;
  const ta = el('textarea', { class: 'textarea', rows: 3 }, tx.content);
  let started = false;
  ta.addEventListener('input', () => { if (!started) { store.begin(); started = true; } upd(c, { text: { content: ta.value } }); });
  ta.addEventListener('change', () => { started = false; store.commit('text'); });
  const fontSel = el('select', { class: 'select font-select' }, fontOptions().map((f) => el('option', { value: f, selected: f === tx.font, style: { fontFamily: `"${f}"` } }, f)));
  fontSel.style.fontFamily = `"${tx.font}"`;
  fontSel.addEventListener('change', () => updC(c, { text: { font: fontSel.value } }));
  bodyEl.append(section(null, ta,
    row('Fonte:', fontSel, el('button', { class: 'icon-btn xs', title: 'Mais fontes', onclick: () => openTab('fonts'), html: icon('font', 13) })),
    slider('Tamanho', tx.size, { min: 8, max: 400, def: 96, onInput: (v) => upd(c, { text: { size: v } }) }),
    row('Estilo:', el('div', { class: 'segmented' },
      el('button', { class: tx.bold ? 'on' : '', title: 'Negrito', onclick: () => updC(c, { text: { bold: !tx.bold } }) }, el('b', {}, 'B')),
      el('button', { class: tx.italic ? 'on' : '', title: 'Itálico', onclick: () => updC(c, { text: { italic: !tx.italic } }) }, el('i', {}, 'I')),
      el('button', { class: tx.underline ? 'on' : '', title: 'Sublinhado', onclick: () => updC(c, { text: { underline: !tx.underline } }) }, el('u', {}, 'U')),
      el('button', { class: tx.uppercase ? 'on' : '', title: 'Maiúsculas', onclick: () => updC(c, { text: { uppercase: !tx.uppercase } }) }, 'AA'))),
    segmented('Alinhar:', tx.align, [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']], (v) => updC(c, { text: { align: v } })),
    color('Cor', tx.color, (v) => upd(c, { text: { color: v } })),
    slider('Espaçamento', tx.letterSpacing, { min: -10, max: 60, def: 0, onInput: (v) => upd(c, { text: { letterSpacing: v } }) }),
    slider('Altura da linha', tx.lineHeight, { min: 0.7, max: 3, step: 0.05, def: 1.15, onInput: (v) => upd(c, { text: { lineHeight: v } }) }),
  ));
  bodyEl.append(section('Contorno',
    color('Cor', tx.stroke, (v) => upd(c, { text: { stroke: v } })),
    slider('Espessura', tx.strokeWidth, { min: 0, max: 30, def: 0, onInput: (v) => upd(c, { text: { strokeWidth: v } }) }),
  ));
  bodyEl.append(section('Fundo',
    toggle('Ativar', tx.bg, (v) => updC(c, { text: { bg: v } })),
    tx.bg ? color('Cor', tx.bgColor, (v) => upd(c, { text: { bgColor: v } })) : null,
    tx.bg ? slider('Opacidade', Math.round(tx.bgOpacity * 100), { min: 0, max: 100, unit: '%', onInput: (v) => upd(c, { text: { bgOpacity: v / 100 } }) }) : null,
    tx.bg ? slider('Margem', tx.bgPadding, { min: 0, max: 100, onInput: (v) => upd(c, { text: { bgPadding: v } }) }) : null,
    tx.bg ? slider('Arredondar', tx.bgRadius, { min: 0, max: 100, onInput: (v) => upd(c, { text: { bgRadius: v } }) }) : null,
  ));
  bodyEl.append(section('Sombra',
    toggle('Ativar', tx.shadow, (v) => updC(c, { text: { shadow: v } })),
    tx.shadow ? color('Cor', tx.shadowColor, (v) => upd(c, { text: { shadowColor: v } })) : null,
    tx.shadow ? slider('Desfoque', tx.shadowBlur, { min: 0, max: 60, onInput: (v) => upd(c, { text: { shadowBlur: v } }) }) : null,
    tx.shadow ? slider('Distância X', tx.shadowX, { min: -50, max: 50, onInput: (v) => upd(c, { text: { shadowX: v } }) }) : null,
    tx.shadow ? slider('Distância Y', tx.shadowY, { min: -50, max: 50, onInput: (v) => upd(c, { text: { shadowY: v } }) }) : null,
  ));
  bodyEl.append(section('Brilho (neon)',
    color('Cor', tx.glowColor, (v) => upd(c, { text: { glowColor: v } })),
    slider('Intensidade', tx.glow, { min: 0, max: 80, def: 0, onInput: (v) => upd(c, { text: { glow: v } }) }),
  ));
}

function audioTab(c) {
  bodyEl.append(section('Áudio',
    animSlider(c, 'volume', 'Volume', { mul: 100, min: 0, max: 300, unit: '%', def: 100 }),
    el('div', { class: 'muted small vol-db' }, (() => { const d = toDb(valueAt(c, 'volume', localTime(c))); return isFinite(d) ? `≈ ${d.toFixed(1)} dB` : '-∞ dB'; })()),
    el('div', { class: 'btn-row' }, el('button', { class: 'btn sm', onclick: () => gainDialog() }, t('Ganho de áudio...') + ' (G)')),
    slider('Fade in', c.fadeIn, { min: 0, max: Math.min(10, c.duration / 2), step: 0.1, unit: 's', def: 0, onInput: (v) => upd(c, { fadeIn: v }) }),
    slider('Fade out', c.fadeOut, { min: 0, max: Math.min(10, c.duration / 2), step: 0.1, unit: 's', def: 0, onInput: (v) => upd(c, { fadeOut: v }) }),
    c.type === 'video' ? el('div', { class: 'btn-row' }, el('button', { class: 'btn', onclick: () => store.detachAudio(c.id) }, 'Separar áudio')) : null,
  ));
  if (c.type !== 'sequence') bodyEl.append(voiceSection(c));
}

// efeitos de voz (estilo CapCut)
function voiceSection(c) {
  const cur = c.voice?.id || '';
  const set = (id) => { store.begin(); c.voice = id ? { id } : null; store.commit('voice'); };
  const box = section(t('Efeitos de voz'));
  const cats = [...new Set(VOICES.map((v) => v.cat))];
  box.append(el('div', { class: 'voice-grid' }, el('button', { class: 'voice-chip' + (!cur ? ' on' : ''), onclick: () => set('') }, '∅ ' + t('Nenhum'))));
  for (const cat of cats) {
    box.append(el('div', { class: 'muted small voice-cat' }, t(cat)));
    box.append(el('div', { class: 'voice-grid' }, VOICES.filter((v) => v.cat === cat).map((v) => el('button', { class: 'voice-chip' + (cur === v.id ? ' on' : ''), onclick: () => set(v.id) }, t(v.name)))));
  }
  return box;
}

function speedTab(c) {
  const presets = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10];
  bodyEl.append(section('Velocidade',
    el('div', { class: 'chips' }, presets.map((s) => el('button', { class: 'chip' + ((c.speed || 1) === s ? ' on' : ''), onclick: () => setSpeed(c, s) }, s + 'x'))),
    slider('Personalizado', c.speed || 1, { min: 0.1, max: 10, step: 0.05, unit: 'x', def: 1, onInput: (v) => { const src = c.duration * (c.speed || 1); c.speed = v; c.duration = src / v; store.touch(); } }),
    toggle('Alterar tom', !!c.changePitch, (v) => updC(c, { changePitch: v })),
    el('div', { class: 'muted small' }, t('Nova duração: {d}', { d: fmtShort(c.duration) })),
  ));
  // rampa de velocidade (time remapping): velocidade varia ao longo do clipe
  const ramp = (pts) => { store.begin(); c.kf = { ...(c.kf || {}) }; if (pts) c.kf.speed = pts.map(([p, v]) => ({ t: +(p * c.duration).toFixed(3), v, e: 'ease' })); else delete c.kf.speed; store.commit('kf'); };
  bodyEl.append(section(t('Rampa de velocidade'),
    el('div', { class: 'muted small' }, t('A velocidade muda ao longo do clipe (como o Time Remapping do Premiere). Use o cronômetro para criar keyframes no cursor.')),
    animSlider(c, 'speed', 'Velocidade no cursor', { min: 0.1, max: 10, step: 0.05, unit: 'x', def: 1 }),
    el('div', { class: 'chips' },
      el('button', { class: 'chip', onclick: () => ramp([[0, 0.4], [1, 2.5]]) }, t('Lento → rápido')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 2.5], [1, 0.4]]) }, t('Rápido → lento')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 3], [0.35, 3], [0.45, 0.3], [0.6, 0.3], [0.7, 3], [1, 3]]) }, t('Montagem (rápido-lento-rápido)')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 1], [0.4, 1], [0.5, 0.2], [0.65, 0.2], [0.75, 1], [1, 1]]) }, t('Câmera lenta no meio')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 1], [0.3, 1], [0.38, 0.15], [0.62, 0.15], [0.7, 1], [1, 1]]) }, t('Herói')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 4], [0.2, 4], [0.3, 0.1], [0.7, 0.1], [0.8, 4], [1, 4]]) }, t('Bala (bullet time)')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 0.8], [0.45, 0.8], [0.5, 6], [0.55, 0.8], [1, 0.8]]) }, t('Salto')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 6], [0.3, 1], [1, 1]]) }, t('Flash in')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 1], [0.7, 1], [1, 6]]) }, t('Flash out')),
      el('button', { class: 'chip', onclick: () => ramp([[0, 0.5], [0.25, 2], [0.5, 0.5], [0.75, 2], [1, 0.5]]) }, t('Pulso')),
      hasKf(c, 'speed') ? el('button', { class: 'chip', onclick: () => ramp(null) }, t('Remover rampa')) : null),
  ));
}

function animTab(c) {
  const isText = c.type === 'text';
  const inList = ANIM_IN.filter((a) => !a.textOnly || isText);
  const pick = (key, list, title, maxDur) => {
    const cur = c[key];
    return section(title,
      select('Animação:', cur?.id || '', [['', 'Nenhuma'], ...list.map((a) => [a.id, a.name])], (v) => updC(c, { [key]: v ? { id: v, dur: cur?.dur || 0.6, speed: cur?.speed || 1 } : null })),
      cur && key !== 'animLoop' ? slider('Duração', cur.dur, { min: 0.1, max: maxDur, step: 0.05, unit: 's', onInput: (v) => upd(c, { [key]: { dur: v } }) }) : null,
      cur && key === 'animLoop' ? slider('Velocidade', cur.speed || 1, { min: 0.1, max: 5, step: 0.1, unit: 'x', onInput: (v) => upd(c, { [key]: { speed: v } }) }) : null,
    );
  };
  const maxDur = Math.max(0.2, Math.min(5, c.duration));
  bodyEl.append(pick('animIn', inList, 'Entrada', maxDur), pick('animOut', inList, 'Saída', maxDur), pick('animLoop', ANIM_LOOP, 'Loop', 5));
  bodyEl.append(el('div', { class: 'btn-row' }, el('button', { class: 'btn', onclick: () => openTab('anims') }, 'Ver prévias das animações')));
}

function adjustTab(c) {
  const a = c.adjust;
  const s = (label, key, min = -100, max = 100) => slider(label, a[key], { min, max, def: 0, onInput: (v) => upd(c, { adjust: { [key]: v } }) });
  const bypass = colorBypass.has(c.id);
  bodyEl.append(el('div', { class: 'color-tools' },
    el('button', { class: 'btn sm', title: t('Clique no conta-gotas e depois em algo branco ou cinza no vídeo'), onclick: () => { startPick((r, g, b) => whiteBalanceFrom(c, r, g, b)); }, html: icon('pipette', 13) + `<span>${t('Balanço de branco')}</span>` }),
    el('button', { class: 'btn sm' + (bypass ? ' on' : ''), title: t('Comparar antes/depois'), onclick: () => { bypass ? colorBypass.delete(c.id) : colorBypass.add(c.id); bus.emit('frame-ready'); render(); }, html: icon('compare', 13) + `<span>${bypass ? t('Mostrando: antes') : t('Antes/depois')}</span>` }),
    c.mediaId ? el('button', { class: 'btn sm', title: t('Aplica estes ajustes e o filtro em todos os clipes desta mesma mídia'), onclick: () => applyColorToMedia(c) }, t('Aplicar à mídia toda')) : null));
  bodyEl.append(section('Luz',
    s('Brilho', 'brightness'), s('Contraste', 'contrast'), s('Exposição', 'exposure'),
  ));
  bodyEl.append(section(t('Tons'),
    s('Realces', 'highlights'), s('Sombras', 'shadows'), s('Brancos', 'whites'), s('Pretos', 'blacks'),
  ));
  bodyEl.append(section('Cor',
    s('Saturação', 'saturation'), s('Temperatura', 'temperature'), s('Tonalidade (verde ↔ magenta)', 'tint'), s('Matiz (girar cores)', 'hue'),
  ));
  bodyEl.append(section('Efeitos',
    s('Nitidez', 'sharpen', 0, 100), s('Desfoque', 'blur', 0, 100), s('Vinheta', 'vignette', 0, 100),
    el('div', { class: 'btn-row' }, el('button', { class: 'btn', onclick: () => updC(c, { adjust: defaultAdjust() }) }, 'Redefinir ajustes'),
      el('button', { class: 'btn', onclick: () => copyAttributes(c) }, t('Copiar atributos')),
      el('button', { class: 'btn', disabled: !hasAttributes(), onclick: () => pasteAttributesDialog() }, t('Colar atributos...'))),
  ));
  if (c.type !== 'filter') {
    bodyEl.append(section('Filtro',
      select('Filtro:', c.filter?.id || '', [['', 'Nenhum'], ...FILTERS.map((f) => [f.id, f.name])], (v) => updC(c, { filter: v ? { id: v, intensity: c.filter?.intensity ?? 1 } : null })),
      c.filter ? slider('Intensidade', Math.round((c.filter.intensity ?? 1) * 100), { min: 0, max: 100, unit: '%', def: 100, onInput: (v) => upd(c, { filter: { intensity: v / 100 } }) }) : null,
    ));
  }
}

// ---------- Cor (estilo Lumetri) ----------
function colorTab(c) {
  if (!c.grade) c.grade = defaultGrade();
  const g = c.grade;
  const ch = (final) => { if (final) store.commit('color'); else store.touch(); };
  const bypass = colorBypass.has(c.id);
  bodyEl.append(el('div', { class: 'color-tools' },
    el('button', { class: 'btn sm', onclick: () => toggleScopes(), html: icon('mixer', 13) + `<span>${t('Scopes')}</span>` }),
    el('button', { class: 'btn sm' + (bypass ? ' on' : ''), onclick: () => { bypass ? colorBypass.delete(c.id) : colorBypass.add(c.id); bus.emit('frame-ready'); render(); }, html: icon('compare', 13) + `<span>${bypass ? t('Mostrando: antes') : t('Antes/depois')}</span>` }),
    el('button', { class: 'btn sm', onclick: () => { store.begin(); const lut = g.lut, mix = g.lutMix; c.grade = { ...defaultGrade(), lut, lutMix: mix }; store.commit('color-reset'); } }, t('Zerar cor'))));
  bodyEl.append(section(t('Rodas de cor'),
    el('div', { class: 'cw-row' }, colorWheel('Sombras', g.lift, ch), colorWheel('Meios-tons', g.gamma, ch), colorWheel('Realces', g.gain, ch)),
    el('div', { class: 'muted small' }, t('Arraste o ponto para tingir; a barra embaixo clareia ou escurece. Toque duplo zera a roda.'))));
  bodyEl.append(section(t('Curvas'), curvesEditor(g.curves, ch)));
  const luts = Object.entries(store.p.luts || {});
  bodyEl.append(section('LUT',
    select('LUT:', g.lut || '', [['', t('Nenhuma')], ...luts.map(([id, l]) => [id, l.name])], (v) => updC(c, { grade: { lut: v || null } })),
    g.lut ? slider('Intensidade', Math.round((g.lutMix ?? 1) * 100), { min: 0, max: 100, unit: '%', def: 100, onInput: (v) => upd(c, { grade: { lutMix: v / 100 } }) }) : null,
    el('div', { class: 'btn-row' }, el('button', { class: 'btn sm', onclick: () => importLut((id) => updC(c, { grade: { lut: id } })) }, t('Importar LUT (.cube)...')))));
}

// ---------- Estabilização ----------
function stabSection(c) {
  const sb = c.stab;
  const box = section(t('Estabilizar'),
    el('div', { class: 'muted small' }, t('Tira a tremedeira da câmera (como o Estabilizador de Distorção do Premiere).')),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm' + (sb ? '' : ' primary'), onclick: () => stabilize(c) }, sb ? t('Analisar de novo') : t('Estabilizar vídeo')),
      el('button', { class: 'btn sm', title: t('Muda o formato e segue a pessoa automaticamente'), onclick: () => autoReframeDialog() }, t('Reenquadrar automaticamente'))));
  if (sb) {
    const set = (patch) => { Object.assign(c.stab, patch); store.touch(); };
    box.append(
      toggle(t('Ligado'), sb.on, (v) => { store.begin(); c.stab.on = v; store.commit('stab'); }),
      slider(t('Suavidade'), Math.round(sb.smooth * 100), { min: 10, max: 400, unit: '%', def: 100, onInput: (v) => set({ smooth: v / 100 }) }),
      slider(t('Zoom (100 = automático)'), Math.round((sb.zoom || 1) * 100), { min: 100, max: 150, unit: '%', def: 100, onInput: (v) => set({ zoom: v > 100 ? v / 100 : 0 }) }),
      el('button', { class: 'btn sm danger', onclick: () => { store.begin(); delete c.stab; store.commit('stab'); } }, t('Remover estabilização')));
  }
  return box;
}

// ---------- Máscaras ----------
function masksSection(c) {
  const list = c.masks || [];
  const add = (shape, extra = {}) => { store.begin(); c.masks = [...(c.masks || []), { ...defaultMask(shape), ...extra }]; store.commit('mask'); };
  const shapeSel = el('select', { class: 'select sm', onchange: () => { if (shapeSel.value) add(shapeSel.value); shapeSel.value = ''; } },
    el('option', { value: '' }, '+ ' + t('Outra forma...')), MASK_SHAPES.slice(2).map(([v, n]) => el('option', { value: v }, t(n))));
  const box = section(t('Máscaras'),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm', onclick: () => add('ellipse') }, '+ ' + t('Elipse')),
      el('button', { class: 'btn sm', onclick: () => add('rect') }, '+ ' + t('Retângulo')), shapeSel),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm', title: t('Desfoca só uma parte (ex.: rosto ou placa). Use "Rastrear" para seguir o movimento.'), onclick: () => add('ellipse', { mode: 'blur', w: 0.28, h: 0.36, feather: 8, amount: 40 }) }, '◍ ' + t('Desfocar área')),
      el('button', { class: 'btn sm', title: t('Pixeliza só uma parte (censura)'), onclick: () => add('rect', { mode: 'pixel', w: 0.28, h: 0.36, feather: 0, amount: 30 }) }, '▦ ' + t('Pixelar área'))));
  list.forEach((m, i) => {
    const set = (patch) => { Object.assign(m, patch); store.touch(); };
    box.append(el('div', { class: 'fx-item' },
      el('div', { class: 'fx-head' }, el('b', {}, `${t('Máscara')} ${i + 1} · ${t((MASK_SHAPES.find((x) => x[0] === m.shape) || MASK_SHAPES[0])[1])}`), el('div', { class: 'grow' }),
        el('button', { class: 'btn sm' + (m.invert ? ' on' : ''), onclick: () => { store.begin(); m.invert = !m.invert; store.commit('mask'); } }, t('Inverter')),
        c.type === 'video' ? el('button', { class: 'btn sm' + (m.track ? ' on' : ''), title: t('Faz a máscara seguir o objeto que está embaixo dela'), onclick: () => trackMask(c, m) }, '◎ ' + t(m.track ? 'Rastrear de novo' : 'Rastrear')) : null,
        m.track ? el('button', { class: 'btn sm', onclick: () => { store.begin(); delete m.track; store.commit('mask'); } }, t('Parar de rastrear')) : null,
        el('button', { class: 'icon-btn xs', title: t('Excluir'), onclick: () => { store.begin(); c.masks.splice(i, 1); store.commit('mask'); }, html: icon('trash', 13) })),
      segmented(t('Tipo:'), m.mode || 'alpha', [['alpha', t('Recorte')], ['blur', t('Desfoque')], ['pixel', t('Pixelado')]], (v) => { store.begin(); m.mode = v === 'alpha' ? undefined : v; if (v !== 'alpha' && m.amount == null) m.amount = 40; store.commit('mask'); }),
      select(t('Forma:'), m.shape, MASK_SHAPES.map(([v, n]) => [v, t(n)]), (v) => { store.begin(); m.shape = v; store.commit('mask'); }),
      m.mode ? slider(t('Intensidade'), m.amount ?? 40, { min: 2, max: 120, def: 40, onInput: (v) => set({ amount: v }) }) : null,
      slider('Posição X', Math.round(m.x * 100), { min: -100, max: 100, def: 0, onInput: (v) => set({ x: v / 100 }) }),
      slider('Posição Y', Math.round(m.y * 100), { min: -100, max: 100, def: 0, onInput: (v) => set({ y: v / 100 }) }),
      slider('Largura', Math.round(m.w * 100), { min: 2, max: 200, unit: '%', def: 60, onInput: (v) => set({ w: v / 100 }) }),
      slider('Altura', Math.round(m.h * 100), { min: 2, max: 200, unit: '%', def: 60, onInput: (v) => set({ h: v / 100 }) }),
      slider('Rotação', m.rot || 0, { min: -180, max: 180, unit: '°', def: 0, onInput: (v) => set({ rot: v }) }),
      slider('Suavizar borda', m.feather, { min: 0, max: 200, def: 20, onInput: (v) => set({ feather: v }) }),
      slider('Expansão', m.expand || 0, { min: -200, max: 200, def: 0, onInput: (v) => set({ expand: v }) }),
      slider('Opacidade', Math.round((m.opacity ?? 1) * 100), { min: 0, max: 100, unit: '%', def: 100, onInput: (v) => set({ opacity: v / 100 }) })));
  });
  return box;
}

function fxTab(c) {
  const list = c.effects;
  const box = section(c.type === 'effect' ? 'Efeito' : 'Efeitos aplicados');
  if (!list.length) box.append(el('div', { class: 'muted small' }, 'Nenhum efeito. Escolha na aba "Efeitos" da biblioteca.'));
  list.forEach((e, i) => {
    const def = EFFECT_MAP[e.id];
    box.append(el('div', { class: 'fx-item' },
      el('div', { class: 'fx-head' }, el('span', { html: icon('effects', 13) }), el('b', {}, def?.name || e.id), el('div', { class: 'grow' }),
        el('button', { class: 'icon-btn xs', title: 'Remover', onclick: () => { store.begin(); c.effects.splice(i, 1); store.commit('rmfx'); }, html: icon('trash', 13) })),
      slider('Intensidade', Math.round((e.intensity ?? 0.6) * 100), { min: 0, max: 100, unit: '%', def: 60, onInput: (v) => { e.intensity = v / 100; store.touch(); } })));
  });
  const add = el('select', { class: 'select' }, el('option', { value: '' }, '+ Adicionar efeito...'), EFFECTS.map((f) => el('option', { value: f.id }, `${f.cat} · ${f.name}`)));
  add.addEventListener('change', () => { if (!add.value) return; store.begin(); c.effects.push({ id: add.value, intensity: 0.6 }); store.commit('addfx'); });
  box.append(add);
  bodyEl.append(box);
  bodyEl.append(el('div', { class: 'btn-row' }, el('button', { class: 'btn', onclick: () => openTab('effects') }, 'Abrir biblioteca de efeitos')));
}

function filterTab(c) {
  bodyEl.append(section('Filtro',
    select('Filtro:', c.filter?.id || '', [['', 'Nenhum'], ...FILTERS.map((f) => [f.id, f.name])], (v) => updC(c, { filter: v ? { id: v, intensity: c.filter?.intensity ?? 1 } : null, name: v ? FILTER_MAP[v].name : 'Ajuste' })),
    c.filter ? slider('Intensidade', Math.round((c.filter.intensity ?? 1) * 100), { min: 0, max: 100, unit: '%', def: 100, onInput: (v) => upd(c, { filter: { intensity: v / 100 } }) }) : null,
    el('div', { class: 'muted small' }, 'Esta camada afeta todas as trilhas abaixo dela.'),
  ));
}

function timingTab(c) {
  bodyEl.append(section('Tempo',
    slider('Início', c.start, { min: 0, max: Math.max(60, store.duration()), step: 0.01, unit: 's', onInput: (v) => upd(c, { start: v }) }),
    slider('Duração', c.duration, { min: 0.1, max: 120, step: 0.05, unit: 's', onInput: (v) => upd(c, { duration: v }) }),
  ));
}
