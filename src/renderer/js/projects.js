// Projetos: novo, abrir, salvar, recentes (com miniatura) e recuperação
import { store, bus, ASPECTS } from './store.js';
import { el, toast, modal } from './util.js';
import { settings } from './settings.js';
import { restoreProjectMedia, isDesktop, api } from './media.js';
import { player, pause } from './player.js';
import { t, locale } from './i18n.js';

export function serialize() {
  const p = store.p;
  return { ...p, savedWith: 'AsturCut', savedAt: Date.now(), media: p.media.map(({ missing, ...m }) => m) };
}

// miniatura do quadro atual do exibidor
function captureThumb() {
  try {
    const src = player.canvas;
    if (!src || !store.p.clips.length) return null;
    const w = 320, h = Math.round(320 * src.height / src.width);
    const c = el('canvas', { width: w, height: Math.min(h, 400) });
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.72);
  } catch { return null; }
}

export function getRecent() { return settings.get('recent') || []; }

export function pushRecent(path, name) {
  if (!path) return;
  const rec = getRecent().filter((r) => r.path !== path);
  rec.unshift({ path, name, date: Date.now(), thumb: captureThumb(), duration: store.duration(), aspect: store.p.settings.aspect, w: store.p.settings.width, h: store.p.settings.height });
  settings.set('recent', rec.slice(0, 24), true);
  bus.emit('recent');
}
export function removeRecent(path) {
  settings.set('recent', getRecent().filter((r) => r.path !== path), true);
  bus.emit('recent');
}

export async function saveProject(saveAs = false) {
  if (!isDesktop) {
    const blob = new Blob([JSON.stringify(serialize(), null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${store.p.name}.astur` });
    document.body.append(a); a.click(); a.remove();
    store.dirty = false; bus.emit('title');
    toast(t('Projeto baixado'), 'success');
    return true;
  }
  try {
    const path = await api.saveProject({ filePath: store.filePath, data: serialize(), saveAs });
    if (!path) return false;
    store.filePath = path;
    store.dirty = false;
    pushRecent(path, store.p.name);
    bus.emit('title');
    clearRecovery();
    toast(t('Projeto salvo'), 'success', 1500);
    return true;
  } catch (e) { toast(t('Erro ao salvar: {e}', { e: e.message }), 'error'); return false; }
}

export async function confirmDiscard() {
  if (!store.dirty || !store.p.clips.length) return true;
  return new Promise((res) => {
    let done = false;
    modal({
      title: t('Alterações não salvas'), width: 440,
      body: el('p', { class: 'muted' }, t('Deseja salvar as alterações em "{name}"?', { name: store.p.name })),
      actions: [
        { label: t('Cancelar'), onClick: () => { done = true; res(false); } },
        { label: t('Não salvar'), danger: true, onClick: () => { done = true; res(true); } },
        { label: t('Salvar'), primary: true, onClick: () => { done = true; saveProject().then((ok) => res(ok)); } },
      ],
      onClose: () => { if (!done) res(false); },
    });
  });
}

export function defaultName() {
  return t('Projeto {date}', { date: new Date().toLocaleDateString(locale()).replace(/\//g, '-') });
}

// cria um projeto novo (opcionalmente com proporção). Retorna false se o usuário cancelou.
export async function newProject({ name, aspect, width, height, fps, background, bgMode } = {}) {
  if (!(await confirmDiscard())) return false;
  pause();
  store.newProject(name || defaultName());
  const st = store.p.settings;
  if (aspect && ASPECTS[aspect]) { const [w, h] = ASPECTS[aspect]; Object.assign(st, { width: w, height: h, aspect }); }
  if (width && height) Object.assign(st, { width, height, aspect: aspect || st.aspect });
  if (fps) st.fps = fps;
  if (background) st.background = background;
  if (bgMode) st.bgMode = bgMode;
  bus.emit('settings-project');
  bus.emit('title');
  bus.emit('enter-editor');
  return true;
}

export async function openProject(path) {
  if (!(await confirmDiscard())) return false;
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
    if (!res) return false;
    pause();
    store.loadProject(res.data, res.filePath);
    await restoreProjectMedia();
    bus.emit('title');
    bus.emit('enter-editor');
    bus.emit('fit-timeline');
    if (res.filePath) setTimeout(() => pushRecent(res.filePath, store.p.name), 1500);
    toast(t('Projeto "{name}" aberto', { name: store.p.name }), 'success');
    return true;
  } catch (e) {
    toast(t('Não foi possível abrir: {e}', { e: e.message }), 'error', 4000);
    if (path) removeRecent(path);
    return false;
  }
}

// ---------- Recuperação / salvamento automático ----------
const REC_KEY = 'asturcut.recovery';
let recTimer = null;
export function scheduleRecovery() {
  clearTimeout(recTimer);
  recTimer = setTimeout(() => {
    if (!store.dirty || !store.p.clips.length) return;
    try { localStorage.setItem(REC_KEY, JSON.stringify({ data: serialize(), filePath: store.filePath, at: Date.now() })); } catch {}
  }, 3000);
}
export function clearRecovery() { try { localStorage.removeItem(REC_KEY); } catch {} }
export function getRecovery() { try { return JSON.parse(localStorage.getItem(REC_KEY) || 'null'); } catch { return null; } }
export async function recover(rec) {
  pause();
  store.loadProject(rec.data, rec.filePath);
  store.dirty = true;
  await restoreProjectMedia();
  bus.emit('title');
  bus.emit('enter-editor');
  bus.emit('fit-timeline');
}

let lastAuto = Date.now();
setInterval(() => {
  const min = settings.get('autosave');
  if (!min || !isDesktop || !store.filePath || !store.dirty || player.exporting) return;
  if (Date.now() - lastAuto >= min * 60000) { lastAuto = Date.now(); saveProject(); }
}, 15000);
