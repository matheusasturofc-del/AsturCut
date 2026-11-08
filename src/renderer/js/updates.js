// Aviso de atualização: consulta a última versão publicada e mostra "Nova atualização disponível!"
import { el, icon, toast } from './util.js';
import { settings } from './settings.js';
import { isDesktop, api } from './media.js';
import { bus } from './store.js';
import { t } from './i18n.js';

export let latest = null; // info da versão nova (se houver)

// compara versões "1.2.10" > "1.2.9"
export function isNewer(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

export async function checkForUpdates({ manual = false } = {}) {
  if (!isDesktop || !api.checkUpdate) { if (manual) toast(t('As atualizações são verificadas no app para PC.'), 'info'); return null; }
  try {
    const info = await api.checkUpdate();
    if (!info || !info.ok) { if (manual) toast(t('Não foi possível verificar agora. Tente mais tarde.'), 'error'); return null; }
    if (isNewer(info.version, info.current)) {
      latest = info;
      bus.emit('update-available', info);
      if (manual || settings.get('skipVersion') !== info.version) showUpdateCard(info);
      return info;
    }
    latest = null;
    if (manual) toast(t('Você já tem a versão mais recente ({v}).', { v: info.current }), 'success');
  } catch (e) {
    if (manual) toast(t('Não foi possível verificar agora. Tente mais tarde.'), 'error');
  }
  return null;
}

export function startUpdateChecks() {
  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), 6 * 3600 * 1000);
}

export function openUpdate(info = latest) {
  if (!info) return;
  api.openExternal(info.download || info.page);
}

function cleanNotes(md) {
  return String(md || '')
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '• ').replace(/\*\*/g, '').trim())
    .filter((l) => l && !/^generated with|^🤖|^https?:\/\//i.test(l))
    .slice(0, 5);
}

export function showUpdateCard(info) {
  document.getElementById('update-card')?.remove();
  const notes = cleanNotes(info.notes);
  const close = () => card.remove();
  const card = el('div', { class: 'update-card', id: 'update-card' },
    el('div', { class: 'uc-head' },
      el('span', { class: 'uc-icon', html: icon('sparkle', 18) }),
      el('div', { class: 'uc-titles' }, el('b', {}, t('Nova atualização disponível!')), el('span', { class: 'muted small' }, t('AsturCut {v} — você está na {c}', { v: info.version, c: info.current }))),
      el('button', { class: 'icon-btn sm', title: t('Fechar'), onclick: close, html: icon('close', 13) })),
    notes.length ? el('div', { class: 'uc-notes no-tr' }, notes.map((n) => el('div', {}, n))) : null,
    el('div', { class: 'uc-actions' },
      el('button', { class: 'btn primary', onclick: () => { openUpdate(info); }, html: icon('import', 14) + `<span>${t('Atualizar agora')}</span>` }),
      el('button', { class: 'btn', onclick: () => api.openExternal(info.page) }, t('Ver novidades')),
      el('button', { class: 'link-btn small', onclick: () => { settings.set('skipVersion', info.version, true); close(); } }, t('Pular esta versão'))),
    el('div', { class: 'muted small uc-hint' }, t('Baixe e abra o instalador: ele atualiza por cima, mantendo seus projetos e preferências.')));
  document.body.append(card);
}
