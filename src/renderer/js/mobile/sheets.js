// Gavetas que sobem de baixo (estilo editores de celular): uma por vez, com título e ✓ para confirmar
import { el, icon } from '../util.js';
import { t } from '../i18n.js';

let sheet = null, body = null, titleEl = null, holder = null, current = null;

function ensure() {
  if (sheet) return;
  holder = el('div', { id: 'm-holder' }); // guarda os painéis quando não estão na gaveta
  titleEl = el('b', { class: 'ms-title' });
  body = el('div', { class: 'ms-body' });
  const done = el('button', { class: 'ms-done', title: t('Concluir'), onclick: () => closeSheet(), html: icon('check', 20) });
  const head = el('div', { class: 'ms-head' }, el('span', { class: 'ms-grab' }), titleEl, done);
  // puxar a alça para baixo fecha
  let y0 = null;
  head.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  head.addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 40) closeSheet(); y0 = null; });
  sheet = el('div', { id: 'm-sheet' }, head, body);
  document.body.append(holder, sheet);
}

export function parkPanel(node) { ensure(); holder.append(node); }

/** abre a gaveta. content: elemento (painel da biblioteca/propriedades ou conteúdo próprio) */
export function openSheet({ title, content, tall = false, onClose = null, keep = false }) {
  ensure();
  closeSheet(true);
  current = { content, onClose, keep };
  titleEl.textContent = title || '';
  body.innerHTML = '';
  body.append(content);
  sheet.classList.toggle('tall', !!tall);
  requestAnimationFrame(() => sheet.classList.add('open'));
  document.body.classList.add('m-sheet-open');
}

export function closeSheet(silent = false) {
  if (!sheet || !current) return false;
  const c = current;
  current = null;
  sheet.classList.remove('open');
  document.body.classList.remove('m-sheet-open');
  if (c.keep) holder.append(c.content); // devolve o painel para o "estacionamento"
  if (!silent && c.onClose) c.onClose();
  return true;
}

export const sheetOpen = () => !!current;
