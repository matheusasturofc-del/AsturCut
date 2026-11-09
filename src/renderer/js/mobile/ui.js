// Layout de celular (estilo apps de edição): exibidor em cima, linha do tempo no meio,
// barra de ferramentas embaixo; biblioteca e propriedades abrem como "gavetas" que sobem.
import { $, el, icon } from '../util.js';
import { t } from '../i18n.js';
import { store, bus } from '../store.js';
import { openTab } from '../library.js';
import { zoom } from '../timeline.js';

const NAV = [
  ['media', 'Mídia', 'media'], ['audio', 'Áudio', 'audio'], ['text', 'Texto', 'text'], ['stickers', 'Stickers', 'sticker'],
  ['effects', 'Efeitos', 'effects'], ['filters', 'Filtros', 'filters'], ['transitions', 'Transições', 'transitions'],
  ['anims', 'Animações', 'wand'], ['edit', 'Editar', 'adjust'],
];

let open = null; // 'library' | 'inspector' | null
let current = null;

function setOpen(which, tab) {
  open = which;
  current = which === 'library' ? tab : which === 'inspector' ? 'edit' : null;
  $('#panel-library').classList.toggle('open', which === 'library');
  $('#panel-inspector').classList.toggle('open', which === 'inspector');
  document.body.classList.toggle('m-sheet-open', !!which);
  document.querySelectorAll('.m-nav-btn').forEach((b) => b.classList.toggle('on', b.dataset.id === current));
}

export function closeSheets() { setOpen(null); }

function sheetHead(title, panel) {
  const head = el('div', { class: 'm-sheet-head' },
    el('span', { class: 'm-grab' }),
    el('b', { class: 'm-sheet-title' }, title),
    el('button', { class: 'icon-btn m-sheet-close', title: t('Fechar'), onclick: () => setOpen(null), html: icon('chevDown', 18) }));
  // arrastar a alça para baixo fecha
  let y0 = null;
  head.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  head.addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 50) setOpen(null); y0 = null; });
  panel.prepend(head);
  return head;
}

export function initMobileUI({ showHome, isHomeVisible }) {
  document.body.classList.add('mobile');
  const lib = $('#panel-library'), insp = $('#panel-inspector');
  lib.classList.add('m-sheet'); insp.classList.add('m-sheet');
  const libHead = sheetHead(t('Biblioteca'), lib);
  sheetHead(t('Editar'), insp);
  // a biblioteca recria seu conteúdo: mantém a alça sempre no topo
  new MutationObserver(() => { if (lib.firstChild !== libHead) lib.prepend(libHead); }).observe(lib, { childList: true });
  const insHead = insp.querySelector('.m-sheet-head');
  new MutationObserver(() => { if (insp.firstChild !== insHead) insp.prepend(insHead); }).observe(insp, { childList: true });

  const nav = el('nav', { id: 'm-nav' }, NAV.map(([id, name, ic]) =>
    el('button', { class: 'm-nav-btn', dataset: { id }, onclick: () => {
      if (current === id) return setOpen(null);
      if (id === 'edit') return setOpen('inspector');
      openTab(id);
      setOpen('library', id);
      libHead.querySelector('.m-sheet-title').textContent = t(name);
    } }, el('span', { html: icon(ic, 20) }), el('small', {}, t(name)))));
  $('#workspace').append(nav);

  // clipe selecionado: destaca "Editar"; toque duplo no clipe abre as propriedades
  bus.on('selection', () => nav.querySelector('[data-id="edit"]').classList.toggle('has-sel', store.selection.size > 0));
  $('#panel-timeline').addEventListener('dblclick', (e) => { if (e.target.closest('.tl-clip')) setOpen('inspector'); });
  // depois de adicionar algo da biblioteca, fecha a gaveta para ver o resultado
  bus.on('change', (label) => { if (open === 'library' && (label === 'add' || label === 'add-media')) setTimeout(() => setOpen(null), 150); });

  // pinça para dar zoom na linha do tempo
  const sc = $('#tl-scroll');
  let d0 = 0;
  const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  sc.addEventListener('touchstart', (e) => { if (e.touches.length === 2) d0 = dist(e); }, { passive: true });
  sc.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !d0) return;
    e.preventDefault();
    const d = dist(e);
    if (Math.abs(d / d0 - 1) > 0.06) { zoom(d / d0); d0 = d; }
  }, { passive: false });
  sc.addEventListener('touchend', () => { d0 = 0; });

  // botão voltar do Android
  window.__asturMobileBack = () => {
    if (open) { setOpen(null); return true; }
    if (!isHomeVisible()) { showHome(); return true; }
    return false;
  };
}
