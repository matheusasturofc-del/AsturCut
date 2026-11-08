// Layout personalizável: redimensionar e reorganizar painéis, presets e visibilidade
import { $, $$, el, dragHandler, clamp, icon, toast } from './util.js';
import { settings } from './settings.js';

export const LAYOUT_PRESETS = {
  padrao: { name: 'Padrão', panelOrder: ['library', 'player', 'inspector'], libWidth: 470, inspWidth: 420, timelineHeight: 340, showLibrary: true, showInspector: true },
  player: { name: 'Exibidor grande', panelOrder: ['library', 'player', 'inspector'], libWidth: 330, inspWidth: 320, timelineHeight: 250, showLibrary: true, showInspector: true },
  timeline: { name: 'Linha do tempo grande', panelOrder: ['library', 'player', 'inspector'], libWidth: 430, inspWidth: 380, timelineHeight: 520, showLibrary: true, showInspector: true },
  invertido: { name: 'Invertido (inspetor à esquerda)', panelOrder: ['inspector', 'player', 'library'], libWidth: 450, inspWidth: 400, timelineHeight: 340, showLibrary: true, showInspector: true },
  playerEsq: { name: 'Exibidor à esquerda', panelOrder: ['player', 'library', 'inspector'], libWidth: 440, inspWidth: 380, timelineHeight: 330, showLibrary: true, showInspector: true },
  vertical: { name: 'Vídeo vertical (9:16)', panelOrder: ['library', 'player', 'inspector'], libWidth: 560, inspWidth: 480, timelineHeight: 320, showLibrary: true, showInspector: true },
  foco: { name: 'Modo foco (só exibidor e timeline)', panelOrder: ['library', 'player', 'inspector'], libWidth: 470, inspWidth: 420, timelineHeight: 300, showLibrary: false, showInspector: false },
};

const PANEL_EL = { library: '#panel-library', player: '#panel-player', inspector: '#panel-inspector' };

export function initLayout() {
  applyLayout();
  // divisória horizontal (timeline)
  $('#hsplit').addEventListener('pointerdown', (e) => {
    const h0 = settings.get('timelineHeight');
    dragHandler(e, (ev, dx, dy) => {
      const max = window.innerHeight - 260;
      settings.data.timelineHeight = clamp(h0 - dy, 140, max);
      applyLayout();
    }, () => settings.set('timelineHeight', settings.data.timelineHeight, true), 'row-resize');
  });
  $('#hsplit').addEventListener('dblclick', () => { settings.set('timelineHeight', 340, true); applyLayout(); });
  for (const id of ['vs1', 'vs2']) {
    $('#' + id).addEventListener('pointerdown', (e) => startVSplit(e, id));
    $('#' + id).addEventListener('dblclick', () => { settings.patch({ libWidth: 470, inspWidth: 420 }); applyLayout(); });
  }
  setupPanelDrag();
  settings.on('change', (k) => { if (['panelOrder', 'showLibrary', 'showInspector', 'libWidth', 'inspWidth', 'timelineHeight'].includes(k)) applyLayout(); });
  window.addEventListener('resize', () => applyLayout());
}

function visibleOrder() {
  return settings.get('panelOrder').filter((p) => p === 'player' || (p === 'library' ? settings.get('showLibrary') : settings.get('showInspector')));
}

export function applyLayout() {
  const order = settings.get('panelOrder');
  const vis = visibleOrder();
  const total = $('#top-row')?.clientWidth || window.innerWidth;
  for (const p of order) {
    const node = $(PANEL_EL[p]);
    if (!node) continue;
    const shown = vis.includes(p);
    node.style.display = shown ? '' : 'none';
    node.style.order = String(vis.indexOf(p) * 2);
    if (p === 'player') { node.style.flex = '1 1 0'; node.style.width = ''; }
    else {
      const key = p === 'library' ? 'libWidth' : 'inspWidth';
      const w = clamp(settings.get(key), 240, Math.max(260, total - 520));
      node.style.flex = `0 0 ${w}px`;
      node.style.width = w + 'px';
    }
  }
  const s1 = $('#vs1'), s2 = $('#vs2');
  if (s1 && s2) {
    s1.style.display = vis.length >= 2 ? '' : 'none'; s1.style.order = '1';
    s2.style.display = vis.length >= 3 ? '' : 'none'; s2.style.order = '3';
    s1.dataset.left = vis[0] || ''; s1.dataset.right = vis[1] || '';
    s2.dataset.left = vis[1] || ''; s2.dataset.right = vis[2] || '';
  }
  const tl = $('#panel-timeline');
  if (tl) tl.style.height = settings.get('timelineHeight') + 'px';
}

function startVSplit(e, id) {
  const s = $('#' + id);
  const left = s.dataset.left, right = s.dataset.right;
  const target = left !== 'player' ? left : right;
  const dir = left !== 'player' ? 1 : -1;
  const key = target === 'library' ? 'libWidth' : 'inspWidth';
  const w0 = settings.get(key);
  dragHandler(e, (ev, dx) => {
    settings.data[key] = clamp(w0 + dx * dir, 240, window.innerWidth - 560);
    applyLayout();
  }, () => settings.set(key, settings.data[key], true), 'col-resize');
}

export function usePreset(id) {
  const p = LAYOUT_PRESETS[id];
  if (!p) return;
  const { name, ...rest } = p;
  settings.patch({ ...structuredClone(rest), layoutPreset: id });
  applyLayout();
  toast(`Layout: ${name}`, 'info', 1500);
}

export function togglePanel(which) {
  const key = which === 'library' ? 'showLibrary' : 'showInspector';
  settings.set(key, !settings.get(key));
  applyLayout();
}

// arraste a alça (⋮⋮) de um painel sobre outro para trocar de lugar
function setupPanelDrag() {
  document.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.panel-grip, .panel-head[data-drag] .panel-title');
    if (!grip) return;
    const panelEl = grip.closest('.panel');
    const from = panelEl?.dataset.panel;
    if (!from) return;
    let ghost = null;
    let over = null;
    dragHandler(e, (ev, dx, dy) => {
      if (!ghost && Math.abs(dx) + Math.abs(dy) > 6) {
        ghost = el('div', { class: 'panel-ghost' }, panelName(from));
        document.body.append(ghost);
        document.body.classList.add('panel-dragging');
      }
      if (!ghost) return;
      ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 12 + 'px';
      $$('.panel.drop-panel').forEach((n) => n.classList.remove('drop-panel'));
      over = null;
      for (const p of Object.keys(PANEL_EL)) {
        if (p === from) continue;
        const n = $(PANEL_EL[p]);
        const r = n.getBoundingClientRect();
        if (n.style.display !== 'none' && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { over = p; n.classList.add('drop-panel'); }
      }
    }, () => {
      ghost?.remove();
      document.body.classList.remove('panel-dragging');
      $$('.panel.drop-panel').forEach((n) => n.classList.remove('drop-panel'));
      if (over) {
        const order = [...settings.get('panelOrder')];
        const a = order.indexOf(from), b = order.indexOf(over);
        [order[a], order[b]] = [order[b], order[a]];
        settings.set('panelOrder', order);
        settings.set('layoutPreset', 'custom', true);
        applyLayout();
        toast('Painéis reorganizados', 'info', 1200);
      }
    }, 'grabbing');
  });
}
function panelName(p) { return { library: 'Biblioteca', player: 'Reprodutor', inspector: 'Propriedades' }[p]; }
export { icon };
