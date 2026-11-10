// Atalhos de teclado configuráveis
import { settings } from './settings.js';

// [id, descrição, teclas padrão]
export const ACTIONS = [
  ['play', 'Reproduzir / pausar', ['Space']],
  ['frameBack', 'Quadro anterior', ['ArrowLeft']],
  ['frameFwd', 'Próximo quadro', ['ArrowRight']],
  ['secBack', 'Voltar 1 segundo', ['Shift+ArrowLeft']],
  ['secFwd', 'Avançar 1 segundo', ['Shift+ArrowRight']],
  ['prevEdit', 'Ponto de edição anterior', ['ArrowUp']],
  ['nextEdit', 'Próximo ponto de edição', ['ArrowDown']],
  ['home', 'Ir para o início', ['Home']],
  ['end', 'Ir para o fim', ['End']],
  ['split', 'Dividir no cursor', ['S', 'Ctrl+B', 'Ctrl+K']],
  ['deleteLeft', 'Excluir à esquerda do cursor (ripple)', ['Q']],
  ['deleteRight', 'Excluir à direita do cursor (ripple)', ['W']],
  ['delete', 'Excluir selecionado', ['Delete', 'Backspace']],
  ['rippleDelete', 'Excluir e fechar o espaço (ripple)', ['Shift+Delete', 'Shift+Backspace']],
  ['toolSelect', 'Ferramenta seleção', ['V']],
  ['toolBlade', 'Ferramenta lâmina', ['C']],
  ['toolRipple', 'Ferramenta edição ripple', ['B']],
  ['toolRolling', 'Ferramenta edição rolante', ['N']],
  ['toolRate', 'Ferramenta alongar taxa', ['R']],
  ['toolSlip', 'Ferramenta slip (deslizar conteúdo)', ['Y']],
  ['toolSlide', 'Ferramenta slide (deslizar clipe)', ['U']],
  ['freeze', 'Congelar quadro', ['Shift+F']],
  ['history', 'Histórico de ações', ['Ctrl+H']],
  ['exportFrame', 'Exportar quadro como imagem', ['Ctrl+Shift+E']],
  ['reverse', 'Inverter clipe (de trás para frente)', ['Ctrl+Alt+R']],
  ['chapters', 'Capítulos do YouTube', ['Ctrl+Shift+M']],
  ['toolForward', 'Ferramenta selecionar à frente', ['A']],
  ['markIn', 'Marcar entrada', ['I']],
  ['markOut', 'Marcar saída', ['O']],
  ['clearInOut', 'Limpar entrada e saída', ['Alt+X']],
  ['marker', 'Adicionar marcador', ['M']],
  ['text', 'Adicionar texto', ['T']],
  ['speed', 'Velocidade e duração', ['Ctrl+R']],
  ['gain', 'Ganho de áudio', ['G']],
  ['label', 'Rótulo de cor (próxima cor)', ['Alt+L']],
  ['shuttleJ', 'Tocar para trás / mais rápido para trás (J)', ['J']],
  ['shuttleK', 'Pausar (K)', ['K']],
  ['shuttleL', 'Tocar / mais rápido para frente (L)', ['L']],
  ['zoomIn', 'Aumentar zoom da linha do tempo', ['+', '=']],
  ['zoomOut', 'Diminuir zoom da linha do tempo', ['-']],
  ['zoomFit', 'Ajustar linha do tempo à janela', ['Shift+Z']],
  ['maximize', 'Maximizar painel sob o mouse', ['`', "'"]],
  ['undo', 'Desfazer', ['Ctrl+Z']],
  ['redo', 'Refazer', ['Ctrl+Y', 'Ctrl+Shift+Z']],
  ['copy', 'Copiar', ['Ctrl+C']],
  ['paste', 'Colar', ['Ctrl+V']],
  ['pasteAttr', 'Colar atributos', ['Ctrl+Alt+V']],
  ['duplicate', 'Duplicar', ['Ctrl+D']],
  ['selectAll', 'Selecionar todos', ['Ctrl+A']],
  ['deselect', 'Limpar seleção', ['Escape']],
  ['mixer', 'Mixer de áudio', ['Ctrl+Alt+M']],
  ['save', 'Salvar', ['Ctrl+S']],
  ['saveAs', 'Salvar como', ['Ctrl+Shift+S']],
  ['open', 'Abrir projeto', ['Ctrl+O']],
  ['new', 'Novo projeto', ['Ctrl+N']],
  ['import', 'Importar mídia', ['Ctrl+I']],
  ['export', 'Exportar', ['Ctrl+E', 'Ctrl+M']],
  ['customize', 'Personalizar', ['Ctrl+,']],
  ['fullscreen', 'Tela cheia', ['F11']],
];

// ações que funcionam mesmo sem foco na linha do tempo (com Ctrl)
export const GLOBAL = new Set(['save', 'saveAs', 'open', 'new', 'import', 'export', 'customize', 'fullscreen']);

export function comboFrom(e) {
  let k = e.key;
  if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null;
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && !(k.length === 1 && !/[A-Z0-9]/.test(k))) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

export function keysFor(id) {
  const over = (settings.get('keymap') || {})[id];
  return over || ACTIONS.find((a) => a[0] === id)?.[2] || [];
}

let index = null;
export function rebuild() {
  index = new Map();
  for (const [id] of ACTIONS) for (const k of keysFor(id)) index.set(k.toUpperCase(), id);
}
export function actionFor(e) {
  if (!index) rebuild();
  const c = comboFrom(e);
  return c ? index.get(c.toUpperCase()) || null : null;
}

export function setKeys(id, keys) {
  const map = { ...(settings.get('keymap') || {}) };
  // remove a tecla de outras ações (evita conflito)
  for (const [other] of ACTIONS) {
    if (other === id) continue;
    const cur = keysFor(other);
    const filtered = cur.filter((k) => !keys.map((x) => x.toUpperCase()).includes(k.toUpperCase()));
    if (filtered.length !== cur.length) map[other] = filtered;
  }
  map[id] = keys;
  settings.set('keymap', map, true);
  rebuild();
}
export function resetKeys() { settings.set('keymap', {}, true); rebuild(); }
