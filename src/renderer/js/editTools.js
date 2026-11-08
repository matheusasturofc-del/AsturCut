// Ferramentas de edição: velocidade/duração (Ctrl+R), ganho de áudio (G), rótulos de cor, atributos
import { store, bus } from './store.js';
import { el, modal, toast, deepClone, fmtShort, clamp } from './util.js';
import { t } from './i18n.js';

// rótulos de cor (como no Premiere) — organizam as partes do vídeo na linha do tempo
export const LABELS = [
  ['#8b5cf6', 'Violeta'], ['#6366f1', 'Íris'], ['#14b8a6', 'Caribe'], ['#a78bfa', 'Lavanda'],
  ['#1ccfdc', 'Ciano'], ['#22c55e', 'Floresta'], ['#ec4899', 'Rosa'], ['#f59e0b', 'Manga'],
  ['#ef4444', 'Vermelho'], ['#eab308', 'Amarelo'],
];
export function setLabel(color) {
  const ids = [...store.selection];
  if (!ids.length) return;
  store.begin();
  ids.forEach((id) => { const c = store.clip(id); if (c) { if (color) c.label = color; else delete c.label; } });
  store.commit('label');
}
export const labelMenu = () => [
  { label: t('Nenhum'), onClick: () => setLabel(null) },
  ...LABELS.map(([c, n]) => ({ label: '● ' + t(n), onClick: () => setLabel(c), color: c })),
];

const hasAudio = (c) => c.type === 'audio' || c.type === 'video';

// ---------- Velocidade e duração ----------
export function speedDialog(clips = store.selectedClips()) {
  clips = clips.filter((c) => ['video', 'audio', 'image', 'text', 'sticker', 'shape', 'effect', 'filter'].includes(c.type));
  if (!clips.length) { toast(t('Selecione um clipe'), 'error'); return; }
  const c0 = clips[0];
  const media = c0.type === 'video' || c0.type === 'audio';
  const speed = el('input', { type: 'number', class: 'input', min: 1, max: 1600, step: 1, value: Math.round((c0.speed || 1) * 100) });
  const dur = el('input', { type: 'number', class: 'input', min: 0.1, step: 0.1, value: c0.duration.toFixed(2) });
  const pitch = el('input', { type: 'checkbox', checked: !c0.changePitch });
  const ripple = el('input', { type: 'checkbox', checked: true });
  const srcLen = c0.duration * (c0.speed || 1);
  speed.addEventListener('input', () => { if (media) dur.value = (srcLen / (Math.max(1, +speed.value) / 100)).toFixed(2); });
  dur.addEventListener('input', () => { if (media) speed.value = Math.round(srcLen / Math.max(0.05, +dur.value) * 100); });
  const row = (label, ctrl, suffix) => el('div', { class: 'dlg-row' }, el('label', {}, label), ctrl, suffix ? el('span', { class: 'muted' }, suffix) : null);
  modal({
    title: t('Velocidade e duração'), width: 420,
    body: el('div', { class: 'dlg' },
      media ? row(t('Velocidade'), speed, '%') : null,
      row(t('Duração'), dur, 's'),
      media ? el('label', { class: 'dlg-check' }, pitch, t('Manter o tom do áudio')) : null,
      el('label', { class: 'dlg-check' }, ripple, t('Empurrar os clipes seguintes (ripple)')),
      media ? el('div', { class: 'muted small' }, t('Dica: vídeo gravado a 60 fps fica suave em câmera lenta até 40% numa linha do tempo de 24 fps.')) : null),
    actions: [
      { label: t('Cancelar') },
      { label: 'OK', primary: true, onClick: () => {
        store.begin();
        for (const c of clips) {
          const oldEnd = c.start + c.duration;
          if (c.type === 'video' || c.type === 'audio') {
            const src = c.duration * (c.speed || 1);
            c.speed = clamp(+speed.value / 100, 0.01, 16);
            c.duration = src / c.speed;
            c.changePitch = !pitch.checked;
          } else c.duration = Math.max(0.1, +dur.value);
          if (ripple.checked) {
            const delta = c.start + c.duration - oldEnd;
            for (const x of store.p.clips) if (x !== c && x.trackId === c.trackId && x.start >= oldEnd - 1e-4) x.start += delta;
          }
        }
        store.commit('speed');
      } },
    ],
  });
  setTimeout(() => (media ? speed : dur).select(), 50);
}

// ---------- Ganho de áudio (dB) ----------
export const toDb = (g) => (g <= 0.0001 ? -Infinity : 20 * Math.log10(g));
export const fromDb = (db) => Math.pow(10, db / 20);
export function gainDialog(clips = store.selectedClips()) {
  clips = clips.filter(hasAudio);
  if (!clips.length) { toast(t('Selecione um clipe com áudio'), 'error'); return; }
  const cur = toDb(clips[0].volume ?? 1);
  const mode = el('select', { class: 'select' }, el('option', { value: 'set' }, t('Definir ganho para')), el('option', { value: 'add' }, t('Ajustar ganho em')));
  const val = el('input', { type: 'number', class: 'input', step: 0.5, min: -60, max: 20, value: isFinite(cur) ? cur.toFixed(1) : -60 });
  mode.addEventListener('change', () => { val.value = mode.value === 'add' ? 0 : (isFinite(cur) ? cur.toFixed(1) : -60); });
  modal({
    title: t('Ganho de áudio'), width: 420,
    body: el('div', { class: 'dlg' },
      el('div', { class: 'dlg-row' }, mode, val, el('span', { class: 'muted' }, 'dB')),
      el('div', { class: 'muted small' }, t('Para música de fundo, algo entre -20 e -30 dB costuma deixar a voz clara.')),
      el('div', { class: 'dlg-presets' }, [-30, -24, -18, -12, -6, 0].map((d) => el('button', { class: 'chip', onclick: () => { mode.value = 'set'; val.value = d; } }, d + ' dB')))),
    actions: [
      { label: t('Cancelar') },
      { label: 'OK', primary: true, onClick: () => {
        store.begin();
        for (const c of clips) {
          const db = mode.value === 'add' ? (isFinite(toDb(c.volume ?? 1)) ? toDb(c.volume ?? 1) : -60) + +val.value : +val.value;
          c.volume = db <= -59.9 ? 0 : clamp(fromDb(db), 0, 10);
          if (c.kf?.volume) delete c.kf.volume;
        }
        store.commit('gain');
      } },
    ],
  });
  setTimeout(() => val.select(), 50);
}

// ---------- Copiar / colar atributos (efeitos, cor, movimento) ----------
let attrClip = null;
export function copyAttributes(c = store.primarySelected()) {
  if (!c) return;
  attrClip = deepClone({ adjust: c.adjust, filter: c.filter, effects: c.effects, transform: c.transform, kf: c.kf, animIn: c.animIn, animOut: c.animOut, animLoop: c.animLoop, blend: c.blend, volume: c.volume, crop: c.crop });
  toast(t('Atributos copiados'), 'info', 1300);
}
export const hasAttributes = () => !!attrClip;
export function pasteAttributes(parts = ['adjust', 'filter', 'effects', 'transform', 'kf', 'anim', 'blend']) {
  if (!attrClip) return;
  const ids = [...store.selection];
  if (!ids.length) return;
  store.begin();
  for (const id of ids) {
    const c = store.clip(id); if (!c) continue;
    const a = deepClone(attrClip);
    const visual = c.type !== 'audio';
    if (visual && parts.includes('adjust')) c.adjust = a.adjust;
    if (visual && parts.includes('filter')) c.filter = a.filter;
    if (visual && parts.includes('effects')) c.effects = a.effects;
    if (visual && parts.includes('transform')) c.transform = a.transform;
    if (parts.includes('kf')) c.kf = a.kf;
    if (visual && parts.includes('anim')) { c.animIn = a.animIn; c.animOut = a.animOut; c.animLoop = a.animLoop; }
    if (visual && parts.includes('blend')) c.blend = a.blend;
    if (hasAudio(c) && parts.includes('volume')) c.volume = a.volume;
  }
  store.commit('paste-attr');
  toast(t('Atributos colados'), 'success', 1300);
}
export function pasteAttributesDialog() {
  if (!attrClip) { toast(t('Copie os atributos de um clipe primeiro'), 'error'); return; }
  const opts = [['adjust', 'Ajustes de cor'], ['filter', 'Filtro'], ['effects', 'Efeitos'], ['transform', 'Movimento (posição, escala, rotação)'], ['kf', 'Keyframes'], ['anim', 'Animações'], ['blend', 'Modo de mistura'], ['volume', 'Volume']];
  const boxes = opts.map(([k, n]) => { const cb = el('input', { type: 'checkbox', checked: k !== 'volume' }); return [k, el('label', { class: 'dlg-check' }, cb, t(n)), cb]; });
  modal({
    title: t('Colar atributos'), width: 380,
    body: el('div', { class: 'dlg' }, ...boxes.map((b) => b[1])),
    actions: [{ label: t('Cancelar') }, { label: t('Colar'), primary: true, onClick: () => pasteAttributes(boxes.filter((b) => b[2].checked).map((b) => b[0])) }],
  });
}

// aplica a correção de cor deste clipe em todos os clipes da mesma mídia (como corrigir a "mídia de origem")
export function applyColorToMedia(c = store.primarySelected()) {
  if (!c || !c.mediaId) return;
  const others = store.p.clips.filter((x) => x.mediaId === c.mediaId && x !== c && x.type !== 'audio');
  store.begin();
  for (const x of others) { x.adjust = deepClone(c.adjust); x.filter = deepClone(c.filter); }
  store.commit('color-all');
  toast(t('Cor aplicada a {n} clipe(s) da mesma mídia', { n: others.length }), 'success');
}

// balanço de branco: ajusta temperatura e tom para deixar a cor clicada neutra
export function whiteBalanceFrom(c, r, g, b) {
  const sum = Math.max(1, r + g + b);
  const dTemp = ((b - r) / sum) * 260;
  const dTint = (((r + b) / 2 - g) / sum) * -260;
  store.begin();
  c.adjust.temperature = Math.round(clamp((c.adjust.temperature || 0) + dTemp, -100, 100));
  c.adjust.tint = Math.round(clamp((c.adjust.tint || 0) + dTint, -100, 100));
  store.commit('wb');
  toast(t('Balanço de branco aplicado'), 'success', 1500);
}
void bus; void fmtShort;
